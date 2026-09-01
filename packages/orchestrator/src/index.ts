/**
 * @hadk/orchestrator — phase detection, gate enforcement, next-action
 * recommendation, and deadline-aware execution policies.
 */

import {
  type CompetitionState,
  type DeadlineMode,
  type DeadlinePolicy,
  type GateStatus,
  type Phase,
  type Result,
  PHASES,
  GATE_FOR_PHASE,
  DEADLINE_THRESHOLDS,
  DEADLINE_POLICIES,
  SCORING_WEIGHTS,
  ok,
  err,
  hadkError,
  remainingHours,
  weightsSumToOne,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';

// ─── Next Action ─────────────────────────────────────────────────────────────

export interface NextAction {
  command: string;
  description: string;
  phase: Phase;
  blocked_by: string[];
  deadline_mode: DeadlineMode;
}

export interface StatusReport {
  competition: string;
  time_remaining: string;
  strategy_mode: string;
  selected_idea: string;
  current_phase: Phase;
  current_gate: string;
  mvp_completion: string;
  critical_risks: string[];
  demo_status: string;
  video_status: string;
  submission_status: string;
  deadline_mode: DeadlineMode;
  next_action: NextAction;
  verified_evidence: number;
  blockers: string[];
  assumptions: string[];
  stale_artifacts: string[];
  confidence: 'low' | 'medium' | 'high';
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export class Orchestrator {
  constructor(private store: StateStore) {}

  // ─── Deadline Policy ───────────────────────────────────────────────────

  getDeadlineMode(state: CompetitionState): DeadlineMode {
    const remaining = this.computeRemainingHours(state);
    if (remaining === null) return 'full';

    for (const threshold of DEADLINE_THRESHOLDS) {
      if (remaining >= threshold.min_hours) return threshold.mode;
    }
    return 'submission_only';
  }

  getDeadlinePolicy(state: CompetitionState): DeadlinePolicy {
    const mode = this.getDeadlineMode(state);
    const remaining = this.computeRemainingHours(state) ?? Infinity;
    const policy = DEADLINE_POLICIES[mode];
    return { mode, remaining_hours: remaining, ...policy };
  }

  computeRemainingHours(state: CompetitionState): number | null {
    return remainingHours(state.competition.deadline, state.competition.remaining_hours);
  }

  // ─── Gate Checks ───────────────────────────────────────────────────────

  checkGate(state: CompetitionState, phase: Phase): { passed: boolean; issues: string[] } {
    const issues: string[] = [];

    switch (phase) {
      case 'competition-intelligence': {
        if (!state.competition.name) issues.push('No competition name confirmed. Run `hadk brief confirm competition_name --value <name>`.');
        if (state.competition.tracks.length === 0) issues.push('No tracks captured. Run `hadk ingest <url-or-file>`.');
        if (state.competition.judging_criteria.length === 0) issues.push('No judging criteria captured or uncertainty recorded.');
        if (!state.competition.deadline && state.competition.remaining_hours === null) issues.push('No deadline captured. Run `hadk brief confirm deadline --value <ISO-date>`.');
        // Gate must also reflect actual gate status: cannot be passed if canonical state missing
        if (state.gates.competition_gate !== 'passed') {
          // Report additional context if gate is pending but checkGate issues already cover it
          if (issues.length === 0) issues.push(`Competition gate is ${state.gates.competition_gate}. Complete brief review and confirm required facts.`);
        }
        break;
      }

      case 'strategy':
        if (!state.strategy.mode) issues.push('No strategy mode selected. Run `hadk strategy`.');
        if (state.strategy.scoring_profile && !weightsSumToOne(state.strategy.scoring_profile)) {
          issues.push('Scoring profile weights do not sum to 1.0.');
        }
        break;

      case 'idea':
        if (!state.strategy.selected_idea) issues.push('No idea selected. Run `hadk idea`.');
        if (state.strategy.selected_track === null && state.competition.tracks.length > 1) {
          issues.push('Multiple tracks exist but none selected.');
        }
        break;

      case 'scope':
        if (state.scope.status !== 'locked') issues.push('Scope is not locked. Run `hadk scope`.');
        if (state.scope.demo_flow.length === 0) issues.push('No demo flow defined in scope.');
        if (!state.scope.primary_wow_moment) issues.push('No primary wow moment defined.');
        {
          const totalHours = state.scope.mvp_features.reduce((sum, f) => sum + f.estimated_hours, 0);
          const available = this.computeRemainingHours(state) ?? 48;
          if (totalHours > available) issues.push(`MVP estimate (${totalHours}h) exceeds available time (${available}h).`);
        }
        for (const dep of state.scope.external_dependencies) {
          if (!dep.fallback) issues.push(`Critical dependency "${dep.name}" has no fallback.`);
        }
        break;

      case 'architecture':
        if (state.architecture.status === 'unselected') issues.push('No architecture profile selected.');
        if (state.scope.status !== 'locked') issues.push('Cannot finalize architecture before scope is locked.');
        break;

      case 'scaffold':
        if (state.architecture.status === 'unselected') issues.push('Architecture must be selected before scaffold. Run `hadk scaffold`.');
        break;

      case 'build':
        if (state.delivery.demo_status === 'blocked') issues.push('Demo path is blocked.');
        break;

      case 'demo':
        if (state.delivery.demo_status === 'not_started') issues.push('Demo validation has not run.');
        break;

      case 'video':
        if (state.delivery.video_status === 'not_started') issues.push('Video project not generated. Run `hadk video generate`.');
        break;

      case 'submission':
        if (state.delivery.submission_status === 'not_started') issues.push('Submission preparation not started. Run `hadk submit`.');
        break;

      default:
        break;
    }

    return { passed: issues.length === 0, issues };
  }

  // ─── Next Action ───────────────────────────────────────────────────────

  getNextAction(state: CompetitionState): NextAction {
    const deadlineMode = this.getDeadlineMode(state);
    const policy = DEADLINE_POLICIES[deadlineMode];
    const phase = state.delivery.phase;

    // Deadline override: submission-only mode
    if (deadlineMode === 'submission_only' && phase !== 'complete') {
      return {
        command: 'hadk submit',
        description: 'Under 1 hour remaining — submission-only mode. Protect existing artifacts and submit.',
        phase: 'submission',
        blocked_by: [],
        deadline_mode: deadlineMode,
      };
    }

    const action = this.resolveAction(state, phase, policy.allowed_operations);
    return { ...action, deadline_mode: deadlineMode };
  }

  private resolveAction(state: CompetitionState, phase: Phase, allowed: string[]): NextAction {
    const current = this.currentPhaseAction(state, phase, allowed);
    if (current) return current;
    const phaseIdx = PHASES.indexOf(phase);

    // Walk from current phase forward to find the first actionable step
    for (let i = phaseIdx; i < PHASES.length; i++) {
      const p = PHASES[i];
      if (p === 'complete') {
        return {
          command: 'hadk status',
          description: 'All phases complete. Review final status.',
          phase: 'complete',
          blocked_by: [],
          deadline_mode: this.getDeadlineMode(state),
        };
      }

      const gateKey = GATE_FOR_PHASE[p];
      const gateStatus: GateStatus = gateKey ? state.gates[gateKey] : 'passed';

      if (gateStatus !== 'passed') {
        const gateCheck = this.checkGate(state, p);
        const command = this.commandForPhase(p);
        const opName = this.operationForPhase(p);
        const blockedByDeadline = opName !== null && !allowed.includes(opName);

        return {
          command: blockedByDeadline ? this.fallbackCommand(allowed) : command,
          description: blockedByDeadline
            ? `Deadline policy restricts "${opName}". Fallback action recommended.`
            : `Gate "${gateKey ?? p}" not passed: ${gateCheck.issues[0] ?? 'requirements incomplete'}.`,
          phase: p,
          blocked_by: blockedByDeadline ? [`deadline_policy:${this.getDeadlineMode(state)}`] : gateCheck.issues,
          deadline_mode: this.getDeadlineMode(state),
        };
      }
    }

    return {
      command: 'hadk status',
      description: 'Unable to determine next action — review status.',
      phase,
      blocked_by: [],
      deadline_mode: this.getDeadlineMode(state),
    };
  }

  private currentPhaseAction(state: CompetitionState, phase: Phase, allowed: string[]): NextAction | null {
    const command = this.commandForPhase(phase);
    const operation = this.operationForPhase(phase);
    const deadline_mode = this.getDeadlineMode(state);
    const blocked = operation !== null && !allowed.includes(operation);
    const blockedBy = blocked ? [`deadline_policy:${deadline_mode}`] : [];
    const fallback = blocked ? this.fallbackCommand(allowed) : command;

    if (phase === 'setup') return { command: fallback, description: 'Initialize the harness before ingesting a competition.', phase, blocked_by: blockedBy, deadline_mode };
    if (phase === 'strategy' && !state.strategy.scoring_profile) return { command: fallback, description: 'Choose a strategy mode before generating ideas.', phase, blocked_by: blockedBy, deadline_mode };
    if (phase === 'judge') return { command: fallback, description: 'Prepare judge Q&A before submission.', phase, blocked_by: blockedBy, deadline_mode };
    if (phase === 'build' && state.gates.build_gate !== 'passed') return { command: fallback, description: 'Validate the generated project before demo preparation.', phase, blocked_by: blockedBy, deadline_mode };
    if (phase === 'video' && state.delivery.video_status === 'project_generated') return { command: 'hadk video render', description: 'Render and verify the generated video before judge preparation.', phase, blocked_by: [], deadline_mode };
    return null;
  }

  private commandForPhase(phase: Phase): string {
    const map: Record<string, string> = {
      setup: 'hadk setup',
      'competition-intelligence': 'hadk ingest <competition-url-or-file>',
      strategy: 'hadk strategy',
      idea: 'hadk idea',
      scope: 'hadk scope',
      architecture: 'hadk architecture plan',
      scaffold: 'hadk scaffold',
      build: 'hadk verify build',
      demo: 'hadk verify demo',
      video: 'hadk package review',
      judge: 'hadk judge',
      submission: 'hadk submit',
    };
    return map[phase] ?? 'hadk status';
  }

  private operationForPhase(phase: Phase): string | null {
    const map: Record<string, string> = {
      strategy: 'strategy',
      idea: 'idea',
      scope: 'scope',
      architecture: 'scaffold',
      scaffold: 'scaffold',
      build: 'build',
      demo: 'demo',
      video: 'video',
      judge: 'judge',
      submission: 'submission',
    };
    return map[phase] ?? null;
  }

  private fallbackCommand(allowed: string[]): string {
    if (allowed.includes('submission')) return 'hadk submit';
    if (allowed.includes('demo')) return 'hadk demo';
    if (allowed.includes('video')) return 'hadk video generate';
    return 'hadk status';
  }

  // ─── Status Report ─────────────────────────────────────────────────────

  getStatus(state: CompetitionState): StatusReport {
    const remaining = this.computeRemainingHours(state);
    const gateKey = GATE_FOR_PHASE[state.delivery.phase];
    const doneTasks = state.delivery.tasks.filter((t) => t.status === 'done').length;
    const totalTasks = state.delivery.tasks.length;
    const criticalRisks = state.delivery.risks
      .filter((r) => (r.severity === 'critical' || r.severity === 'high') && r.status === 'open')
      .map((r) => r.description);

    return {
      competition: state.competition.name ?? '(not ingested)',
      time_remaining: remaining !== null ? `${remaining}h` : '(unknown)',
      strategy_mode: state.strategy.mode,
      selected_idea: state.strategy.selected_idea ?? '(none)',
      current_phase: state.delivery.phase,
      current_gate: gateKey ? `${gateKey}: ${state.gates[gateKey]}` : '(none)',
      mvp_completion: totalTasks > 0 ? `${doneTasks}/${totalTasks} tasks` : '(no tasks planned)',
      critical_risks: criticalRisks,
      demo_status: state.delivery.demo_status,
      video_status: state.delivery.video_status,
      submission_status: state.delivery.submission_status,
      deadline_mode: this.getDeadlineMode(state),
      next_action: this.getNextAction(state),
      verified_evidence: (state.evidence ?? []).filter((e) => e.status === 'verified' || e.status === 'captured').length,
      blockers: state.blockers ?? [],
      assumptions: state.assumptions ?? [],
      stale_artifacts: state.architecture.status === 'invalidated' ? ['architecture', 'handoff', 'verification'] : [],
      confidence: (state.evidence ?? []).length > 3 && !(state.blockers ?? []).length ? 'high' : (state.evidence ?? []).length > 0 ? 'medium' : 'low',
    };
  }

  // ─── Phase Advancement ─────────────────────────────────────────────────

  advancePhase(state: CompetitionState): Result<Phase> {
    const idx = PHASES.indexOf(state.delivery.phase);
    if (idx >= PHASES.length - 1) {
      return err(hadkError('ALREADY_COMPLETE', 'Already at final phase.'));
    }

    const currentGate = GATE_FOR_PHASE[state.delivery.phase];
    if (currentGate && state.gates[currentGate] !== 'passed') {
      const check = this.checkGate(state, state.delivery.phase);
      return err(
        hadkError('GATE_NOT_PASSED', `Cannot advance: gate "${currentGate}" has not passed.`, check.issues),
      );
    }

    const next = PHASES[idx + 1];
    return ok(next);
  }

  // ─── Replan ────────────────────────────────────────────────────────────

  replan(state: CompetitionState, reason: string): Result<CompetitionState> {
    const updated = this.store.update((s) => {
      s.delivery.risks.push({
        id: `risk-replan-${Date.now().toString(36)}`,
        description: `Replan triggered: ${reason}`,
        severity: 'medium',
        mitigation: 'Scope and timeline re-evaluated.',
        status: 'open',
      });
      // Unlock scope
      if (s.scope.status === 'locked') {
        s.scope.status = 'unlocked';
      }
      // Cascade invalidation: scope and everything downstream must be re-earned
      s.gates.scope_gate = 'pending';
      s.gates.architecture_gate = 'pending';
      s.gates.build_gate = 'pending';
      s.gates.demo_gate = 'pending';
      s.gates.video_gate = 'pending';
      s.gates.submission_gate = 'pending';
      s.architecture.status = 'invalidated';
      s.architecture.invalidation_reason = reason;
      s.architecture.stale_since = new Date().toISOString();
      // Roll back phase to scope so the user re-runs scope → architecture → scaffold
      s.delivery.phase = 'scope';
    });

    if (!updated.ok) return updated;
    this.store.log('replan', `Replan triggered: ${reason}. Gates reset: architecture → submission; scope unlocked.`);
    return updated;
  }
}

// ─── Scoring Helpers ─────────────────────────────────────────────────────────

export function scoreIdea(
  scores: Record<string, number>,
  weights: Record<string, number>,
): { breakdown: Record<string, number>; total: number } {
  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const [axis, weight] of Object.entries(weights)) {
    const raw = Math.min(10, Math.max(0, scores[axis] ?? 5));
    const weighted = raw * weight;
    breakdown[axis] = Math.round(weighted * 100) / 100;
    total += weighted;
  }

  return { breakdown, total: Math.round(total * 100) / 100 };
}

export function validateScoringProfile(mode: keyof typeof SCORING_WEIGHTS, profile: Record<string, number>): Result<void> {
  const expected = SCORING_WEIGHTS[mode];
  const axes = Object.keys(expected);

  for (const axis of axes) {
    if (!(axis in profile)) {
      return err(hadkError('MISSING_AXIS', `Scoring profile missing axis "${axis}" for mode "${mode}".`));
    }
  }

  if (!weightsSumToOne(profile)) {
    return err(hadkError('WEIGHTS_INVALID', 'Scoring profile weights must sum to 1.0.'));
  }

  return ok(undefined);
}
