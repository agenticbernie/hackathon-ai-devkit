/**
 * CLI command handlers for hadk.
 *
 * AI-assisted phases (ingest, idea, judge) produce structured, persisted
 * artifacts. Content generation is deterministic where possible so the
 * pipeline runs end-to-end; the coding agent refines artifacts using the
 * corresponding skills.
 */

import {
  type CompetitionState,
  type CandidateIdea,
  type SelectedIdea,
  SCORING_WEIGHTS,
  STRATEGY_MODES,
  TASTE_OPTIONS,
  DEFAULT_STRATEGY_MODE,
  generateId,
  nowIso,
  readYamlFile,
  weightsSumToOne,
  remainingHours,
  writeYamlFileAtomic,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { Orchestrator, scoreIdea } from '@hadk/orchestrator';
import { validateRegistry } from '@hadk/validators';
import { AgentAdapters } from '@hadk/agent-adapters';
import Ajv from 'ajv';
import { existsSync, readFileSync, accessSync, constants, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, delimiter, resolve, basename, extname } from 'node:path';
import { success, info, warn, fail } from './index.js';

const ideaImportSchema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../../schemas/idea-import.schema.json'), 'utf-8'),
);
const validateIdeaImportShape = new Ajv({ allErrors: true }).compile(ideaImportSchema);

// ─── setup ───────────────────────────────────────────────────────────────────

export async function cmdSetup(
  store: StateStore,
  opts: { teamSize?: string; teamSkills?: string; nonInteractive?: boolean },
): Promise<void> {
  const result = store.init();
  if (!result.ok) return fail(result.error.message, result.error.hint);

  success(result.value.created ? 'Initialized .hackathon/ state directory.' : 'Existing .hackathon/ state preserved.');

  // Apply team config if provided
  if (opts.teamSize || opts.teamSkills) {
    store.update((s) => {
      if (opts.teamSize) s.team.size = parseInt(opts.teamSize, 10);
      if (opts.teamSkills) s.team.skills = opts.teamSkills.split(',').map((x) => x.trim()).filter(Boolean);
    });
  }

  // Detect environment
  const pm = detectPackageManager();
  info(`Package manager: ${pm ?? 'not detected'}`);
  info(`Git: ${commandOnPath('git') ? 'found' : 'not found'}`);

  // Install agent adapters
  const adapters = new AgentAdapters(store);
  const adapterResult = adapters.install();
  if (adapterResult.ok) {
    success(`Agent adapters installed: ${adapterResult.value.files_written.join(', ')}`);
    if (adapterResult.value.detected_agents.length) {
      info(`Detected agents: ${adapterResult.value.detected_agents.join(', ')}`);
    }
  }

  // Advance phase if still in setup
  store.update((s) => {
    if (s.delivery.phase === 'setup') s.delivery.phase = 'competition-intelligence';
  });

  success('Setup complete.');
  info('Next: hadk ingest <competition-url-or-file>');
}

// ─── ingest ──────────────────────────────────────────────────────────────────

export async function cmdIngest(
  store: StateStore,
  source: string,
  opts: { track?: string },
): Promise<void> {
  ensureInitialized(store);

  let rawContent = '';
  let sourceUrl: string | null = null;

  if (source.startsWith('http://') || source.startsWith('https://')) {
    sourceUrl = source;
    // Attempt fetch; record blocker honestly if unavailable
    try {
      const res = await fetch(source, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return fail(`Could not fetch URL: ${res.status} ${res.statusText}.`);
      rawContent = await res.text();
    } catch (e) {
      warn(`Could not fetch URL (${(e as Error).message}). Recording source with low confidence.`);
      rawContent = '';
    }
  } else {
    // Local file
    if (!existsSync(source)) return fail(`File not found: ${source}`);
    rawContent = readFileSync(source, 'utf-8');
  }

  // Parse the brief with heuristics
  const parsed = parseBrief(rawContent, source);

  const artifact = {
    schema_version: '1.0',
    ingested_at: nowIso(),
    source: sourceUrl ?? source,
    source_type: sourceUrl ? 'url' : 'file',
    extraction_confidence: rawContent ? 'medium' : 'low',
    extraction_warnings: rawContent ? [] : ['Source content unavailable; fields recorded as unknown.'],
    preferred_track_hint: opts.track ?? null,
    ...parsed,
  };

  // Persist raw source
  store.writeArtifact('competition', 'raw-source.md', { content: rawContent.slice(0, 20000), source: sourceUrl ?? source });
  const artifactPath = store.writeArtifact('competition', 'competition.yaml', artifact);
  if (!artifactPath.ok) return fail(artifactPath.error.message);

  // Update state
  store.update((s) => {
    s.competition.name = parsed.event_metadata.name;
    s.competition.source_url = sourceUrl ?? source;
    s.competition.type = parsed.competition_type;
    s.competition.tracks = parsed.tracks;
    s.competition.judging_criteria = parsed.judging_criteria;
    s.competition.sponsor_requirements = parsed.sponsor_requirements;
    s.competition.deadline = parsed.event_metadata.submission_deadline;
    s.gates.competition_gate = parsed.tracks.length > 0 ? 'passed' : 'failed';
    if (parsed.tracks.length > 0) s.delivery.phase = 'strategy';
  });

  success(`Competition ingested: ${parsed.event_metadata.name ?? '(unknown)'}`);
  info(`Tracks: ${parsed.tracks.length} · Criteria: ${parsed.judging_criteria.length} · Confidence: ${artifact.extraction_confidence}`);
  info(`Artifact: ${artifactPath.value}`);
  info('Next: hadk strategy');
}

// ─── configure ───────────────────────────────────────────────────────────────

export async function cmdConfigure(
  store: StateStore,
  opts: { teamSize?: string; teamSkills?: string; deadline?: string; remainingHours?: string },
): Promise<void> {
  ensureInitialized(store);
  const teamSize = opts.teamSize === undefined ? undefined : Number(opts.teamSize);
  const remaining = opts.remainingHours === undefined ? undefined : Number(opts.remainingHours);
  if (teamSize !== undefined && (!Number.isInteger(teamSize) || teamSize < 1)) return fail('--team-size must be a positive integer.');
  if (remaining !== undefined && (!Number.isFinite(remaining) || remaining < 0)) return fail('--remaining-hours must be a non-negative number.');
  if (opts.deadline && Number.isNaN(new Date(opts.deadline).getTime())) return fail('--deadline must be a valid ISO-8601 timestamp.');
  store.update((s) => {
    if (teamSize !== undefined) s.team.size = teamSize;
    if (opts.teamSkills) s.team.skills = opts.teamSkills.split(',').map((x) => x.trim()).filter(Boolean);
    if (opts.deadline) s.competition.deadline = opts.deadline;
    if (remaining !== undefined) s.competition.remaining_hours = remaining;
  });
  success('Configuration updated.');
}

// ─── strategy ────────────────────────────────────────────────────────────────

function validateTasteValues(taste: CompetitionState['strategy']['idea_taste']): void {
  (Object.keys(TASTE_OPTIONS) as (keyof typeof TASTE_OPTIONS)[]).forEach((key) => {
    const allowed = new Set(TASTE_OPTIONS[key] as readonly string[]);
    const values = taste[key] ?? [];
    const unknown = values.filter((v) => !allowed.has(v));
    if (unknown.length > 0) {
      warn(`Unknown ${key} values: ${unknown.join(', ')}. Allowed: ${[...allowed].join(', ')}. Custom values are accepted but may not match built-in profiles.`);
    }
  });
}

export async function cmdStrategy(
  store: StateStore,
  opts: {
    mode?: string;
    taste?: string;
    market?: string;
    layer?: string;
    technology?: string;
    businessShape?: string;
    traits?: string;
    tasteFile?: string;
  },
): Promise<void> {
  ensureInitialized(store);

  const mode = (opts.mode ?? DEFAULT_STRATEGY_MODE) as (typeof STRATEGY_MODES)[number];
  if (!STRATEGY_MODES.includes(mode)) {
    return fail(`Invalid mode "${mode}". Choose: ${STRATEGY_MODES.join(', ')}`);
  }

  let tasteSource: 'auto' | 'user' | 'auto_fallback' = opts.taste === 'user' ? 'user' : 'auto';
  const weights = SCORING_WEIGHTS[mode];
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);

  // Resolve taste profile
  let taste: CompetitionState['strategy']['idea_taste'];
  if (tasteSource === 'auto') {
    taste = inferTaste(loaded.value);
  } else {
    // --taste user: read from flags or a YAML file
    if (opts.tasteFile) {
      const tasteResult = readYamlFile<CompetitionState['strategy']['idea_taste']>(opts.tasteFile);
      if (!tasteResult.ok) return fail(`Could not read taste file: ${tasteResult.error.message}`);
      taste = tasteResult.value;
      validateTasteValues(taste);
    } else {
      taste = {
        market: opts.market ? opts.market.split(',').map((x) => x.trim()).filter(Boolean) : [],
        product_layer: opts.layer ? opts.layer.split(',').map((x) => x.trim()).filter(Boolean) : [],
        technology: opts.technology ? opts.technology.split(',').map((x) => x.trim()).filter(Boolean) : [],
        business_shape: opts.businessShape ? opts.businessShape.split(',').map((x) => x.trim()).filter(Boolean) : [],
        desired_traits: opts.traits ? opts.traits.split(',').map((x) => x.trim()).filter(Boolean) : [],
      };
      validateTasteValues(taste);
      // If no flags were provided at all, warn and fall back to auto
      const allEmpty = Object.values(taste).every((a) => a.length === 0);
      if (allEmpty) {
        warn('No taste flags provided. Use --market/--technology/--traits/--taste-file to declare your taste, or switch to --taste auto.');
        info('Falling back to auto-inferred taste.');
        tasteSource = 'auto_fallback';
        taste = inferTaste(loaded.value);
      }
    }
  }

  store.update((s) => {
    s.strategy.mode = mode;
    s.strategy.taste_source = tasteSource;
    s.strategy.idea_taste = taste;
    s.strategy.scoring_profile = weights;
    if (s.competition.tracks.length > 0 && !s.strategy.selected_track) {
      s.strategy.selected_track = s.competition.tracks[0].name;
    }
    if (s.delivery.phase === 'strategy') {
      // idea_gate is intentionally left unchanged; it is set by `hadk idea`.
      s.delivery.phase = 'idea';
    }
  });

  const artifact = {
    schema_version: '1.0',
    created_at: nowIso(),
    mode,
    taste_source: tasteSource,
    idea_taste: taste,
    scoring_profile: weights,
    weights_sum: Object.values(weights).reduce((a, b) => a + b, 0),
    rationale:
      tasteSource === 'auto'
        ? 'Taste profile inferred from competition rubric, team skills, duration, and differentiation whitespace to maximize winning probability.'
        : tasteSource === 'auto_fallback'
          ? 'User requested user taste but provided no values; fell back to auto-inferred profile.'
          : 'Taste profile provided by user.',
  };
  store.writeArtifact('strategy', 'strategy.yaml', artifact);

  success(`Strategy locked: ${mode} (taste: ${tasteSource})`);
  info(`Scoring axes: ${Object.keys(weights).join(', ')}`);
  info(`Taste: market=[${taste.market.join(', ') || 'any'}] tech=[${taste.technology.join(', ') || 'general'}] traits=[${taste.desired_traits.join(', ') || 'balanced'}]`);
  info('Next: hadk idea');
}

