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
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { Orchestrator, scoreIdea } from '@hadk/orchestrator';
import { validateRegistry } from '@hadk/validators';
import { AgentAdapters } from '@hadk/agent-adapters';
import Ajv from 'ajv';
import { existsSync, readFileSync, accessSync, constants, statSync } from 'node:fs';
import { join, delimiter, resolve } from 'node:path';
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
    if (s.delivery.phase === 'competition-intelligence') {
      s.gates.competition_gate = parsed.tracks.length > 0 ? 'passed' : 'failed';
      if (parsed.tracks.length > 0) s.delivery.phase = 'strategy';
    }
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
  store.update((s) => {
    if (opts.teamSize) s.team.size = parseInt(opts.teamSize, 10);
    if (opts.teamSkills) s.team.skills = opts.teamSkills.split(',').map((x) => x.trim()).filter(Boolean);
    if (opts.deadline) s.competition.deadline = opts.deadline;
    if (opts.remainingHours) s.competition.remaining_hours = parseFloat(opts.remainingHours);
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
    'Write your result as YAML matching `schemas/idea-import.schema.json` and save it as `.hackathon/artifacts/ideas/result.yaml`.',
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
    const promptResult = store.writeArtifact('generated', 'idea-agent-prompt.md', prompt);
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

  // Agent-provided totals are advisory. Recalculate against the active strategy
  // profile so imported data cannot bypass the idea gate with inflated scores.
  for (const candidate of candidates) {
    const scored = scoreIdea(candidate.score_breakdown, state.strategy.scoring_profile ?? SCORING_WEIGHTS[state.strategy.mode]);
    candidate.score_breakdown = scored.breakdown;
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

  // Build a scope contract from the selected idea artifact
  const selectedArtifact = store.readArtifact<{ selected_idea: SelectedIdea }>('ideas', 'selected.yaml');
  const ideaName = state.strategy.selected_idea;

  const available = state.competition.remaining_hours ?? 48;
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

export async function cmdSubmit(store: StateStore): Promise<void> {
  ensureInitialized(store);
  const loaded = store.load();
  if (!loaded.ok) return fail(loaded.error.message);
  const state = loaded.value;

  store.writeArtifact('submission', 'submission.yaml', {
    prepared_at: nowIso(),
    competition: state.competition.name,
    project: state.strategy.selected_idea,
    description: `Submission for ${state.competition.name ?? 'competition'}.`,
    repository_link: null,
    video_artifact: state.delivery.video_status !== 'not_started',
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
      total_score: 0,
    });
  }
  return ideas;
}

function buildScopeContract(state: CompetitionState, ideaName: string, availableHours: number) {
  const hoursPer = Math.max(2, Math.floor((availableHours * 0.6) / 4));
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
        { id: 'demo_data', name: 'Demo data & reset', purpose: 'Deterministic, reproducible demo state', required_for_demo: true, required_for_rubric: false, estimated_hours: Math.max(2, Math.floor(hoursPer / 2)), dependencies: [], fallback: 'Seed script' },
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
