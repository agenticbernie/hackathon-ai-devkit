/**
 * Core type definitions for the HADK competition engineering harness.
 */

// ─── Competition Types ───────────────────────────────────────────────────────

export type CompetitionType = 'hackathon' | 'buildathon' | 'startup-contest';

export type StrategyMode =
  | 'execution-first'
  | 'balanced'
  | 'differentiation-first'
  | 'conservative'
  | 'realistic'
  | 'futuristic';

export type ArtifactStatus = 'planned' | 'in_progress' | 'blocked' | 'unverified' | 'verified';
export type VerificationStatus = ArtifactStatus | 'agent_reported' | 'human_attested';
export type FactStatus = 'extracted' | 'inferred' | 'user_confirmed' | 'unknown' | 'rejected';
export type EvidenceType =
  | 'command_execution'
  | 'test_output'
  | 'build_output'
  | 'healthcheck_output'
  | 'browser_demo'
  | 'api_demo'
  | 'human_attestation'
  | 'agent_result'
  | 'source_excerpt'
  | 'user_confirmation';

export type TasteSource = 'user' | 'auto' | 'auto_fallback';

export type Phase =
  | 'setup'
  | 'competition-intelligence'
  | 'strategy'
  | 'idea'
  | 'scope'
  | 'architecture'
  | 'scaffold'
  | 'build'
  | 'demo'
  | 'video'
  | 'judge'
  | 'submission'
  | 'complete';

export type GateStatus = 'pending' | 'passed' | 'failed' | 'skipped';

export type DeadlineMode = 'full' | 'fast' | 'demo_first' | 'freeze_scope' | 'no_new_features' | 'submission_only';

export type DeploymentStatus = 'not_started' | 'in_progress' | 'deployed' | 'failed';
export type DemoStatus = 'not_started' | 'in_progress' | 'validated' | 'blocked';
export type VideoStatus = 'not_started' | 'storyboard_ready' | 'project_generated' | 'rendered' | 'failed';
export type SubmissionStatus = 'not_started' | 'in_progress' | 'ready' | 'submitted';

// ─── State Model ─────────────────────────────────────────────────────────────

export interface CompetitionState {
  schema_version: string;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  source_refs?: string[];
  assumptions?: string[];
  blockers?: string[];
  evidence_refs?: string[];
  verification_status?: VerificationStatus;
  evidence?: Evidence[];

  competition: {
    name: string | null;
    type: CompetitionType;
    source_url: string | null;
    deadline: string | null;
    remaining_hours: number | null;
    tracks: Track[];
    judging_criteria: JudgingCriterion[];
    sponsor_requirements: SponsorRequirement[];
    disqualifiers: string[];
  };

  team: {
    size: number | null;
    members: string[];
    skills: string[];
    existing_assets: string[];
    constraints: string[];
  };

  strategy: {
    mode: StrategyMode;
    taste_source: TasteSource;
    idea_taste: IdeaTaste;
    selected_track: string | null;
    selected_idea: string | null;
    scoring_profile: Record<string, number> | null;
  };

  startup?: {
    pain_point_research_status: GateStatus;
    opportunity_scorecard_status: GateStatus;
    selected_pain_point_id: string | null;
    pain_point_deep_dive_status: GateStatus;
    validation_plan_status: GateStatus;
    customer_evidence_status: GateStatus;
    hackathon_adapter_status: GateStatus;
    latest_research_artifact?: string | null;
    latest_scorecard_artifact?: string | null;
    latest_deep_dive_artifact?: string | null;
    latest_validation_plan_artifact?: string | null;
    latest_agent_handoff_artifact?: string | null;
  };

  scope: {
    status: 'unlocked' | 'locked';
    mvp_features: ScopeFeature[];
    deferred_features: DeferredFeature[];
    demo_flow: DemoFlowStep[];
    primary_wow_moment: WowMoment | null;
    external_dependencies: ExternalDependency[];
    fallbacks: string[];
  };

  architecture: {
    profile: string | null;
    status: 'unselected' | 'selected' | 'generated' | 'invalidated';
    invalidation_reason?: string;
    stale_since?: string;
    decisions: ArchitectureDecision[];
    feature_mapping: Record<string, FeatureMapping>;
  };

  delivery: {
    phase: Phase;
    risks: Risk[];
    tasks: Task[];
    milestones: Milestone[];
    checkpoints: Checkpoint[];
    deployment_status: DeploymentStatus;
    demo_status: DemoStatus;
    video_status: VideoStatus;
    submission_status: SubmissionStatus;
  };

  gates: {
    competition_gate: GateStatus;
    idea_gate: GateStatus;
    scope_gate: GateStatus;
    architecture_gate: GateStatus;
    build_gate: GateStatus;
    demo_gate: GateStatus;
    video_gate: GateStatus;
    submission_gate: GateStatus;
  };
}

// ─── Sub-types ───────────────────────────────────────────────────────────────

export interface Track {
  id: string;
  name: string;
  description: string;
  sponsor: string | null;
  prize: string | null;
  required_tools: string[];
}

