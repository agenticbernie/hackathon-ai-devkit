import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { cmdScope, cmdArchitecturePlan } from '@hadk/cli';
import { AgentBridge } from '@hadk/agent-bridge';
import { stringifyYaml } from '@hadk/core';

let dir: string;
let store: StateStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-rich-'));
  store = new StateStore(dir);
  store.init();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function setupCompetitionAndStrategy() {
  store.update((s) => {
    s.competition.name = 'BUIDL CTC 2026 Fall';
    s.competition.deadline = new Date(Date.now() + 48 * 3600000).toISOString();
    s.competition.tracks = [{ id: 'track-1', name: 'DeFi', description: 'DeFi', sponsor: null, prize: null, required_tools: [] }];
    s.competition.judging_criteria = [{ name: 'Attestcoin depth', weight: null, description: 'Depth of Attestcoin', source: 'user-provided' }];
    s.strategy.mode = 'balanced';
    s.strategy.scoring_profile = { problem_value: 0.2, rubric_alignment: 0.2, differentiation: 0.2, feasibility: 0.2, demo_proof: 0.2 };
    s.strategy.selected_idea = 'VeriTreasury';
    s.gates.competition_gate = 'passed';
    s.gates.idea_gate = 'passed';
    s.scope.status = 'unlocked';
    s.delivery.phase = 'scope';
  });
}

function writeRichIdeaFixture() {
  const candidate = {
    id: 'idea-veritreasury-001',
    name: 'VeriTreasury',
    one_liner: 'Verifiable cross-chain treasury with Attestcoin attestations',
    target_user: 'DAO treasurers and cross-chain asset managers',
    problem: 'DAO treasuries lack verifiable cross-chain attestation, leading to opaque reserves and governance risk',
    solution: 'VeriTreasury: a treasury dashboard that verifies cross-chain reserves via Attestcoin Protocol SDK and displays attested balances',
    core_mechanism: 'Attestation verification engine using Attestcoin SDK to validate cross-chain treasury proofs and anchor them on Creditcoin',
    strategy_mode_fit: 'Strong balanced fit: verifiable treasury is high-value and demoable',
    taste_fit: 'Fintech + blockchain, vertically integrated',
    rubric_fit: 'Directly maps to Attestcoin depth and real-world impact',
    sponsor_fit: 'Uses Attestcoin SDK and Creditcoin RPC',
    demo_flow: [
      'Treasurer submits treasury proof via dashboard',
      'Attestcoin protocol verifies cross-chain attestation',
      'Dashboard displays verified treasury status and proof',
    ],
    wow_moment: 'Treasury proof verified in 3 seconds, showing green attested badge and on-chain anchor',
    future_thesis: 'Verifiable treasuries become standard for DAO governance',
    build_plan_summary: 'Implement attestation engine, treasury dashboard, proof submission API, and demo seeding',
    estimated_hours: 24,
    critical_dependencies: ['Attestcoin SDK', 'Creditcoin RPC', 'IPFS for proof storage'],
    fallbacks: ['Mock attestation with canned proof', 'Static verified badge', 'Local proof cache'],
    failure_modes: ['Attestation latency >5s', 'RPC unavailable', 'Proof format mismatch'],
    score_breakdown: { problem_value: 8, rubric_alignment: 9, differentiation: 7, feasibility: 7, demo_proof: 8 },
    score_breakdown_kind: 'raw',
    total_score: 7.8,
  };
  const selected = {
    id: 'idea-veritreasury-001',
    name: 'VeriTreasury',
    selection_reason: 'Rich imported idea with full VeriTreasury spec',
    why_now: 'Attestcoin is live and DAOs need verifiable treasuries',
    why_this_team: 'Team has fintech and blockchain skills',
    why_this_competition: 'BUIDL CTC requires Attestcoin integration',
    judge_memory_hook: 'Green attested badge in 3 seconds',
    core_demo_proof: 'Treasury proof verification via Attestcoin SDK',
    primary_risk: 'Attestation latency',
    fallback: 'Mock attestation',
  };
  const importPayload = {
    schema_version: '1.0',
    candidates: [candidate],
    selected,
  };
  // Write candidates and selected artifacts as the CLI would
  store.writeArtifact('ideas', 'candidates.yaml', {
    schema_version: '2.1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'agent',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'agent_reported',
    candidates: [candidate],
  });
  store.writeArtifact('ideas', 'selected.yaml', {
    schema_version: '2.1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'agent',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'agent_reported',
    selected_idea: candidate,
    selected,
  });
  // Also write an import YAML file for reference
  writeFileSync(join(dir, 'rich-idea.yaml'), stringifyYaml(importPayload));
  return candidate;
}

