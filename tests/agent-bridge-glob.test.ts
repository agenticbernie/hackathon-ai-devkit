import { describe, it, expect } from 'vitest';
import { matchesPattern } from '@hadk/agent-bridge';

describe('matchesPattern glob-to-regex (v2.1.5 regression)', () => {
  it('matches src/**/attestcoin-batch-pro/** against deep nested files', () => {
    const pattern = 'src/**/attestcoin-batch-pro/**';
    expect(matchesPattern(pattern, 'src/app/api/attestcoin-batch-pro/route.ts')).toBe(true);
    expect(matchesPattern(pattern, 'src/core/attestcoin-batch-pro/types.ts')).toBe(true);
    expect(matchesPattern(pattern, 'src/attestcoin-batch-pro/index.ts')).toBe(true);
    expect(matchesPattern(pattern, 'src/a/b/c/attestcoin-batch-pro/d/e.ts')).toBe(true);
  });

  it('does not match unrelated feature directories', () => {
    const pattern = 'src/**/attestcoin-batch-pro/**';
    expect(matchesPattern(pattern, 'src/app/api/other-feature/route.ts')).toBe(false);
    expect(matchesPattern(pattern, 'src/core/other-pro/types.ts')).toBe(false);
    expect(matchesPattern(pattern, 'src/app/api/attestcoin-batch/route.ts')).toBe(false);
    expect(matchesPattern(pattern, 'src/app/api/attestcoin-batch-pro-other/route.ts')).toBe(false);
  });

  it('exact test-file pattern still works', () => {
    expect(matchesPattern('tests/attestcoin-batch-pro.test.ts', 'tests/attestcoin-batch-pro.test.ts')).toBe(true);
    expect(matchesPattern('tests/attestcoin-batch-pro.test.ts', 'tests/other.test.ts')).toBe(false);
    // wildcard test pattern
    expect(matchesPattern('tests/*.test.ts', 'tests/demo.test.ts')).toBe(true);
    expect(matchesPattern('tests/*.test.ts', 'tests/a/b.test.ts')).toBe(false);
  });

  it('forbidden/path boundary behavior is not weakened', () => {
    // .env exact
    expect(matchesPattern('.env', '.env')).toBe(true);
    expect(matchesPattern('.env', '.env.local')).toBe(false);
    expect(matchesPattern('.env', 'src/.env')).toBe(false);
    // .env.local exact
    expect(matchesPattern('.env.local', '.env.local')).toBe(true);
    // credentials/**
    expect(matchesPattern('credentials/**', 'credentials/foo')).toBe(true);
    expect(matchesPattern('credentials/**', 'credentials/foo/bar/baz.ts')).toBe(true);
    expect(matchesPattern('credentials/**', 'src/credentials/foo')).toBe(false);
    expect(matchesPattern('credentials/**', 'credentials')).toBe(false); // ** requires slash after?
    // .hackathon/**
    expect(matchesPattern('.hackathon/**', '.hackathon/state.yaml')).toBe(true);
    expect(matchesPattern('.hackathon/**', '.hackathon/artifacts/scope.yaml')).toBe(true);
    expect(matchesPattern('.hackathon/**', 'other/.hackathon/file')).toBe(false);
  });

  it('allowed_files patterns for feature still work', () => {
    const featureId = 'attestcoin_batch_pro';
    const allowed = [
      `src/**/${featureId}/**`,
      `src/**/${featureId.replaceAll('_', '-')}/**`,
      `tests/${featureId}.test.ts`,
    ];
    // src/**/attestcoin_batch_pro/**
    expect(allowed.some((p) => matchesPattern(p, 'src/app/api/attestcoin_batch_pro/handler.ts'))).toBe(true);
    // src/**/attestcoin-batch-pro/**
    expect(allowed.some((p) => matchesPattern(p, 'src/app/api/attestcoin-batch-pro/route.ts'))).toBe(true);
    expect(allowed.some((p) => matchesPattern(p, 'src/core/attestcoin-batch-pro/types.ts'))).toBe(true);
    // tests file
    expect(allowed.some((p) => matchesPattern(p, 'tests/attestcoin_batch_pro.test.ts'))).toBe(true);
    // unrelated should not match
    expect(allowed.some((p) => matchesPattern(p, 'src/app/api/other/route.ts'))).toBe(false);
    expect(allowed.some((p) => matchesPattern(p, 'src/other/handler.ts'))).toBe(false);
  });

  it('does not corrupt regex via sequential replacement (the original bug)', () => {
    // This is the exact bug: '**/' replacement contains '*' which was re-replaced
    const pattern = 'src/**/attestcoin-batch-pro/**';
    const value = 'src/app/api/attestcoin-batch-pro/route.ts';
    // Before fix, this was false due to '(?:.*/)?' being corrupted to '(?:.[^/]*/)?'
    expect(matchesPattern(pattern, value)).toBe(true);
    // Ensure the generated regex is correct by checking internal fragments aren't corrupted
    // The pattern should match any depth, not just one level
    expect(matchesPattern('src/**/a/**', 'src/a/b.ts')).toBe(true);
    expect(matchesPattern('src/**/a/**', 'src/x/y/a/z.ts')).toBe(true);
    expect(matchesPattern('src/**/a/**', 'src/x/y/a/b/c.ts')).toBe(true);
  });

  it('handles ** without slash and single * correctly', () => {
    expect(matchesPattern('src/**', 'src/a')).toBe(true);
    expect(matchesPattern('src/**', 'src/a/b/c')).toBe(true);
    expect(matchesPattern('src/*.ts', 'src/a.ts')).toBe(true);
    expect(matchesPattern('src/*.ts', 'src/a/b.ts')).toBe(false);
    expect(matchesPattern('**/*.ts', 'src/a.ts')).toBe(true);
    expect(matchesPattern('**/*.ts', 'a.ts')).toBe(true);
  });

  it('escapes regex special chars correctly', () => {
    expect(matchesPattern('src/**/file.name.ts', 'src/a/file.name.ts')).toBe(true);
    expect(matchesPattern('src/**/file.name.ts', 'src/a/fileXname.ts')).toBe(false);
    expect(matchesPattern('src/**/a+b.ts', 'src/x/a+b.ts')).toBe(true);
    expect(matchesPattern('src/**/a+b.ts', 'src/x/aab.ts')).toBe(false);
  });
});
