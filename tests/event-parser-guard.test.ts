import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skillDir = join(repoRoot, 'skills', 'hackathon-event-parser');
const skillMd = join(skillDir, 'SKILL.md');
const refExample = join(skillDir, 'references', 'example-output.yaml');

// Any string that could look like real source evidence must never appear in
// the SKILL.md that the model is prompted with. Regression guard for the
// "example contamination" bug where fictional example data was replayed into
// real outputs when page retrieval failed.
const FABRICATED = [
  'globalaihealth',
  'Global AI Health',
  'HealthTech Alliance',
  'track-mental-health',
  'track-diagnostics',
  'GPT-4o API',
  'Nvidia NIM',
  'OpenAI API credits',
];

describe('hackathon-event-parser SKILL.md', () => {
  it('contains no fabricated example event data', () => {
    const content = readFileSync(skillMd, 'utf-8');
    for (const needle of FABRICATED) {
      expect(content, `SKILL.md must not contain "${needle}"`).not.toContain(needle);
    }
  });

  it('preserves the exact user-provided URL', () => {
    const content = readFileSync(skillMd, 'utf-8');
    expect(content).toContain('exactly the user-provided URL');
    expect(content).toMatch(/preserve the exact user-provided URL/i);
  });

  it('mandates unknown/null/empty output when source is empty or inaccessible', () => {
    const content = readFileSync(skillMd, 'utf-8');
    expect(content).toMatch(/verified event name or 'unknown'/);
    expect(content).toMatch(/verified organizer or 'unknown'/);
    expect(content).toMatch(/empty or inaccessible/i);
    expect(content).toMatch(/Never copy any example/i);
  });
});

describe('hackathon-event-parser references/example-output.yaml', () => {
  it('exists and is clearly labeled as fictional test-fixture data', () => {
    expect(existsSync(refExample)).toBe(true);
    const content = readFileSync(refExample, 'utf-8');
    expect(content).toMatch(/FICTIONAL TEST FIXTURE DATA/i);
    expect(content).toMatch(/never treat it as source evidence/i);
  });
});