export interface JudgingCriterion {
  name: string;
  weight: number | null;
  description: string;
  source: 'extracted' | 'inferred' | 'user-provided';
}

export interface SponsorRequirement {
  sponsor: string;
  requirement: string;
  tools: string[];
  prize: string | null;
}

export interface IdeaTaste {
  market: string[];
  product_layer: string[];
  technology: string[];
  business_shape: string[];
  desired_traits: string[];
}

export interface ScopeFeature {
  id: string;
  name: string;
  purpose: string;
  required_for_demo: boolean;
  required_for_rubric: boolean;
  estimated_hours: number;
  dependencies: string[];
  fallback: string | null;
}

export interface DeferredFeature {
  id: string;
  name: string;
  reason_deferred: string;
}

export interface DemoFlowStep {
  step: number;
  user_action: string;
  system_response: string;
  proof_shown: string;
}

export interface WowMoment {
  description: string;
  demo_step: number;
  judge_takeaway: string;
}

export interface ExternalDependency {
  name: string;
  type: string;
  risk: string;
  fallback: string | null;
}

export interface ArchitectureDecision {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  alternatives_considered: string[];
}

export interface FeatureMapping {
  routes: string[];
  ui: string[];
  services: string[];
  tests: string[];
}

export interface Risk {
  id: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  mitigation: string;
  status: 'open' | 'mitigated' | 'accepted';
}

export interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  estimated_hours: number;
  feature_id: string | null;
  critical_path: boolean;
}

export interface Milestone {
  id: string;
  name: string;
  target_hours: number;
  status: 'pending' | 'reached' | 'missed';
}

export interface Checkpoint {
  id: string;
  created_at: string;
  phase: Phase;
  label: string;
  state_file: string;
}

// ─── Idea Types ──────────────────────────────────────────────────────────────

export interface CandidateIdea {
  id: string;
  name: string;
  one_liner: string;
  target_user: string;
  problem: string;
  solution: string;
  core_mechanism: string;
  strategy_mode_fit: string;
  taste_fit: string;
  rubric_fit: string;
  sponsor_fit: string;
  demo_flow: string[];
  wow_moment: string;
  future_thesis: string | null;
  build_plan_summary: string;
  estimated_hours: number;
  critical_dependencies: string[];
  fallbacks: string[];
  failure_modes: string[];
  score_breakdown: Record<string, number>;
  score_breakdown_kind: 'raw' | 'weighted';
  total_score: number;
  generation_mode?: 'agent-backed' | 'human-imported' | 'heuristic-draft';
  confidence?: 'low' | 'medium' | 'high';
  implementation_estimate?: string;
  dependencies?: string[];
  adversarial_critique?: string[];
  assumptions?: string[];
  evidence_refs?: string[];
}

export interface SelectedIdea {
  id: string;
  name: string;
  selection_reason: string;
  why_now: string;
  why_this_team: string;
  why_this_competition: string;
  judge_memory_hook: string;
  core_demo_proof: string;
  primary_risk: string;
  fallback: string;
  selection_method?: 'human' | 'validated-agent';
  verification_status?: VerificationStatus;
  evidence_refs?: string[];
}

// ─── Registry Types ──────────────────────────────────────────────────────────

export interface SkillRegistryEntry {
  version: string;
  phase: string;
  description: string;
  path: string;
  input_schema: string | null;
  output_schema: string | null;
  dependencies: string[];
  optional_dependencies: string[];
  produces: string[];
  consumes: string[];
  supported_agents: string[];
}

export interface Manifest {
  schema_version: string;
  skills: Record<string, SkillRegistryEntry>;
}

// ─── Validation Types ────────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  validator: string;
  passed: boolean;
  issues: ValidationIssue[];
  timestamp: string;
}

export interface ArtifactMetadata {
  schema_version: string;
  created_at: string;
  updated_at: string;
  created_by: string;
  source_refs: string[];
  assumptions: string[];
  blockers: string[];
  evidence_refs: string[];
  verification_status: VerificationStatus;
}

export interface Evidence {
  id: string;
  evidence_type: EvidenceType;
  source: string;
  actor: string;
  timestamp: string;
  status: 'captured' | 'verified' | 'rejected' | 'redacted';
  content?: string;
  path?: string;
  checksum: string | null;
  redaction: { applied: boolean; fields: string[]; note?: string };
  metadata?: Record<string, string | number | boolean>;
}

export interface CompetitionFact {
  id: string;
  field: string;
  value: unknown;
  fact_type: FactStatus;
  confidence: 'low' | 'medium' | 'high';
  source_ref: string;
  excerpt: string | null;
  locator: string | null;
  unresolved_questions: string[];
}

export interface StrategyContract extends ArtifactMetadata {
  mode: 'execution-first' | 'balanced' | 'differentiation-first';
  dimensions: Record<string, { weight: number; rationale: string }>;
  intended_use: string;
  risks: string[];
  scores_are_decision_aids: true;
}

export interface ScopeFeatureContract extends ScopeFeature {
  why_it_exists: string;
  acceptance_criteria: string[];
  owner: string;
  fallback: string | null;
  demo_step: number;
  verification_method: string;
}