// ─── idea ────────────────────────────────────────────────────────────────────

function buildAgentIdeaPrompt(state: CompetitionState, agent?: string, provider?: string): string {
  const lines = [
    '# HADK Agent Handoff: Idea Research & Selection',
    '',
    `You are helping a team competing in **${state.competition.name}**.`,
    `Competition type: ${state.competition.type ?? 'hackathon'}`,
    `Deadline: ${state.competition.deadline ?? 'TBD'}`,
    `Remaining hours: ${state.competition.remaining_hours ?? 'TBD'}`,
    '',
    '## Tracks',
    ...(state.competition.tracks.length ? state.competition.tracks.map((t) => `- ${t.name}: ${t.description || 'No description'}`) : ['- No track data available.']),
    '',
    '## Judging Criteria',
    ...(state.competition.judging_criteria.length ? state.competition.judging_criteria.map((c) => `- ${c.name} (${c.weight}x): ${c.description || ''}`) : ['- No criteria available.']),
    '',
    '## Team',
    `- Size: ${state.team.size}`,
    `- Skills: ${state.team.skills.join(', ') || 'generalist'}`,
    `- Members: ${state.team.members.join(', ') || 'unspecified'}`,
    '',
    '## Strategy Mode',
    `- Mode: ${state.strategy.mode}`,
    `- Taste source: ${state.strategy.taste_source}`,
    `- Taste profile:`,
    `  - market: ${state.strategy.idea_taste.market.join(', ') || 'any'}`,
    `  - product_layer: ${state.strategy.idea_taste.product_layer.join(', ') || 'any'}`,
    `  - technology: ${state.strategy.idea_taste.technology.join(', ') || 'any'}`,
    `  - business_shape: ${state.strategy.idea_taste.business_shape.join(', ') || 'any'}`,
    `  - desired_traits: ${state.strategy.idea_taste.desired_traits.join(', ') || 'balanced'}`,
    '',
    '## Your Task',
    '1. Compare tracks and expected win probability for this team.',
    '2. Collect evidence: market/problem fit, previous winners, idea saturation.',
    '3. Generate 5 distinct candidate ideas aligned with the strategy mode and taste.',
    '4. Run adversarial critique on each candidate.',
    '5. Score each candidate across: differentiation, feasibility, wow, rubric fit, team fit, fallback safety.',
    '6. Recommend a winning idea and 2 runner-ups.',
    '',
    '## Output Format',
    'Write your result as YAML matching `schemas/idea-import.schema.json`. Use raw 0-10 values and `score_breakdown_kind: raw`, then save it as `.hackathon/artifacts/ideas/result.yaml`.',
    '',
    `Intended agent: ${agent ?? 'unspecified'}`,
    `Intended provider: ${provider ?? 'unspecified'}`,
    '',
    'After generating the result, the user will run: `hadk idea import .hackathon/artifacts/ideas/result.yaml`',
  ];
  return lines.join('\n');
}

export async function cmdIdea(store: StateStore, opts: { count?: string; agent?: string; provider?: string; agentHandoff?: boolean }): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  if (!state.strategy.scoring_profile) {
    return fail('No strategy selected.', 'Run `hadk strategy` first.');
  }

  // Agent handoff: export a prompt pack and stop; do not claim agent-guided generation.
  if (opts.agentHandoff) {
    const prompt = buildAgentIdeaPrompt(state, opts.agent, opts.provider);
    const promptResult = store.writeTextArtifact('generated', 'idea-agent-prompt.md', prompt);
    if (!promptResult.ok) return fail(promptResult.error.message);
    success('Agent handoff prompt exported.');
    info(`Prompt: ${promptResult.value}`);
    info('Load this prompt into your agent, then import the result with `hadk idea import <result.yaml>` when ready.');
    return;
  }

  const count = Math.min(7, Math.max(3, parseInt(opts.count ?? '5', 10)));
  const candidates = generateCandidateIdeas(state, count);

  // Determine generation mode for provenance tracking.
  // --agent/--provider without --agent-handoff are declarations of intent only,
  // not actual agent execution. Report them honestly so we do not over-claim.
  const hasDeclaredIntent = !!(opts.agent || opts.provider);
  const generationMode = hasDeclaredIntent ? 'declared_intent' : 'heuristic_fallback';
  const confidence: 'low' | 'medium' | 'high' = hasDeclaredIntent ? 'low' : 'low';

  if (generationMode === 'heuristic_fallback') {
    info('Running in heuristic mode — ideas are deterministic skeletons. Use --agent-handoff for agent-driven idea research.');
  } else {
    info(`Declared intent: refine ideas via ${opts.agent ?? opts.provider}. No agent executed. Use --agent-handoff to generate a prompt pack.`);
  }

  // Score each candidate
  for (const c of candidates) {
    const { breakdown, total } = scoreIdea(c.score_breakdown, state.strategy.scoring_profile);
    c.score_breakdown = breakdown;
    c.score_breakdown_kind = 'weighted';
    c.total_score = total;
  }
  candidates.sort((a, b) => b.total_score - a.total_score);

  const winner = candidates[0];
  const selected: SelectedIdea = {
    id: winner.id,
    name: winner.name,
    selection_reason: `Highest weighted score (${winner.total_score}) under ${state.strategy.mode} mode.`,
    why_now: winner.strategy_mode_fit,
    why_this_team: `Matches team skills: ${state.team.skills.join(', ') || 'generalist'}.`,
    why_this_competition: winner.rubric_fit,
    judge_memory_hook: winner.wow_moment,
    core_demo_proof: winner.demo_flow[0] ?? 'Demonstrate the core mechanism live.',
    primary_risk: winner.failure_modes[0] ?? 'Execution risk under time pressure.',
    fallback: winner.fallbacks[0] ?? 'Reduce to a smaller core-mechanism demo.',
  };

  // Persist all ideas (never discard losers)
  store.writeArtifact('ideas', 'candidates.yaml', {
    schema_version: '1.0',
    generated_at: nowIso(),
    strategy_mode: state.strategy.mode,
    generation_mode: generationMode,
    confidence,
    candidates,
  });
  store.writeArtifact('ideas', 'selected.yaml', {
    schema_version: '1.0',
    selected_at: nowIso(),
    selected_idea: selected,
    alternatives: candidates.slice(1).map((c) => ({
      id: c.id,
      name: c.name,
      total_score: c.total_score,
      rejection_reason: `Lower weighted score (${c.total_score}) than ${winner.name} (${winner.total_score}).`,
    })),
  });

  // Update state
  store.update((s) => {
    s.strategy.selected_idea = selected.name;
    s.gates.idea_gate = 'passed';
    if (s.delivery.phase === 'idea') s.delivery.phase = 'scope';
  });

  success(`Generated ${candidates.length} candidates; selected "${selected.name}".`);
  for (const c of candidates) {
    info(`  ${c.id === winner.id ? '★' : ' '} ${c.total_score.toFixed(2)}  ${c.name} — ${c.one_liner}`);
  }
  info('Next: hadk scope');
}

