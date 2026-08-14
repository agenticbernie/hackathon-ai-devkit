import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { StateStore } from '@hadk/state-store';
import { ScaffoldEngine } from '@hadk/scaffold-engine';
import { VerificationRunner } from '@hadk/verification';

describe('v2.1 web-ai-fullstack reference project', () => {
  it('installs, typechecks, tests, builds, starts, healthchecks, and verifies the demo', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-reference-'));
    try {
      const store = new StateStore(root);
      store.init();
      store.update((state) => {
        state.competition.name = 'Reference Competition';
        state.strategy.selected_idea = 'Reference Proof';
        state.scope.status = 'locked';
        state.scope.mvp_features = [{
          id: 'core_mechanism',
          name: 'Core mechanism',
          purpose: 'Reference proof',
          required_for_demo: true,
          required_for_rubric: true,
          estimated_hours: 1,
          dependencies: [],
          fallback: 'deterministic',
        }];
        state.scope.demo_flow = [{ step: 1, user_action: 'submit', system_response: 'result', proof_shown: 'visible result' }];
        state.scope.primary_wow_moment = { description: 'visible result', demo_step: 1, judge_takeaway: 'proof' };
      });
      const scaffold = new ScaffoldEngine(store).generate({ profile: 'web-ai-fullstack' });
      expect(scaffold.ok).toBe(true);
      const build = await new VerificationRunner({ projectRoot: 'prototype', store }).build();
      expect(build.ok && build.value.passed).toBe(true);
      const demo = await new VerificationRunner({ projectRoot: 'prototype', store }).demo();
      expect(demo.ok && demo.value.passed).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 180_000);
});