export interface ScopeContract extends ArtifactMetadata {
  status: 'planned' | 'locked' | 'unlocked';
  core_demo_flow: DemoFlowStep[];
  primary_proof_point: string;
  cut_list: string[];
  implementation_budget: number;
  integration_budget: number;
  verification_budget: number;
  demo_rehearsal_budget: number;
  buffer: number;
  risk_budget: number;
  reset_seed_strategy: string;
  mvp_features: ScopeFeatureContract[];
}

export interface ArchitecturePlan extends ArtifactMetadata {
  version: string;
  system_context: string;
  component_boundaries: Array<{ name: string; responsibility: string; owns_data: string[] }>;
  data_flow: string[];
  external_integrations: Array<{ name: string; purpose: string; fallback: string }>;
  security_boundaries: string[];
  deployment_assumptions: string[];
  decisions: ArchitectureDecision[];
  feature_to_component: Record<string, string[]>;
  implementation_sequence: string[];
  verification_strategy: string[];
}

export interface AgentCapability extends ArtifactMetadata {
  agent: 'claude-code' | 'codex' | 'opencode';
  capabilities: string[];
  adapter_version: string;
  execution_supported: false;
}

export interface AgentTaskPacket extends ArtifactMetadata {
  task_id: string;
  feature_id: string;
  scope_version: string;
  architecture_version: string;
  objective: string;
  allowed_files: string[];
  forbidden_files: string[];
  acceptance_criteria: string[];
  required_tests: string[];
  verification_commands: string[][];
  dependencies: string[];
  fallback: string;
  expected_result_schema: string;
}

export interface AgentResult extends ArtifactMetadata {
  task_id: string;
  scope_version: string;
  status: 'completed' | 'blocked' | 'partial';
  changed_files: string[];
  commands_executed: string[][];
  tests: Array<{ command: string[]; passed: boolean; evidence_ref?: string }>;
  unresolved_issues: string[];
  result_evidence_refs: string[];
}

export interface VerificationStep {
  id: string;
  kind: 'install' | 'typecheck' | 'test' | 'build' | 'start' | 'healthcheck' | 'api_smoke' | 'browser';
  command?: string[];
  timeout_ms: number;
  required: boolean;
}

export interface VerificationResult extends ArtifactMetadata {
  contract_version: string;
  project_root: string;
  steps: Array<{
    step_id: string;
    kind: VerificationStep['kind'];
    status: 'passed' | 'failed' | 'blocked' | 'skipped';
    exit_code: number | null;
    stdout_evidence_ref?: string;
    stderr_evidence_ref?: string;
    duration_ms: number;
  }>;
  passed: boolean;
}

export interface DemoVerification extends ArtifactMetadata {
  mode: 'automated' | 'human-attested';
  reset_seed: string;
  journey: string[];
  expected_output: string[];
  fallback_behavior: string;
  operator?: string;
  checklist?: Array<{ item: string; passed: boolean; note?: string }>;
  media_refs?: string[];
  automated: boolean;
}

export interface SubmissionRequirement {
  requirement_id: string;
  source: string;
  mandatory: boolean;
  accepted_format: string;
  deadline: string | null;
  evidence_artifact_ref: string | null;
  status: 'missing' | 'in_progress' | 'satisfied' | 'blocked';
  reviewer_note: string | null;
}

export interface SubmissionPackage extends ArtifactMetadata {
  package_version: string;
  requirements: SubmissionRequirement[];
  export_path: string | null;
  ready: boolean;
}

// ─── Scaffold Types ──────────────────────────────────────────────────────────

export interface ScaffoldPlan {
  profile: string;
  project_name: string;
  output_dir: string;
  features: string[];
  feature_mapping: Record<string, FeatureMapping>;
  files: ScaffoldFile[];
  post_install_commands: string[];
  startup_command: string;
  health_check: string;
}

export interface ScaffoldFile {
  path: string;
  template: string | null;
  content_hash: string | null;
  overwrite: boolean;
}

// ─── Video Types ─────────────────────────────────────────────────────────────

export interface VideoPlan {
  title: string;
  duration_seconds: number;
  resolution: { width: number; height: number };
  scenes: VideoScene[];
  assets: VideoAsset[];
  constraints: {
    problem_within_seconds: number;
    product_reveal_before_seconds: number;
    core_mechanism_demonstrated: boolean;
    sponsor_evidence: boolean;
    memory_hook_at_end: boolean;
  };
}

export interface VideoScene {
  id: string;
  order: number;
  type: 'title' | 'problem' | 'product' | 'demo' | 'architecture' | 'wow' | 'cta';
  duration_seconds: number;
  narration: string;
  visual_description: string;
  assets: string[];
}

export interface VideoAsset {
  id: string;
  type: 'screenshot' | 'recording' | 'logo' | 'illustration' | 'audio' | 'diagram';
  path: string;
  description: string;
  status: 'available' | 'missing' | 'placeholder';
}

// ─── Deadline Policy ─────────────────────────────────────────────────────────

export interface DeadlinePolicy {
  mode: DeadlineMode;
  remaining_hours: number;
  allowed_operations: string[];
  restrictions: string[];
}
