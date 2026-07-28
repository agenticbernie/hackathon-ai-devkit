import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { cmdStrategy, cmdIdea } from '@hadk/cli';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-taste-'));
  store = new StateStore(dir);
  store.init();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('strategy --taste user', () => {
  it('records explicit taste flags', async () => {
    await cmdStrategy(store, {
      mode: 'futuristic',
      taste: 'user',
      market: 'b2b,developer_tools',
      layer: 'infrastructure,tooling',
      technology: 'ai_agents,blockchain',
      businessShape: 'vertical_saas,enterprise',
      traits: 'technically_impressive,futuristic',
    });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.strategy.mode).toBe('futuristic');
    expect(state.strategy.taste_source).toBe('user');
    expect(state.strategy.idea_taste.market).toEqual(['b2b', 'developer_tools']);
    expect(state.strategy.idea_taste.product_layer).toEqual(['infrastructure', 'tooling']);
    expect(state.strategy.idea_taste.technology).toEqual(['ai_agents', 'blockchain']);
    expect(state.strategy.idea_taste.business_shape).toEqual(['vertical_saas', 'enterprise']);
    expect(state.strategy.idea_taste.desired_traits).toEqual(['technically_impressive', 'futuristic']);
  });

  it('reads taste from a YAML file', async () => {
    const tasteFile = join(dir, 'taste.yaml');
    writeFileSync(
      tasteFile,
      `market:\n  - b2c\nproduct_layer:\n  - application\ntechnology:\n  - climate\nbusiness_shape:\n  - open_source\ndesired_traits:\n  - socially_impactful\n`,
      'utf-8',
    );
    await cmdStrategy(store, {
      mode: 'realistic',
      taste: 'user',
      tasteFile,
    });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.strategy.taste_source).toBe('user');
    expect(state.strategy.idea_taste.market).toEqual(['b2c']);
    expect(state.strategy.idea_taste.technology).toEqual(['climate']);
    expect(state.strategy.idea_taste.desired_traits).toEqual(['socially_impactful']);
  });

  it('falls back to auto and records auto_fallback when user provides no taste data', async () => {
    await cmdStrategy(store, {
      mode: 'conservative',
      taste: 'user',
    });
    const loaded = store.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const state = loaded.value;
    expect(state.strategy.taste_source).toBe('auto_fallback');
    expect(state.strategy.idea_taste.technology.length).toBeGreaterThanOrEqual(0);
  });
});

describe('idea agent handoff', () => {
  it('writes a usable Markdown prompt instead of YAML-serializing it', async () => {
    await cmdStrategy(store, { mode: 'realistic', taste: 'auto' });
    await cmdIdea(store, { agentHandoff: true, agent: 'opencode' });
    const prompt = readFileSync(store.artifactPath('generated', 'idea-agent-prompt.md'), 'utf-8');
    expect(prompt).toMatch(/^# HADK Agent Handoff:/);
    expect(prompt).not.toMatch(/^>/);
  });
});