function writeHeuristicFixture() {
  const candidate = {
    id: 'idea-heuristic-001',
    name: 'AI Copilot',
    one_liner: 'AI copilot for DeFi',
    target_user: 'DeFi traders',
    problem: 'Manual trading is slow',
    solution: 'AI copilot automates trades',
    core_mechanism: 'AI-assisted automation pipeline',
    strategy_mode_fit: 'Balanced',
    taste_fit: 'AI',
    rubric_fit: 'Maps to rubric',
    sponsor_fit: 'Uses AI API',
    demo_flow: ['Show AI handling input', 'Reveal output', 'Highlight wow'],
    wow_moment: 'AI produces result in seconds',
    future_thesis: null,
    build_plan_summary: 'Implement AI pipeline',
    estimated_hours: 12,
    critical_dependencies: ['AI provider API'],
    fallbacks: ['Deterministic fallback'],
    failure_modes: ['API latency'],
    score_breakdown: { problem_value: 7, rubric_alignment: 7, differentiation: 6, feasibility: 8, demo_proof: 7 },
    score_breakdown_kind: 'raw',
    total_score: 7.0,
  };
  store.writeArtifact('ideas', 'candidates.yaml', {
    schema_version: '2.1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'hadk',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'unverified',
    candidates: [candidate],
  });
  store.writeArtifact('ideas', 'selected.yaml', {
    schema_version: '2.1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'hadk',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'unverified',
    selected_idea: candidate,
  });
  return candidate;
}