export async function cmdIdeaImport(store: StateStore, filePath: string): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  const result = readYamlFile<{ schema_version?: string; candidates: CandidateIdea[]; selected: SelectedIdea }>(filePath);
  if (!result.ok) return fail(`Could not read idea result file: ${result.error.message}`);
  if (!validateIdeaImportShape(result.value)) {
    const issues = (validateIdeaImportShape.errors ?? []).map((issue: { instancePath?: string; dataPath?: string; message?: string }) => `${issue.instancePath || issue.dataPath || '(root)'} ${issue.message}`);
    return fail(`Imported file does not match schemas/idea-import.schema.json: ${issues.join('; ')}`);
  }
  const { schema_version: schemaVersion, candidates, selected } = result.value;
  if (schemaVersion !== '1.0') {
    return fail('Imported file must declare `schema_version: "1.0"` (see schemas/idea-import.schema.json).');
  }
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return fail('Imported file must contain a non-empty `candidates` array.');
  }
  if (!selected?.name) {
    return fail('Imported file must contain a `selected` object with a `name`.');
  }

  const selectedCandidate = candidates.find((candidate) => candidate.id === selected.id);
  if (!selectedCandidate) {
    return fail(`Selected idea id "${selected.id}" must match a candidate.`);
  }
  if (selectedCandidate.name !== selected.name) {
    return fail(`Selected idea id "${selected.id}" and name "${selected.name}" refer to different candidates.`);
  }

  const profile = state.strategy.scoring_profile ?? SCORING_WEIGHTS[state.strategy.mode];
  const axes = Object.keys(profile);
  // Agent-provided totals are advisory. Require every strategy axis instead of
  // silently inventing a neutral score, then normalize raw or weighted input.
  for (const candidate of candidates) {
    const missing = axes.filter((axis) => typeof candidate.score_breakdown[axis] !== 'number');
    if (missing.length > 0) return fail(`Candidate "${candidate.name}" is missing strategy scores: ${missing.join(', ')}.`);
    const rawScores = candidate.score_breakdown_kind === 'weighted'
      ? Object.fromEntries(axes.map((axis) => [axis, candidate.score_breakdown[axis] / profile[axis]]))
      : candidate.score_breakdown;
    const scored = scoreIdea(rawScores, profile);
    candidate.score_breakdown = scored.breakdown;
    candidate.score_breakdown_kind = 'weighted';
    candidate.total_score = scored.total;
  }

  // Persist with honest provenance: imported from agent
  const candWrite = store.writeArtifact('ideas', 'candidates.yaml', {
    schema_version: '1.0',
    generated_at: nowIso(),
    imported_at: nowIso(),
    strategy_mode: state.strategy.mode,
    generation_mode: 'agent_imported',
    confidence: 'medium',
    source_file: filePath,
    candidates,
  });
  if (!candWrite.ok) return fail(candWrite.error.message);

  const selWrite = store.writeArtifact('ideas', 'selected.yaml', {
    schema_version: '1.0',
    selected_at: nowIso(),
    imported_at: nowIso(),
    selected_idea: selected,
    alternatives: candidates
      .filter((c) => c.id !== selectedCandidate.id)
      .map((c) => ({ id: c.id, name: c.name, total_score: c.total_score })),
  });
  if (!selWrite.ok) return fail(selWrite.error.message);

  store.update((s) => {
    s.strategy.selected_idea = selected.name;
    s.gates.idea_gate = 'passed';
    if (s.delivery.phase === 'idea') s.delivery.phase = 'scope';
  });

  success(`Imported ${candidates.length} candidates; selected "${selected.name}".`);
  info('Next: hadk scope');
}

// ─── scope ───────────────────────────────────────────────────────────────────

export async function cmdScope(store: StateStore, opts: { unlock?: boolean }): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  if (opts.unlock) {
    // Create a checkpoint before unlocking so the user can roll back
    const checkpoint = store.createCheckpoint('pre-unlock');
    if (!checkpoint.ok) {
      return fail(`Could not create checkpoint before unlocking scope: ${checkpoint.error.message}`);
    }
    store.update((s) => {
      s.scope.status = 'unlocked';
      // Cascade invalidation: scope and downstream gates must be re-earned
      s.gates.scope_gate = 'pending';
      s.gates.architecture_gate = 'pending';
      s.gates.build_gate = 'pending';
      s.gates.demo_gate = 'pending';
      s.gates.video_gate = 'pending';
      s.gates.submission_gate = 'pending';
      s.architecture.status = 'invalidated';
      s.architecture.invalidation_reason = 'scope unlocked by user';
      s.architecture.stale_since = new Date().toISOString();
      if (s.delivery.phase !== 'scope' && s.delivery.phase !== 'setup' && s.delivery.phase !== 'competition-intelligence' && s.delivery.phase !== 'strategy' && s.delivery.phase !== 'idea') {
        s.delivery.phase = 'scope';
      }
    });
    success('Scope unlocked. Downstream gates reset (scope → submission). A checkpoint was created.');
    info('Re-lock after changes: hadk scope');
    info('Roll back if needed: hadk rollback');
    return;
  }

  if (!state.strategy.selected_idea) {
    return fail('No idea selected.', 'Run `hadk idea` first.');
  }

  if (state.scope.status === 'locked') {
    warn('Scope is already locked. Use `hadk scope --unlock` or `hadk replan` to change it.');
    return;
  }

  const ideaName = state.strategy.selected_idea;

  const available = remainingHours(state.competition.deadline, state.competition.remaining_hours) ?? 48;
  const scope = buildScopeContract(state, ideaName, available);

  store.writeArtifact('scope', 'scope.yaml', scope);

  // Validate before locking
  const issues: string[] = [];
  if (scope.scope.core_demo_flow.length === 0) issues.push('no demo flow');
  if (!scope.scope.primary_wow_moment) issues.push('no wow moment');
  const totalHours = scope.scope.mvp_features.reduce((a, f) => a + f.estimated_hours, 0);
  if (totalHours > available) issues.push(`budget ${totalHours}h exceeds ${available}h`);
  for (const dep of scope.scope.external_dependencies) {
    if (!dep.fallback) issues.push(`dependency "${dep.name}" lacks fallback`);
  }

  if (issues.length > 0) {
    fail(`Scope gate failed: ${issues.join('; ')}`);
    store.update((s) => {
      s.gates.scope_gate = 'failed';
    });
    return;
  }

  store.update((s) => {
    s.scope.status = 'locked';
    s.scope.mvp_features = scope.scope.mvp_features;
    s.scope.deferred_features = scope.scope.deferred_features;
    s.scope.demo_flow = scope.scope.core_demo_flow;
    s.scope.primary_wow_moment = scope.scope.primary_wow_moment;
    s.scope.external_dependencies = scope.scope.external_dependencies;
    s.gates.scope_gate = 'passed';
    if (s.delivery.phase === 'scope') s.delivery.phase = 'architecture';
  });

  success(`Scope locked for "${ideaName}" (${scope.scope.mvp_features.length} MVP features, ${totalHours}h estimated).`);
  info(`Wow moment: ${scope.scope.primary_wow_moment?.description ?? 'TBD'}`);
  info('Next: hadk scaffold');
}

// ─── status / next ───────────────────────────────────────────────────────────

export async function cmdStatus(store: StateStore, orch: Orchestrator, opts: { json?: boolean }): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);

  const report = orch.getStatus(loaded.value);
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const rows: [string, string][] = [
    ['Competition', report.competition],
    ['Time remaining', report.time_remaining],
    ['Deadline mode', report.deadline_mode],
    ['Strategy mode', report.strategy_mode],
    ['Selected idea', report.selected_idea],
    ['Current phase', report.current_phase],
    ['Current gate', report.current_gate],
    ['MVP completion', report.mvp_completion],
    ['Critical risks', report.critical_risks.length ? report.critical_risks.join('; ') : 'none'],
    ['Demo status', report.demo_status],
    ['Video status', report.video_status],
    ['Submission status', report.submission_status],
    ['Next action', report.next_action.command],
  ];

  const width = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    console.log(`${k.padEnd(width)}  ${v}`);
  }
  if (report.next_action.blocked_by.length) {
    info(`Blocked by: ${report.next_action.blocked_by.join('; ')}`);
  }
}

export async function cmdNext(store: StateStore, orch: Orchestrator): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);

  const action = orch.getNextAction(loaded.value);
  console.log(action.command);
  info(action.description);
  if (action.blocked_by.length) info(`Blocked by: ${action.blocked_by.join('; ')}`);
}

// ─── checkpoint / rollback / replan ─────────────────────────────────────────

export async function cmdCheckpoint(store: StateStore, opts: { label?: string }): Promise<void> {
  ensureInitialized(store);
  const result = store.createCheckpoint(opts.label);
  if (!result.ok) return fail(result.error.message);
  success(`Checkpoint ${result.value.id} created (phase: ${result.value.phase}).`);
}

export async function cmdRollback(store: StateStore, checkpointId?: string): Promise<void> {
  ensureInitialized(store);
  const result = store.rollback(checkpointId);
  if (!result.ok) return fail(result.error.message, result.error.hint);
  success(`Rolled back to phase: ${result.value.delivery.phase}`);
}

export async function cmdReplan(store: StateStore, orch: Orchestrator, opts: { reason?: string }): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const checkpoint = store.createCheckpoint('pre-replan');
  if (!checkpoint.ok) {
    return fail(`Could not create checkpoint before replanning: ${checkpoint.error.message}`);
  }
  const result = orch.replan(loaded.value, opts.reason ?? 'manual replan');
  if (!result.ok) return fail(result.error.message);
  success(`Replan triggered. Scope unlocked — re-run \`hadk scope\` after adjusting. Checkpoint ${checkpoint.value.id} created.`);
}

// ─── demo / judge / submit ───────────────────────────────────────────────────

export async function cmdDemo(store: StateStore): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  if (state.gates.build_gate !== 'passed') {
    return fail('Build gate has not passed.', 'Run `hadk validate build` after installing and building the generated project.');
  }
  if (state.scope.demo_flow.length === 0) {
    return fail('No demo flow defined.', 'Lock scope with `hadk scope` first.');
  }

  store.update((s) => {
    s.delivery.demo_status = 'validated';
    s.gates.demo_gate = 'passed';
    if (s.delivery.phase === 'demo') s.delivery.phase = 'video';
  });
  store.writeArtifact('demo', 'demo-checklist.yaml', {
    validated_at: nowIso(),
    demo_flow: state.scope.demo_flow,
    reset_command: 'pnpm demo:reset',
    fallback_mode: 'DEMO_FALLBACK_MODE=true',
  });
  success('Demo path validated. Checklist written to .hackathon/artifacts/demo/.');
}

export async function cmdJudge(store: StateStore): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  if (state.gates.video_gate !== 'passed') {
    return fail('Video gate has not passed.', 'Run `hadk video render` and resolve any render blocker first.');
  }

  const criteria = state.competition.judging_criteria.map((c) => c.name);
  store.writeArtifact('pitch', 'judge-prep.yaml', {
    prepared_at: nowIso(),
    selected_idea: state.strategy.selected_idea,
    judging_criteria: criteria,
    anticipated_questions: criteria.map((c) => `How does your project score on "${c}"?`),
    memory_hook: state.scope.primary_wow_moment?.judge_takeaway ?? 'TBD',
    note: 'Refine with the hackathon-judge-simulator skill for adversarial Q&A.',
  });
  store.update((s) => {
    if (s.delivery.phase === 'judge') s.delivery.phase = 'submission';
  });
  success('Judge preparation artifact written to .hackathon/artifacts/pitch/.');
}

