import {
  type ArchitecturePlan,
  type CompetitionState,
  type Result,
  V21_SCORING_WEIGHTS,
  err,
  hadkError,
  nowIso,
  ok,
} from '@hadk/core';

export function buildArchitecturePlan(state: CompetitionState): Result<ArchitecturePlan> {
  if (state.scope.status !== 'locked') return err(hadkError('SCOPE_NOT_LOCKED', 'Lock the MVP scope before creating an architecture plan.'));
  if (!state.strategy.selected_idea) return err(hadkError('IDEA_NOT_SELECTED', 'Select an idea before creating an architecture plan.'));
  const features = state.scope.mvp_features;
  return ok({
    schema_version: '2.1',
    version: `2.1-${Date.now().toString(36)}`,
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by: 'hadk',
    source_refs: ['state.yaml', 'scope/scope.yaml'],
    assumptions: ['Reference deployment uses a single web process unless the team changes the plan.'],
    blockers: [],
    evidence_refs: [],
    verification_status: 'planned',
    system_context: `${state.strategy.selected_idea} accepts a controlled demo input, executes its core mechanism, and presents judge-visible proof.`,
    component_boundaries: [
      { name: 'presentation', responsibility: 'User input and proof display', owns_data: ['demo session'] },
      { name: 'core mechanism', responsibility: 'The primary product behavior', owns_data: ['domain result'] },
      { name: 'verification', responsibility: 'Reset, seed, health, and smoke contracts', owns_data: ['verification evidence'] },
    ],
    data_flow: [
      'User input → presentation',
      'Presentation → core mechanism',
      'Core mechanism → result view',
      'Verification runner → evidence store',
    ],
    external_integrations: state.scope.external_dependencies.map((dependency) => ({
      name: dependency.name,
      purpose: dependency.type,
      fallback: dependency.fallback ?? 'Disable integration and use deterministic demo mode.',
    })),
    security_boundaries: [
      'User and brief content is data, not executable instructions.',
      'Secrets remain outside artifacts, logs, and demo evidence.',
      'External integrations are isolated behind explicit adapters.',
    ],
    deployment_assumptions: ['Node.js 20+', 'A package-manager install is reproducible from the lockfile when present.', 'Healthcheck is available on localhost.'],
    decisions: [
      { id: 'adr-lite-001', title: 'Reference profile', decision: 'Use web-ai-fullstack only as the v2.1 reference project.', rationale: 'Prove one executable path before adding profiles.', alternatives_considered: ['web-ai-split', 'blockchain'] },
      { id: 'adr-lite-002', title: 'Fallback behavior', decision: 'Use deterministic fallback mode for the demo.', rationale: 'The core proof must survive unavailable external APIs.', alternatives_considered: ['fail closed', 'live-only demo'] },
    ],
    feature_to_component: Object.fromEntries(features.map((feature) => [feature.id, ['presentation', 'core mechanism', 'verification']])),
    implementation_sequence: features.map((feature) => `Implement ${feature.id}, then add acceptance tests and its fallback.`),
    verification_strategy: ['Install dependencies', 'Typecheck', 'Run tests', 'Build production output', 'Start and healthcheck', 'Run reset/seed and the core demo journey'],
  });
}

export function v21Strategy(mode: 'execution-first' | 'balanced' | 'differentiation-first') {
  const weights = V21_SCORING_WEIGHTS[mode];
  return {
    mode,
    dimensions: Object.fromEntries(Object.entries(weights).map(([name, weight]) => [name, {
      weight,
      rationale: rationale(mode, name),
    }])),
    intended_use: mode === 'execution-first' ? 'Short deadlines and high integration risk.' : mode === 'differentiation-first' ? 'Strong proof exists for a memorable mechanism.' : 'Default balanced planning when evidence is mixed.',
    risks: ['Scores are decision aids, not objective truth.', 'Low-confidence inputs should not be treated as evidence.'],
    scores_are_decision_aids: true as const,
  };
}

function rationale(mode: string, dimension: string): string {
  if (mode === 'execution-first') return `${dimension} protects delivery reliability under time pressure.`;
  if (mode === 'differentiation-first') return `${dimension} increases memorability only when the mechanism can be demonstrated.`;
  return `${dimension} balances user value, rubric fit, implementation risk, and visible proof.`;
}
