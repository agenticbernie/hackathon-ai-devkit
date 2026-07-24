import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { HyperFramesAdapter } from '@hadk/hyperframes-adapter';
import type { CompetitionState } from '@hadk/core';

let dir: string;
let store: StateStore;

function baseState(): CompetitionState {
  return {
    schema_version: '1.0',
    competition: {
      name: 'Video Test Hackathon',
      competition_type: 'hackathon',
      description: 'Test',
      deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      duration_hours: 48,
      tracks: [{ name: 'AI Agents', description: 'Agents' }],
      criteria: [{ name: 'Innovation', weight: 1, description: 'Innovative' }],
      sponsor_requirements: [],
      prizes: [],
      resources: [],
      url: '',
    },
    team: { size: 2, skills: ['TypeScript'], experience_level: 'intermediate' },
    strategy: {
      mode: 'realistic',
      taste_source: 'auto',
      idea_taste: { market: [], product_layer: [], technology: [], business_shape: [], desired_traits: [] },
      scoring_profile: { innovation: 0.25, feasibility: 0.25, wow: 0.25, rubric_fit: 0.25 },
      selected_track: 'AI Agents',
      selected_idea: 'Test Idea',
    },
    ideas: {
      candidates: [],
      selected: null,
    },
    scope: {
      status: 'locked',
      mvp_features: [],
      demo_flow: [{ step: 1, user_action: 'Run', system_response: 'Works', proof_shown: 'Result' }],
      primary_wow_moment: { description: 'Wow', demo_step: 1, judge_takeaway: 'Fast' },
      external_dependencies: [],
      time_budget: { total_hours: 48, mvp_hours: 24, buffer_hours: 4 },
    },
    architecture: { profile: 'web-ai-fullstack', status: 'generated', decisions: [], feature_mapping: {} },
    delivery: {
      phase: 'video',
      risks: [],
      tasks: [],
      milestones: [],
      checkpoints: [],
      deployment_status: 'not_started',
      demo_status: 'not_started',
      video_status: 'not_started',
    },
    gates: {
      setup_gate: 'passed',
      competition_intelligence_gate: 'passed',
      strategy_gate: 'passed',
      idea_gate: 'passed',
      scope_gate: 'passed',
      architecture_gate: 'passed',
      build_gate: 'passed',
      demo_gate: 'passed',
      video_gate: 'pending',
      submission_gate: 'pending',
    },
  } as unknown as CompetitionState;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-video-'));
  store = new StateStore(dir);
  store.init();
  store.update((s) => {
    Object.assign(s, baseState());
  });
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('HyperFrames video project generation', () => {
  it('generates an ESM render script that detects both hyperframes and hf', () => {
    const adapter = new HyperFramesAdapter(store);
    const result = adapter.generate({ durationSeconds: 30 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files_written).toContain('scripts/render.mjs');
    const videoDir = result.value.video_dir;
    const script = readFileSync(join(videoDir, 'scripts', 'render.mjs'), 'utf-8');
    expect(script).toContain('import { execFileSync } from \'node:child_process\'');
    expect(script).toContain('hyperframes');
    expect(script).toContain('hf');
    expect(script).toContain('statSync');
    expect(script).not.toContain('require(');
    expect(script).not.toContain('hyperframes render');
    const pkg = JSON.parse(readFileSync(join(videoDir, 'package.json'), 'utf-8'));
    expect(pkg.scripts.render).toBe('node scripts/render.mjs');
  });

  it('does not advance phase to judge until render succeeds', () => {
    const adapter = new HyperFramesAdapter(store);
    const result = adapter.generate({ durationSeconds: 30 });
    expect(result.ok).toBe(true);
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.delivery.phase).toBe('video');
    expect(state.gates.video_gate).toBe('pending');
  });
});