export async function cmdSubmit(store: StateStore, opts: { repository?: string }): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  if (state.delivery.phase !== 'submission' || !store.listArtifacts('pitch').includes('judge-prep.yaml')) {
    return fail('Judge preparation is required before submission.', 'Run `hadk judge` after the video gate passes.');
  }
  if (!opts.repository || !/^https:\/\//.test(opts.repository)) {
    return fail('A public repository URL is required for submission.', 'Run `hadk submit --repository https://github.com/org/repo`.');
  }

  store.writeArtifact('submission', 'submission.yaml', {
    prepared_at: nowIso(),
    competition: state.competition.name,
    project: state.strategy.selected_idea,
    description: `Submission for ${state.competition.name ?? 'competition'}.`,
    repository_link: opts.repository,
    video_artifact: state.delivery.video_status === 'rendered',
    pitch_artifact: store.listArtifacts('pitch').length > 0,
    sponsor_evidence: state.competition.sponsor_requirements.map((r) => r.sponsor),
    checklist: [
      'Repository link added',
      'Demo video attached',
      'Pitch deck attached',
      'Sponsor requirements evidenced',
      'Character limits respected',
    ],
  });
  store.update((s) => {
    s.delivery.submission_status = 'ready';
    s.gates.submission_gate = 'passed';
    if (s.delivery.phase === 'submission') s.delivery.phase = 'complete';
  });
  success('Submission package prepared at .hackathon/artifacts/submission/.');
  info('Review the checklist and fill in the repository link before submitting.');
}

// ─── doctor ──────────────────────────────────────────────────────────────────

export async function cmdDoctor(store: StateStore, hadkRoot: string): Promise<void> {
  let problems = 0;
  const check = (label: string, okCond: boolean, hint?: string) => {
    if (okCond) {
      success(label);
    } else {
      warn(`${label}${hint ? ` — ${hint}` : ''}`);
      problems++;
    }
  };

  check(`Node.js ${process.version}`, process.versions.node !== undefined);
  check('Package manager', detectPackageManager() !== null, 'install pnpm or npm');
  check('git', commandOnPath('git'), 'install git');
  check('HyperFrames CLI', commandOnPath('hyperframes'), 'optional; video rendering requires it');

  check('State initialized', store.isInitialized(), 'run `hadk setup`');
  if (store.isInitialized()) {
    const loaded = store.load();
    check('State valid', loaded.ok, loaded.ok ? undefined : loaded.error.message);
  }

  const registry = validateRegistry(hadkRoot);
  check('Registry valid', registry.passed, registry.issues.find((i) => i.severity === 'error')?.message);

  if (problems === 0) {
    success('Environment looks healthy.');
  } else {
    warn(`${problems} issue(s) found.`);
    process.exitCode = 1;
  }
}

// ─── update ──────────────────────────────────────────────────────────────────

export async function cmdUpdate(): Promise<void> {
  info('To update HADK, re-run the installer:');
  info('  curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/main/install.sh | bash');
  info('The installer is idempotent and non-destructive.');
}

// ─── Startup discovery ───────────────────────────────────────────────────────

const validationMethods = ['user_interview', 'expert_interview', 'survey', 'landing_page_test', 'fake_door_test', 'concierge_mvp', 'prototype_usability_test', 'pilot', 'pre_order', 'letter_of_intent', 'manual_workflow_experiment'] as const;

function startupState(store: StateStore): void {
  store.update((s) => {
    s.startup ??= {
      pain_point_research_status: 'pending', opportunity_scorecard_status: 'pending', selected_pain_point_id: null,
      pain_point_deep_dive_status: 'pending', validation_plan_status: 'pending', customer_evidence_status: 'pending', hackathon_adapter_status: 'pending',
    };
  });
}

function writeOptionalOutput(path: string | undefined, data: unknown): boolean {
  if (!path) return true;
  const written = writeYamlFileAtomic(resolve(path), data);
  if (!written.ok) {
    fail(`Could not write --output: ${written.error.message}`);
    return false;
  }
  return true;
}

function readStartupYaml<T>(path: string, label: string): T | null {
  const result = readYamlFile<T>(path);
  if (!result.ok) {
    fail(`Could not read ${label}: ${result.error.message}`);
    return null;
  }
  return result.value;
}

type StartupSource = {
  source_id: string;
  source: string;
  source_type: 'local_markdown' | 'local_text' | 'local_yaml' | 'local_json' | 'public_url' | 'user_statement' | 'agent_observation';
  retrieved_at: string;
  content_hash: string | null;
  retrieval_status: 'retrieved' | 'failed' | 'empty';
  extraction_confidence: 'low' | 'medium' | 'high';
  extraction_warnings: string[];
  locator: string | null;
  evidence_excerpt: string | null;
};

function sourceType(pathOrUrl: string): StartupSource['source_type'] {
  if (/^https?:\/\//i.test(pathOrUrl)) return 'public_url';
  const extension = extname(pathOrUrl).toLowerCase();
  if (extension === '.md' || extension === '.markdown') return 'local_markdown';
  if (extension === '.yaml' || extension === '.yml') return 'local_yaml';
  if (extension === '.json') return 'local_json';
  return 'local_text';
}

function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function sourceList(opts: { source?: string | string[]; sourcesFile?: string }): string[] | null {
  const values = opts.source ? (Array.isArray(opts.source) ? opts.source : [opts.source]) : [];
  if (!opts.sourcesFile) return values;
  const loaded = readStartupYaml<any>(resolve(opts.sourcesFile), 'sources file');
  if (!loaded) return null;
  const fromFile = Array.isArray(loaded) ? loaded : loaded.sources;
  if (!Array.isArray(fromFile) || fromFile.some((source) => typeof source !== 'string')) {
    fail('Sources file must contain a YAML/JSON array of source strings or `{ sources: [...] }`.');
    return null;
  }
  return [...values, ...fromFile];
}

async function ingestStartupSource(source: string): Promise<StartupSource> {
  const retrievedAt = nowIso();
  const type = sourceType(source);
  const base = { source_id: generateId('source'), source, source_type: type, retrieved_at: retrievedAt, locator: null } as const;
  if (type === 'public_url') {
    try {
      const url = new URL(source);
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) return { ...base, content_hash: null, retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: [`HTTP ${response.status} ${response.statusText}`], evidence_excerpt: null };
      const content = await response.text();
      if (!content.trim()) return { ...base, content_hash: hashContent(content), retrieval_status: 'empty', extraction_confidence: 'low', extraction_warnings: ['URL returned an empty response.'], evidence_excerpt: null };
      return { ...base, content_hash: hashContent(content), retrieval_status: 'retrieved', extraction_confidence: 'low', extraction_warnings: ['Content was retrieved but no claims were extracted by the deterministic handler.'], evidence_excerpt: content.slice(0, 500) };
    } catch (error) {
      return { ...base, content_hash: null, retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: [`URL retrieval failed: ${(error as Error).message}`], evidence_excerpt: null };
    }
  }
  if (basename(source).startsWith('.') || /\.env|credentials|secret/i.test(source)) {
    return { ...base, content_hash: null, retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: ['Potential secret-bearing file was not read.'], evidence_excerpt: null };
  }
  if (!existsSync(resolve(source))) return { ...base, content_hash: null, retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: [`Local source file not found: ${source}`], evidence_excerpt: null };
  try {
    const content = readFileSync(resolve(source), 'utf8');
    if (type === 'local_yaml' || type === 'local_json') {
      const parsed = readYamlFile<unknown>(resolve(source));
      if (!parsed.ok) return { ...base, content_hash: hashContent(content), retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: [`Structured source could not be parsed: ${parsed.error.message}`], evidence_excerpt: null };
    }
    if (!content.trim()) return { ...base, content_hash: hashContent(content), retrieval_status: 'empty', extraction_confidence: 'low', extraction_warnings: ['Local source is empty.'], evidence_excerpt: null };
    return { ...base, content_hash: hashContent(content), retrieval_status: 'retrieved', extraction_confidence: 'low', extraction_warnings: ['Content was read but no claims were extracted by the deterministic handler.'], evidence_excerpt: content.slice(0, 500) };
  } catch (error) {
    return { ...base, content_hash: null, retrieval_status: 'failed', extraction_confidence: 'low', extraction_warnings: [`Local source could not be read: ${(error as Error).message}`], evidence_excerpt: null };
  }
}

function researchHandoffPrompt(agent: 'claude-code' | 'codex', state: CompetitionState, market: string, segments: string[], sources: string[], outputPath: string): string {
  return [
    `# HADK Startup Pain-Point Research Handoff — ${agent}`,
    '',
    '## Venture context',
    `Market: ${market}`,
    `Target segments: ${segments.join(', ')}`,
    `Competition: ${state.competition.name ?? 'not specified'}`,
    '',
    '## Available sources',
    ...(sources.length ? sources.map((source) => `- ${source}`) : ['- No external source supplied; record this as a research gap.']),
    '',
    '## Required contract',
    'Read the available sources only within your tools and permissions. Return YAML matching `schemas/skills/startup-pain-point-research.output.schema.json`.',
    `Save the result to ${outputPath}.`,
    'Preserve provenance for every externally sourced claim: source identifier, source type, retrieval status, locator, and excerpt where safe.',
    '',
    '## Evidence rules',
    '- Separate direct user evidence, secondary research, market signals, founder observations, inference, and hypothesis.',
    '- Never fabricate interviews, quotes, statistics, citations, or customer evidence.',
    '- Search for disconfirming evidence and state unresolved research gaps.',
    '- Label confidence and extraction warnings. Failed or inaccessible sources are not validated evidence.',
    '- Do not generate a product idea. Recommend a pain point for deep dive only.',
    '',
    '## Validation checklist',
    '- Every pain point has evidence type, confidence, assumptions, research gaps, and provenance.',
    '- All claims are traceable to a supplied source or explicitly labeled inference/hypothesis.',
    '- The YAML parses and satisfies the input/output schema contract.',
    `Next action after review: hadk startup scorecard --research-file ${outputPath}`,
  ].join('\n');
}

