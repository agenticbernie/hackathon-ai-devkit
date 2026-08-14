import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { redactSecrets, safeResolvePath } from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { validateBuild, validateVideo } from '@hadk/validators';
import { BriefService, captureSource } from '@hadk/competition-intelligence';
import { SubmissionManager } from '@hadk/submission';

describe('HADK v2.1 truth and safety contracts', () => {
  it('rejects paths outside the project root and symlink escapes', () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-path-'));
    const outside = mkdtempSync(join(tmpdir(), 'hadk-v21-outside-'));
    expect(safeResolvePath(root, '../outside').ok).toBe(false);
    symlinkSync(outside, join(root, 'escape'));
    expect(safeResolvePath(root, 'escape/secret.txt').ok).toBe(false);
  });

  it('does not let an empty node_modules directory pass build validation', () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-build-'));
    const store = new StateStore(root);
    store.init();
    mkdirSync(join(root, 'prototype', 'node_modules'), { recursive: true });
    expect(validateBuild(store).passed).toBe(false);
    expect(validateBuild(store).issues.some((issue) => issue.code === 'BUILD_NOT_VERIFIED')).toBe(true);
  });

  it('rejects zero-byte video evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-video-'));
    const store = new StateStore(root);
    store.init();
    mkdirSync(join(root, 'demo-video', 'compositions'), { recursive: true });
    mkdirSync(join(root, 'demo-video', 'output'), { recursive: true });
    writeFileSync(join(root, 'demo-video', 'storyboard.yaml'), 'scenes: []');
    writeFileSync(join(root, 'demo-video', 'asset-manifest.yaml'), 'assets: []');
    writeFileSync(join(root, 'demo-video', 'compositions', 'submission-video.html'), '<!doctype html>');
    writeFileSync(join(root, 'demo-video', 'output', 'submission-video.mp4'), '');
    store.update((state) => { state.delivery.video_status = 'rendered'; });
    expect(validateVideo(store).issues.some((issue) => issue.code === 'VIDEO_EMPTY')).toBe(true);
  });

  it('blocks incomplete briefs instead of inventing tracks or rubric facts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-brief-'));
    const store = new StateStore(root);
    store.init();
    writeFileSync(join(root, 'brief.md'), '# Only a name\n');
    const result = await new BriefService(store).capture('brief.md');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('needs_review');
    const state = store.load();
    expect(state.ok && state.value.competition.tracks).toEqual([]);
    expect(state.ok && state.value.gates.competition_gate).toBe('pending');
  });

  it('requires a replacement value before confirming an unknown brief fact', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-confirm-'));
    const store = new StateStore(root);
    store.init();
    writeFileSync(join(root, 'brief.md'), '# Only a name\n');
    const service = new BriefService(store);
    const captured = await service.capture('brief.md');
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const unknown = captured.value.facts.find((fact) => fact.value === null);
    expect(unknown).toBeDefined();
    if (!unknown) return;
    expect(service.confirm(unknown.id).ok).toBe(false);
    expect(service.confirm(unknown.id, 'confirmed value').ok).toBe(true);
  });

  it('does not treat a zero-byte video as mandatory submission evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-submission-'));
    const store = new StateStore(root);
    store.init();
    store.writeArtifact('competition', 'facts.yaml', {
      facts: [{ field: 'submission_requirements', value: '60 second demo video' }],
    });
    mkdirSync(join(root, 'media'), { recursive: true });
    const media = join(root, 'media', 'demo.mp4');
    writeFileSync(media, '');
    store.recordEvidence({
      evidence_type: 'human_attestation',
      source: 'test',
      actor: 'test',
      status: 'captured',
      path: media,
      redaction: { applied: false, fields: [] },
    });
    const packageResult = new SubmissionManager(store).build('https://github.com/example/project');
    expect(packageResult.ok).toBe(true);
    if (packageResult.ok) {
      expect(packageResult.value.requirements.find((item) => item.requirement_id === 'demo-video')?.status).toBe('blocked');
    }
  });

  it('redacts secrets from evidence content', () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-secret-'));
    const store = new StateStore(root);
    store.init();
    const evidence = store.recordEvidence({
      evidence_type: 'command_execution',
      source: 'test',
      actor: 'test',
      status: 'captured',
      content: 'API_KEY=sk-test-secret-value',
      redaction: { applied: false, fields: [] },
    });
    expect(evidence.ok).toBe(true);
    if (evidence.ok) expect(evidence.value.content).not.toContain('sk-test-secret-value');
  });

  it('redacts multiline PEM private keys and rejects path-like evidence ids', () => {
    expect(redactSecrets('-----BEGIN PRIVATE KEY-----\nsecret-material\n-----END PRIVATE KEY-----')).toBe('[REDACTED PEM PRIVATE KEY]');
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-evidence-id-'));
    const store = new StateStore(root);
    store.init();
    const evidence = store.recordEvidence({
      id: '../../escape',
      evidence_type: 'command_execution',
      source: 'test',
      actor: 'test',
      status: 'captured',
      content: 'safe',
      redaction: { applied: false, fields: [] },
    });
    expect(evidence.ok).toBe(false);
  });

  it('blocks startup SSRF targets through the shared source capture policy', async () => {
    const root = mkdtempSync(join(tmpdir(), 'hadk-v21-startup-ssrf-'));
    expect((await captureSource(root, 'http://127.0.0.1:9/metadata')).ok).toBe(false);
    expect((await captureSource(root, 'http://169.254.169.254/latest/meta-data')).ok).toBe(false);
  });
});
