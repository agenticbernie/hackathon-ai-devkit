import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Map workspace packages to their built dist so tests run against compiled
// output without requiring the root package to depend on every @hadk/* package.
const pkgs = [
  'core',
  'state-store',
  'orchestrator',
  'scaffold-engine',
  'validators',
  'hyperframes-adapter',
  'agent-adapters',
  'cli',
  'competition-intelligence',
  'planning',
  'agent-bridge',
  'verification',
  'submission',
  'workspace',
];

const alias = Object.fromEntries(
  pkgs.map((p) => [`@hadk/${p}`, resolve(__dirname, `packages/${p}/dist/index.js`)]),
);

export default defineConfig({
  resolve: { alias },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 180000,
    hookTimeout: 120000,
    // Tests run against the built packages (dist), so `pnpm build` must run first.
    pool: 'forks',
  },
});
