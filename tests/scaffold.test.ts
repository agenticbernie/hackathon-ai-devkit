import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { ScaffoldEngine, listProfiles, slugify, hashContent, pascalCase } from '@hadk/scaffold-engine';
import { IMPLEMENTED_PROFILES } from '@hadk/core';
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
  { step: 2, user_action: 'Submit input', system_response: 'Processes', proof_shown: 'Result shown' },
];

const wow: WowMoment = {
  description: 'The result appears instantly',
  demo_step: 2,
  judge_takeaway: 'Fast and magical',
};

function lockScope(profile: string) {
  store.update((s) => {
    s.competition.name = 'Scaffold Test';
    s.strategy.selected_idea = 'Test Project';
    s.scope.status = 'locked';
    s.scope.mvp_features = [feature('core_mechanism'), feature('input_surface'), feature('output_view')];
    s.scope.demo_flow = demoFlow;
    s.scope.primary_wow_moment = wow;
    s.architecture.profile = profile;
    s.architecture.status = 'selected';
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-scaffold-'));
  store = new StateStore(dir);
  store.init();
  engine = new ScaffoldEngine(store);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('profile registry', () => {
  it('lists the three implemented profiles', () => {
    const profiles = listProfiles();
    for (const p of IMPLEMENTED_PROFILES) {
      expect(profiles).toContain(p);
    }
  });
});

describe('scaffold dry run', () => {
  it('produces a plan without writing files', () => {
    lockScope('web-ai-fullstack');
    const result = engine.generate({ dryRun: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.dry_run).toBe(true);
    expect(result.value.plan.files.length).toBeGreaterThan(0);
    // In dry-run, files_written reports the files that *would* be written…
    expect(result.value.files_written.length).toBeGreaterThan(0);
    // …but nothing is actually written to disk.
    expect(existsSync(join(dir, 'prototype'))).toBe(false);
  });

  it('refuses to scaffold when scope is not locked (non-dry-run)', () => {
    // scope stays unlocked
    const result = engine.generate();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SCOPE_NOT_LOCKED');
  });
});

describe('scaffold generation', () => {
  it('writes real files for the fullstack profile', () => {
    lockScope('web-ai-fullstack');
    const result = engine.generate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.files_written.length).toBeGreaterThan(10);
    expect(existsSync(join(dir, 'prototype', 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'prototype', 'hadk.project.yaml'))).toBe(true);
    // A health endpoint must exist.
    expect(existsSync(join(dir, 'prototype', 'src', 'app', 'api', 'health', 'route.ts'))).toBe(true);
  });

  it('generates for every implemented profile', () => {
    for (const profile of IMPLEMENTED_PROFILES) {
      const pdir = mkdtempSync(join(tmpdir(), 'hadk-profile-'));
      const pstore = new StateStore(pdir);
      pstore.init();
      pstore.update((s) => {
        s.strategy.selected_idea = 'Profile Project';
        s.scope.status = 'locked';
        s.scope.mvp_features = [feature('core_mechanism')];
        s.scope.demo_flow = demoFlow;
        s.scope.primary_wow_moment = wow;
        s.architecture.profile = profile;
      });
      const pengine = new ScaffoldEngine(pstore);
      const result = pengine.generate();
      expect(result.ok, `profile ${profile} should generate`).toBe(true);
      if (result.ok) expect(result.value.files_written.length).toBeGreaterThan(0);
      rmSync(pdir, { recursive: true, force: true });
    }
  });
});

describe('file conflict protection', () => {
  it('does not overwrite a user-modified file without --force', () => {
    lockScope('web-ai-fullstack');
    engine.generate();
    const readmePath = join(dir, 'prototype', 'README.md');
    writeFileSync(readmePath, 'USER EDITED CONTENT', 'utf-8');

    const second = engine.generate();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // The user file must be preserved.
    expect(readFileSync(readmePath, 'utf-8')).toBe('USER EDITED CONTENT');
    expect(second.value.files_skipped.length).toBeGreaterThan(0);
  });

  it('overwrites conflicting files with --force', () => {
    lockScope('web-ai-fullstack');
    engine.generate();
    const readmePath = join(dir, 'prototype', 'README.md');
    writeFileSync(readmePath, 'USER EDITED CONTENT', 'utf-8');

    const forced = engine.generate({ force: true });
    expect(forced.ok).toBe(true);
    expect(readFileSync(readmePath, 'utf-8')).not.toBe('USER EDITED CONTENT');
  });
});

describe('scaffold helpers', () => {
  it('slugifies names', () => {
    expect(slugify('My Cool Project!')).toBe('my-cool-project');
  });
  it('produces stable content hashes', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });
  it('converts slugs to PascalCase', () => {
    expect(pascalCase('core-mechanism')).toBe('CoreMechanism');
  });
});
