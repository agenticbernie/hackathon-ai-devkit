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
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function persistRenderFailure(st: StateStore, blocker: string): void {
  const attemptedAt = new Date().toISOString();
  st.update((s) => {
    s.delivery.video_status = 'failed';
    s.gates.video_gate = 'failed';
  });
  st.writeArtifact('video', 'render-report.yaml', {
    attempted_at: attemptedAt,
    status: 'failed',
    blocker,
    video_gate: 'failed',
  });
}
import {
  cmdSetup,
  cmdIngest,
  cmdBriefReview,
  cmdBriefChange,
  cmdConfigure,
  cmdStrategy,
  cmdIdea,
  cmdIdeaImport,
  cmdIdeaSelect,
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
  cmdStartupResearch,
  cmdStartupScorecard,
  cmdStartupDeepDive,
  cmdStartupValidate,
  cmdStartupAdaptHackathon,
  cmdStartupStatus,
  cmdStartupNext,
  cmdArchitecturePlan,
  cmdHandoffImplement,
  cmdHandoffImport,
  cmdVerifyBuild,
  cmdVerifyDemo,
  cmdPackageSubmission,
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

const brief = program.command('brief').description('Review evidence-aware competition facts');
brief.command('review').description('Show extracted facts, provenance, confidence, and blockers').action(async () => cmdBriefReview(store()));
brief.command('show').description('Alias for brief review').action(async () => cmdBriefReview(store()));
brief.command('confirm <field>').description('Confirm a reviewed field explicitly')
  .option('--value <value>', 'value to confirm when the source was unknown')
  .action(async (field, opts) => cmdBriefChange(store(), field, 'confirm', opts.value));
brief.command('reject <field>').description('Reject a reviewed field explicitly').action(async (field) => cmdBriefChange(store(), field, 'reject'));

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
  .option('--taste <taste>', 'auto (infer) | user (supply taste)', 'auto')
  .option('--market <markets>', 'comma-separated: b2b,b2c,b2g,developer_tools')
  .option('--layer <layers>', 'comma-separated: application,tooling,infrastructure,protocol,platform')
  .option('--technology <techs>', 'comma-separated: ai_agents,blockchain,climate,robotics,cybersecurity,data,fintech,healthcare,education,iot')
  .option('--business-shape <shapes>', 'comma-separated: vertical_saas,horizontal_platform,open_source,enterprise,marketplace')
  .option('--traits <traits>', 'comma-separated: technically_impressive,commercially_credible,visually_demoable,socially_impactful,futuristic')
  .option('--taste-file <path>', 'read taste profile from a YAML file')
  .action(async (opts) => cmdStrategy(store(), opts));

// ─── idea ────────────────────────────────────────────────────────────────────
const idea = program
  .command('idea')
  .description('Generate, score, select, and import candidate ideas');

idea
  .command('generate', { isDefault: true })
  .description('Generate and score candidate ideas (default)')
  .option('--count <n>', 'number of candidate ideas (3-7)', '5')
  .option('--agent <agent>', 'intended coding agent for later refinement (claude-code, codex, opencode)')
  .option('--provider <provider>', 'intended LLM provider for later refinement (openai, openrouter, groq)')
  .option('--agent-handoff', 'export a prompt pack for an agent to refine ideas instead of generating heuristics')
  .action(async (opts) => cmdIdea(store(), opts));

idea
  .command('import')
  .description('Import agent-refined idea candidates from a YAML file')
  .argument('<file>', 'path to the YAML result file')
  .action(async (file) => cmdIdeaImport(store(), file));
idea
  .command('select <candidateId>')
  .description('Explicitly select a reviewed idea candidate')
  .option('--reason <reason>', 'human selection reason')
  .action(async (candidateId, opts) => cmdIdeaSelect(store(), candidateId, opts.reason));

// ─── scope ───────────────────────────────────────────────────────────────────
program
  .command('scope')
  .description('Create and lock the MVP scope')
  .option('--unlock', 'unlock a previously locked scope (requires replan)')
  .action(async (opts) => cmdScope(store(), opts));

// ─── scaffold ────────────────────────────────────────────────────────────────
program
  .command('scaffold')
  .description('[Deprecated experimental] Generate a project scaffold from the locked scope')
  .option('--profile <profile>', `scaffold profile (${listProfiles().join(' | ')})`)
  .option('--output <dir>', 'output directory', 'prototype')
  .option('--dry-run', 'preview files without writing')
  .option('--force', 'overwrite conflicting files (destructive)')
  .option('--allow-outside-root', 'explicitly allow output outside the project root')
  .action(async (opts) => {
    const engine = new ScaffoldEngine(store());
    const result = engine.generate({
      profile: opts.profile,
      output: opts.output,
      dryRun: opts.dryRun,
      force: opts.force,
      allowOutsideRoot: opts.allowOutsideRoot,
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

program
  .command('architecture')
  .description('Create the v2.1 architecture plan')
  .command('plan')
  .description('Write system context, boundaries, data flow, decisions, and verification strategy')
  .action(async () => cmdArchitecturePlan(store()));

const handoff = program.command('handoff').description('Agent-compatible task handoff, not autonomous execution');
handoff.command('implement').description('Export canonical context and one packet per implementation unit')
  .option('--agent <agent>', 'claude-code, codex, or opencode', 'claude-code')
  .action(async (opts) => cmdHandoffImplement(store(), opts));
handoff.command('import <resultFile>').description('Import a typed agent result as agent_reported')
  .action(async (resultFile) => cmdHandoffImport(store(), resultFile));

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
    if (t === 'build' && result.passed) {
      const updated = s.update((state) => {
        state.gates.build_gate = 'passed';
        if (state.delivery.phase === 'build') state.delivery.phase = 'demo';
      });
      if (!updated.ok) return fail(updated.error.message);
    }
    printValidationResults([result], opts.json);
    process.exitCode = result.passed ? 0 : 1;
  });

// ─── demo ────────────────────────────────────────────────────────────────────
program
  .command('demo')
  .description('[Deprecated alias] Use hadk verify demo')
  .action(async () => cmdDemo(store()));

const verify = program.command('verify').description('Run real evidence-backed verification contracts');
verify.command('build').description('Install, typecheck, test, build, start, and healthcheck prototype/')
  .action(async () => cmdVerifyBuild(store()));
verify.command('demo').description('Run reset/seed, start, healthcheck, and the demo journey')
  .option('--human', 'record explicit human attestation instead of automated verification')
  .option('--operator <name>', 'human operator name')
  .option('--checklist <items>', 'semicolon-separated checklist items')
  .option('--media <path>', 'confined screenshot or recording path')
  .action(async (opts) => cmdVerifyDemo(store(), opts));

// ─── video ───────────────────────────────────────────────────────────────────
const video = program.command('video').description('[Deprecated optional] Video planning and HyperFrames integration');

video
  .command('plan')
  .description('Build a video plan from the locked demo flow')
  .action(async () => {
    const adapter = new HyperFramesAdapter(store());
    const loaded = store().load();
    if (!loaded.ok) return fail(loaded.error.message);
    const plan = adapter.buildPlan(loaded.value);
    if (!plan.ok) return fail(plan.error.message, plan.error.hint);
    const storyboard = [
      `# Demo Video Plan: ${plan.value.title}`,
      '',
      `Target duration: ${plan.value.duration_seconds}s`,
      '',
      '## Storyboard',
      ...plan.value.scenes.map((scene) => `- ${scene.order}. **${scene.type}** (${scene.duration_seconds}s): ${scene.narration} — ${scene.visual_description}`),
      '',
      '## Asset checklist',
      ...plan.value.assets.map((asset) => `- [${asset.status === 'available' ? 'x' : ' '}] ${asset.type}: ${asset.path} (${asset.description})`),
      '',
      'Optional external video link: _add only after review_',
      '',
      'This plan is not a rendered video and does not satisfy media evidence by itself.',
    ].join('\n');
    const videoPlan = store().writeTextArtifact('submission', 'video-plan.md', storyboard);
    if (!videoPlan.ok) return fail(videoPlan.error.message);
    success(`Video plan: ${plan.value.title} (${plan.value.duration_seconds}s, ${plan.value.scenes.length} scenes)`);
    info(`Storyboard: ${videoPlan.value}`);
  });

// ─── startup discovery ───────────────────────────────────────────────────────
const startup = program.command('startup').description('Problem-first startup discovery workflow');

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

startup
  .command('research')
  .description('Map market pain points before solution ideation')
  .requiredOption('--market <market>', 'market or domain to research')
  .requiredOption('--segments <segments>', 'comma-separated target segments')
  .option('--source <file-or-url>', 'source reference to preserve as provenance', collectOption, [])
  .option('--sources-file <path>', 'YAML/JSON file containing source references')
  .option('--agent <agent>', 'intended agent for later refinement')
  .option('--output <path>', 'optional additional YAML output path')
  .option('--agent-handoff', 'generate Claude Code and Codex research prompts')
  .action(async (opts) => cmdStartupResearch(store(), opts));

startup
  .command('scorecard')
  .description('Rank pain points by evidence-aware opportunity quality')
  .option('--research-file <path>', 'research YAML artifact path')
  .option('--deep-dive-file <path>', 'optional deep-dive YAML artifact path')
  .option('--agent <agent>', 'intended agent for later refinement')
  .action(async (opts) => cmdStartupScorecard(store(), opts));

startup
  .command('deep-dive <pain-point-id>')
  .description('Investigate one pain point and seek disconfirming evidence')
  .option('--research-file <path>', 'research YAML artifact path')
  .option('--pain-point-file <path>', 'YAML file containing the selected pain point')
  .option('--agent <agent>', 'intended agent for later refinement')
  .action(async (id, opts) => cmdStartupDeepDive(store(), id, opts));

startup
  .command('validate')
  .description('Create a falsifiable validation plan from a pain-point deep dive')
  .option('--deep-dive-file <path>', 'deep-dive YAML artifact path')
  .option('--methods <methods>', 'comma-separated validation methods')
  .option('--timeline-days <n>', 'validation timeline in days', '7')
  .option('--agent <agent>', 'intended agent for later refinement')
  .action(async (opts) => cmdStartupValidate(store(), opts));

startup
  .command('adapt-hackathon')
  .description('Map existing hackathon skills into a problem-first startup workflow')
  .option('--profile <profile>', 'startup or startup-contest', 'startup')
  .option('--source-skills <skills>', 'comma-separated source skill profile')
  .option('--agent <agent>', 'intended agent for later refinement')
  .action(async (opts) => cmdStartupAdaptHackathon(store(), opts));

startup
  .command('status')
  .description('Show startup discovery artifacts, blockers, and next action')
  .option('--json', 'output stable JSON for agents')
  .action(async (opts) => cmdStartupStatus(store(), opts));

startup
  .command('next')
  .description('Recommend the next valid startup discovery action')
  .action(async () => cmdStartupNext(store()));

video
  .command('generate')
  .description('Generate the complete demo-video/ HyperFrames project')
  .option('--duration <seconds>', 'video duration in seconds', '60')
  .action(async (opts) => {
    const st = store();
    const loaded = st.load();
    if (!loaded.ok) return fail(loaded.error.message);
    if (loaded.value.gates.demo_gate !== 'passed') {
      return fail('Demo gate has not passed.', 'Run `hadk demo` after `hadk validate build`.');
    }
    const adapter = new HyperFramesAdapter(st);
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
    const st = store();
    const loaded = st.load();
    if (!loaded.ok) return fail(loaded.error.message);
    if (loaded.value.delivery.phase !== 'video') {
      return fail('Video rendering is only available during the video phase.', 'Complete build validation and `hadk demo` first.');
    }
    const adapter = new HyperFramesAdapter(st);
    const validation = adapter.validate();
    if (!validation.ok) return fail(validation.error.message);
    if (!validation.value.passed) return fail(`Video project invalid: ${validation.value.issues.join('; ')}`);

    const { execSync } = await import('node:child_process');
    const { existsSync, statSync } = await import('node:fs');
    const videoDir = join(st.projectRoot, 'demo-video');

    if (existsSync(join(videoDir, 'package.json'))) {
      try {
        info('Rendering video…');
        execSync('pnpm render', { cwd: videoDir, encoding: 'utf-8', stdio: 'pipe', timeout: 300_000 });
        // Verify MP4 was produced (portable Node stat, not GNU stat)
        const mp4 = join(videoDir, 'output', 'submission-video.mp4');
        if (existsSync(mp4)) {
          const size = statSync(mp4).size;
          if (size === 0) {
            const blocker = 'Render produced a zero-byte MP4, which is not valid media evidence.';
            persistRenderFailure(st, blocker);
            return warn(`${blocker} Render failure persisted in state.`);
          }
          success(`MP4 rendered: ${mp4} (${(size / 1024).toFixed(1)} KB)`);
          // Update state to reflect successful render
          st.update((s) => {
            s.delivery.video_status = 'rendered';
            s.gates.video_gate = 'passed';
            if (s.delivery.phase === 'video' || s.delivery.phase === 'judge') {
              s.delivery.phase = 'judge';
            }
          });
          st.writeArtifact('video', 'render-report.yaml', {
            rendered_at: new Date().toISOString(),
            output_path: mp4,
            size_bytes: size,
            video_gate: 'passed',
          });
        } else {
          const blocker = 'Render completed but no MP4 was produced in demo-video/output/.';
          persistRenderFailure(st, blocker);
          warn(`${blocker} Render failure persisted in state.`);
        }
      } catch (e: any) {
        const blocker = `Render failed (HyperFrames CLI may need setup): ${e.stderr ?? e.message}`;
        persistRenderFailure(st, blocker);
        warn(`${blocker} Render failure persisted in state.`);
        info('The composition remains valid and previewable: open demo-video/compositions/submission-video.html');
      }
    } else {
      const blocker = 'Video project package.json is missing. Re-run `hadk video generate` before rendering.';
      persistRenderFailure(st, blocker);
      warn(`${blocker} Render failure persisted in state.`);
      info('Manually: cd demo-video && pnpm render');
      info('The composition remains valid and previewable: open demo-video/compositions/submission-video.html');
    }
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
  .description('[Deprecated alias] Use hadk package submission')
  .requiredOption('--repository <url>', 'public repository URL for the submission')
  .action(async (opts) => cmdSubmit(store(), opts));

const pkg = program.command('package').description('Requirements-driven local submission package');
pkg.command('submission').description('Assemble a local submission package from actual evidence')
  .option('--repository <url>', 'repository URL')
  .action(async (opts) => cmdPackageSubmission(store(), 'submission', opts.repository));
pkg.command('review').description('Review requirement status and blockers')
  .option('--repository <url>', 'repository URL')
  .action(async (opts) => cmdPackageSubmission(store(), 'review', opts.repository));
pkg.command('export').description('Export the local package as markdown')
  .option('--repository <url>', 'repository URL')
  .action(async (opts) => cmdPackageSubmission(store(), 'export', opts.repository));

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

export {
  cmdSetup,
  cmdIngest,
  cmdBriefReview,
  cmdBriefChange,
  cmdConfigure,
  cmdStrategy,
  cmdIdea,
  cmdIdeaImport,
  cmdIdeaSelect,
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
  cmdStartupResearch,
  cmdStartupScorecard,
  cmdStartupDeepDive,
  cmdStartupValidate,
  cmdStartupAdaptHackathon,
  cmdStartupStatus,
  cmdStartupNext,
  cmdArchitecturePlan,
  cmdHandoffImplement,
  cmdHandoffImport,
  cmdVerifyBuild,
  cmdVerifyDemo,
  cmdPackageSubmission,
} from './handlers.js';

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  program.parseAsync(process.argv).catch((e) => {
    fail(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
