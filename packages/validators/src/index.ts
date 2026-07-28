/**
 * @hadk/validators — executable validation gates.
 *
 * Each validator inspects real state and filesystem, returning
 * machine-readable and human-readable results.
 */

import {
  type CompetitionState,
  type Manifest,
  type ValidationResult,
  type ValidationIssue,
  SCORING_WEIGHTS,
  nowIso,
  readYamlFile,
  weightsSumToOne,
  remainingHours,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─── Issue Helpers ───────────────────────────────────────────────────────────

function error(code: string, message: string, path?: string): ValidationIssue {
  return { severity: 'error', code, message, path };
}

function warning(code: string, message: string, path?: string): ValidationIssue {
  return { severity: 'warning', code, message, path };
}

function info(code: string, message: string, path?: string): ValidationIssue {
  return { severity: 'info', code, message, path };
}

function result(validator: string, issues: ValidationIssue[]): ValidationResult {
  return {
    validator,
    passed: !issues.some((i) => i.severity === 'error'),
    issues,
    timestamp: nowIso(),
  };
}

// ─── Registry Validator ──────────────────────────────────────────────────────

export function validateRegistry(hadkRoot: string): ValidationResult {
  const issues: ValidationIssue[] = [];
  const manifestPath = join(hadkRoot, 'manifest.yaml');

  if (!existsSync(manifestPath)) {
    return result('registry', [error('MANIFEST_MISSING', `manifest.yaml not found at ${manifestPath}`)]);
  }

  const loaded = readYamlFile<Manifest>(manifestPath);
  if (!loaded.ok) {
    return result('registry', [error('MANIFEST_INVALID', `Failed to parse manifest: ${loaded.error.message}`)]);
  }

  const manifest = loaded.value;
  if (!manifest.skills || typeof manifest.skills !== 'object') {
    return result('registry', [error('MANIFEST_NO_SKILLS', 'Manifest has no skills section.')]);
  }

  const skillNames = Object.keys(manifest.skills);
  const registered = new Set(skillNames);

  for (const [name, entry] of Object.entries(manifest.skills)) {
    // Path exists
    const skillDir = join(hadkRoot, entry.path);
    if (!existsSync(skillDir)) {
      issues.push(error('SKILL_PATH_MISSING', `Skill "${name}" path does not exist: ${entry.path}`, entry.path));
    } else if (!existsSync(join(skillDir, 'SKILL.md'))) {
      issues.push(error('SKILL_MD_MISSING', `Skill "${name}" has no SKILL.md`, entry.path));
    }

    // Version present
    if (!entry.version) {
      issues.push(error('SKILL_NO_VERSION', `Skill "${name}" has no version.`));
    }

    // Dependencies resolve
    for (const dep of entry.dependencies ?? []) {
      if (!registered.has(dep)) {
        issues.push(error('DEP_UNRESOLVED', `Skill "${name}" depends on unregistered skill "${dep}".`));
      }
    }
    for (const dep of entry.optional_dependencies ?? []) {
      if (!registered.has(dep)) {
        issues.push(warning('OPT_DEP_UNRESOLVED', `Skill "${name}" optional dependency "${dep}" not registered.`));
      }
    }

    // Schemas exist (when declared)
    if (entry.input_schema && !existsSync(join(hadkRoot, entry.input_schema))) {
      issues.push(warning('INPUT_SCHEMA_MISSING', `Skill "${name}" input schema missing: ${entry.input_schema}`));
    }
    if (entry.output_schema && !existsSync(join(hadkRoot, entry.output_schema))) {
      issues.push(warning('OUTPUT_SCHEMA_MISSING', `Skill "${name}" output schema missing: ${entry.output_schema}`));
    }
  }

  // Orphan detection: skill dirs not in manifest
  const skillsDir = join(hadkRoot, 'skills');
  if (existsSync(skillsDir)) {
    for (const dir of readdirSync(skillsDir)) {
      if (existsSync(join(skillsDir, dir, 'SKILL.md')) && !registered.has(dir)) {
        issues.push(warning('ORPHAN_SKILL', `Skill directory "${dir}" exists but is not registered in manifest.yaml.`));
      }
    }
  }

  issues.push(info('REGISTRY_COUNT', `${skillNames.length} skills registered.`));
  return result('registry', issues);
}

// ─── State Validators ────────────────────────────────────────────────────────

export function validateState(store: StateStore): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!store.isInitialized()) {
    return result('state', [error('NOT_INITIALIZED', 'No .hackathon/ state found. Run `hadk setup`.')]);
  }

  const loaded = store.load();
  if (!loaded.ok) {
    return result('state', [error('STATE_INVALID', loaded.error.message)]);
  }

  const state = loaded.value;
  if (!state.schema_version) issues.push(error('NO_SCHEMA_VERSION', 'State missing schema_version.'));
  if (!state.gates) issues.push(error('NO_GATES', 'State missing gates section.'));
  if (!state.delivery) issues.push(error('NO_DELIVERY', 'State missing delivery section.'));

  return result('state', issues);
}

