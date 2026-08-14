import {
  type SubmissionPackage,
  type SubmissionRequirement,
  type CompetitionState,
  type Result,
  err,
  nowIso,
  ok,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

export class SubmissionManager {
  constructor(private readonly store: StateStore) {}

  build(repository?: string): Result<SubmissionPackage> {
    const loaded = this.store.load();
    if (!loaded.ok) return loaded;
    const state = loaded.value;
    const requirements = this.requirements(state, repository);
    return ok({
      schema_version: '2.1',
      package_version: '2.1',
      created_at: nowIso(),
      updated_at: nowIso(),
      created_by: 'hadk',
      source_refs: ['competition/facts.yaml', 'state.yaml'],
      assumptions: [],
      blockers: requirements.filter((requirement) => requirement.status !== 'satisfied' && requirement.mandatory).map((requirement) => `${requirement.requirement_id}: ${requirement.reviewer_note ?? 'evidence missing'}`),
      evidence_refs: requirements.flatMap((requirement) => requirement.evidence_artifact_ref ? [requirement.evidence_artifact_ref] : []),
      verification_status: requirements.every((requirement) => !requirement.mandatory || requirement.status === 'satisfied') ? 'verified' : 'blocked',
      requirements,
      export_path: null,
      ready: requirements.every((requirement) => !requirement.mandatory || requirement.status === 'satisfied'),
    });
  }

  write(repository?: string): Result<SubmissionPackage> {
    const packageResult = this.build(repository);
    if (!packageResult.ok) return packageResult;
    const written = this.store.writeArtifact('submission', 'package.yaml', packageResult.value);
    if (!written.ok) return written;
    return ok({ ...packageResult.value, export_path: written.value });
  }

  export(repository?: string): Result<string> {
    const packageResult = this.write(repository);
    if (!packageResult.ok) return packageResult;
    const markdown = [
      '# HADK v2.1 Submission Package',
      '',
      `Ready: ${packageResult.value.ready ? 'yes' : 'no'}`,
      '',
      '| Requirement | Mandatory | Status | Evidence | Note |',
      '|---|---:|---|---|---|',
      ...packageResult.value.requirements.map((item) => `| ${item.requirement_id} | ${item.mandatory ? 'yes' : 'no'} | ${item.status} | ${item.evidence_artifact_ref ?? 'none'} | ${item.reviewer_note ?? ''} |`),
      '',
      'This is a local review package. HADK does not submit to external systems.',
    ].join('\n');
    const written = this.store.writeTextArtifact('submission', 'package.md', markdown);
    if (!written.ok) return written;
    return ok(written.value);
  }

  review(repository?: string): Result<{ package: SubmissionPackage; blockers: string[] }> {
    const packageResult = this.build(repository);
    if (!packageResult.ok) return packageResult;
    return ok({ package: packageResult.value, blockers: packageResult.value.blockers });
  }

  private requirements(state: CompetitionState, repository?: string): SubmissionRequirement[] {
    const evidence = new Set(this.store.listEvidence().filter((item) => item.status === 'captured' || item.status === 'verified').map((item) => item.id));
    const brief = this.store.readArtifact<any>('competition', 'facts.yaml');
    const submissionText = JSON.stringify(brief.ok ? brief.value.facts?.find((fact: any) => fact.field === 'submission_requirements')?.value ?? '' : '').toLowerCase();
    const hasBuild = state.gates.build_gate === 'passed' && [...evidence].some((id) => this.store.listEvidence().find((item) => item.id === id)?.evidence_type === 'build_output');
    const hasDemo = state.gates.demo_gate === 'passed' && [...evidence].some((id) => this.store.listEvidence().find((item) => item.id === id)?.evidence_type === 'api_demo' || this.store.listEvidence().find((item) => item.id === id)?.evidence_type === 'browser_demo');
    const repo = repository && /^https:\/\//i.test(repository);
    const requirements: SubmissionRequirement[] = [
      { requirement_id: 'repository', source: 'user-provided repository URL', mandatory: true, accepted_format: 'https URL', deadline: state.competition.deadline, evidence_artifact_ref: repo ? repository : null, status: repo ? 'satisfied' : 'missing', reviewer_note: repo ? null : 'A repository URL is required; a plan or local path is not evidence.' },
      { requirement_id: 'build', source: 'HADK verification contract', mandatory: true, accepted_format: 'verified build evidence', deadline: state.competition.deadline, evidence_artifact_ref: hasBuild ? 'evidence:build_output' : null, status: hasBuild ? 'satisfied' : 'blocked', reviewer_note: hasBuild ? null : 'Run hadk verify build successfully.' },
      { requirement_id: 'demo', source: 'competition brief', mandatory: true, accepted_format: 'automated or human-attested demo evidence', deadline: state.competition.deadline, evidence_artifact_ref: hasDemo ? 'evidence:demo' : null, status: hasDemo ? 'satisfied' : 'blocked', reviewer_note: hasDemo ? null : 'Run hadk verify demo or record human attestation.' },
      { requirement_id: 'video-plan', source: 'competition brief', mandatory: false, accepted_format: 'storyboard markdown and asset checklist', deadline: state.competition.deadline, evidence_artifact_ref: this.store.listArtifacts('submission').includes('video-plan.md') ? 'submission/video-plan.md' : null, status: this.store.listArtifacts('submission').includes('video-plan.md') ? 'satisfied' : 'in_progress', reviewer_note: 'A plan is not rendered media evidence.' },
      { requirement_id: 'demo-video', source: 'competition brief', mandatory: submissionText.includes('video'), accepted_format: 'non-empty MP4/WebM or external media evidence', deadline: state.competition.deadline, evidence_artifact_ref: this.mediaEvidence(), status: this.mediaEvidence() ? 'satisfied' : (submissionText.includes('video') ? 'blocked' : 'missing'), reviewer_note: this.mediaEvidence() ? null : 'A storyboard or zero-byte media file is not evidence.' },
      { requirement_id: 'pitch-deck', source: 'competition brief', mandatory: submissionText.includes('slide') || submissionText.includes('deck'), accepted_format: 'PDF or slide link', deadline: state.competition.deadline, evidence_artifact_ref: this.deckEvidence(), status: this.deckEvidence() ? 'satisfied' : 'missing', reviewer_note: this.deckEvidence() ? null : 'Attach the actual deck before external submission.' },
    ];
    for (const sponsor of state.competition.sponsor_requirements) {
      requirements.push({ requirement_id: `sponsor:${sponsor.sponsor}`, source: 'competition brief', mandatory: true, accepted_format: 'artifact or verified integration evidence', deadline: state.competition.deadline, evidence_artifact_ref: null, status: 'blocked', reviewer_note: `Evidence for ${sponsor.sponsor} is not present.` });
    }
    return requirements;
  }

  private mediaEvidence(): string | null {
    const media = this.store.listEvidence().find((item) => item.path && /\.(mp4|webm|mov)$/i.test(item.path) && existsSync(resolve(this.store.projectRoot, item.path)) && statSync(resolve(this.store.projectRoot, item.path)).size > 0);
    return media ? media.id : null;
  }

  private deckEvidence(): string | null {
    const deck = this.store.listEvidence().find((item) => item.path && /\.(pdf|pptx|odp)$/i.test(item.path) && existsSync(resolve(this.store.projectRoot, item.path)) && statSync(resolve(this.store.projectRoot, item.path)).size > 0);
    return deck ? deck.id : null;
  }
}
