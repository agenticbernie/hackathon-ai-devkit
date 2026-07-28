import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore, createDefaultState, migrateState } from '@hadk/state-store';
import { SCHEMA_VERSION } from '@hadk/core';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-state-'));
  store = new StateStore(dir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('state initialization', () => {
  it('creates the .hackathon/ directory structure and default state', () => {
    const result = store.init();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.created).toBe(true);
    expect(existsSync(store.statePath)).toBe(true);
    expect(existsSync(store.configPath)).toBe(true);
    expect(existsSync(store.checkpointsDir)).toBe(true);
    expect(existsSync(store.logsDir)).toBe(true);
    expect(result.value.state.schema_version).toBe(SCHEMA_VERSION);
    expect(result.value.state.delivery.phase).toBe('setup');
  });

  it('is idempotent — re-init preserves existing state', () => {
    store.init();
    store.update((s) => { s.competition.name = 'Test Comp'; });
    const second = store.init();
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.created).toBe(false);
    expect(second.value.state.competition.name).toBe('Test Comp');
  });

  it('detects initialization state', () => {
    expect(store.isInitialized()).toBe(false);
    store.init();
    expect(store.isInitialized()).toBe(true);
  });
});

describe('atomic writes and corruption protection', () => {
  it('writes a backup alongside state.yaml', () => {
    store.init();
    store.update((s) => { s.competition.name = 'First'; });
    store.update((s) => { s.competition.name = 'Second'; });
    // A .bak should exist after the second atomic write.
    expect(existsSync(store.statePath + '.bak')).toBe(true);
  });

  it('reports unparseable state as an error rather than crashing', () => {
    store.init();
    writeFileSync(store.statePath, 'not: valid: state: structure', 'utf-8');
    const loaded = store.load();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe('YAML_PARSE_ERROR');
    }
  });

  it('reports structurally-invalid state as corrupted', () => {
    store.init();
    // Parseable YAML, but missing the required schema_version/gates structure.
    writeFileSync(store.statePath, 'foo: bar\nbaz: 1\n', 'utf-8');
    const loaded = store.load();
    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.error.code).toBe('STATE_CORRUPTED');
    }
  });

  it('restores state.yaml.bak when rollback is requested after corruption', () => {
    store.init();
    store.update((s) => { s.competition.name = 'Recoverable'; });
    store.update((s) => { s.competition.name = 'Newer'; });
    writeFileSync(store.statePath, 'not: valid: yaml: [', 'utf-8');

    const restored = store.rollback();
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value.competition.name).toBe('Recoverable');
  });
});

describe('schema migration', () => {
  it('bumps an older schema_version to the current one', () => {
    const state = createDefaultState();
    state.schema_version = '0.1';
    const migrated = migrateState(state);
    expect(migrated.changed).toBe(true);
    expect(migrated.state.schema_version).toBe(SCHEMA_VERSION);
  });

  it('fills in missing top-level sections from defaults', () => {
    const partial = createDefaultState();
    // @ts-expect-error simulate a partial older state
    delete partial.gates;
    const migrated = migrateState(partial);
    expect(migrated.changed).toBe(true);
    expect(migrated.state.gates).toBeDefined();
    expect(migrated.state.gates.competition_gate).toBe('pending');
  });

  it('migrates on load when the persisted schema is old', () => {
    store.init();
    const raw = readFileSync(store.statePath, 'utf-8');
    writeFileSync(store.statePath, raw.replace(`schema_version: '${SCHEMA_VERSION}'`, "schema_version: '0.1'"), 'utf-8');
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.value.schema_version).toBe(SCHEMA_VERSION);
  });
});

describe('checkpoints and rollback', () => {
  it('creates a checkpoint and lists it', () => {
    store.init();
    store.update((s) => { s.competition.name = 'Checkpointed'; });
    const ckpt = store.createCheckpoint('before-risk');
    expect(ckpt.ok).toBe(true);
    const list = store.listCheckpoints();
    expect(list.length).toBe(1);
    expect(list[0].label).toBe('before-risk');
  });

  it('rolls back to the last checkpoint, restoring prior state', () => {
    store.init();
    store.update((s) => { s.competition.name = 'Good State'; });
    store.createCheckpoint('safe');
    store.update((s) => { s.competition.name = 'Broken State'; });

    const rolled = store.rollback();
    expect(rolled.ok).toBe(true);
    if (!rolled.ok) return;
    expect(rolled.value.competition.name).toBe('Good State');
  });

  it('errors clearly when there are no checkpoints', () => {
    store.init();
    const rolled = store.rollback();
    expect(rolled.ok).toBe(false);
    if (!rolled.ok) expect(rolled.error.code).toBe('NO_CHECKPOINTS');
  });

  it('preserves checkpoint history across rollback', () => {
    store.init();
    store.createCheckpoint('a');
    store.createCheckpoint('b');
    store.rollback();
    const list = store.listCheckpoints();
    expect(list.length).toBe(2);
  });
});

describe('artifacts', () => {
  it('writes and reads a YAML artifact', () => {
    store.init();
    const written = store.writeArtifact('ideas', 'candidates.yaml', { ideas: [1, 2, 3] });
    expect(written.ok).toBe(true);
    const read = store.readArtifact<{ ideas: number[] }>('ideas', 'candidates.yaml');
    expect(read.ok).toBe(true);
    if (read.ok) expect(read.value.ideas).toEqual([1, 2, 3]);
  });
});
