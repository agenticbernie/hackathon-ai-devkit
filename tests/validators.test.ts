import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StateStore, createDefaultState } from '@hadk/state-store';
import { validateScope, validateRegistry, validateState, validateVideo } from '@hadk/validators';
import type { CompetitionState, ScopeFeature } from '@hadk/core';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const feature = (id: string, over: Partial<ScopeFeature> = {}): ScopeFeature => ({
  id,
  name: id,
  purpose: 'p',
  required_for_demo: true,
  required_for_rubric: false,
  estimated_hours: 4,
  dependencies: [],
  fallback: 'x',
  ...over,
});

function validScopeState(): CompetitionState {
  const s = createDefaultState();
  s.strategy.selected_idea = { id: 'i', name: 'Idea' } as any;
  s.scope.status = 'locked';
  s.scope.mvp_features = [feature('core_mechanism')];
  s.scope.demo_flow = [{ step: 1, user_action: 'a', system_response: 'b', proof_shown: 'c' }];
  s.scope.primary_wow_moment = { description: 'wow', demo_step: 1, judge_takeaway: 't' };
  s.competition.remaining_hours = 48;
  return s;
}

describe('scope validation', () => {
  it('passes a well-formed locked scope', () => {
    const result = validateScope(validScopeState());
    expect(result.passed).toBe(true);
  });

  it('fails when no idea is fixed', () => {
    const s = validScopeState();
    s.strategy.selected_idea = null;
    const result = validateScope(s);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'IDEA_NOT_FIXED')).toBe(true);
  });

  it('fails when there is no demo flow', () => {
    const s = validScopeState();
    s.scope.demo_flow = [];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'NO_DEMO_FLOW')).toBe(true);
  });

  it('fails when there is no wow moment', () => {
    const s = validScopeState();
    s.scope.primary_wow_moment = null;
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'NO_WOW_MOMENT')).toBe(true);
  });

  it('fails when a feature supports neither demo nor rubric', () => {
    const s = validScopeState();
    s.scope.mvp_features = [feature('orphan', { required_for_demo: false, required_for_rubric: false })];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'FEATURE_UNJUSTIFIED')).toBe(true);
  });

  it('fails when the time budget is exceeded', () => {
    const s = validScopeState();
    s.competition.remaining_hours = 2;
    s.scope.mvp_features = [feature('big', { estimated_hours: 100 })];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'BUDGET_EXCEEDED')).toBe(true);
  });

  it('uses an absolute deadline over stale remaining_hours', () => {
    const s = validScopeState();
    s.competition.remaining_hours = 48;
    s.competition.deadline = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    s.scope.mvp_features = [feature('big', { estimated_hours: 2 })];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'BUDGET_EXCEEDED')).toBe(true);
  });

  it('fails when an external dependency has no fallback', () => {
    const s = validScopeState();
    s.scope.external_dependencies = [{ name: 'API', type: 'api', risk: 'high', fallback: null } as any];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'NO_FALLBACK')).toBe(true);
  });

  it('fails when a feature is both deferred and in MVP', () => {
    const s = validScopeState();
    s.scope.deferred_features = [{ id: 'core_mechanism', name: 'x', reason_deferred: 'r' }];
    const result = validateScope(s);
    expect(result.issues.some((i) => i.code === 'INCONSISTENT_SCOPE')).toBe(true);
  });
});

describe('registry validation', () => {
  it('validates the real repository manifest', () => {
    const result = validateRegistry(repoRoot);
    expect(result.passed).toBe(true);
    // Should register all 30 skills.
    expect(result.issues.some((i) => i.code === 'REGISTRY_COUNT' && i.message.includes('30'))).toBe(true);
  });

  it('fails when the manifest is missing', () => {
    const empty = mkdtempSync(join(tmpdir(), 'hadk-reg-'));
    const result = validateRegistry(empty);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'MANIFEST_MISSING')).toBe(true);
    rmSync(empty, { recursive: true, force: true });
  });
});

describe('state validation', () => {
  it('fails when state is not initialized', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hadk-sv-'));
    const store = new StateStore(dir);
    const result = validateState(store);
    expect(result.passed).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes for initialized state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hadk-sv2-'));
    const store = new StateStore(dir);
    store.init();
    const result = validateState(store);
    expect(result.passed).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('video validation', () => {
  it('fails when no video project exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hadk-vv-'));
    const store = new StateStore(dir);
    store.init();
    const result = validateVideo(store);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.code === 'NO_VIDEO_PROJECT')).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
