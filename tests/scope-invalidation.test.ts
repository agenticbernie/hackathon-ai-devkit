import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { Orchestrator } from '@hadk/orchestrator';
import { cmdScope, cmdReplan } from '@hadk/cli';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-scope-'));
  store = new StateStore(dir);
  store.init();
  // Put state in a post-scope state
  store.update((s) => {
    s.competition.name = 'Scope Test';
    s.strategy.selected_idea = 'Test Idea';
    s.strategy.mode = 'realistic';
    s.scope.status = 'locked';
    s.scope.mvp_features = [];
    s.gates.idea_gate = 'passed';
    s.gates.scope_gate = 'passed';
    s.gates.architecture_gate = 'passed';
    s.gates.build_gate = 'passed';
    s.architecture.status = 'generated';
    s.delivery.phase = 'build';
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scope --unlock', () => {
  it('resets scope_gate and downstream gates and invalidates architecture', async () => {
    await cmdScope(store, { unlock: true });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.scope.status).toBe('unlocked');
    expect(state.gates.scope_gate).toBe('pending');
    expect(state.gates.architecture_gate).toBe('pending');
    expect(state.gates.build_gate).toBe('pending');
    expect(state.gates.demo_gate).toBe('pending');
    expect(state.gates.video_gate).toBe('pending');
    expect(state.gates.submission_gate).toBe('pending');
    expect(state.architecture.status).toBe('invalidated');
    expect(state.architecture.invalidation_reason).toBe('scope unlocked by user');
    expect(state.delivery.phase).toBe('scope');
  });

  it('creates a checkpoint before unlocking', async () => {
    await cmdScope(store, { unlock: true });
    const checkpoints = store.listCheckpoints();
    expect(checkpoints.length).toBeGreaterThan(0);
    expect(checkpoints.some((c) => c.label === 'pre-unlock')).toBe(true);
  });
});

describe('deadline-aware scope', () => {
  it('uses a near deadline to size a scope that can actually fit', async () => {
    store.update((s) => {
      s.scope.status = 'unlocked';
      s.delivery.phase = 'scope';
      s.competition.remaining_hours = 48;
      s.competition.deadline = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString();
    });
    await cmdScope(store, {});
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const estimate = loaded.value.scope.mvp_features.reduce((total, feature) => total + feature.estimated_hours, 0);
    expect(loaded.value.scope.status).toBe('locked');
    expect(estimate).toBeLessThanOrEqual(5);
  });
});

describe('hadk replan', () => {
  it('cascades invalidation through scope_gate and downstream gates', async () => {
    const orch = new Orchestrator(store);
    await cmdReplan(store, orch, { reason: 'changed demo target' });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.scope.status).toBe('unlocked');
    expect(state.gates.scope_gate).toBe('pending');
    expect(state.gates.architecture_gate).toBe('pending');
    expect(state.gates.build_gate).toBe('pending');
    expect(state.gates.demo_gate).toBe('pending');
    expect(state.gates.video_gate).toBe('pending');
    expect(state.gates.submission_gate).toBe('pending');
    expect(state.architecture.status).toBe('invalidated');
    expect(state.architecture.invalidation_reason).toBe('changed demo target');
    expect(state.delivery.phase).toBe('scope');
    expect(state.delivery.risks.some((r: { description: string }) => r.description.includes('changed demo target'))).toBe(true);
    expect(store.listCheckpoints().some((checkpoint) => checkpoint.label === 'pre-replan')).toBe(true);
  });
});
