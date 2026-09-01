/**
 * Core constants for the HADK harness.
 */

import type { DeadlineMode, Phase, StrategyMode } from './types.js';

export const SCHEMA_VERSION = '2.1';
export const HADK_VERSION = '2.1.2';
export const STATE_DIR = '.hackathon';
export const STATE_FILE = 'state.yaml';
export const CONFIG_FILE = 'config.yaml';
export const MANIFEST_FILE = 'manifest.yaml';

// ─── Phase Model ─────────────────────────────────────────────────────────────

export const PHASES: Phase[] = [
  'setup',
  'competition-intelligence',
  'strategy',
  'idea',
  'scope',
  'architecture',
  'scaffold',
  'build',
  'demo',
  'video',
  'judge',
  'submission',
  'complete',
];

export const GATE_FOR_PHASE: Partial<Record<Phase, keyof import('./types.js').CompetitionState['gates']>> = {
  'competition-intelligence': 'competition_gate',
  idea: 'idea_gate',
  scope: 'scope_gate',
  architecture: 'architecture_gate',
  build: 'build_gate',
  demo: 'demo_gate',
  video: 'video_gate',
  submission: 'submission_gate',
};

// ─── Strategy Modes ──────────────────────────────────────────────────────────

export const STRATEGY_MODES: StrategyMode[] = [
  'execution-first',
  'balanced',
  'differentiation-first',
  // Compatibility aliases, deprecated in v2.1.
  'conservative',
  'realistic',
  'futuristic',
];

export const V21_STRATEGY_MODES = ['execution-first', 'balanced', 'differentiation-first'] as const;

export const SCORING_WEIGHTS: Record<string, Record<string, number>> = {
  conservative: {
    build_feasibility: 0.25,
    demo_reliability: 0.2,
    rubric_alignment: 0.2,
    sponsor_integration: 0.15,
    problem_clarity: 0.1,
    novelty: 0.1,
  },
  realistic: {
    problem_value: 0.2,
    rubric_alignment: 0.2,
    differentiation: 0.15,
    build_feasibility: 0.15,
    demo_strength: 0.15,
    business_potential: 0.15,
  },
  futuristic: {
    future_thesis_strength: 0.2,
    memorability: 0.15,
    technical_credibility: 0.15,
    rubric_alignment: 0.15,
    core_mechanism_proof: 0.15,
    strategic_upside: 0.1,
    build_feasibility: 0.1,
  },
  'execution-first': {
    feasibility: 0.3,
    demo_reliability: 0.25,
    rubric_alignment: 0.2,
    implementation_cost: 0.15,
    fallback_safety: 0.1,
  },
  balanced: {
    problem_value: 0.2,
    rubric_alignment: 0.2,
    differentiation: 0.2,
    feasibility: 0.2,
    demo_proof: 0.2,
  },
  'differentiation-first': {
    differentiation: 0.3,
    memorability: 0.2,
    rubric_alignment: 0.2,
    core_mechanism_proof: 0.2,
    feasibility: 0.1,
  },
};

export const FUTURISTIC_HARD_CONSTRAINTS = {
  core_mechanism_buildable: true,
  demoable_within_time: true,
  technical_claims_must_be_evidence_based: true,
  science_fiction_without_proof: false,
} as const;

export const DEFAULT_STRATEGY_MODE: StrategyMode = 'realistic';

export const V21_SCORING_WEIGHTS: Record<(typeof V21_STRATEGY_MODES)[number], Record<string, number>> = {
  'execution-first': {
    feasibility: 0.3,
    demo_reliability: 0.25,
    rubric_alignment: 0.2,
    implementation_cost: 0.15,
    fallback_safety: 0.1,
  },
  balanced: {
    problem_value: 0.2,
    rubric_alignment: 0.2,
    differentiation: 0.2,
    feasibility: 0.2,
    demo_proof: 0.2,
  },
  'differentiation-first': {
    differentiation: 0.3,
    memorability: 0.2,
    rubric_alignment: 0.2,
    core_mechanism_proof: 0.2,
    feasibility: 0.1,
  },
};

// ─── Deadline Policy ─────────────────────────────────────────────────────────

export const DEADLINE_THRESHOLDS: { min_hours: number; mode: DeadlineMode }[] = [
  { min_hours: 24, mode: 'full' },
  { min_hours: 12, mode: 'fast' },
  { min_hours: 6, mode: 'demo_first' },
  { min_hours: 3, mode: 'freeze_scope' },
  { min_hours: 1, mode: 'no_new_features' },
  { min_hours: 0, mode: 'submission_only' },
];

export const DEADLINE_POLICIES: Record<DeadlineMode, { allowed_operations: string[]; restrictions: string[] }> = {
  full: {
    allowed_operations: ['strategy', 'idea', 'scope', 'architecture', 'scaffold', 'build', 'demo', 'video', 'judge', 'submission'],
    restrictions: [],
  },
  fast: {
    allowed_operations: ['strategy', 'idea', 'scope', 'scaffold', 'build', 'demo', 'video', 'submission'],
    restrictions: ['limit_architecture_experimentation', 'reduce_planning_ceremony'],
  },
  demo_first: {
    allowed_operations: ['build', 'demo', 'video', 'submission'],
    restrictions: ['freeze_optional_integrations', 'create_fallback_mode', 'no_new_architecture'],
  },
  freeze_scope: {
    allowed_operations: ['build', 'demo', 'submission'],
    restrictions: ['freeze_scope', 'no_architecture_changes_unless_demo_blocking', 'fix_demo_path_only'],
  },
  no_new_features: {
    allowed_operations: ['demo', 'video', 'judge', 'submission'],
    restrictions: ['no_new_features', 'demo_video_pitch_submission_only'],
  },
  submission_only: {
    allowed_operations: ['submission'],
    restrictions: ['stop_implementation', 'protect_existing_artifacts'],
  },
};

// ─── Taste Options ───────────────────────────────────────────────────────────

export const TASTE_OPTIONS = {
  market: ['b2b', 'b2c', 'b2g', 'developer_tools'],
  product_layer: ['application', 'tooling', 'infrastructure', 'protocol', 'platform'],
  technology: ['ai_agents', 'blockchain', 'climate', 'robotics', 'cybersecurity', 'data', 'fintech', 'healthcare', 'education', 'iot'],
  business_shape: ['vertical_saas', 'horizontal_platform', 'open_source', 'enterprise', 'marketplace'],
  desired_traits: ['technically_impressive', 'commercially_credible', 'visually_demoable', 'socially_impactful', 'futuristic'],
} as const;

// ─── Scaffold Profiles ───────────────────────────────────────────────────────

export const SCAFFOLD_PROFILES = [
  'web-ai-fullstack',
  'web-ai-split',
  'blockchain',
  'data-ml',
  'iot-hardware',
  'mobile',
] as const;

export const IMPLEMENTED_PROFILES = ['web-ai-fullstack', 'web-ai-split', 'blockchain'] as const;

// ─── Supported Agents ────────────────────────────────────────────────────────

export const SUPPORTED_AGENTS = ['claude-code', 'codex', 'opencode'] as const;
export const PARTIAL_AGENTS = ['cursor', 'windsurf'] as const;

// ─── Artifact Directories ────────────────────────────────────────────────────

export const ARTIFACT_DIRS = [
  'competition',
  'strategy',
  'ideas',
  'scope',
  'architecture',
  'build',
  'demo',
  'pitch',
  'submission',
  'startup-discovery',
] as const;
