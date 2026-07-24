import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Orchestrator, scoreIdea, validateScoringProfile } from '@hadk/orchestrator';
import { StateStore, createDefaultState } from '@hadk/state-store';
import { SCORING_WEIGHTS, STRATEGY_MODES } from '@hadk/core';
import type { CompetitionState } from '@hadk/core';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-orch-'));
  store = new StateStore(dir);
  store.init();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function stateWith(remaining: number | null): CompetitionState {
  const s = createDefaultState();
  s.competition.remaining_hours = remaining;
  return s;
}

describe('strategy scoring', () => {
  it('computes a weighted total from scores and weights', () => {
    const weights = SCORING_WEIGHTS.realistic;
    const scores: Record<string, number> = {};
    for (const axis of Object.keys(weights)) scores[axis] = 10;
    const { total, breakdown } = scoreIdea(scores, weights);
    // All axes at 10 with weights summing to 1.0 → total 10.
    expect(total).toBeCloseTo(10, 5);
    expect(Object.keys(breakdown).length).toBe(Object.keys(weights).length);
  });

  it('clamps scores to the 0-10 range', () => {
    const weights = { a: 1.0 };
    const high = scoreIdea({ a: 99 }, weights);
    const low = scoreIdea({ a: -5 }, weights);
    expect(high.total).toBe(10);
    expect(low.total).toBe(0);
  });

  it('defaults a missing axis score to 5', () => {
    const weights = { a: 1.0 };
    const result = scoreIdea({}, weights);
    expect(result.total).toBe(5);
  });

  it('validates that every mode scoring profile sums to 1.0', () => {
    for (const mode of STRATEGY_MODES) {
      const result = validateScoringProfile(mode, SCORING_WEIGHTS[mode]);
      expect(result.ok).toBe(true);
    }
  });

  it('rejects a scoring profile that does not sum to 1.0', () => {
    const bad = { problem_value: 0.5, rubric_alignment: 0.1 };
    const result = validateScoringProfile('realistic', bad);
    expect(result.ok).toBe(false);
  });
});

describe('deadline mode transitions', () => {
  let orch: Orchestrator;
  beforeEach(() => {
    orch = new Orchestrator(store);
  });

  it('selects "full" mode with plenty of time', () => {
    expect(orch.getDeadlineMode(stateWith(48))).toBe('full');
  });

  it('steps down through modes as time runs out', () => {
    // Bands: full >=24, fast 12-24, demo_first 6-12, freeze_scope 3-6,
    // no_new_features 1-3, submission_only 0-1.
    expect(orch.getDeadlineMode(stateWith(20))).toBe('fast');
    expect(orch.getDeadlineMode(stateWith(8))).toBe('demo_first');
    expect(orch.getDeadlineMode(stateWith(4))).toBe('freeze_scope');
    expect(orch.getDeadlineMode(stateWith(2))).toBe('no_new_features');
    expect(orch.getDeadlineMode(stateWith(0.5))).toBe('submission_only');
    expect(orch.getDeadlineMode(stateWith(0))).toBe('submission_only');
  });

  it('treats a missing deadline as full mode (no false panic)', () => {
    expect(orch.getDeadlineMode(stateWith(null))).toBe('full');
  });

  it('returns a policy object describing the active mode', () => {
    const policy = orch.getDeadlinePolicy(stateWith(8));
    expect(policy.mode).toBe('demo_first');
  });
});

describe('orchestrator status and next action', () => {
  let orch: Orchestrator;
  beforeEach(() => {
    orch = new Orchestrator(store);
  });

  it('produces a status report for fresh state', () => {
    const s = createDefaultState();
    const status = orch.getStatus(s);
    expect(status).toBeDefined();
    expect(status.current_phase).toBe('setup');
  });

  it('recommends a next action for fresh state', () => {
    const s = createDefaultState();
    const next = orch.getNextAction(s);
    expect(next).toBeDefined();
    expect(typeof next.command).toBe('string');
    expect(next.command.length).toBeGreaterThan(0);
  });
});
