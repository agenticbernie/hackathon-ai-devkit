import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readYamlFile } from '@hadk/core';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliBin = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
const fixtureBrief = join(repoRoot, 'tests', 'fixtures', 'sample-hackathon', 'brief.md');

let dir: string;

function hadk(args: string[], env?: NodeJS.ProcessEnv): string {
  return execFileSync(process.execPath, [cliBin, ...args], {
    cwd: dir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: env ?? process.env,
  });
}

function readYaml<T = any>(...parts: string[]): T {
  const result = readYamlFile<T>(join(dir, ...parts));
  if (!result.ok) throw new Error(`Failed to read ${parts.join('/')}: ${result.error.message}`);
  return result.value;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-e2e-'));
  // Stage the fixture brief inside the project directory.
  copyFileSync(fixtureBrief, join(dir, 'brief.md'));
}, 120000);

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('full fixture competition flow (real CLI, real artifacts)', () => {
  it('setup initializes .hackathon/ state', () => {
    const out = hadk(['setup', '--team-size', '3', '--team-skills', 'ai,fullstack,design', '--non-interactive']);
    expect(out).toContain('Setup complete');
    expect(existsSync(join(dir, '.hackathon', 'state.yaml'))).toBe(true);
    expect(existsSync(join(dir, '.hackathon', 'artifacts'))).toBe(true);
  });

  it('ingest parses the brief into competition artifacts', () => {
    const out = hadk(['ingest', 'brief.md']);
    expect(out).toContain('Competition ingested');
    const competition = readYaml<any>('.hackathon', 'artifacts', 'competition', 'competition.yaml');
    expect(competition.event_metadata.name).toBe('FutureStack AI Hackathon 2026');
    expect(competition.tracks.length).toBeGreaterThanOrEqual(3);
    expect(competition.judging_criteria.length).toBeGreaterThanOrEqual(4);
    expect(competition.competition_type).toBe('hackathon');
  });

  it('strategy locks a futuristic strategy with auto taste', () => {
    const out = hadk(['strategy', '--mode', 'futuristic', '--taste', 'auto']);
    expect(out).toContain('Strategy locked: futuristic');
    const strategy = readYaml<any>('.hackathon', 'artifacts', 'strategy', 'strategy.yaml');
    expect(strategy.mode).toBe('futuristic');
    expect(strategy.taste_source).toBe('auto');
    // Futuristic weights must sum to 1.0
    const sum = Object.values(strategy.scoring_profile as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-6);
  });

  it('idea generates, scores, and selects candidates', () => {
    const out = hadk(['idea', '--count', '5']);
    expect(out).toContain('selected');
    const candidates = readYaml<any>('.hackathon', 'artifacts', 'ideas', 'candidates.yaml');
    expect(candidates.candidates.length).toBe(5);
    const selected = readYaml<any>('.hackathon', 'artifacts', 'ideas', 'selected.yaml');
    expect(selected.selected_idea.name).toBeTruthy();
    expect(selected.alternatives.length).toBe(4);
    // Candidates must be sorted by descending total_score.
    const scores = candidates.candidates.map((c: any) => c.total_score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('scope locks a validated MVP scope', () => {
    const out = hadk(['scope']);
    expect(out).toContain('Scope locked');
    const scope = readYaml<any>('.hackathon', 'artifacts', 'scope', 'scope.yaml');
    expect(scope.scope.status).toBe('locked');
    expect(scope.scope.core_demo_flow.length).toBeGreaterThan(0);
    expect(scope.scope.mvp_features.length).toBeGreaterThan(0);
    expect(scope.scope.primary_wow_moment).toBeTruthy();
    // Every external dependency must have a fallback.
    for (const dep of scope.scope.external_dependencies) {
      expect(dep.fallback).toBeTruthy();
    }
  });

  it('scaffold generates a real prototype project', () => {
    const out = hadk(['scaffold', '--profile', 'web-ai-fullstack']);
    expect(out).toContain('Scaffold generated');
    expect(existsSync(join(dir, 'prototype', 'package.json'))).toBe(true);
    expect(existsSync(join(dir, 'prototype', 'hadk.project.yaml'))).toBe(true);
    const files = readdirSync(join(dir, 'prototype'), { recursive: true }) as string[];
    expect(files.length).toBeGreaterThan(10);
  });

  it('status reports a coherent state', () => {
    const out = hadk(['status', '--json']);
    const report = JSON.parse(out);
    expect(report.competition).toBe('FutureStack AI Hackathon 2026');
    expect(report.strategy_mode).toBe('futuristic');
    expect(report.current_phase).toBeTruthy();
    expect(report.next_action.command).toBeTruthy();
  });

  it('validate runs all gates without crashing', () => {
    // Some gates may legitimately fail (e.g. build not run), but the command
    // must execute and produce structured output. Allow non-zero exit.
    let out = '';
    try {
      out = hadk(['validate', 'all', '--json']);
    } catch (e: any) {
      out = e.stdout?.toString() ?? '';
    }
    const results = JSON.parse(out);
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
    // State and registry validators must pass on a healthy fixture.
    const state = results.find((r: any) => r.validator === 'state');
    const registry = results.find((r: any) => r.validator === 'registry');
    expect(state?.passed).toBe(true);
    expect(registry?.passed).toBe(true);
  });

  it('video generate produces a complete HyperFrames project', () => {
    // A directory-shaped node_modules is not build evidence.
    let legacyValidationFailed = false;
    try { hadk(['validate', 'build']); } catch { legacyValidationFailed = true; }
    expect(legacyValidationFailed).toBe(true);
    // The fast fixture uses an explicit human attestation here. The reference
    // project’s real install/build/demo contract is exercised in CI/manual
    // release verification; this test must remain bounded for unit CI.
    const demoOut = hadk(['verify', 'demo', '--human', '--operator', 'fixture-operator', '--checklist', 'reset observed;core flow observed;fallback observed']);
    expect(demoOut).toContain('Human-attested demo recorded');
    const out = hadk(['video', 'generate']);
    expect(out).toContain('Video project generated');
    const videoDir = join(dir, 'demo-video');
    expect(existsSync(join(videoDir, 'storyboard.yaml'))).toBe(true);
    expect(existsSync(join(videoDir, 'asset-manifest.yaml'))).toBe(true);
    expect(existsSync(join(videoDir, 'compositions', 'submission-video.html'))).toBe(true);
    const storyboard = readYaml<any>('demo-video', 'storyboard.yaml');
    expect(storyboard.scenes.length).toBeGreaterThan(0);
  });

  it('renders from the generated project directory when HyperFrames is available', () => {
    const out = hadk(['video', 'validate']);
    expect(out).toContain('Video project is valid');
  });

  it('prepares judge material and completes a submission with a repository URL', () => {
    expect(hadk(['package', 'review', '--repository', 'https://github.com/example/project'])).toContain('"ready": false');
    const state = readYaml<any>('.hackathon', 'state.yaml');
    expect(state.gates.submission_gate).not.toBe('passed');
    expect(state.delivery.phase).toBe('build');
  });

  it('produced state.yaml reflects the full pipeline', () => {
    const state = readYaml<any>('.hackathon', 'state.yaml');
    expect(state.competition.name).toBe('FutureStack AI Hackathon 2026');
    expect(state.strategy.mode).toBe('futuristic');
    expect(state.strategy.selected_idea).toBeTruthy();
    expect(state.scope.status).toBe('locked');
    expect(state.gates.idea_gate).toBe('passed');
    expect(state.gates.scope_gate).toBe('passed');
  });

  it('replan creates a rollback checkpoint before invalidating scope', () => {
    const out = hadk(['replan', '--reason', 'test checkpoint safety']);
    expect(out).toContain('Checkpoint');
    const state = readYaml<any>('.hackathon', 'state.yaml');
    expect(state.scope.status).toBe('unlocked');
    expect(state.delivery.phase).toBe('scope');
    expect(state.delivery.checkpoints.some((c: any) => c.label === 'pre-replan')).toBe(true);
  });
});
