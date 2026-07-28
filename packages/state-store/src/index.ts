/**
 * @hadk/state-store — persistent competition state management.
 *
 * Manages the .hackathon/ directory: state.yaml, config, artifacts,
 * checkpoints, rollback, migration, and history logging.
 */

import {
  type CompetitionState,
  type Checkpoint,
  type Phase,
  type Result,
  SCHEMA_VERSION,
  STATE_DIR,
  STATE_FILE,
  CONFIG_FILE,
  ARTIFACT_DIRS,
  ok,
  err,
  hadkError,
  readYamlFile,
  writeYamlFileAtomic,
  stringifyYaml,
  generateId,
  nowIso,
} from '@hadk/core';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

// ─── Default State ───────────────────────────────────────────────────────────

export function createDefaultState(): CompetitionState {
  return {
    schema_version: SCHEMA_VERSION,
    competition: {
      name: null,
      type: 'hackathon',
      source_url: null,
      deadline: null,
      remaining_hours: null,
      tracks: [],
      judging_criteria: [],
      sponsor_requirements: [],
      disqualifiers: [],
    },
    team: {
      size: null,
      members: [],
      skills: [],
      existing_assets: [],
      constraints: [],
    },
    strategy: {
      mode: 'realistic',
      taste_source: 'auto',
      idea_taste: { market: [], product_layer: [], technology: [], business_shape: [], desired_traits: [] },
      selected_track: null,
      selected_idea: null,
      scoring_profile: null,
    },
    scope: {
      status: 'unlocked',
      mvp_features: [],
      deferred_features: [],
      demo_flow: [],
      primary_wow_moment: null,
      external_dependencies: [],
      fallbacks: [],
    },
    architecture: {
      profile: null,
      status: 'unselected',
      decisions: [],
      feature_mapping: {},
    },
    delivery: {
      phase: 'setup',
      risks: [],
      tasks: [],
      milestones: [],
      checkpoints: [],
      deployment_status: 'not_started',
      demo_status: 'not_started',
      video_status: 'not_started',
      submission_status: 'not_started',
    },
    gates: {
      competition_gate: 'pending',
      idea_gate: 'pending',
      scope_gate: 'pending',
      architecture_gate: 'pending',
      build_gate: 'pending',
      demo_gate: 'pending',
      video_gate: 'pending',
      submission_gate: 'pending',
    },
  };
}

// ─── State Store ─────────────────────────────────────────────────────────────