export async function cmdStartupResearch(
  store: StateStore,
  opts: { market?: string; segments?: string; source?: string | string[]; sourcesFile?: string; agent?: string; output?: string; agentHandoff?: boolean },
): Promise<void> {
  ensureInitialized(store);
  startupState(store);
  const market = opts.market?.trim();
  const segments = (opts.segments ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!market) return fail('--market is required.', 'Example: hadk startup research --market "clinic operations" --segments "practice managers,clinicians"');
  if (segments.length === 0) return fail('--segments must contain at least one segment.');
  const sources = sourceList(opts);
  if (!sources) return;
  const provenance = await Promise.all(sources.map((source) => ingestStartupSource(source)));
  const failedSources = provenance.filter((source) => source.retrieval_status === 'failed');
  if (failedSources.length) warn(`${failedSources.length} source(s) could not be retrieved; they are recorded as unavailable, not evidence.`);

  const researchedAt = nowIso();
  const painPoints = segments.map((segment, index) => ({
    id: generateId('pain'), segment,
    job_to_be_done: `Complete the highest-value workflow in ${market}.`,
    situation: `The ${segment} segment encounters this workflow in normal operations.`,
    pain: `The workflow may be slower, riskier, or more expensive than desired.`,
    current_workaround: 'Unknown; document the existing workaround during interviews.',
    consequence: 'Unknown; quantify time, cost, risk, and emotional impact during validation.',
    frequency: 'Unknown', severity: 'Unknown', urgency: 'Unknown', economic_impact: 'Unknown',
    evidence: [],
    evidence_type: 'hypothesis' as const, confidence: 'low' as const,
    assumptions: [`${segment} experiences a meaningful version of this workflow pain.`],
    research_gaps: ['Direct user evidence', 'Frequency and severity measures', 'Current alternatives and spend'],
    rank: index + 1,
  }));
  const artifact = {
    schema_version: '1.0', research_id: generateId('research'), researched_at: researchedAt, market,
    target_segments: segments,
    observed_workflows: segments.map((segment) => ({ segment, job_to_be_done: `Complete the highest-value workflow in ${market}.`, steps: ['Trigger and context are unknown', 'Current workflow is unknown', 'Outcome and consequence are unknown'] })),
    pain_points: painPoints, opportunity_areas: [`Unverified workflow improvements for ${market}`],
    recommended_pain_point_id: painPoints[0].id, recommended_next_skill: 'startup-pain-point-deep-dive',
    source_references: sources,
    provenance,
    generation: { mode: 'heuristic_fallback', agent_intent: opts.agent ?? null, claims_validated: false },
  };
  const written = store.writeArtifact('startup-discovery', 'pain-point-research.yaml', artifact);
  if (!written.ok) return fail(written.error.message);
  if (!writeOptionalOutput(opts.output, artifact)) return;
  store.update((s) => { s.startup!.pain_point_research_status = 'passed'; s.startup!.selected_pain_point_id = artifact.recommended_pain_point_id; s.startup!.latest_research_artifact = written.value; });
  success(`Pain-point research created for ${market} (${painPoints.length} candidate pain points).`);
  info(`Artifact: ${written.value}`);
  info('Confidence: low until source evidence is reviewed.');
  info(`Next: hadk startup deep-dive ${artifact.recommended_pain_point_id}`);
  if (opts.agentHandoff || opts.agent === 'claude-code' || opts.agent === 'codex') {
    const agents: ('claude-code' | 'codex')[] = opts.agent === 'claude-code' ? ['claude-code'] : opts.agent === 'codex' ? ['codex'] : ['claude-code', 'codex'];
    const stateResult = store.load();
    if (!stateResult.ok) return fail(stateResult.error.message);
    for (const agent of agents) {
      const prompt = researchHandoffPrompt(agent, stateResult.value, market, segments, sources, written.value);
      const handoff = store.writeTextArtifact('startup-discovery/agent-handoffs', `pain-point-research-${agent}.md`, prompt);
      if (!handoff.ok) return fail(handoff.error.message);
      store.update((s) => { s.startup!.latest_agent_handoff_artifact = handoff.value; });
      info(`Agent handoff: ${handoff.value}`);
    }
  }
}

const scorecardDimensions = {
  severity: 0.25,
  frequency: 0.2,
  urgency: 0.2,
  buyer_access: 0.2,
  willingness_to_pay: 0.15,
};

function evidenceStatus(painPoint: any): 'validated' | 'assumed' | 'hypothetical' {
  if (painPoint.evidence_type === 'direct_user_evidence' || painPoint.evidence_type === 'secondary_research' || painPoint.evidence_type === 'market_signal') return 'validated';
  if (painPoint.evidence_type === 'inference' || painPoint.evidence_type === 'founder_observation') return 'assumed';
  return 'hypothetical';
}

function scoreDimension(painPoint: any, dimension: string): { score: number; rationale: string; evidence: string[]; confidence: 'low' | 'medium' | 'high'; evidence_status: 'validated' | 'assumed' | 'hypothetical' } {
  const status = evidenceStatus(painPoint);
  const value = String(painPoint[dimension] ?? '').toLowerCase();
  const known = value && value !== 'unknown' && value !== 'tbd';
  const score = known ? 3 : 1;
  return {
    score,
    rationale: known ? `${dimension} is recorded in the research artifact but has not been independently scored.` : `${dimension} is missing or unknown; use the minimum provisional score until evidence is collected.`,
    evidence: (painPoint.evidence ?? []).map((item: any) => item.source ?? item.claim).filter(Boolean),
    confidence: known && status === 'validated' ? 'medium' : 'low',
    evidence_status: status,
  };
}

export async function cmdStartupScorecard(
  store: StateStore,
  opts: { researchFile?: string; deepDiveFile?: string; agent?: string },
): Promise<void> {
  ensureInitialized(store);
  startupState(store);
  const researchPath = resolve(opts.researchFile ?? store.artifactPath('startup-discovery', 'pain-point-research.yaml'));
  const research = readStartupYaml<any>(researchPath, 'research artifact');
  if (!research) return;
  if (!Array.isArray(research.pain_points) || research.pain_points.length === 0) return fail('Research artifact contains no pain points.', 'Run `hadk startup research` with at least one target segment.');
  const deepDive = opts.deepDiveFile ? readStartupYaml<any>(resolve(opts.deepDiveFile), 'deep-dive artifact') : null;
  if (opts.deepDiveFile && !deepDive) return;
  const dimensions = Object.fromEntries(Object.entries(scorecardDimensions).map(([name, weight]) => [name, { weight, scale: '1-5' }]));
  const scores = research.pain_points.map((painPoint: any) => {
    const dimensionScores = Object.fromEntries(Object.keys(scorecardDimensions).map((dimension) => [dimension, scoreDimension(painPoint, dimension)]));
    const weightedScore = Object.entries(scorecardDimensions).reduce((total, [dimension, weight]) => total + (dimensionScores[dimension] as any).score * weight, 0);
    const missingEvidence = painPoint.research_gaps ?? ['Direct user evidence', 'Buyer access and willingness-to-pay evidence'];
    return {
      pain_point_id: painPoint.id,
      pain_point: painPoint.pain,
      scores: dimensionScores,
      weighted_score: Math.round(weightedScore * 100) / 100,
      score_confidence: 'low',
      key_risks: ['Numeric scores are provisional and can create false precision.', 'Buyer access and willingness to pay remain unverified.'],
      missing_evidence: missingEvidence,
      recommended_action: 'deep_dive',
    };
  }).sort((a: any, b: any) => b.weighted_score - a.weighted_score);
  const ranking = scores.map((score: any, index: number) => ({ pain_point_id: score.pain_point_id, rank: index + 1, weighted_score: score.weighted_score, recommendation: score.recommended_action }));
  const artifact = {
    schema_version: '1.0', scorecard_id: generateId('scorecard'), created_at: nowIso(),
    scoring_method: 'Transparent weighted 1-5 provisional score; scores are prioritization signals, not product-market-fit proof.',
    dimensions, pain_point_scores: scores, ranking, recommended_pain_point_id: ranking[0].pain_point_id,
    decision: 'Prioritize the top pain point for disconfirming deep dive while collecting the missing evidence listed for every score.',
    next_skill: 'startup-pain-point-deep-dive',
    provenance: research.provenance ?? [], source_deep_dive_id: deepDive?.deep_dive_id ?? null, generation: { mode: 'deterministic_scorecard', agent_intent: opts.agent ?? null },
  };
  const written = store.writeArtifact('startup-discovery', 'opportunity-scorecard.yaml', artifact);
  if (!written.ok) return fail(written.error.message);
  store.update((s) => { s.startup!.opportunity_scorecard_status = 'passed'; s.startup!.selected_pain_point_id = artifact.recommended_pain_point_id; s.startup!.latest_scorecard_artifact = written.value; });
  success(`Opportunity scorecard ranked ${scores.length} pain points.`);
  info(`Artifact: ${written.value}`);
  info(`Recommended pain point: ${artifact.recommended_pain_point_id} (provisional, low confidence)`);
  info(`Next: hadk startup deep-dive ${artifact.recommended_pain_point_id}`);
}

type StartupStatusReport = {
  initialized: boolean;
  phase: string;
  research: { status: string; artifact: string | null; pain_points: number };
  recommended_pain_point_id: string | null;
  scorecard: { status: string; artifact: string | null };
  deep_dive: { status: string; artifact: string | null };
  validation_plan: { status: string; artifact: string | null };
  customer_evidence: { status: string; artifact: string | null };
  agent_handoff: { status: string; artifact: string | null };
  blocking_issues: string[];
  next_action: { command: string; reason: string };
};

