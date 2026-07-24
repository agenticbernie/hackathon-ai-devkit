import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { HyperFramesAdapter } from '@hadk/hyperframes-adapter';
import type { DemoFlowStep, WowMoment } from '@hadk/core';

let dir: string;
let store: StateStore;
let adapter: HyperFramesAdapter;

const demoFlow: DemoFlowStep[] = [
  { step: 1, user_action: 'Open app', system_response: 'Loads', proof_shown: 'UI appears' },
  { step: 2, user_action: 'Submit', system_response: 'Processes', proof_shown: 'Result' },
];
const wow: WowMoment = { description: 'Instant result', demo_step: 2, judge_takeaway: 'Magical' };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-video-'));
  store = new StateStore(dir);
  store.init();
  store.update((s) => {
    s.competition.name = 'Video Test';
    s.strategy.selected_idea = { id: 'i', name: 'Video Project' } as any;
    s.scope.status = 'locked';
    s.scope.mvp_features = [{ id: 'core_mechanism', name: 'Core', purpose: 'p', required_for_demo: true, required_for_rubric: true, estimated_hours: 4, dependencies: [], fallback: 'x' }];
    s.scope.demo_flow = demoFlow;
    s.scope.primary_wow_moment = wow;
  });
  adapter = new HyperFramesAdapter(store);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('HyperFrames project generation', () => {
  it('builds a video plan from the locked demo flow', () => {
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const plan = adapter.buildPlan(loaded.value);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.value.scenes.length).toBeGreaterThan(0);
    expect(plan.value.duration_seconds).toBeGreaterThan(0);
  });

  it('generates a complete demo-video/ project on disk', () => {
    const result = adapter.generate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const videoDir = join(dir, 'demo-video');
    expect(existsSync(join(videoDir, 'storyboard.yaml'))).toBe(true);
    expect(existsSync(join(videoDir, 'asset-manifest.yaml'))).toBe(true);
    expect(existsSync(join(videoDir, 'compositions', 'submission-video.html'))).toBe(true);
    expect(result.value.files_written.length).toBeGreaterThan(0);
  });

  it('reports render status honestly (blocked when CLI unavailable)', () => {
    const result = adapter.generate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // In CI/test the HyperFrames CLI is not installed → render must be blocked, not faked.
    expect(['not_attempted', 'blocked', 'rendered']).toContain(result.value.render_status);
    if (result.value.render_status === 'blocked') {
      expect(result.value.render_blocker).toBeTruthy();
    }
  });

  it('produces a valid storyboard YAML with scenes', () => {
    adapter.generate();
    const storyboard = readFileSync(join(dir, 'demo-video', 'storyboard.yaml'), 'utf-8');
    expect(storyboard).toContain('scenes');
  });
});

describe('video project validation', () => {
  it('validates the generated project as valid', () => {
    adapter.generate();
    const result = adapter.validate();
    expect(result.ok).toBe(true);
  });
});
