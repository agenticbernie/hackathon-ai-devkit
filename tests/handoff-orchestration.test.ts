import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StateStore } from '@hadk/state-store';
import { Orchestrator } from '@hadk/orchestrator';
import { AgentBridge } from '@hadk/agent-bridge';
import { cmdScope, cmdArchitecturePlan } from '@hadk/cli';
import { stringifyYaml } from '@hadk/core';

let dir: string;
let store: StateStore;
let orch: Orchestrator;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'hadk-handoff-'));
  store = new StateStore(dir);
  orch = new Orchestrator(store);
  store.init();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function setupLockedScopeWith4Features() {
  store.update((s) => {
    s.competition.name = 'Handoff Test';
    s.competition.deadline = new Date(Date.now() + 48 * 3600000).toISOString();
    s.competition.tracks = [{ id: 't1', name: 'Test', description: 'Test', sponsor: null, prize: null, required_tools: [] }];
    s.competition.judging_criteria = [{ name: 'Test', weight: null, description: 'Test', source: 'user-provided' }];
    s.strategy.selected_idea = 'Test Idea';
    s.strategy.mode = 'balanced';
    s.strategy.scoring_profile = { problem_value: 0.2, rubric_alignment: 0.2, differentiation: 0.2, feasibility: 0.2, demo_proof: 0.2 };
    s.gates.competition_gate = 'passed';
    s.gates.idea_gate = 'passed';
    s.scope.status = 'locked';
    s.scope.mvp_features = [
      { id: 'feat_a', name: 'Feature A', purpose: 'p1', required_for_demo: true, required_for_rubric: true, estimated_hours: 2, dependencies: [], fallback: 'fb1' },
      { id: 'feat_b', name: 'Feature B', purpose: 'p2', required_for_demo: true, required_for_rubric: false, estimated_hours: 2, dependencies: [], fallback: 'fb2' },
      { id: 'feat_c', name: 'Feature C', purpose: 'p3', required_for_demo: true, required_for_rubric: false, estimated_hours: 2, dependencies: [], fallback: 'fb3' },
      { id: 'feat_d', name: 'Feature D', purpose: 'p4', required_for_demo: true, required_for_rubric: false, estimated_hours: 2, dependencies: [], fallback: 'fb4' },
    ];
    s.scope.demo_flow = [
      { step: 1, user_action: 'a', system_response: 'b', proof_shown: 'c' },
      { step: 2, user_action: 'd', system_response: 'e', proof_shown: 'f' },
    ];
    s.scope.primary_wow_moment = { description: 'wow', demo_step: 2, judge_takeaway: 'wow' };
    s.scope.external_dependencies = [];
    s.gates.scope_gate = 'passed';
    s.architecture.status = 'generated';
    s.architecture.profile = 'web-ai-fullstack';
    s.gates.architecture_gate = 'passed';
    s.delivery.phase = 'build';
    s.delivery.tasks = [];
    s.gates.build_gate = 'pending';
    s.gates.demo_gate = 'pending';
    // Write scope and architecture artifacts so AgentBridge can read them
    // Use store.writeArtifact to create versioned artifacts
  });
  // Write scope.yaml with version
  store.writeArtifact('scope', 'scope.yaml', {
    schema_version: '2.1',
    version: 'test-scope-v1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'test',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'unverified',
    scope: {
      status: 'locked',
      core_demo_flow: store.load().value!.scope.demo_flow,
      mvp_features: store.load().value!.scope.mvp_features,
      deferred_features: [],
      primary_wow_moment: store.load().value!.scope.primary_wow_moment,
      external_dependencies: [],
    },
  });
  store.writeArtifact('architecture', 'plan.yaml', {
    schema_version: '2.1',
    version: 'test-arch-v1',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: 'test',
    source_refs: [],
    assumptions: [],
    blockers: [],
    evidence_refs: [],
    verification_status: 'planned',
    system_context: 'test',
    component_boundaries: [],
    data_flow: [],
    external_integrations: [],
    security_boundaries: [],
    deployment_assumptions: [],
    decisions: [],
    feature_to_component: {},
    implementation_sequence: [],
    verification_strategy: [],
  });
}