function startupStatusReport(store: StateStore): StartupStatusReport {
  if (!store.isInitialized()) return { initialized: false, phase: 'not_initialized', research: { status: 'pending', artifact: null, pain_points: 0 }, recommended_pain_point_id: null, scorecard: { status: 'pending', artifact: null }, deep_dive: { status: 'pending', artifact: null }, validation_plan: { status: 'pending', artifact: null }, customer_evidence: { status: 'pending', artifact: null }, agent_handoff: { status: 'pending', artifact: null }, blocking_issues: [], next_action: { command: 'hadk startup research --market <market> --segments <segments>', reason: 'Initialize startup discovery by creating a pain-point research artifact.' } };
  const loaded = store.load();
  if (!loaded.ok) return { initialized: true, phase: 'blocked', research: { status: 'failed', artifact: null, pain_points: 0 }, recommended_pain_point_id: null, scorecard: { status: 'blocked', artifact: null }, deep_dive: { status: 'blocked', artifact: null }, validation_plan: { status: 'blocked', artifact: null }, customer_evidence: { status: 'blocked', artifact: null }, agent_handoff: { status: 'blocked', artifact: null }, blocking_issues: [loaded.error.message], next_action: { command: 'hadk startup research', reason: 'State could not be loaded.' } };
  const state = loaded.value;
  const researchPath = store.artifactPath('startup-discovery', 'pain-point-research.yaml');
  const scorecardPath = store.artifactPath('startup-discovery', 'opportunity-scorecard.yaml');
  const deepDivePath = store.artifactPath('startup-discovery', 'pain-point-deep-dive.yaml');
  const validationPath = store.artifactPath('startup-discovery', 'validation-plan.yaml');
  const customerPaths = [store.artifactPath('startup-discovery', 'customer-evidence.yaml'), store.artifactPath('startup-validation', 'customer-evidence.yaml')];
  const handoffDir = join(store.artifactsDir, 'startup-discovery', 'agent-handoffs');
  const research = existsSync(researchPath) ? readStartupYaml<any>(researchPath, 'research artifact') : null;
  const customerPath = customerPaths.find((path) => existsSync(path)) ?? null;
  const customerEvidence = customerPath ? readStartupYaml<any>(customerPath, 'customer evidence artifact') : null;
  const startup = state.startup ?? { pain_point_research_status: 'pending', opportunity_scorecard_status: 'pending', selected_pain_point_id: null, pain_point_deep_dive_status: 'pending', validation_plan_status: 'pending', customer_evidence_status: 'pending', hackathon_adapter_status: 'pending' };
  const recommended = (existsSync(scorecardPath) ? readStartupYaml<any>(scorecardPath, 'scorecard artifact')?.recommended_pain_point_id : null) ?? startup.selected_pain_point_id ?? (research?.recommended_pain_point_id ?? null);
  const status: StartupStatusReport = {
    initialized: true, phase: customerPath && customerEvidence?.unresolved_assumptions?.length ? 'evidence-needs-validation' : customerPath ? 'customer-evidence' : existsSync(validationPath) ? 'validation-planned' : existsSync(deepDivePath) ? 'deep-dive-complete' : existsSync(scorecardPath) ? 'opportunity-scored' : existsSync(researchPath) ? 'research-complete' : 'not_started',
    research: { status: existsSync(researchPath) ? 'completed' : 'pending', artifact: existsSync(researchPath) ? researchPath : null, pain_points: research?.pain_points?.length ?? 0 },
    recommended_pain_point_id: recommended,
    scorecard: { status: existsSync(scorecardPath) ? 'completed' : 'pending', artifact: existsSync(scorecardPath) ? scorecardPath : null },
    deep_dive: { status: existsSync(deepDivePath) ? 'completed' : 'pending', artifact: existsSync(deepDivePath) ? deepDivePath : null },
    validation_plan: { status: existsSync(validationPath) ? 'completed' : 'pending', artifact: existsSync(validationPath) ? validationPath : null },
    customer_evidence: { status: customerPath ? 'completed' : 'pending', artifact: customerPath },
    agent_handoff: { status: existsSync(handoffDir) ? 'completed' : 'pending', artifact: startup.latest_agent_handoff_artifact ?? null },
    blocking_issues: [
      ...(!existsSync(researchPath) ? ['Pain-point research artifact is missing.'] : []),
      ...(existsSync(researchPath) && !existsSync(scorecardPath) ? ['Opportunity scorecard is missing.'] : []),
      ...(existsSync(scorecardPath) && !existsSync(deepDivePath) ? ['Pain-point deep dive is missing.'] : []),
      ...(existsSync(deepDivePath) && !existsSync(validationPath) ? ['Validation plan is missing.'] : []),
    ],
    next_action: { command: 'hadk startup research', reason: 'No research artifact exists.' },
  };
  status.next_action = startupNextAction(status);
  return status;
}

function startupNextAction(status: StartupStatusReport): { command: string; reason: string } {
  if (!status.initialized || status.research.status !== 'completed') return { command: 'hadk startup research --market <market> --segments <segments>', reason: 'Research is the blocking dependency.' };
  if (status.scorecard.status !== 'completed') return { command: 'hadk startup scorecard', reason: 'Research exists but pain points have not been ranked transparently.' };
  if (status.deep_dive.status !== 'completed') return { command: `hadk startup deep-dive ${status.recommended_pain_point_id ?? '<pain-point-id>'}`, reason: 'The top-ranked pain point needs disconfirming deep dive.' };
  if (status.validation_plan.status !== 'completed') return { command: 'hadk startup validate', reason: 'Deep dive exists but no falsifiable validation plan exists.' };
  if (status.customer_evidence.status !== 'completed') return { command: 'agent-handoff: startup-customer-evidence', reason: 'Collect direct customer evidence from the validation plan; this is an agent/manual action, not a built-in CLI command.' };
  if (status.phase === 'evidence-needs-validation') return { command: 'agent-handoff: startup additional validation', reason: 'Customer evidence contains unresolved assumptions; run additional falsifiable tests before solution hypotheses.' };
  return { command: 'agent-handoff: startup solution hypothesis', reason: 'Startup discovery is complete; generate solution hypotheses from validated pain points.' };
}

export async function cmdStartupStatus(store: StateStore, opts: { json?: boolean }): Promise<void> {
  const report = startupStatusReport(store);
  if (opts.json) { console.log(JSON.stringify(report, null, 2)); return; }
  console.log('Startup discovery status');
  console.log(`Initialized: ${report.initialized ? 'yes' : 'no'}`);
  console.log(`Phase: ${report.phase}`);
  console.log(`Research: ${report.research.status}`);
  console.log(`Pain points: ${report.research.pain_points}`);
  console.log(`Recommended pain point: ${report.recommended_pain_point_id ?? '(none)'}`);
  console.log(`Scorecard: ${report.scorecard.status}`);
  console.log(`Deep dive: ${report.deep_dive.status}`);
  console.log(`Validation plan: ${report.validation_plan.status}`);
  console.log(`Customer evidence: ${report.customer_evidence.status}`);
  console.log(`Agent handoff: ${report.agent_handoff.status}`);
  console.log('');
  console.log('Next:');
  console.log(`  ${report.next_action.command}`);
  info(report.next_action.reason);
}

export async function cmdStartupNext(store: StateStore): Promise<void> {
  const report = startupStatusReport(store);
  console.log(report.next_action.command);
  info(report.next_action.reason);
}

export async function cmdStartupDeepDive(
  store: StateStore,
  painPointId: string,
  opts: { researchFile?: string; painPointFile?: string; agent?: string },
): Promise<void> {
  ensureInitialized(store);
  startupState(store);
  const defaultPath = store.artifactPath('startup-discovery', 'pain-point-research.yaml');
  const researchPath = resolve(opts.researchFile ?? defaultPath);
  const research = readStartupYaml<any>(researchPath, 'research artifact');
  if (!research) return;
  const painPoint = opts.painPointFile ? readStartupYaml<any>(resolve(opts.painPointFile), 'pain-point file') : research.pain_points?.find((p: any) => p.id === painPointId);
  if (!painPoint) return fail(`Unknown pain point "${painPointId}".`, `Choose one of: ${(research.pain_points ?? []).map((p: any) => p.id).join(', ') || 'none'}`);
  if (painPoint.id !== painPointId) return fail(`Pain-point file does not contain requested id "${painPointId}".`);
  const artifact = {
    schema_version: '1.0', deep_dive_id: generateId('deep-dive'), created_at: nowIso(), pain_point_id: painPointId,
    pain_point: painPoint.pain, primary_segment: painPoint.segment, user: painPoint.segment, buyer: 'Unknown; validate separately', decision_maker: 'Unknown; validate separately',
    trigger: painPoint.situation, current_workflow: ['Unknown; observe the workflow directly'], current_workarounds: [painPoint.current_workaround],
    consequences: { time: 'Unknown', cost: 'Unknown', risk: 'Unknown', emotional: 'Unknown', operational: painPoint.consequence },
    frequency: painPoint.frequency, severity: painPoint.severity, urgency: painPoint.urgency, switching_barriers: ['Unknown; ask what prevents changing the current workaround'],
    alternatives: ['Current workaround', 'Unknown alternatives; discover during interviews'], willingness_to_pay_signals: ['No willingness-to-pay evidence captured'],
    supporting_evidence: painPoint.evidence ?? [], disconfirming_evidence: [{ claim: 'The pain may not be important enough to change behavior.', source: 'Required validation question; no disconfirming evidence collected yet.' }],
    assumptions: [...(painPoint.assumptions ?? []), 'A user, buyer, and decision maker may be different people.'],
    validation_questions: ['Tell me about the last time this happened.', 'What do you do today instead?', 'What does this cost in time, money, or risk?', 'When is this problem not important?', 'What would make you switch or pay?'],
    pain_point_verdict: 'insufficient_evidence' as const, confidence: 'low' as const, recommended_next_action: 'Run startup-validation-plan and collect direct user evidence.',
    provenance: { generation_mode: 'heuristic_fallback', agent_intent: opts.agent ?? null },
  };
  const written = store.writeArtifact('startup-discovery', 'pain-point-deep-dive.yaml', artifact);
  if (!written.ok) return fail(written.error.message);
  store.update((s) => { s.startup!.pain_point_deep_dive_status = 'passed'; s.startup!.selected_pain_point_id = painPointId; s.startup!.latest_deep_dive_artifact = written.value; });
  success(`Pain-point deep dive created for ${painPointId}.`);
  info(`Artifact: ${written.value}`);
  info('Verdict: insufficient_evidence. No product recommendation was made.');
  info('Next: hadk startup validate');
}

