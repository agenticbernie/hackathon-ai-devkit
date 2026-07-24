import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { ScaffoldEngine } from '@hadk/scaffold-engine';
import type { ScopeFeature, DemoFlowStep, WowMoment } from '@hadk/core';

let dir: string;
let store: StateStore;
let engine: ScaffoldEngine;

const feature = (id: string): ScopeFeature => ({
  id,
  name: id,
  purpose: `Test feature ${id}`,
  required_for_demo: true,
  required_for_rubric: true,
  estimated_hours: 4,
  dependencies: [],
  fallback: 'canned response',
});

const demoFlow: DemoFlowStep[] = [
  { step: 1, user_action: 'Open app', system_response: 'Loads', proof_shown: 'UI appears' },
];

const wow: WowMoment = {
  description: 'Magic happens',
  demo_step: 1,
  judge_takeaway: 'Instant',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-arch-'));
  store = new StateStore(dir);
  store.init();
  engine = new ScaffoldEngine(store);
  store.update((s) => {
    s.competition.name = 'Arch Gate Test';
    s.strategy.selected_idea = 'Arch Project';
    s.scope.status = 'locked';
    s.scope.mvp_features = [feature('core_mechanism'), feature('input_surface'), feature('output_view')];
    s.scope.demo_flow = demoFlow;
    s.scope.primary_wow_moment = wow;
    s.architecture.profile = 'web-ai-fullstack';
    s.architecture.status = 'selected';
    s.delivery.phase = 'scaffold';
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('scaffold architecture gate', () => {
  it('sets architecture_gate to passed and advances to build phase', () => {
    const result = engine.generate({ dryRun: false });
    expect(result.ok).toBe(true);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.gates.architecture_gate).toBe('passed');
    expect(state.architecture.status).toBe('generated');
    expect(state.delivery.phase).toBe('build');
  });
});