export class StateStore {
  readonly projectRoot: string;
  readonly stateDir: string;
  readonly statePath: string;
  readonly configPath: string;
  readonly artifactsDir: string;
  readonly checkpointsDir: string;
  readonly logsDir: string;
  readonly contextDir: string;
  readonly evidenceDir: string;
  readonly generatedDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
    this.stateDir = join(this.projectRoot, STATE_DIR);
    this.statePath = join(this.stateDir, STATE_FILE);
    this.configPath = join(this.stateDir, CONFIG_FILE);
    this.artifactsDir = join(this.stateDir, 'artifacts');
    this.checkpointsDir = join(this.stateDir, 'checkpoints');
    this.logsDir = join(this.stateDir, 'logs');
    this.contextDir = join(this.stateDir, 'context');
    this.evidenceDir = join(this.stateDir, 'evidence');
    this.generatedDir = join(this.stateDir, 'generated');
  }

  // ─── Initialization ──────────────────────────────────────────────────────

  /**
   * Initialize the .hackathon/ directory structure. Non-destructive:
   * existing state is preserved.
   */
  init(): Result<{ created: boolean; state: CompetitionState }> {
    const alreadyExists = existsSync(this.statePath);

    // Create directory structure
    mkdirSync(this.stateDir, { recursive: true });
    mkdirSync(this.contextDir, { recursive: true });
    mkdirSync(this.evidenceDir, { recursive: true });
    mkdirSync(this.checkpointsDir, { recursive: true });
    mkdirSync(this.logsDir, { recursive: true });
    mkdirSync(this.generatedDir, { recursive: true });
    for (const dir of ARTIFACT_DIRS) {
      mkdirSync(join(this.artifactsDir, dir), { recursive: true });
    }

    if (alreadyExists) {
      const loaded = this.load();
      if (!loaded.ok) return loaded;
      this.log('init', 'State already exists; preserved existing state.');
      return ok({ created: false, state: loaded.value });
    }

    const state = createDefaultState();
    const written = this.save(state);
    if (!written.ok) return written;

    // Write default config
    if (!existsSync(this.configPath)) {
      writeYamlFileAtomic(this.configPath, {
        schema_version: SCHEMA_VERSION,
        created_at: nowIso(),
        agent: null,
        package_manager: null,
        autonomous_mode: false,
      });
    }

    this.log('init', 'Initialized .hackathon/ state directory.');
    return ok({ created: true, state });
  }

  isInitialized(): boolean {
    return existsSync(this.statePath);
  }

  // ─── Load / Save ─────────────────────────────────────────────────────────

  load(): Result<CompetitionState> {
    const result = readYamlFile<CompetitionState>(this.statePath);
    if (!result.ok) return result;

    const state = result.value;

    // Corruption protection: verify essential structure
    if (!state || typeof state !== 'object' || !state.schema_version || !state.gates) {
      return err(
        hadkError(
          'STATE_CORRUPTED',
          `State file at ${this.statePath} is corrupted or has an unrecognized structure.`,
          ['A backup may exist at state.yaml.bak'],
          'Run `hadk rollback` to restore the last checkpoint, or delete .hackathon/ and re-run `hadk setup`.',
        ),
      );
    }

    // Schema migration
    const migrated = migrateState(state);
    if (migrated.changed) {
      const saved = this.save(migrated.state);
      if (!saved.ok) return saved;
      this.log('migration', `Migrated state from schema ${state.schema_version} to ${migrated.state.schema_version}.`);
    }

    return ok(migrated.state);
  }

  save(state: CompetitionState): Result<void> {
    const result = writeYamlFileAtomic(this.statePath, state);
    if (!result.ok) return result;
    return ok(undefined);
  }

  /**
   * Update state with a partial mutation function, then persist atomically.
   */
  update(mutator: (state: CompetitionState) => void): Result<CompetitionState> {
    const loaded = this.load();
    if (!loaded.ok) return loaded;

    const state = loaded.value;
    mutator(state);

    const saved = this.save(state);
    if (!saved.ok) return saved;
    return ok(state);
  }

  // ─── Phase Transitions ───────────────────────────────────────────────────

  setPhase(phase: Phase): Result<CompetitionState> {
    const result = this.update((s) => {
      s.delivery.phase = phase;
    });
    if (result.ok) {
      this.log('phase', `Phase transition → ${phase}`);
    }
    return result;
  }

  // ─── Checkpoints ─────────────────────────────────────────────────────────

  createCheckpoint(label?: string): Result<Checkpoint> {
    const loaded = this.load();
    if (!loaded.ok) return loaded;
    const state = loaded.value;

    const checkpoint: Checkpoint = {
      id: generateId('ckpt'),
      created_at: nowIso(),
      phase: state.delivery.phase,
      label: label ?? `checkpoint-${state.delivery.phase}`,
      state_file: '',
    };
    checkpoint.state_file = `${checkpoint.id}.yaml`;

    const ckptPath = join(this.checkpointsDir, checkpoint.state_file);
    const written = writeYamlFileAtomic(ckptPath, state);
    if (!written.ok) return err(hadkError('CHECKPOINT_FAILED', `Failed to write checkpoint: ${written.error.message}`));

    // Record in state
    const updated = this.update((s) => {
      s.delivery.checkpoints.push(checkpoint);
    });
    if (!updated.ok) return updated;

    this.log('checkpoint', `Created checkpoint ${checkpoint.id} (${checkpoint.label}) at phase ${checkpoint.phase}.`);
    return ok(checkpoint);
  }

  listCheckpoints(): Checkpoint[] {
    const loaded = this.load();
    if (!loaded.ok) return [];
    return loaded.value.delivery.checkpoints;
  }

  rollback(checkpointId?: string): Result<CompetitionState> {
    const loaded = this.load();
    if (!loaded.ok) {
      if (!checkpointId && existsSync(this.statePath + '.bak')) return this.restoreBackup();
      return loaded;
    }
    const state = loaded.value;

    const checkpoints = state.delivery.checkpoints;
    if (checkpoints.length === 0) {
      return err(hadkError('NO_CHECKPOINTS', 'No checkpoints available to roll back to.', undefined, 'Create a checkpoint first with `hadk checkpoint`.'));
    }

    const target = checkpointId
      ? checkpoints.find((c) => c.id === checkpointId)
      : checkpoints[checkpoints.length - 1];

    if (!target) {
      return err(hadkError('CHECKPOINT_NOT_FOUND', `Checkpoint "${checkpointId}" not found.`, checkpoints.map((c) => c.id)));
    }

    const ckptPath = join(this.checkpointsDir, target.state_file);
    if (!existsSync(ckptPath)) {
      return err(hadkError('CHECKPOINT_FILE_MISSING', `Checkpoint file missing: ${ckptPath}`));
    }

    const restored = readYamlFile<CompetitionState>(ckptPath);
    if (!restored.ok) return restored;

    // Preserve checkpoint history (don't lose newer checkpoints from the restored state)
    const restoredState = restored.value;
    restoredState.delivery.checkpoints = checkpoints;

    const saved = this.save(restoredState);
    if (!saved.ok) return saved;

    this.log('rollback', `Rolled back to checkpoint ${target.id} (phase: ${target.phase}).`);
    return ok(restoredState);
  }

  // ─── Artifacts ───────────────────────────────────────────────────────────

  artifactPath(category: string, filename: string): string {
    return join(this.artifactsDir, category, filename);
  }

  writeArtifact(category: string, filename: string, data: unknown): Result<string> {
    const filePath = this.artifactPath(category, filename);
    const result = writeYamlFileAtomic(filePath, data);
    if (!result.ok) return err(hadkError('ARTIFACT_WRITE_FAILED', `Failed to write artifact: ${result.error.message}`));
    this.log('artifact', `Wrote artifact ${category}/${filename}`);
    return ok(filePath);
  }

  writeTextArtifact(category: string, filename: string, content: string): Result<string> {
    try {
      const filePath = this.artifactPath(category, filename);
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf-8');
      this.log('artifact', `Wrote artifact ${category}/${filename}`);
      return ok(filePath);
    } catch (e) {
      return err(hadkError('ARTIFACT_WRITE_FAILED', `Failed to write artifact: ${(e as Error).message}`));
    }
  }

  private restoreBackup(): Result<CompetitionState> {
    const backupPath = this.statePath + '.bak';
    const backup = readYamlFile<CompetitionState>(backupPath);
    if (!backup.ok) return backup;
    if (!backup.value?.schema_version || !backup.value.gates) {
      return err(hadkError('BACKUP_CORRUPTED', `State backup at ${backupPath} is invalid.`));
    }
    try {
      copyFileSync(backupPath, this.statePath);
      this.log('rollback', 'Restored state.yaml from state.yaml.bak after state corruption.');
      return ok(backup.value);
    } catch (e) {
      return err(hadkError('BACKUP_RESTORE_FAILED', `Failed to restore ${backupPath}: ${(e as Error).message}`));
    }
  }

  readArtifact<T>(category: string, filename: string): Result<T> {
    return readYamlFile<T>(this.artifactPath(category, filename));
  }

  listArtifacts(category: string): string[] {
    const dir = join(this.artifactsDir, category);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.md'));
  }

  // ─── History Log ─────────────────────────────────────────────────────────

  log(event: string, message: string): void {
    try {
      const logPath = join(this.logsDir, 'history.log');
      const line = `${nowIso()} [${event}] ${message}\n`;
      const existing = existsSync(logPath) ? readFileSync(logPath, 'utf-8') : '';
      writeFileSync(logPath, existing + line, 'utf-8');
    } catch {
      // Logging must never crash the harness
    }
  }
}

// ─── Schema Migration ────────────────────────────────────────────────────────

interface MigrationResult {
  state: CompetitionState;
  changed: boolean;
}

/**
 * Migrate state from older schema versions to the current one.
 * Currently at schema 1.0 — future migrations chain here.
 */
export function migrateState(raw: CompetitionState): MigrationResult {
  const state = raw;
  let changed = false;

  if (state.schema_version !== SCHEMA_VERSION) {
    // Future: apply incremental migrations per version
    state.schema_version = SCHEMA_VERSION;
    changed = true;
  }

  // Ensure structural completeness (guards against partial older states)
  const defaults = createDefaultState();
  for (const section of Object.keys(defaults) as (keyof CompetitionState)[]) {
    if (!state[section]) {
      (state as unknown as Record<string, unknown>)[section] = defaults[section];
      changed = true;
    }
  }

  return { state, changed };
}