describe('rich imported idea → scope → architecture → handoff', () => {
  it('derives concrete scope from VeriTreasury semantics (not generic placeholders)', async () => {
    setupCompetitionAndStrategy();
    const idea = writeRichIdeaFixture();

    await cmdScope(store, {});

    const scopeArt = store.readArtifact<any>('scope', 'scope.yaml');
    expect(scopeArt.ok).toBe(true);
    if (!scopeArt.ok) return;
    const scope = scopeArt.value.scope;

    // Must contain concrete features derived from idea, not generic placeholders
    const featureNames = scope.mvp_features.map((f: any) => f.name);
    const featureIds = scope.mvp_features.map((f: any) => f.id);
    // Should not be the old generic placeholders
    expect(featureNames).not.toContain('Core mechanism');
    expect(featureNames).not.toContain('Input surface');
    expect(featureNames).not.toContain('Output view');
    // Should contain VeriTreasury-specific semantics
    const allText = JSON.stringify(scope).toLowerCase();
    expect(allText).toContain('attestation');
    expect(allText).toContain('veritreasury');
    expect(allText).toContain('treasury');

    // Acceptance criteria should be grounded in idea
    const acText = scope.mvp_features.flatMap((f: any) => f.acceptance_criteria).join(' ').toLowerCase();
    expect(acText).toContain('attestation');
    // Fallbacks should be from idea
    const fallbackText = scope.mvp_features.map((f: any) => f.fallback).join(' ').toLowerCase();
    expect(fallbackText).toContain('mock');

    // Demo flow should be from idea.demo_flow (3 steps)
    expect(scope.core_demo_flow.length).toBe(idea.demo_flow.length);
    expect(scope.core_demo_flow[0].user_action.toLowerCase()).toContain('treasurer');
    expect(scope.core_demo_flow[1].user_action.toLowerCase()).toContain('attestcoin');

    // Wow moment should be idea.wow_moment
    expect(scope.primary_wow_moment.description).toBe(idea.wow_moment);
    expect(scope.primary_wow_moment.judge_takeaway).toContain('attested');

    // External dependencies should be from critical_dependencies
    const depNames = scope.external_dependencies.map((d: any) => d.name).join(' ').toLowerCase();
    expect(depNames).toContain('attestcoin sdk');
    expect(depNames).toContain('creditcoin');

    // Cut boundaries
    const deferredText = scope.deferred_features.map((d: any) => d.reason_deferred).join(' ').toLowerCase();
    expect(deferredText.length).toBeGreaterThan(10);

    // Verify risks/budgets still valid
    expect(scope.mvp_features.length).toBeGreaterThan(0);
    expect(scope.primary_wow_moment).toBeTruthy();
    for (const dep of scope.external_dependencies) {
      expect(dep.fallback).toBeTruthy();
    }
  });

  it('architecture consumes concrete scope (not generic)', async () => {
    setupCompetitionAndStrategy();
    writeRichIdeaFixture();
    await cmdScope(store, {});
    await cmdArchitecturePlan(store);
    const archArt = store.readArtifact<any>('architecture', 'plan.yaml');
    expect(archArt.ok).toBe(true);
    if (!archArt.ok) return;
    const arch = archArt.value;
    const ctx = arch.system_context.toLowerCase();
    // Should mention VeriTreasury and attestation, not generic "accepts a controlled demo input"
    expect(ctx).toContain('veritreasury');
    expect(ctx).toContain('attestation');
    // Should have concrete demo flow
    expect(arch.data_flow.join(' ').toLowerCase()).toContain('treasurer');
    // Component boundaries should include concrete features
    const compText = JSON.stringify(arch.component_boundaries).toLowerCase();
    expect(compText).toContain('attestation');
    // Should not be the old generic sentence
    expect(arch.system_context).not.toBe('VeriTreasury accepts a controlled demo input, executes its core mechanism, and presents judge-visible proof.');
    // Decisions should mention fallbacks/dependencies
    const decisionsText = JSON.stringify(arch.decisions).toLowerCase();
    expect(decisionsText).toContain('fallback');
  });

  it('handoff preserves rich semantics for coding agent', async () => {
    setupCompetitionAndStrategy();
    const idea = writeRichIdeaFixture();
    await cmdScope(store, {});
    await cmdArchitecturePlan(store);
    const bridge = new AgentBridge(store);
    const result = bridge.implement('opencode');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const context = readFileSync(result.value.context_pack, 'utf-8').toLowerCase();
    // Must contain rich idea fields
    expect(context).toContain('veritreasury');
    expect(context).toContain('attestation verification engine');
    expect(context).toContain('dao treasuries');
    expect(context).toContain('treasurer submits');
    expect(context).toContain('attestcoin sdk');
    expect(context).toContain('mock attestation');
    expect(context).toContain('attestation latency');
    // Must contain concrete scope features, not generic placeholders
    expect(context).not.toContain('core mechanism: the single thing the project must prove');
    expect(context).toContain('treasury');
    // Task packets should have enriched objectives
    for (const packetPath of result.value.task_packets) {
      const packet = readFileSync(packetPath, 'utf-8').toLowerCase();
      expect(packet).toContain('veritreasury');
      // Acceptance should include idea solution
      expect(packet.length).toBeGreaterThan(100);
    }
  });

  it('heuristic ideas still produce valid generic scope (backward compat)', async () => {
    setupCompetitionAndStrategy();
    store.update((s) => { s.strategy.selected_idea = 'AI Copilot'; });
    writeHeuristicFixture();
    await cmdScope(store, {});
    const scopeArt = store.readArtifact<any>('scope', 'scope.yaml');
    expect(scopeArt.ok).toBe(true);
    if (!scopeArt.ok) return;
    const scope = scopeArt.value.scope;
    expect(scope.mvp_features.length).toBeGreaterThan(0);
    expect(scope.core_demo_flow.length).toBeGreaterThan(0);
    expect(scope.primary_wow_moment).toBeTruthy();
    // Heuristic should still produce a scope, even if less rich, but should not be the old completely generic fallback that ignores idea
    // For heuristic, the builder will still use the idea's fields (AI-assisted automation pipeline) to make it slightly richer, which is acceptable
    const allText = JSON.stringify(scope).toLowerCase();
    expect(allText).toContain('ai-assisted');
    // Architecture and handoff should also work for heuristic
    await cmdArchitecturePlan(store);
    const archArt = store.readArtifact<any>('architecture', 'plan.yaml');
    expect(archArt.ok).toBe(true);
    const bridge = new AgentBridge(store);
    const handoff = bridge.implement('opencode');
    expect(handoff.ok).toBe(true);
  });
});