describe('handoff orchestration regression (v2.1.6)', () => {
  it('handoff implement creates 4 tasks in canonical state and 4 packets, no duplicates on re-run', async () => {
    setupLockedScopeWith4Features();
    const bridge = new AgentBridge(store);
    const first = bridge.implement('opencode');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.task_packets.length).toBe(4);

    const stateAfterFirst = store.load().value!;
    expect(stateAfterFirst.delivery.tasks.length).toBe(4);
    expect(stateAfterFirst.delivery.tasks.map((t) => t.feature_id).sort()).toEqual(['feat_a', 'feat_b', 'feat_c', 'feat_d'].sort());
    expect(stateAfterFirst.delivery.tasks.every((t) => t.status === 'pending')).toBe(true);
    expect(stateAfterFirst.delivery.phase).toBe('build');

    const tasksDir = join(dir, '.hackathon', 'artifacts', 'generated', 'handoff', 'tasks');
    const filesAfterFirst = readdirSync(tasksDir).filter((f) => f.endsWith('.yaml')).sort();
    expect(filesAfterFirst.length).toBe(4);

    // Re-run handoff - should not create duplicates, should reuse deterministic ids and keep tasks
    const second = bridge.implement('opencode');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.task_packets.length).toBe(4);

    const filesAfterSecond = readdirSync(tasksDir).filter((f) => f.endsWith('.yaml')).sort();
    expect(filesAfterSecond.length).toBe(4);
    // Files should be same ids (deterministic) - no accumulation
    expect(filesAfterSecond).toEqual(filesAfterFirst);

    const stateAfterSecond = store.load().value!;
    expect(stateAfterSecond.delivery.tasks.length).toBe(4);
    // Should not have duplicate tasks
    const ids = stateAfterSecond.delivery.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('importing one result only marks that task done, others remain pending, next stays in build', async () => {
    setupLockedScopeWith4Features();
    const bridge = new AgentBridge(store);
    const impl = bridge.implement('opencode');
    expect(impl.ok).toBe(true);
    if (!impl.ok) return;

    const stateBefore = store.load().value!;
    const firstTask = stateBefore.delivery.tasks[0];
    const taskId = firstTask.id;
    const scopeVersion = 'test-scope-v1';
    const archVersion = 'test-arch-v1';

    // Create a fake agent result for first task
    const resultPayload = {
      schema_version: '2.1',
      task_id: taskId,
      scope_version: scopeVersion,
      architecture_version: archVersion,
      status: 'completed',
      changed_files: [`src/${firstTask.feature_id}/handler.ts`],
      commands_executed: [['pnpm', 'run', 'typecheck']],
      tests: [{ command: ['pnpm', 'run', 'test'], passed: true }],
      unresolved_issues: [],
      result_evidence_refs: [],
    };
    const resultPath = join(dir, 'agent-result.yaml');
    writeFileSync(resultPath, stringifyYaml(resultPayload));

    // Mock the allowed files to include the changed_file - need to ensure the task's allowed_files matches
    // The task's allowed_files is src/**/{feature_id}/** etc. Our changed_file is src/feat_a/handler.ts which should match
    // For deterministic test, we need to ensure the feature_id is feat_a and pattern matches

    const imported = bridge.importResult(resultPath);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const stateAfter = store.load().value!;
    expect(stateAfter.delivery.tasks.length).toBe(4);
    const done = stateAfter.delivery.tasks.filter((t) => t.status === 'done');
    const pending = stateAfter.delivery.tasks.filter((t) => t.status !== 'done');
    expect(done.length).toBe(1);
    expect(done[0].id).toBe(taskId);
    expect(pending.length).toBe(3);

    // Phase should still be build, not demo
    expect(stateAfter.delivery.phase).toBe('build');
    // build_gate should be pending (or not passed)
    expect(stateAfter.gates.build_gate).not.toBe('passed');

    // hadk next should not be verify demo, should be handoff import or verify build
    const next = orch.getNextAction(stateAfter);
    expect(next.phase).toBe('build');
    expect(next.command).not.toBe('hadk verify demo');
    // Should be either handoff implement or verify build, but not demo
    expect(['hadk handoff implement', 'hadk handoff import <result.yaml>', 'hadk verify build']).toContain(next.command);
  });

  it('build verification is invalidated after import and cannot advance to demo until tasks done', async () => {
    setupLockedScopeWith4Features();
    const bridge = new AgentBridge(store);
    bridge.implement('opencode');

    // Simulate a previously passed build_gate
    store.update((s) => {
      s.gates.build_gate = 'passed';
      s.delivery.phase = 'build';
      // Also create a fake build verification artifact so validateBuild would pass if not for tasks
      s.delivery.tasks.forEach((t) => (t.status = 'done'));
    });
    // Now import a new result (simulate new code change after build passed - should invalidate)
    // First, reset one task to pending and re-import
    store.update((s) => {
      if (s.delivery.tasks[0]) s.delivery.tasks[0].status = 'pending';
      s.gates.build_gate = 'passed';
    });
    const stateBeforeImport = store.load().value!;
    const taskToImport = stateBeforeImport.delivery.tasks[0];
    const resultPayload = {
      schema_version: '2.1',
      task_id: taskToImport.id,
      scope_version: 'test-scope-v1',
      architecture_version: 'test-arch-v1',
      status: 'completed',
      changed_files: [`src/${taskToImport.feature_id}/handler.ts`],
      commands_executed: [],
      tests: [],
      unresolved_issues: [],
      result_evidence_refs: [],
    };
    const resultPath = join(dir, 'agent-result2.yaml');
    writeFileSync(resultPath, stringifyYaml(resultPayload));

    // Set build_gate to passed before import to test invalidation
    store.update((s) => { s.gates.build_gate = 'passed'; });
    const beforeGate = store.load().value!.gates.build_gate;
    expect(beforeGate).toBe('passed');

    const imported = bridge.importResult(resultPath);
    expect(imported.ok).toBe(true);

    const after = store.load().value!;
    // After import, build_gate should be pending (stale)
    expect(after.gates.build_gate).toBe('pending');
    // Phase should be build, not demo
    expect(after.delivery.phase).toBe('build');
    // The imported task should be done
    const importedTask = after.delivery.tasks.find((t) => t.id === taskToImport.id);
    expect(importedTask?.status).toBe('done');
  });

  it('stale task packets are not accepted after handoff regeneration with new scope version', async () => {
    setupLockedScopeWith4Features();
    const bridge = new AgentBridge(store);
    const first = bridge.implement('opencode');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstTaskId = store.load().value!.delivery.tasks[0].id;

    // Simulate scope change - new scope version
    store.writeArtifact('scope', 'scope.yaml', {
      schema_version: '2.1',
      version: 'test-scope-v2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'test',
      source_refs: [],
      assumptions: [],
      blockers: [],
      evidence_refs: [],
      verification_status: 'unverified',
      scope: {
        status: 'locked',
        core_demo_flow: store.load().value!.scope.demo_flow,
        mvp_features: store.load().value!.scope.mvp_features,
        deferred_features: [],
        primary_wow_moment: store.load().value!.scope.primary_wow_moment,
        external_dependencies: [],
      },
    });
    // Also need to update architecture version?
    store.writeArtifact('architecture', 'plan.yaml', {
      schema_version: '2.1',
      version: 'test-arch-v2',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      created_by: 'test',
      source_refs: [],
      assumptions: [],
      blockers: [],
      evidence_refs: [],
      verification_status: 'planned',
      system_context: 'test v2',
      component_boundaries: [],
      data_flow: [],
      external_integrations: [],
      security_boundaries: [],
      deployment_assumptions: [],
      decisions: [],
      feature_to_component: {},
      implementation_sequence: [],
      verification_strategy: [],
    });

    const second = bridge.implement('opencode');
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    // Old task packet should no longer exist (cleaned up) and should be stale
    const oldPacketPath = join(dir, '.hackathon', 'artifacts', 'generated', 'handoff', 'tasks', `${firstTaskId}.yaml`);
    // Since we use deterministic ids with scopeVersion, the old packet's id includes v1, new one has v2, so old file should be deleted
    expect(existsSync(oldPacketPath)).toBe(false);

    // Trying to import old task should fail as stale
    const staleResult = {
      schema_version: '2.1',
      task_id: firstTaskId,
      scope_version: 'test-scope-v1',
      architecture_version: 'test-arch-v1',
      status: 'completed',
      changed_files: [],
      commands_executed: [],
      tests: [],
      unresolved_issues: [],
      result_evidence_refs: [],
    };
    const stalePath = join(dir, 'stale-result.yaml');
    writeFileSync(stalePath, stringifyYaml(staleResult));
    const staleImport = bridge.importResult(stalePath);
    expect(staleImport.ok).toBe(false);
    if (!staleImport.ok) {
      expect(staleImport.error.code).toMatch(/TASK_NOT_FOUND|AGENT_RESULT_STALE/);
    }
  });

  it('hadk next correctly transitions through build tasks to demo only when done', async () => {
    setupLockedScopeWith4Features();
    const bridge = new AgentBridge(store);
    bridge.implement('opencode');

    // Initially, next should be handoff import (tasks pending)
    let next = orch.getNextAction(store.load().value!);
    expect(next.phase).toBe('build');
    expect(next.command).toBe('hadk handoff import <result.yaml>');

    // Complete all tasks
    const tasks = [...store.load().value!.delivery.tasks];
    for (const task of tasks) {
      const resultPayload = {
        schema_version: '2.1',
        task_id: task.id,
        scope_version: 'test-scope-v1',
        architecture_version: 'test-arch-v1',
        status: 'completed',
        changed_files: [`src/${task.feature_id}/file.ts`],
        commands_executed: [],
        tests: [],
        unresolved_issues: [],
        result_evidence_refs: [],
      };
      const p = join(dir, `result-${task.id}.yaml`);
      writeFileSync(p, stringifyYaml(resultPayload));
      const imported = bridge.importResult(p);
      expect(imported.ok).toBe(true);
    }

    const afterAllDone = store.load().value!;
    expect(afterAllDone.delivery.tasks.every((t) => t.status === 'done')).toBe(true);
    // Now next should be verify build (since tasks done but build_gate not passed)
    next = orch.getNextAction(afterAllDone);
    expect(next.command).toBe('hadk verify build');

    // Simulate build verification passed
    store.update((s) => {
      s.gates.build_gate = 'passed';
      s.delivery.phase = 'build';
    });
    // Need to create a fake build verification artifact for validateBuild to pass?
    // For next action, it checks build_gate, not the artifact, so it should now advance
    // But we need to set phase to build and build_gate passed, then next should be demo
    // However our checkGate for build will now pass if tasks are done and build_gate passed
    const withBuildPassed = store.load().value!;
    const checkBuild = orch.checkGate(withBuildPassed, 'build');
    expect(checkBuild.passed).toBe(true);

    // After build passes, next should be demo (if we set phase to demo, but we are still in build)
    // The orchestrator's resolveAction will check if build gate is passed, then move to next phase (demo)
    // We need to simulate that build verification passed and then check next
    // The phase is still build, but gate is passed, so next should be the next phase's command
    next = orch.getNextAction(withBuildPassed);
    // Since build gate is passed, it should walk to next phase which is demo
    // The next phase after build is demo, so it should return hadk verify demo
    // But only if build is passed and tasks are done
    expect(next.command).toBe('hadk verify demo');
  });
});
