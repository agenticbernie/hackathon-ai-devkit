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
  const demoFlow = state.scope.demo_flow;
  const wow = state.scope.primary_wow_moment;
  const firstFeature = features[0];
  // Derive system_context from concrete scope (which is already derived from rich idea when available)
  const system_context = firstFeature
    ? `${state.strategy.selected_idea} — ${firstFeature.name}: ${firstFeature.purpose} via ${firstFeature.name}. Demo: ${demoFlow.map((s) => s.user_action).join(' → ')}. Wow: ${wow?.description ?? firstFeature.name}`
    : `${state.strategy.selected_idea} accepts a controlled demo input, executes its core mechanism, and presents judge-visible proof.`;
  // Build component boundaries grounded in MVP features
  const component_boundaries: ArchitecturePlan['component_boundaries'] = [
    { name: 'presentation', responsibility: `Input surface and wow output for ${state.strategy.selected_idea}`, owns_data: ['demo session', wow?.description ?? 'proof'] },
    { name: 'core', responsibility: firstFeature ? `${firstFeature.name} — ${firstFeature.purpose}` : 'The primary product behavior', owns_data: [firstFeature?.id ?? 'domain result', 'attestation proof'] },
    { name: 'verification', responsibility: 'Reset, seed, health, and smoke contracts', owns_data: ['verification evidence'] },
  ];
  // Add a dedicated component for each additional MVP feature when scope is rich (more than 4 generic)
  for (const feat of features.slice(1, 3)) {
    if (!component_boundaries.some((c) => c.name === feat.id)) {
      component_boundaries.push({ name: feat.id, responsibility: `${feat.name}: ${feat.purpose}`, owns_data: [feat.id] });
    }
  }
  const data_flow = demoFlow.length
    ? [
        `${demoFlow[0]?.user_action ?? 'User input'} → presentation`,
        `presentation → ${firstFeature?.id ?? 'core'}`,
        `${firstFeature?.id ?? 'core'} → ${features[features.length - 1]?.id ?? 'result view'} (${wow?.description?.slice(0, 60) ?? 'wow'})`,
        'Verification runner → evidence store',
      ]
    : [
        'User input → presentation',
        'Presentation → core mechanism',
        'Core mechanism → result view',
        'Verification runner → evidence store',
      ];
  return ok({
    schema_version: '2.1',
    version: `2.1-${Date.now().toString(36)}`,
    created_at: nowIso(),
    updated_at: nowIso(),
    created_by: 'hadk',
    source_refs: ['state.yaml', 'scope/scope.yaml'],
    assumptions: [
      'Reference deployment uses a single web process unless the team changes the plan.',
      ...(firstFeature ? [`Scope feature "${firstFeature.name}" drives architecture: ${firstFeature.purpose}`] : []),
      ...(wow ? [`Wow moment at step ${wow.demo_step}: ${wow.description.slice(0, 80)}`] : []),
    ],
    blockers: [],
    evidence_refs: [],
    verification_status: 'planned',
    system_context,
    component_boundaries,
    data_flow,
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
      { id: 'adr-lite-002', title: 'Fallback behavior', decision: `Use deterministic fallback mode for the demo. Primary fallback: ${firstFeature?.fallback ?? 'mock'}.`, rationale: 'The core proof must survive unavailable external APIs.', alternatives_considered: ['fail closed', 'live-only demo'] },
      ...(firstFeature?.dependencies?.length ? [{ id: 'adr-lite-003', title: 'Critical dependencies', decision: `Isolate ${firstFeature.dependencies.join(', ')} behind adapters with fallbacks`, rationale: `Derived from idea's critical_dependencies: ${firstFeature.dependencies.join(', ')}`, alternatives_considered: ['direct SDK calls'] }] : []),
    ],
    feature_to_component: Object.fromEntries(features.map((feature) => [feature.id, ['presentation', 'core', 'verification', feature.id]])),
    implementation_sequence: features.map((feature) => `Implement ${feature.id} (${feature.name}): ${feature.purpose.slice(0, 80)} — fallback: ${feature.fallback ?? 'none'}, then add acceptance tests.`),
    verification_strategy: [
      'Install dependencies',
      'Typecheck',
      'Run tests',
      `Build production output (verify ${firstFeature?.name ?? 'core'} acceptance: ${(firstFeature as any)?.acceptance_criteria?.[0]?.slice(0, 60) ?? 'core result visible'})`,
      'Start and healthcheck',
      `Run reset/seed and the core demo journey: ${demoFlow.map((s) => s.proof_shown).join(' → ')}`,
    ],
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