export function validateCompetition(state: CompetitionState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.competition.tracks.length === 0) {
    issues.push(error('NO_TRACKS', 'At least one track is required. Run `hadk ingest`.'));
  }

  if (state.competition.judging_criteria.length === 0) {
    issues.push(warning('NO_RUBRIC', 'No judging criteria captured. Record uncertainty explicitly if rubric is unavailable.'));
  }

  const hasUncertainty = state.competition.judging_criteria.some((c) => c.source === 'inferred');
  if (state.competition.judging_criteria.length > 0 && hasUncertainty) {
    issues.push(info('RUBRIC_INFERRED', 'Some judging criteria are inferred, not extracted.'));
  }

  if (!state.competition.deadline && state.competition.remaining_hours === null) {
    issues.push(warning('NO_DEADLINE', 'Deadline is unknown. Set explicitly or record as unknown.'));
  }

  if (state.competition.sponsor_requirements.length === 0) {
    issues.push(info('NO_SPONSOR_REQS', 'No sponsor requirements captured.'));
  }

  return result('competition', issues);
}

export function validateIdea(state: CompetitionState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!state.strategy.selected_idea) {
    issues.push(error('NO_SELECTED_IDEA', 'No idea selected. Run `hadk idea`.'));
    return result('idea', issues);
  }

  // Scoring weights sum correctly
  const profile = state.strategy.scoring_profile ?? SCORING_WEIGHTS[state.strategy.mode];
  if (!weightsSumToOne(profile)) {
    issues.push(error('WEIGHTS_INVALID', `Scoring weights for mode "${state.strategy.mode}" do not sum to 1.0.`));
  }

  // Strategy mode consistency
  if (!SCORING_WEIGHTS[state.strategy.mode]) {
    issues.push(error('INVALID_MODE', `Unknown strategy mode: ${state.strategy.mode}`));
  }

  // Selected idea artifact exists
  const ideaArtifact = state.strategy.selected_idea;
  if (!ideaArtifact) {
    issues.push(error('IDEA_ARTIFACT_MISSING', 'Selected idea artifact not found.'));
  }

  return result('idea', issues);
}

export function validateScope(state: CompetitionState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.strategy.selected_idea === null) {
    issues.push(error('IDEA_NOT_FIXED', 'Selected idea must be fixed before locking scope.'));
  }

  if (state.scope.demo_flow.length === 0) {
    issues.push(error('NO_DEMO_FLOW', 'Scope requires a demo flow.'));
  }

  if (!state.scope.primary_wow_moment) {
    issues.push(error('NO_WOW_MOMENT', 'Scope requires a primary wow moment.'));
  }

  if (state.scope.mvp_features.length === 0) {
    issues.push(error('NO_MVP_FEATURES', 'Scope requires at least one MVP feature.'));
  }

  // Every MVP feature must support demo or rubric
  for (const feature of state.scope.mvp_features) {
    if (!feature.required_for_demo && !feature.required_for_rubric) {
      issues.push(error('FEATURE_UNJUSTIFIED', `Feature "${feature.id}" supports neither demo nor rubric.`, feature.id));
    }
  }

  // Budget fits time
  const totalHours = state.scope.mvp_features.reduce((sum, f) => sum + f.estimated_hours, 0);
  const available = remainingHours(state.competition.deadline, state.competition.remaining_hours) ?? 48;
  if (totalHours > available) {
    issues.push(error('BUDGET_EXCEEDED', `MVP estimate ${totalHours}h exceeds available ${available}h.`));
  }

  // Critical dependencies have fallbacks
  for (const dep of state.scope.external_dependencies) {
    if (!dep.fallback) {
      issues.push(error('NO_FALLBACK', `External dependency "${dep.name}" has no fallback.`, dep.name));
    }
  }

  // Internal consistency: deferred features not in MVP
  const mvpIds = new Set(state.scope.mvp_features.map((f) => f.id));
  for (const deferred of state.scope.deferred_features) {
    if (mvpIds.has(deferred.id)) {
      issues.push(error('INCONSISTENT_SCOPE', `Feature "${deferred.id}" is both deferred and in MVP.`, deferred.id));
    }
  }

  return result('scope', issues);
}

