/**
 * @hadk/scaffold-engine — scope-driven project scaffold generator.
 *
 * Derives an actual working project from: selected idea, locked scope,
 * demo flow, feature list, team constraints, stack profile, and
 * deployment target. Non-destructive by default with conflict detection.
 */

import {
  type CompetitionState,
  type FeatureMapping,
  type Result,
  type ScaffoldFile,
  type ScaffoldPlan,
  ok,
  err,
  hadkError,
  nowIso,
  stringifyYaml,
  safeResolvePath,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { getProfile, listProfiles, type ProfileDefinition } from './profiles.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

export { listProfiles };
export type { ProfileDefinition };

// ─── Scaffold Options ────────────────────────────────────────────────────────

export interface ScaffoldOptions {
  profile?: string;
  output?: string;
  dryRun?: boolean;
  force?: boolean;
  installDeps?: boolean;
  allowOutsideRoot?: boolean;
}

export interface ScaffoldResult {
  plan: ScaffoldPlan;
  files_written: string[];
  files_skipped: string[];
  conflicts: string[];
  dry_run: boolean;
  output_dir: string;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

export class ScaffoldEngine {
  constructor(private store: StateStore) {}

  /**
   * Generate a scaffold plan from current state without writing files.
   */
  plan(options: ScaffoldOptions = {}): Result<ScaffoldPlan> {
    const loadResult = this.store.load();
    if (!loadResult.ok) return loadResult;
    const state = loadResult.value;

    // Preconditions: scope must be locked (or allow scaffold with defaults for dry-run)
    if (state.scope.status !== 'locked' && !options.dryRun) {
      return err(
        hadkError(
          'SCOPE_NOT_LOCKED',
          'Scope must be locked before scaffolding.',
          ['Architecture and scaffold must consume the locked scope.'],
          'Run `hadk scope` to create and lock the MVP scope first.',
        ),
      );
    }

    const profileName = options.profile ?? state.architecture.profile ?? 'web-ai-fullstack';
    const profile = getProfile(profileName);
    if (!profile) {
      return err(
        hadkError('PROFILE_NOT_FOUND', `Scaffold profile "${profileName}" not found.`, undefined, 'Available: web-ai-fullstack, web-ai-split, blockchain'),
      );
    }

    const projectName = this.deriveProjectName(state);
    const outputCheck = safeResolvePath(this.store.projectRoot, options.output ?? 'prototype', { allowOutsideRoot: options.allowOutsideRoot });
    if (!outputCheck.ok) return err(outputCheck.error);
    const outputDir = outputCheck.value;
    const invalidFeature = state.scope.mvp_features.find((feature) => !/^[A-Za-z0-9_-]+$/.test(feature.id));
    if (invalidFeature) {
      return err(hadkError('FEATURE_ID_INVALID', `Feature id "${invalidFeature.id}" contains unsupported path characters.`));
    }

    // Feature-to-component mapping
    const featureMapping = this.buildFeatureMapping(state, profile);

    // Build file list from profile templates
    const files = profile.generateFiles({
      projectName,
      features: state.scope.mvp_features.map((f) => f.id),
      featureMapping,
      demoFlow: state.scope.demo_flow,
      wowMoment: state.scope.primary_wow_moment?.description ?? null,
      teamSize: state.team.size ?? 1,
      ideaName: state.strategy.selected_idea ?? projectName,
    });

    const plan: ScaffoldPlan = {
      profile: profileName,
      project_name: projectName,
      output_dir: outputDir,
      features: state.scope.mvp_features.map((f) => f.id),
      feature_mapping: featureMapping,
      files,
      post_install_commands: profile.postInstallCommands,
      startup_command: profile.startupCommand,
      health_check: profile.healthCheck,
    };

    return ok(plan);
  }

  /**
   * Generate the scaffold: write actual files to disk.
   * Non-destructive unless --force. Conflicts are detected and reported.
   */
  generate(options: ScaffoldOptions = {}): Result<ScaffoldResult> {
    const planResult = this.plan(options);
    if (!planResult.ok) return planResult;
    const plan = planResult.value;

    const filesWritten: string[] = [];
    const filesSkipped: string[] = [];
    const conflicts: string[] = [];

    for (const file of plan.files) {
      const pathCheck = safeResolvePath(plan.output_dir, file.path, {
        allowSecrets: file.path === '.env.example' || file.path.endsWith('/.env.example') || file.path === '.env.local' || file.path.endsWith('/.env.local') || file.path === 'backend/.env',
      });
      if (!pathCheck.ok) return err(hadkError('SCAFFOLD_PATH_DENIED', pathCheck.error.message));
      const fullPath = pathCheck.value;

      if (existsSync(fullPath) && !options.force) {
        // Conflict detection: never overwrite user code without explicit approval
        const existing = readFileSync(fullPath, 'utf-8');
        const existingHash = hashContent(existing);
        if (file.content_hash && existingHash === file.content_hash) {
          filesSkipped.push(file.path); // identical — safe to skip
        } else {
          conflicts.push(file.path);
        }
        continue;
      }

      if (options.dryRun) {
        filesWritten.push(file.path);
        continue;
      }

      // Write the file
      const content = file.template ?? '';
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, 'utf-8');
      filesWritten.push(file.path);
    }

    // Write hadk.project.yaml metadata into the generated project
    if (!options.dryRun) {
      const projectMeta = {
        schema_version: '1.0',
        generated_at: nowIso(),
        profile: plan.profile,
        project_name: plan.project_name,
        startup_command: plan.startup_command,
        health_check: plan.health_check,
        features: plan.features,
      };
      const metaCheck = safeResolvePath(plan.output_dir, 'hadk.project.yaml');
      if (!metaCheck.ok) return err(hadkError('SCAFFOLD_PATH_DENIED', metaCheck.error.message));
      const metaPath = metaCheck.value;
      if (!existsSync(metaPath) || options.force) {
        writeFileSync(metaPath, stringifyYaml(projectMeta), 'utf-8');
        filesWritten.push('hadk.project.yaml');
      }
    }

    // Update state with architecture info
    if (!options.dryRun) {
      this.store.update((s) => {
        s.architecture.profile = plan.profile;
        s.architecture.status = 'generated';
        s.architecture.feature_mapping = plan.feature_mapping;
        s.gates.architecture_gate = 'passed';
        if (s.delivery.phase === 'scaffold' || s.delivery.phase === 'architecture') {
          s.delivery.phase = 'build';
        }
      });
      this.store.log('scaffold', `Generated ${plan.profile} scaffold at ${plan.output_dir} (${filesWritten.length} files).`);
    }

    return ok({
      plan,
      files_written: filesWritten,
      files_skipped: filesSkipped,
      conflicts,
      dry_run: options.dryRun ?? false,
      output_dir: plan.output_dir,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private deriveProjectName(state: CompetitionState): string {
    if (state.strategy.selected_idea) {
      return slugify(state.strategy.selected_idea);
    }
    if (state.competition.name) {
      return slugify(state.competition.name) + '-prototype';
    }
    return 'hadk-prototype';
  }

  private buildFeatureMapping(state: CompetitionState, profile: ProfileDefinition): Record<string, FeatureMapping> {
    const mapping: Record<string, FeatureMapping> = {};
    for (const feature of state.scope.mvp_features) {
      mapping[feature.id] = profile.mapFeature(feature.id, feature.name);
    }
    return mapping;
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'project';
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function pascalCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}
