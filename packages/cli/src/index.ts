#!/usr/bin/env node
/**
 * hadk — AI-native Competition Engineering Harness CLI.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { HADK_VERSION } from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { Orchestrator } from '@hadk/orchestrator';
import { ScaffoldEngine, listProfiles } from '@hadk/scaffold-engine';
import { runValidator, runAllValidators, type ValidatorName } from '@hadk/validators';
import { HyperFramesAdapter } from '@hadk/hyperframes-adapter';
import { AgentAdapters } from '@hadk/agent-adapters';
import { resolve } from 'node:path';
import {
  cmdSetup,
  cmdIngest,
  cmdConfigure,
  cmdStrategy,
  cmdIdea,
  cmdScope,
  cmdStatus,
  cmdNext,
  cmdCheckpoint,
  cmdRollback,
  cmdReplan,
  cmdDemo,
  cmdJudge,
  cmdSubmit,
  cmdDoctor,
  cmdUpdate,
} from './handlers.js';

const program = new Command();

function store(): StateStore {
  return new StateStore(process.cwd());
}

function hadkRoot(): string {
  // The harness root (where manifest.yaml lives) — resolved relative to this package.
  return resolve(import.meta.dirname, '..', '..', '..');
}

program
  .name('hadk')
  .description('AI-native Competition Engineering Harness — competition brief → winning submission')
  .version(HADK_VERSION);

// ─── setup ───────────────────────────────────────────────────────────────────
program
  .command('setup')
  .description('Initialize .hackathon/ state, detect repo/agents/package manager, install adapters')
  .option('--team-size <n>', 'team size')
  .option('--team-skills <skills>', 'comma-separated team skills')
  .option('--non-interactive', 'skip prompts')
  .action(async (opts) => cmdSetup(store(), opts));

// ─── ingest ──────────────────────────────────────────────────────────────────
program
  .command('ingest <source>')
  .description('Ingest a competition brief from a URL or local file')
  .option('--track <track>', 'preferred track hint')
  .action(async (source, opts) => cmdIngest(store(), source, opts));

// ─── configure ───────────────────────────────────────────────────────────────
program
  .command('configure')
  .description('Update team and competition configuration')
  .option('--team-size <n>', 'team size')
  .option('--team-skills <skills>', 'comma-separated team skills')
  .option('--deadline <iso>', 'competition deadline (ISO 8601)')
  .option('--remaining-hours <n>', 'hours remaining')
  .action(async (opts) => cmdConfigure(store(), opts));

// ─── strategy ────────────────────────────────────────────────────────────────
program
  .command('strategy')
  .description('Select strategy mode (conservative | realistic | futuristic) and taste profile')
  .option('--mode <mode>', 'conservative | realistic | futuristic', 'realistic')
  .option('--taste <taste>', 'user | auto', 'auto')
  .action(async (opts) => cmdStrategy(store(), opts));

// ─── idea ────────────────────────────────────────────────────────────────────
program
  .command('idea')
  .description('Generate, score, and select candidate ideas')
  .option('--count <n>', 'number of candidate ideas (3-7)', '5')
  .action(async (opts) => cmdIdea(store(), opts));

// ─── scope ───────────────────────────────────────────────────────────────────
program
  .command('scope')
  .description('Create and lock the MVP scope')
  .option('--unlock', 'unlock a previously locked scope (requires replan)')
  .action(async (opts) => cmdScope(store(), opts));

// ─── scaffold ────────────────────────────────────────────────────────────────
program
  .command('scaffold')
  .description('Generate an actual project scaffold from the locked scope')
  .option('--profile <profile>', `scaffold profile (${listProfiles().join(' | ')})`)
  .option('--output <dir>', 'output directory', 'prototype')
  .option('--dry-run', 'preview files without writing')
  .option('--force', 'overwrite conflicting files (destructive)')
  .action(async (opts) => {
    const engine = new ScaffoldEngine(store());
    const result = engine.generate({
      profile: opts.profile,
      output: opts.output,
      dryRun: opts.dryRun,
      force: opts.force,
    });
    if (!result.ok) {
      fail(result.error.message, result.error.hint);
      return;
    }
    const r = result.value;
    success(`Scaffold ${r.dry_run ? 'dry-run' : 'generated'}: ${r.plan.project_name} (${r.plan.profile})`);
    info(`  Output: ${r.output_dir}`);
    info(`  Files ${r.dry_run ? 'to write' : 'written'}: ${r.files_written.length}`);
    if (r.files_skipped.length) info(`  Skipped (identical): ${r.files_skipped.length}`);
    if (r.conflicts.length) {
      warn(`  Conflicts (not overwritten): ${r.conflicts.join(', ')}`);
      info('  Re-run with --force to overwrite conflicting files.');
    }
    if (!r.dry_run) {
      info(`  Start: cd ${r.output_dir} && ${r.plan.startup_command}`);
      info(`  Health: ${r.plan.health_check}`);
    }
  });

// ─── status ──────────────────────────────────────────────────────────────────
program
  .command('status')
  .description('Show competition state, phase, gates, deadline mode, and next action')
  .option('--json', 'output as JSON')
  .action(async (opts) => cmdStatus(store(), new Orchestrator(store()), opts));

// ─── next ────────────────────────────────────────────────────────────────────
program
  .command('next')
  .description('Inspect actual state and print the correct next action')
  .action(async () => cmdNext(store(), new Orchestrator(store())));

// ─── checkpoint ──────────────────────────────────────────────────────────────
program
  .command('checkpoint')
  .description('Create a state checkpoint')
  .option('--label <label>', 'checkpoint label')
  .action(async (opts) => cmdCheckpoint(store(), opts));

// ─── rollback ────────────────────────────────────────────────────────────────
program
  .command('rollback')
  .description('Roll back to the last (or a named) checkpoint')
  .argument('[checkpointId]', 'checkpoint id to restore')
  .action(async (checkpointId) => cmdRollback(store(), checkpointId));

// ─── replan ──────────────────────────────────────────────────────────────────
program
  .command('replan')
  .description('Unlock scope and re-plan (records the reason)')
  .option('--reason <reason>', 'reason for replanning', 'manual replan')
  .action(async (opts) => cmdReplan(store(), new Orchestrator(store()), opts));

// ─── validate ────────────────────────────────────────────────────────────────
program
  .command('validate [target]')
  .description('Run validation gates (state|registry|competition|idea|scope|scaffold|build|demo|video|submission|all)')
  .option('--json', 'output as JSON')
  .action(async (target, opts) => {
    const s = store();
    const root = hadkRoot();
    const t = (target ?? 'all') as string;

    if (t === 'all') {
      const results = runAllValidators(s, root);
      printValidationResults(results, opts.json);
      const failed = results.filter((r) => !r.passed);
      process.exitCode = failed.length > 0 ? 1 : 0;
      return;
    }

    const result = runValidator(t as ValidatorName, s, root);
    printValidationResults([result], opts.json);
    process.exitCode = result.passed ? 0 : 1;
  });

// ─── demo ────────────────────────────────────────────────────────────────────
program
  .command('demo')
  .description('Validate and prepare the demo path')
  .action(async () => cmdDemo(store()));

// ─── video ───────────────────────────────────────────────────────────────────
const video = program.command('video').description('HyperFrames demo video pipeline');

video
  .command('plan')
  .description('Build a video plan from the locked demo flow')
  .action(async () => {
    const adapter = new HyperFramesAdapter(store());
    const loaded = store().load();
    if (!loaded.ok) return fail(loaded.error.message);
    const plan = adapter.buildPlan(loaded.value);
    if (!plan.ok) return fail(plan.error.message, plan.error.hint);
    success(`Video plan: ${plan.value.title} (${plan.value.duration_seconds}s, ${plan.value.scenes.length} scenes)`);
  });

video
  .command('generate')
  .description('Generate the complete demo-video/ HyperFrames project')
  .option('--duration <seconds>', 'video duration in seconds', '60')
  .action(async (opts) => {
    const adapter = new HyperFramesAdapter(store());
    const result = adapter.generate({ durationSeconds: parseInt(opts.duration, 10) });
    if (!result.ok) return fail(result.error.message, result.error.hint);
    const r = result.value;
    success(`Video project generated at ${r.video_dir}`);
    info(`  Files: ${r.files_written.join(', ')}`);
    if (r.render_status === 'blocked') {
      warn(`  Render: BLOCKED — ${r.render_blocker}`);
    } else {
      info('  Render: not attempted. Run `hadk video render` when HyperFrames is available.');
    }
  });

video
  .command('preview')
  .description('Show how to preview the composition')
  .action(async () => {
    info('Open demo-video/compositions/submission-video.html in a browser to preview.');
  });

video
  .command('render')
  .description('Render the composition to MP4 (requires HyperFrames CLI)')
  .action(async () => {
    const adapter = new HyperFramesAdapter(store());
    const validation = adapter.validate();
    if (!validation.ok) return fail(validation.error.message);
    if (!validation.value.passed) return fail(`Video project invalid: ${validation.value.issues.join('; ')}`);
    warn('Rendering requires the HyperFrames CLI. Run: cd demo-video && pnpm render');
    info('If the CLI is unavailable, the composition remains valid and previewable.');
  });

video
  .command('validate')
  .description('Validate the generated video project')
  .action(async () => {
    const adapter = new HyperFramesAdapter(store());
    const result = adapter.validate();
    if (!result.ok) return fail(result.error.message);
    if (result.value.passed) {
      success('Video project is valid.');
    } else {
      fail(`Video project issues: ${result.value.issues.join('; ')}`);
      process.exitCode = 1;
    }
  });

// ─── judge ───────────────────────────────────────────────────────────────────
program
  .command('judge')
  .description('Prepare judge Q&A and scoring simulation artifacts')
  .action(async () => cmdJudge(store()));

// ─── submit ──────────────────────────────────────────────────────────────────
program
  .command('submit')
  .description('Prepare and validate the submission package')
  .action(async () => cmdSubmit(store()));

// ─── update ──────────────────────────────────────────────────────────────────
program
  .command('update')
  .description('Update the HADK installation')
  .action(async () => cmdUpdate());

// ─── doctor ──────────────────────────────────────────────────────────────────
program
  .command('doctor')
  .description('Diagnose the environment (Node, package manager, git, agents, state, registry)')
  .action(async () => cmdDoctor(store(), hadkRoot()));

// ─── Output Helpers ──────────────────────────────────────────────────────────

export function success(msg: string): void {
  console.log(pc.green('✓') + ' ' + msg);
}

export function info(msg: string): void {
  console.log(pc.dim('  ' + msg));
}

export function warn(msg: string): void {
  console.log(pc.yellow('⚠') + ' ' + msg);
}

export function fail(msg: string, hint?: string): void {
  console.error(pc.red('✗') + ' ' + msg);
  if (hint) console.error(pc.dim('  hint: ' + hint));
  process.exitCode = 1;
}

function printValidationResults(results: import('@hadk/core').ValidationResult[], asJson?: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }
  for (const r of results) {
    const icon = r.passed ? pc.green('PASS') : pc.red('FAIL');
    console.log(`${icon}  ${r.validator}`);
    for (const issue of r.issues) {
      const color = issue.severity === 'error' ? pc.red : issue.severity === 'warning' ? pc.yellow : pc.dim;
      console.log(color(`   [${issue.code}] ${issue.message}`));
    }
  }
}

program.parseAsync(process.argv).catch((e) => {
  fail(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