export function validateScaffold(store: StateStore): ValidationResult {
  const issues: ValidationIssue[] = [];
  const loaded = store.load();
  if (!loaded.ok) return result('scaffold', [error('STATE_INVALID', loaded.error.message)]);
  const state = loaded.value;

  if (state.architecture.status === 'unselected') {
    issues.push(error('NO_SCAFFOLD', 'No scaffold generated. Run `hadk scaffold`.'));
    return result('scaffold', issues);
  }

  // Look for generated project (default: prototype/)
  const protoDir = join(store.projectRoot, 'prototype');
  if (!existsSync(protoDir)) {
    issues.push(error('SCAFFOLD_DIR_MISSING', `Generated project directory not found: ${protoDir}`));
    return result('scaffold', issues);
  }

  // hadk.project.yaml exists
  const projectMeta = join(protoDir, 'hadk.project.yaml');
  if (!existsSync(projectMeta)) {
    issues.push(warning('PROJECT_META_MISSING', 'hadk.project.yaml not found in generated project.'));
  } else {
    const meta = readYamlFile<{ startup_command?: string; health_check?: string }>(projectMeta);
    if (meta.ok) {
      if (!meta.value.startup_command) issues.push(error('NO_STARTUP_COMMAND', 'Generated project has no startup command.'));
      if (!meta.value.health_check) issues.push(warning('NO_HEALTH_CHECK', 'Generated project has no health check.'));
    }
  }

  // Environment template exists
  const hasEnv = existsSync(join(protoDir, '.env.example')) || existsSync(join(protoDir, 'frontend', '.env.example')) || existsSync(join(protoDir, 'backend', '.env.example'));
  if (!hasEnv) {
    issues.push(warning('NO_ENV_TEMPLATE', 'No .env.example found in generated project.'));
  }

  // Package manifest valid
  const pkgPaths = [join(protoDir, 'package.json'), join(protoDir, 'frontend', 'package.json')];
  if (!pkgPaths.some((p) => existsSync(p))) {
    issues.push(error('NO_PACKAGE_MANIFEST', 'No package.json found in generated project.'));
  }

  return result('scaffold', issues);
}

export function validateDemo(state: CompetitionState): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (state.scope.demo_flow.length === 0) {
    issues.push(error('NO_DEMO_FLOW', 'No documented demo path.'));
  }

  if (state.delivery.demo_status === 'blocked') {
    issues.push(error('DEMO_BLOCKED', 'Demo path has unresolved blockers.'));
  }

  // Deterministic demo state: check for reset capability
  if (state.delivery.demo_status === 'not_started') {
    issues.push(error('DEMO_NOT_VALIDATED', 'Demo has not been validated end-to-end.'));
  }

  // External dependencies have fallback
  for (const dep of state.scope.external_dependencies) {
    if (!dep.fallback) {
      issues.push(error('DEP_NO_FALLBACK', `Critical dependency "${dep.name}" lacks a demo fallback.`, dep.name));
    }
  }

  return result('demo', issues);
}