export async function cmdStartupValidate(
  store: StateStore,
  opts: { deepDiveFile?: string; methods?: string; timelineDays?: string; agent?: string },
): Promise<void> {
  ensureInitialized(store);
  startupState(store);
  const deepDive = readStartupYaml<any>(resolve(opts.deepDiveFile ?? store.artifactPath('startup-discovery', 'pain-point-deep-dive.yaml')), 'deep-dive artifact');
  if (!deepDive) return;
  const methods = (opts.methods ?? 'user_interview,manual_workflow_experiment').split(',').map((m) => m.trim()).filter(Boolean);
  const invalid = methods.filter((m) => !(validationMethods as readonly string[]).includes(m));
  if (invalid.length) return fail(`Invalid validation method(s): ${invalid.join(', ')}.`, `Allowed: ${validationMethods.join(', ')}`);
  const timelineDays = Number(opts.timelineDays ?? '7');
  if (!Number.isInteger(timelineDays) || timelineDays < 1) return fail('--timeline-days must be a positive integer.');
  const hypotheses = [
    { id: generateId('hypothesis'), statement: 'The target user experiences this pain frequently enough to seek change.', category: 'frequency' as const, importance: 'critical' as const, current_confidence: 'low' as const, validation_method: methods[0] as typeof validationMethods[number], target_participants: deepDive.primary_segment, sample_size: 5, interview_or_test_questions: deepDive.validation_questions ?? [], success_threshold: 'At least 3 of 5 participants describe a recent recurring instance.', falsification_threshold: 'Fewer than 2 participants describe a recent instance or workaround.', timeline: `${timelineDays} days`, owner: 'founder', evidence_to_capture: 'Dated interview notes with source references and observed behavior.', status: 'planned' as const, next_decision: 'Continue if threshold passes; revise or stop if falsified.' },
    { id: generateId('hypothesis'), statement: 'The consequences are severe enough to justify changing the current workaround.', category: 'severity' as const, importance: 'high' as const, current_confidence: 'low' as const, validation_method: (methods[1] ?? methods[0]) as typeof validationMethods[number], target_participants: deepDive.primary_segment, sample_size: 5, interview_or_test_questions: ['What happens when this problem is not solved?', 'What have you already tried?'], success_threshold: 'At least 3 of 5 participants report a material time, cost, risk, or operational consequence.', falsification_threshold: 'Most participants report negligible consequences and no motivation to change.', timeline: `${timelineDays} days`, owner: 'founder', evidence_to_capture: 'Specific consequence examples and existing spend/workaround effort.', status: 'planned' as const, next_decision: 'Prioritize customer evidence only if material consequences are observed.' },
  ];
  const artifact = { schema_version: '1.0', validation_plan_id: generateId('validation'), created_at: nowIso(), source_pain_point_id: deepDive.pain_point_id, hypotheses, sequence: hypotheses.map((h) => h.id), decision_rules: ['Do not call the pain validated without direct evidence.', 'Stop or revise when a falsification threshold is met.', 'Advance to customer evidence only after the problem thresholds are met.'], expected_outcomes: ['Evidence-backed pain assessment', 'Explicit disconfirmation or revised assumptions'], recommended_next_skill: 'startup-customer-evidence', provenance: { generation_mode: 'heuristic_fallback', agent_intent: opts.agent ?? null } };
  const written = store.writeArtifact('startup-discovery', 'validation-plan.yaml', artifact);
  if (!written.ok) return fail(written.error.message);
  store.update((s) => { s.startup!.validation_plan_status = 'passed'; s.startup!.latest_validation_plan_artifact = written.value; });
  success(`Validation plan created with ${hypotheses.length} falsifiable hypotheses.`);
  info(`Artifact: ${written.value}`);
  info('Next: startup-customer-evidence (collect evidence; the plan itself is not validation).');
}

export async function cmdStartupAdaptHackathon(
  store: StateStore,
  opts: { profile?: string; sourceSkills?: string; agent?: string },
): Promise<void> {
  ensureInitialized(store);
  startupState(store);
  const profile = opts.profile ?? 'startup';
  if (profile !== 'startup' && profile !== 'startup-contest') return fail('--profile must be startup or startup-contest.');
  const mappings = [
    ['hackathon-problem-space', 'startup-pain-point-research', 'adapt', 'Replace broad track framing with evidence-aware pain research.'],
    ['hackathon-idea-strategy', 'startup venture strategy', 'adapt', 'Move strategy after problem evidence and add market, buyer, and evidence constraints.'],
    ['hackathon-idea-generator', 'startup solution hypothesis generation', 'adapt', 'Generate solution hypotheses only after a pain point, not as validated products.'],
    ['hackathon-idea-scoring', 'startup opportunity scoring', 'adapt', 'Score evidence strength, urgency, willingness to pay, and access instead of demo appeal alone.'],
    ['hackathon-scope-cutter', 'startup MVP or experiment scope', 'adapt', 'Turn demo scope into learning and validation scope.'],
    ['hackathon-wow-detector', 'startup value-proof detector', 'adapt', 'Turn the wow moment into proof of value.'],
    ['hackathon-risk-analyzer', 'startup market/adoption/distribution risk', 'adapt', 'Include market and adoption risks, not only technical risks.'],
    ['hackathon-task-planner', 'startup experiment roadmap', 'adapt', 'Sequence experiments by risk and learning value.'],
    ['hackathon-deployment-prep', 'startup pilot readiness', 'adapt', 'Prepare a reliable pilot rather than only a demo deployment.'],
    ['hackathon-judge-simulator', 'investor/customer diligence', 'adapt', 'Test claims with investor and customer objections.'],
  ] as const;
  const artifact = { schema_version: '1.0', adapter_id: generateId('adapter'), created_at: nowIso(), source_profile: opts.sourceSkills ?? 'existing hackathon skills', target_profile: 'startup', mappings: mappings.map(([source_skill, target_skill, action, rationale]) => ({ source_skill, target_skill, action, rationale, dependency_changes: ['Remove selected-idea as a prerequisite for problem discovery.'], evaluation_changes: ['Prefer evidence, learning velocity, adoption, and proof of value over novelty alone.'], output_changes: ['Add provenance, assumptions, disconfirming evidence, and next decision.'] })), workflow: { ordered_steps: [{ step: 1, skill: 'startup-pain-point-research', purpose: 'Map evidence-aware pains before ideation.', depends_on: [] }, { step: 2, skill: 'startup-pain-point-deep-dive', purpose: 'Investigate one pain and seek disconfirmation.', depends_on: ['startup-pain-point-research'] }, { step: 3, skill: 'startup-validation-plan', purpose: 'Plan falsifiable tests.', depends_on: ['startup-pain-point-deep-dive'] }, { step: 4, skill: 'startup-customer-evidence', purpose: 'Collect direct customer evidence.', depends_on: ['startup-validation-plan'] }], parallel_steps: ['startup-market-sizing', 'startup-competitor-mapper'] }, skills_to_reuse: ['hackathon-task-planner'], skills_to_adapt: mappings.map((m) => m[0]), skills_to_avoid: ['hackathon-idea-scoring as the first startup decision'], recommended_new_skills: ['startup-pain-point-research', 'startup-pain-point-deep-dive', 'startup-validation-plan'], migration_risks: ['Idea-first habits can cause premature solution commitment.', 'Demo metrics can be mistaken for customer validation.', 'Inferred market claims may be presented as direct evidence.'], recommended_commands: ['hadk startup research --market <market> --segments <segments>', 'hadk startup deep-dive <pain-point-id>', 'hadk startup validate', 'hadk startup adapt-hackathon'], provenance: { generation_mode: 'deterministic_mapping', agent_intent: opts.agent ?? null } };
  const written = store.writeArtifact('startup-discovery', 'hackathon-adapter.yaml', artifact);
  if (!written.ok) return fail(written.error.message);
  store.update((s) => { s.startup!.hackathon_adapter_status = 'passed'; });
  success(`Hackathon-to-startup adapter created for ${profile}.`);
  info(`Artifact: ${written.value}`);
  info('Startup principle: problem-first; wow becomes proof of value; demo scope becomes learning scope.');
  info('Next: hadk startup research --market <market> --segments <segments>');
}

// ─── Heuristic Generators ────────────────────────────────────────────────────

