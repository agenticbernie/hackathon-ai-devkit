import {
  type VerificationResult,
  type VerificationStep,
  err,
  hadkError,
  nowIso,
  ok,
  redactSecrets,
  safeResolvePath,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { existsSync, readFileSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

export interface VerificationOptions {
  projectRoot: string;
  store: StateStore;
  steps?: VerificationStep[];
  actor?: string;
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export class VerificationRunner {
  constructor(private readonly options: VerificationOptions) {}

  async build(): Promise<ReturnType<typeof ok<VerificationResult>> | ReturnType<typeof err>> {
    const rootCheck = safeResolvePath(this.options.store.projectRoot, this.options.projectRoot);
    if (!rootCheck.ok) return rootCheck;
    const steps = this.options.steps ?? defaultBuildSteps(rootCheck.value);
    return this.run(steps);
  }

  async demo(): Promise<ReturnType<typeof ok<VerificationResult>> | ReturnType<typeof err>> {
    const rootCheck = safeResolvePath(this.options.store.projectRoot, this.options.projectRoot);
    if (!rootCheck.ok) return rootCheck;
    const steps = this.options.steps ?? defaultDemoSteps(rootCheck.value);
    return this.run(steps);
  }

  async run(steps: VerificationStep[]): Promise<ReturnType<typeof ok<VerificationResult>> | ReturnType<typeof err>> {
    const project = safeResolvePath(this.options.store.projectRoot, this.options.projectRoot);
    if (!project.ok) return project;
    const results: VerificationResult['steps'] = [];
    let blocked = false;
    let process: ChildProcess | undefined;
    try {
      for (const step of steps) {
        if (blocked) {
          results.push({ step_id: step.id, kind: step.kind, status: 'blocked', exit_code: null, duration_ms: 0 });
          continue;
        }
        if (!step.command || step.command.length === 0) {
          results.push({ step_id: step.id, kind: step.kind, status: 'blocked', exit_code: null, duration_ms: 0 });
          if (step.required) blocked = true;
          continue;
        }
        const result = await executeCommand(step.command, project.value, step.timeout_ms, step.kind === 'start');
        if (step.kind === 'start') process = result.process;
        const stdout = result.stdout;
        const stderr = result.stderr;
        const outEvidence = await this.record(step, stdout, 'stdout');
        const errEvidence = await this.record(step, stderr, 'stderr');
        const passed = result.exitCode === 0 && !result.timedOut;
        results.push({
          step_id: step.id,
          kind: step.kind,
          status: passed ? 'passed' : 'failed',
          exit_code: result.exitCode,
          stdout_evidence_ref: outEvidence,
          stderr_evidence_ref: errEvidence,
          duration_ms: result.durationMs,
        });
        if (!passed && step.required) blocked = true;
      }
    } finally {
      if (process) {
        terminateProcess(process);
      }
    }
    const verification: VerificationResult = {
      schema_version: '2.1',
      contract_version: '2.1',
      project_root: project.value,
      created_at: nowIso(),
      updated_at: nowIso(),
      created_by: this.options.actor ?? 'hadk',
      source_refs: [],
      assumptions: [],
      blockers: results.filter((step) => step.status !== 'passed' && steps.find((candidate) => candidate.id === step.step_id)?.required).map((step) => `${step.step_id} ${step.status}`),
      evidence_refs: results.flatMap((step) => [step.stdout_evidence_ref, step.stderr_evidence_ref].filter((item): item is string => !!item)),
      verification_status: blocked ? 'blocked' : 'verified',
      steps: results,
      passed: !blocked && results.every((step) => step.status === 'passed' || !steps.find((candidate) => candidate.id === step.step_id)?.required),
    };
    return ok(verification);
  }

  private async record(step: VerificationStep, content: string, stream: 'stdout' | 'stderr'): Promise<string | undefined> {
    const evidence = this.options.store.recordEvidence({
      evidence_type: step.kind === 'test' ? 'test_output' : step.kind === 'build' ? 'build_output' : step.kind === 'healthcheck' ? 'healthcheck_output' : 'command_execution',
      source: `verification:${step.id}:${stream}`,
      actor: this.options.actor ?? 'hadk',
      status: 'captured',
      content: redactSecrets(content).slice(-100_000),
      redaction: { applied: content !== redactSecrets(content), fields: content !== redactSecrets(content) ? ['secrets'] : [] },
      metadata: { command: JSON.stringify(step.command ?? []) },
    });
    return evidence.ok ? evidence.value.id : undefined;
  }
}

export function defaultBuildSteps(projectRoot: string): VerificationStep[] {
  const commands = projectCommands(projectRoot);
  return [
    { id: 'install', kind: 'install', command: commands.install, timeout_ms: 300_000, required: true },
    { id: 'typecheck', kind: 'typecheck', command: commands.typecheck, timeout_ms: 120_000, required: true },
    { id: 'test', kind: 'test', command: commands.test, timeout_ms: 180_000, required: true },
    { id: 'build', kind: 'build', command: commands.build, timeout_ms: 300_000, required: true },
    { id: 'start', kind: 'start', command: commands.start, timeout_ms: 5_000, required: true },
    { id: 'healthcheck', kind: 'healthcheck', command: commands.healthcheck, timeout_ms: 30_000, required: true },
  ];
}

export function defaultDemoSteps(projectRoot: string): VerificationStep[] {
  return [
    { id: 'reset-seed', kind: 'api_smoke', command: projectCommands(projectRoot).reset, timeout_ms: 60_000, required: true },
    ...defaultBuildSteps(projectRoot).filter((step) => step.kind === 'start' || step.kind === 'healthcheck'),
    { id: 'demo-journey', kind: 'api_smoke', command: projectCommands(projectRoot).demo, timeout_ms: 120_000, required: true },
  ];
}

function projectCommands(projectRoot: string): Record<string, string[]> {
  const packagePath = join(projectRoot, 'package.json');
  let scripts: Record<string, string> = {};
  try {
    scripts = JSON.parse(readFileSync(packagePath, 'utf8')).scripts ?? {};
  } catch {
    // Missing package.json is reported as a failed install/build command.
  }
  const packageManager = existsSync(join(projectRoot, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(projectRoot, 'yarn.lock')) ? 'yarn' : 'npm';
  const run = (name: string): string[] => scripts[name] ? [packageManager, 'run', name] : [];
  const install = packageManager === 'pnpm' && existsSync(join(projectRoot, 'pnpm-lock.yaml')) ? [packageManager, 'install', '--frozen-lockfile'] : [packageManager, 'install'];
  return {
    install,
    typecheck: run('typecheck'),
    test: run('test'),
    build: run('build'),
    start: run('start'),
    reset: scripts['demo:reset'] ? [packageManager, 'run', 'demo:reset'] : [],
    demo: scripts['demo:verify'] ? [packageManager, 'run', 'demo:verify'] : run('demo'),
    healthcheck: ['curl', '--fail', '--silent', '--show-error', 'http://127.0.0.1:3000/api/health'],
  };
}

async function executeCommand(command: string[], cwd: string, timeoutMs: number, keepAlive: boolean): Promise<CommandResult & { process?: ChildProcess }> {
  const started = Date.now();
  return await new Promise((resolve) => {
    const [executable, ...args] = command;
    if (!executable || command.some((part) => part.includes('\0'))) {
      resolve({ exitCode: null, stdout: '', stderr: 'Invalid command.', durationMs: Date.now() - started, timedOut: false });
      return;
    }
    const child = spawn(executable, args, { cwd, shell: false, detached: process.platform !== 'win32', env: { ...process.env, CI: '1' } });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    let settled = false;
    const finish = (exitCode: number | null, timedOut: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ exitCode, stdout, stderr, durationMs: Date.now() - started, timedOut, process: keepAlive ? child : undefined });
    };
    const timer = setTimeout(() => { child.kill('SIGTERM'); finish(null, true); }, timeoutMs);
    child.once('error', (error) => { clearTimeout(timer); stderr += `\n${error.message}`; finish(null, false); });
    child.once('exit', (code) => { clearTimeout(timer); finish(code, false); });
    if (keepAlive) {
      setTimeout(() => { if (!settled) finish(0, false); }, Math.min(timeoutMs, 1000));
    }
  });
}

function terminateProcess(child: ChildProcess): void {
  try {
    if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch {
    // The process may have exited between the check and cleanup.
  }
}