export function validateVideo(store: StateStore): ValidationResult {
  const issues: ValidationIssue[] = [];
  const videoDir = join(store.projectRoot, 'demo-video');
  const loaded = store.load();
  if (!loaded.ok) return result('video', [error('STATE_INVALID', loaded.error.message)]);

  if (!existsSync(videoDir)) {
    issues.push(error('NO_VIDEO_PROJECT', 'No demo-video/ project found. Run `hadk video generate`.'));
    return result('video', issues);
  }

  const storyboard = join(videoDir, 'storyboard.yaml');
  if (!existsSync(storyboard)) {
    issues.push(error('NO_STORYBOARD', 'storyboard.yaml missing from demo-video/.'));
  }

  const manifest = join(videoDir, 'asset-manifest.yaml');
  if (!existsSync(manifest)) {
    issues.push(error('NO_ASSET_MANIFEST', 'asset-manifest.yaml missing from demo-video/.'));
  }

  const composition = join(videoDir, 'compositions', 'submission-video.html');
  if (!existsSync(composition)) {
    issues.push(error('NO_COMPOSITION', 'compositions/submission-video.html missing.'));
  }
  if (loaded.value.delivery.video_status !== 'rendered') {
    issues.push(error('VIDEO_NOT_RENDERED', 'Video has not been rendered and verified. Run `hadk video render`.'));
  }

  return result('video', issues);
}

export function validateSubmission(state: CompetitionState, store: StateStore): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!state.competition.name) {
    issues.push(error('NO_COMPETITION', 'Competition not ingested.'));
  }

  if (!state.strategy.selected_idea) {
    issues.push(error('NO_IDEA', 'No selected idea for submission description.'));
  }

  const submissionArtifacts = store.listArtifacts('submission');
  if (submissionArtifacts.length === 0) {
    issues.push(error('NO_SUBMISSION_ARTIFACTS', 'No submission artifacts prepared. Run `hadk submit`.'));
  }

  if (state.delivery.video_status === 'not_started') {
    issues.push(error('NO_VIDEO', 'No rendered video artifact for submission.'));
  }

  return result('submission', issues);
}

// ─── Aggregate ───────────────────────────────────────────────────────────────

export type ValidatorName =
  | 'state'
  | 'registry'
  | 'competition'
  | 'idea'
  | 'scope'
  | 'scaffold'
  | 'build'
  | 'demo'
  | 'video'
  | 'submission';

export function runValidator(name: ValidatorName, store: StateStore, hadkRoot: string): ValidationResult {
  const stateResult = store.isInitialized() ? store.load() : null;
  const state = stateResult?.ok ? stateResult.value : null;

  switch (name) {
    case 'registry':
      return validateRegistry(hadkRoot);
    case 'state':
      return validateState(store);
    case 'competition':
      return state ? validateCompetition(state) : result('competition', [error('NO_STATE', 'State not initialized.')]);
    case 'idea':
      return state ? validateIdea(state) : result('idea', [error('NO_STATE', 'State not initialized.')]);
    case 'scope':
      return state ? validateScope(state) : result('scope', [error('NO_STATE', 'State not initialized.')]);
    case 'scaffold':
      return validateScaffold(store);
    case 'build':
      return validateBuild(store);
    case 'demo':
      return state ? validateDemo(state) : result('demo', [error('NO_STATE', 'State not initialized.')]);
    case 'video':
      return validateVideo(store);
    case 'submission':
      return state ? validateSubmission(state, store) : result('submission', [error('NO_STATE', 'State not initialized.')]);
    default:
      return result(name, [error('UNKNOWN_VALIDATOR', `Unknown validator: ${name}`)]);
  }
}

export function validateBuild(store: StateStore): ValidationResult {
  const issues: ValidationIssue[] = [];
  const protoDir = join(store.projectRoot, 'prototype');

  if (!existsSync(protoDir)) {
    issues.push(error('NO_PROJECT', 'No generated project found at prototype/. Run `hadk scaffold`.'));
    return result('build', issues);
  }

  const hasNodeModules = existsSync(join(protoDir, 'node_modules'));
  if (!hasNodeModules) {
    issues.push(error('DEPS_NOT_INSTALLED', 'node_modules not found — run the install command from hadk.project.yaml.'));
  }

  issues.push(info('BUILD_MANUAL', 'Full build validation (install, typecheck, test, startup, health) requires running the project. See hadk.project.yaml for commands.'));
  return result('build', issues);
}

export function runAllValidators(store: StateStore, hadkRoot: string): ValidationResult[] {
  const names: ValidatorName[] = ['state', 'registry', 'competition', 'idea', 'scope', 'scaffold', 'build', 'demo', 'video', 'submission'];
  return names.map((n) => runValidator(n, store, hadkRoot));
}
