/**
 * Core type definitions for the HADK competition engineering harness.
 */

// ─── Competition Types ───────────────────────────────────────────────────────

export type CompetitionType = 'hackathon' | 'buildathon' | 'startup-contest';

export type StrategyMode = 'conservative' | 'realistic' | 'futuristic';

export type TasteSource = 'user' | 'auto';

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
    status: 'unselected' | 'selected' | 'generated';
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
  total_score: number;
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