function parseBrief(content: string, source: string) {
  const name = extractField(content, /(?:^|\n)#\s+(.+)/) ?? extractField(content, /event[_ ]?name[:\s]+(.+)/i) ?? null;
  const deadline = extractField(content, /(?:deadline|due|ends?)[:\s]+([0-9T:\-Z+. ]{10,})/i) ?? null;
  const durationMatch = extractField(content, /(\d+)\s*(?:hour|hr|h)\b/i);

  // Tracks: lines like "- Track: X" or "## Track: X" or table rows
  const tracks: CompetitionState['competition']['tracks'] = [];
  const trackRegex = /(?:^|\n)\s*(?:[-*]|\d+\.)?\s*(?:track(?:\s*\d+)?[:\s]+)\s*([^\n]+)/gi;
  let m: RegExpExecArray | null;
  let ti = 0;
  while ((m = trackRegex.exec(content)) !== null && ti < 10) {
    tracks.push({
      id: `track-${++ti}`,
      name: m[1].trim(),
      description: m[1].trim(),
      sponsor: null,
      prize: null,
      required_tools: [],
    });
  }
  if (tracks.length === 0 && content) {
    tracks.push({ id: 'track-1', name: 'General', description: 'Open track (no explicit tracks found)', sponsor: null, prize: null, required_tools: [] });
  }

  // Judging criteria
  const criteria: CompetitionState['competition']['judging_criteria'] = [];
  const critRegex = /(?:^|\n)\s*(?:[-*]|\d+\.)?\s*(?:judg\w*|criteri\w*|rubric)[:\s]+([^\n]+)/gi;
  while ((m = critRegex.exec(content)) !== null && criteria.length < 10) {
    criteria.push({ name: m[1].trim(), weight: null, description: m[1].trim(), source: 'extracted' });
  }
  if (criteria.length === 0) {
    for (const c of ['Innovation', 'Technical Execution', 'Impact', 'Presentation']) {
      criteria.push({ name: c, weight: 0.25, description: `${c} (inferred — rubric not found in source)`, source: 'inferred' });
    }
  }

  // Sponsors
  const sponsors: CompetitionState['competition']['sponsor_requirements'] = [];
  const sponsorRegex = /(?:^|\n)\s*(?:[-*]|\d+\.)?\s*sponsor\w*[:\s]+([^\n]+)/gi;
  while ((m = sponsorRegex.exec(content)) !== null && sponsors.length < 10) {
    sponsors.push({ sponsor: m[1].trim(), requirement: 'Use sponsor technology', tools: [], prize: null });
  }

  const isStartup = /startup|pitch|investor|traction|market size/i.test(content);
  const isBuildathon = /buildathon/i.test(content);

  return {
    event_metadata: {
      name,
      submission_deadline: deadline,
      duration_hours: durationMatch ? parseInt(durationMatch, 10) : null,
    },
    competition_type: (isStartup ? 'startup-contest' : isBuildathon ? 'buildathon' : 'hackathon') as CompetitionState['competition']['type'],
    tracks,
    judging_criteria: criteria,
    sponsor_requirements: sponsors,
  };
}

function extractField(content: string, regex: RegExp): string | null {
  const m = regex.exec(content);
  return m?.[1]?.trim() ?? null;
}

function inferTaste(state: CompetitionState) {
  const skills = state.team.skills.map((s) => s.toLowerCase());
  const technology: string[] = [];
  if (skills.some((s) => /ai|ml|llm|openai|agent/.test(s))) technology.push('ai_agents');
  if (skills.some((s) => /blockchain|web3|solidity/.test(s))) technology.push('blockchain');
  if (skills.some((s) => /data|sql|analytics/.test(s))) technology.push('data');
  if (technology.length === 0) technology.push('ai_agents');

  const desired_traits: string[] = [];
  if (state.strategy.mode === 'futuristic') desired_traits.push('futuristic', 'technically_impressive');
  else if (state.strategy.mode === 'conservative') desired_traits.push('commercially_credible', 'visually_demoable');
  else desired_traits.push('technically_impressive', 'visually_demoable');

  return {
    market: ['b2b'],
    product_layer: ['application'],
    technology,
    business_shape: ['vertical_saas'],
    desired_traits,
  };
}

function generateCandidateIdeas(state: CompetitionState, count: number): CandidateIdea[] {
  const track = state.strategy.selected_track ?? state.competition.tracks[0]?.name ?? 'General';
  const mode = state.strategy.mode;
  const tech = state.strategy.idea_taste.technology[0] ?? 'ai';
  const base = state.competition.name ?? 'the competition';

  const archetypes = [
    { suffix: 'Copilot', problem: 'Manual, repetitive work slows teams down', mechanism: 'AI-assisted automation pipeline' },
    { suffix: 'Radar', problem: 'Relevant signals are scattered and missed', mechanism: 'Aggregation + ranking engine' },
    { suffix: 'Studio', problem: 'Creating polished output takes too long', mechanism: 'Generative template engine' },
    { suffix: 'Guard', problem: 'Errors are caught too late', mechanism: 'Continuous verification layer' },
    { suffix: 'Bridge', problem: 'Systems do not talk to each other', mechanism: 'Unified translation API' },
    { suffix: 'Lens', problem: 'Decisions lack real-time insight', mechanism: 'Live analytics overlay' },
    { suffix: 'Flow', problem: 'Workflows stall on handoffs', mechanism: 'Stateful orchestration engine' },
  ];

  const ideas: CandidateIdea[] = [];
  for (let i = 0; i < count; i++) {
    const a = archetypes[i % archetypes.length];
    const name = `${track.split(' ')[0] ?? 'Project'} ${a.suffix}`;
    // Deterministic pseudo-scores derived from index + mode so ranking is stable
    const scores: Record<string, number> = {};
    for (const axis of Object.keys(state.strategy.scoring_profile ?? SCORING_WEIGHTS[mode])) {
      scores[axis] = 5 + ((i * 7 + axis.length * 3 + Object.keys(SCORING_WEIGHTS[mode]).length) % 5);
    }
    ideas.push({
      id: generateId('idea'),
      name,
      one_liner: `${a.mechanism} for ${track.toLowerCase()}.`,
      target_user: `Teams competing in ${base}`,
      problem: a.problem,
      solution: `${name} provides a ${a.mechanism.toLowerCase()} that addresses: ${a.problem.toLowerCase()}.`,
      core_mechanism: a.mechanism,
      strategy_mode_fit: mode === 'futuristic' ? `Positions ${tech} infrastructure 5-10 years ahead` : `Strong fit for ${mode} strategy`,
      taste_fit: `Aligned with ${state.strategy.idea_taste.technology.join(', ') || 'general'} taste profile`,
      rubric_fit: `Maps to judging criteria via ${a.mechanism.toLowerCase()}`,
      sponsor_fit: state.competition.sponsor_requirements.length ? 'Uses sponsor tooling' : 'No sponsor constraints',
      demo_flow: [`Show the ${a.mechanism.toLowerCase()} handling a live input`, 'Reveal the transformed output', 'Highlight the wow moment'],
      wow_moment: `The ${a.mechanism.toLowerCase()} produces a surprising, visible result in seconds`,
      future_thesis: mode === 'futuristic' ? `As ${tech} matures, ${a.mechanism.toLowerCase()}s become essential infrastructure` : null,
      build_plan_summary: `Implement ${a.mechanism.toLowerCase()} core, one UI surface, and a demo data path`,
      estimated_hours: 12 + (i % 3) * 4,
      critical_dependencies: [`${tech} provider API`],
      fallbacks: ['Deterministic fallback mode with canned responses'],
      failure_modes: ['External API latency during demo'],
      score_breakdown: scores,
      score_breakdown_kind: 'raw',
      total_score: 0,
    });
  }
  return ideas;
}

function buildScopeContract(state: CompetitionState, ideaName: string, availableHours: number) {
  const hoursPer = Math.max(0.1, Math.floor((availableHours / 4.5) * 10) / 10);
  return {
    schema_version: '1.0',
    project: { name: ideaName, type: state.competition.type },
    scope: {
      status: 'locked',
      core_demo_flow: [
        { step: 1, user_action: 'Open the app and provide a sample input', system_response: 'System processes the input through the core mechanism', proof_shown: 'Visible transformation appears' },
        { step: 2, user_action: 'Trigger the primary action', system_response: 'Core mechanism executes end-to-end', proof_shown: 'Result rendered with the wow moment' },
        { step: 3, user_action: 'Show the summary/output', system_response: 'System presents the final artifact', proof_shown: 'Judge-ready output displayed' },
      ],
      mvp_features: [
        { id: 'core_mechanism', name: 'Core mechanism', purpose: 'The single thing the project must prove', required_for_demo: true, required_for_rubric: true, estimated_hours: hoursPer * 2, dependencies: [], fallback: 'Deterministic fallback mode' },
        { id: 'input_surface', name: 'Input surface', purpose: 'Let a user provide input for the demo', required_for_demo: true, required_for_rubric: false, estimated_hours: hoursPer, dependencies: [], fallback: 'Hardcoded demo input' },
        { id: 'output_view', name: 'Output view', purpose: 'Show the result clearly to judges', required_for_demo: true, required_for_rubric: true, estimated_hours: hoursPer, dependencies: ['core_mechanism'], fallback: 'Static screenshot' },
        { id: 'demo_data', name: 'Demo data & reset', purpose: 'Deterministic, reproducible demo state', required_for_demo: true, required_for_rubric: false, estimated_hours: Math.max(0.1, Math.floor((hoursPer / 2) * 10) / 10), dependencies: [], fallback: 'Seed script' },
      ],
      deferred_features: [
        { id: 'auth', name: 'Authentication', reason_deferred: 'Not required for the demo path' },
        { id: 'persistence', name: 'Durable persistence', reason_deferred: 'In-memory state is sufficient for demo' },
      ],
      primary_wow_moment: {
        description: `The core mechanism produces a surprising, visible result in seconds for "${ideaName}".`,
        demo_step: 2,
        judge_takeaway: `Remember: ${ideaName} turns a hard problem into a one-click result.`,
      },
      external_dependencies: [
        { name: 'AI provider API', type: 'api', risk: 'Latency or key failure during demo', fallback: 'DEMO_FALLBACK_MODE=true canned responses' },
      ],
      time_budget: {
        implementation_hours: hoursPer * 4,
        integration_hours: 3,
        validation_hours: 2,
        demo_hours: 2,
        submission_hours: 2,
        buffer_hours: Math.max(2, Math.floor(availableHours * 0.1)),
      },
    },
  };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function ensureInitialized(store: StateStore): void {
  if (!store.isInitialized()) {
    store.init();
  }
}

function detectPackageManager(): string | null {
  if (commandOnPath('pnpm')) return 'pnpm';
  if (commandOnPath('npm')) return 'npm';
  if (commandOnPath('yarn')) return 'yarn';
  return null;
}

function commandOnPath(cmd: string): boolean {
  // PATH scan without invoking a shell (avoids injection).
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, cmd);
    try {
      accessSync(candidate, constants.X_OK);
      if (statSync(candidate).isFile()) return true;
    } catch {
      // continue
    }
  }
  return false;
}
