import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readYamlFile } from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { cmdStartupResearch } from '@hadk/cli';

const repoRoot = resolve(import.meta.dirname, '..');
const cliBin = join(repoRoot, 'packages', 'cli', 'dist', 'index.js');
let dir: string;

function hadk(args: string[]): string {
  return execFileSync(process.execPath, [cliBin, ...args], { cwd: dir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function yaml<T>(filename: string): T {
  const result = readYamlFile<T>(join(dir, '.hackathon', 'artifacts', 'startup-discovery', filename));
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'hadk-startup-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('problem-first startup discovery', () => {
  it('runs research, deep dive, and validation through persisted artifacts', () => {
    expect(hadk(['startup', 'research', '--market', 'clinic operations', '--segments', 'practice managers,clinicians'])).toContain('Next: hadk startup deep-dive');
    const research = yaml<any>('pain-point-research.yaml');
    expect(research.pain_points).toHaveLength(2);
    expect(research.pain_points[0].evidence_type).toBe('hypothesis');
    expect(hadk(['startup', 'deep-dive', research.recommended_pain_point_id])).toContain('insufficient_evidence');
    const deepDive = yaml<any>('pain-point-deep-dive.yaml');
    expect(deepDive.disconfirming_evidence.length).toBeGreaterThan(0);
    expect(hadk(['startup', 'validate', '--methods', 'user_interview,manual_workflow_experiment'])).toContain('Next: startup-customer-evidence');
    const plan = yaml<any>('validation-plan.yaml');
    expect(plan.hypotheses.length).toBeGreaterThan(0);
    for (const hypothesis of plan.hypotheses) {
      expect(hypothesis.success_threshold).toBeTruthy();
      expect(hypothesis.falsification_threshold).toBeTruthy();
      expect(hypothesis.evidence_to_capture).toBeTruthy();
      expect(hypothesis.next_decision).toBeTruthy();
    }
    const state = readYamlFile<any>(join(dir, '.hackathon', 'state.yaml'));
    expect(state.ok).toBe(true);
    if (state.ok) expect(state.value.startup.validation_plan_status).toBe('passed');
  });

  it('runs the Shoo fixture through scorecard, deep dive, validation, status, and next', () => {
    const fixture = join(repoRoot, 'tests', 'fixtures', 'startup', 'shoo', 'research-notes.md');
    expect(hadk(['startup', 'research', '--market', 'team operations', '--segments', 'solo founders,small startup teams', '--source', fixture, '--agent-handoff'])).toContain('Pain-point research created');
    expect(existsSync(join(dir, '.hackathon', 'artifacts', 'startup-discovery', 'agent-handoffs', 'pain-point-research-claude-code.md'))).toBe(true);
    expect(existsSync(join(dir, '.hackathon', 'artifacts', 'startup-discovery', 'agent-handoffs', 'pain-point-research-codex.md'))).toBe(true);
    const claudePrompt = readFileSync(join(dir, '.hackathon', 'artifacts', 'startup-discovery', 'agent-handoffs', 'pain-point-research-claude-code.md'), 'utf8');
    const codexPrompt = readFileSync(join(dir, '.hackathon', 'artifacts', 'startup-discovery', 'agent-handoffs', 'pain-point-research-codex.md'), 'utf8');
    expect(claudePrompt).toContain('startup-pain-point-research.output.schema.json');
    expect(claudePrompt).toContain('Never fabricate interviews');
    expect(claudePrompt).toContain('provenance');
    expect(claudePrompt).not.toEqual(codexPrompt);
    expect(hadk(['startup', 'scorecard'])).toContain('Opportunity scorecard ranked');
    const scorecard = yaml<any>('opportunity-scorecard.yaml');
    expect(scorecard.ranking[0].weighted_score).toBeGreaterThanOrEqual(scorecard.ranking[1].weighted_score);
    expect(hadk(['startup', 'deep-dive', scorecard.recommended_pain_point_id])).toContain('insufficient_evidence');
    expect(hadk(['startup', 'validate'])).toContain('Validation plan created');
    const status = JSON.parse(hadk(['startup', 'status', '--json']));
    expect(status.phase).toBe('validation-planned');
    expect(status.next_action.command).toBe('agent-handoff: startup-customer-evidence');
    expect(hadk(['startup', 'next'])).toContain('agent-handoff: startup-customer-evidence');
  });

  it('records deterministic provenance for URL success, HTTP failure, timeout, invalid, and empty sources', async () => {
    const store = new StateStore(dir);
    const sourceFile = join(dir, 'notes.md');
    writeFileSync(sourceFile, 'A local founder note.', 'utf8');
    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes('404')) return new Response('missing', { status: 404 });
      if (url.includes('timeout')) throw new Error('timeout simulated');
      if (url.includes('empty')) return new Response('', { status: 200 });
      return new Response('Public source content.', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    await cmdStartupResearch(store, { market: 'test market', segments: 'test users', source: ['https://example.com/success', 'https://example.com/404', 'https://example.com/timeout', 'https://example.com/empty', 'http://[invalid-url', sourceFile], fetcher: fetchMock });
    const research = yaml<any>('pain-point-research.yaml');
    expect(research.provenance).toHaveLength(6);
    expect(research.provenance.find((source: any) => source.source.includes('/success')).retrieval_status).toBe('retrieved');
    expect(research.provenance.find((source: any) => source.source.includes('/404')).retrieval_status).toBe('failed');
    expect(research.provenance.find((source: any) => source.source.includes('/timeout')).retrieval_status).toBe('failed');
    expect(research.provenance.find((source: any) => source.source.includes('/empty')).retrieval_status).toBe('empty');
    expect(research.provenance.find((source: any) => source.source.includes('[invalid-url')).retrieval_status).toBe('failed');
    expect(research.provenance.find((source: any) => source.source === sourceFile).content_hash).toMatch(/^[a-f0-9]{64}$/);
    const firstHash = research.provenance.find((source: any) => source.source === sourceFile).content_hash;
    await cmdStartupResearch(store, { market: 'test market', segments: 'test users', source: sourceFile });
    const second = yaml<any>('pain-point-research.yaml');
    expect(second.provenance[0].content_hash).toBe(firstHash);
    vi.unstubAllGlobals();
  });

  it('rejects missing prerequisites and creates an independent adapter artifact', () => {
    const initialStatus = JSON.parse(hadk(['startup', 'status', '--json']));
    expect(initialStatus.initialized).toBe(false);
    expect(initialStatus.next_action.command).toContain('hadk startup research');
    expect(() => hadk(['startup', 'deep-dive', 'pain-unknown'])).toThrow();
    const output = hadk(['startup', 'adapt-hackathon', '--profile', 'startup-contest']);
    expect(output).toContain('problem-first');
    expect(existsSync(join(dir, '.hackathon', 'artifacts', 'startup-discovery', 'hackathon-adapter.yaml'))).toBe(true);
    const adapter = yaml<any>('hackathon-adapter.yaml');
    expect(adapter.skills_to_reuse).toContain('hackathon-task-planner');
    expect(adapter.skills_to_adapt.length).toBe(10);
    expect(adapter.skills_to_avoid.length).toBeGreaterThan(0);
  });
});
