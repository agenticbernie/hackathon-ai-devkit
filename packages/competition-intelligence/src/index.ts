import {
  type CompetitionFact,
  type CompetitionState,
  type FactStatus,
  err,
  generateId,
  hadkError,
  nowIso,
  ok,
  safeResolvePath,
} from '@hadk/core';
import { StateStore } from '@hadk/state-store';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export interface BriefSource {
  source: string;
  source_type: 'url' | 'file';
  retrieved_at: string;
  content: string;
  checksum: string;
  content_type: string;
  warnings: string[];
}

export interface BriefReview {
  status: 'needs_review' | 'confirmed' | 'blocked';
  facts: CompetitionFact[];
  unresolved_questions: string[];
  blockers: string[];
  raw_source_ref: string;
}

const MAX_BYTES = 2_000_000;
const ALLOWED_TYPES = new Set(['text/plain', 'text/markdown', 'text/html', 'application/xhtml+xml']);

export class BriefService {
  constructor(private readonly store: StateStore) {}

  async capture(source: string): Promise<ReturnType<typeof ok<BriefReview>> | ReturnType<typeof err>> {
    const fetched = await captureSource(this.store.projectRoot, source);
    if (!fetched.ok) return fetched;
    const raw = fetched.value;
    const rawArtifact = this.store.writeTextArtifact('competition', `raw-${Date.now()}.txt`, raw.content);
    if (!rawArtifact.ok) return rawArtifact;
    const evidence = this.store.recordEvidence({
      evidence_type: 'source_excerpt',
      source,
      actor: 'hadk',
      status: 'captured',
      content: raw.content.slice(0, 4000),
      redaction: { applied: false, fields: [] },
      metadata: { content_type: raw.content_type, byte_length: raw.content.length },
    });
    if (!evidence.ok) return evidence;
    const review = extractFacts(normalizeContent(raw.content, raw.content_type), source, rawArtifact.value);
    const artifact = {
      schema_version: '2.1',
      created_at: nowIso(),
      updated_at: nowIso(),
      created_by: 'hadk',
      source_refs: [source],
      assumptions: [],
      blockers: review.blockers,
      evidence_refs: [evidence.value.id],
      verification_status: review.status === 'confirmed' ? 'verified' : review.status === 'blocked' ? 'blocked' : 'unverified',
      raw_source_ref: rawArtifact.value,
      source: raw,
      facts: review.facts,
      status: review.status,
      unresolved_questions: review.unresolved_questions,
    };
    const written = this.store.writeArtifact('competition', 'facts.yaml', artifact);
    if (!written.ok) return written;
    const stateResult = this.store.update((state) => {
      state.competition.source_url = /^https?:\/\//i.test(source) ? source : state.competition.source_url;
      // Hydrate canonical competition state from extracted facts (preserving provenance).
      hydrateCompetitionState(state, review.facts);
      state.gates.competition_gate = computeCompetitionGateStatus(state, review.status);
      state.blockers = [...new Set([...(state.blockers ?? []), ...review.blockers])];
      state.evidence_refs = [...new Set([...(state.evidence_refs ?? []), evidence.value.id])];
      if (state.delivery.phase === 'setup') state.delivery.phase = 'competition-intelligence';
    });
    if (!stateResult.ok) return stateResult;
    return ok({ ...review, raw_source_ref: rawArtifact.value });
  }

  review(): ReturnType<typeof ok<BriefReview>> | ReturnType<typeof err> {
    const result = this.store.readArtifact<any>('competition', 'facts.yaml');
    if (!result.ok) return result;
    return ok({
      status: result.value.status ?? 'needs_review',
      facts: result.value.facts ?? [],
      unresolved_questions: result.value.unresolved_questions ?? [],
      blockers: result.value.blockers ?? [],
      raw_source_ref: result.value.raw_source_ref,
    });
  }

  confirm(field: string, value?: string): ReturnType<typeof ok<BriefReview>> | ReturnType<typeof err> {
    return this.changeFact(field, 'user_confirmed', value);
  }

  reject(field: string): ReturnType<typeof ok<BriefReview>> | ReturnType<typeof err> {
    return this.changeFact(field, 'rejected');
  }

  private changeFact(field: string, factType: FactStatus, replacement?: string): ReturnType<typeof ok<BriefReview>> | ReturnType<typeof err> {
    const current = this.review();
    if (!current.ok) return current;
    const fact = current.value.facts.find((item) => item.field === field || item.id === field);
    if (!fact) return err(hadkError('FACT_NOT_FOUND', `No brief fact matches "${field}".`));
    if (replacement !== undefined) fact.value = replacement;
    if (factType === 'user_confirmed' && (fact.value === null || fact.value === undefined || fact.value === '')) {
      return err(hadkError('FACT_VALUE_MISSING', `Cannot confirm "${field}" because the extracted value is unknown.`, undefined, 'Provide the value through a reviewed brief source or update the fact contract.'));
    }
    fact.fact_type = factType;
    fact.confidence = factType === 'user_confirmed' ? 'high' : 'low';
    const remaining = current.value.facts.filter((item) => item.fact_type === 'unknown' || item.fact_type === 'rejected');
    const status = factType === 'rejected' || remaining.length > 0 ? 'needs_review' : 'confirmed';
    const updated = this.store.writeArtifact('competition', 'facts.yaml', {
      ...current.value,
      facts: current.value.facts,
      status,
      updated_at: nowIso(),
      verification_status: status === 'confirmed' ? 'verified' : 'unverified',
    });
    if (!updated.ok) return updated;
    const evidence = this.store.recordEvidence({
      evidence_type: 'user_confirmation',
      source: `brief fact ${field}`,
      actor: 'user',
      status: 'verified',
      content: `${factType}: ${String(fact.value)}`,
      redaction: { applied: false, fields: [] },
    });
    if (!evidence.ok) return evidence;
    const state = this.store.update((s) => {
      // Hydrate canonical competition state from all confirmed facts, preserving provenance.
      hydrateCompetitionState(s, current.value.facts);
      s.gates.competition_gate = computeCompetitionGateStatus(s, status);
      s.blockers = status === 'confirmed' && s.gates.competition_gate === 'passed' ? (s.blockers ?? []).filter((item) => !item.includes('brief')) : [...new Set([...(s.blockers ?? []), `brief review required for ${field}`])];
      s.evidence_refs = [...new Set([...(s.evidence_refs ?? []), evidence.value.id])];
      // If hydration now makes the competition canonical ready and status confirmed, advance phase if still in competition-intelligence.
      if (s.gates.competition_gate === 'passed' && s.delivery.phase === 'competition-intelligence') {
        // Keep phase as-is; orchestrator/next will recommend moving to strategy. Do not auto-jump beyond strategy without explicit strategy command.
        // However for compatibility with ingest that sets phase to strategy when confirmed, we keep that behavior only if competition was previously ingested.
      }
    });
    if (!state.ok) return state;
    return ok({ ...current.value, status });
  }
}

export async function captureSource(root: string, source: string, fetcher?: typeof fetch): Promise<ReturnType<typeof ok<BriefSource>> | ReturnType<typeof err>> {
  const retrievedAt = nowIso();
  if (!/^https?:\/\//i.test(source)) {
    const safe = safeResolvePath(root, source);
    if (!safe.ok) return safe;
    if (/(^|\/)(\.env|credentials|secrets?|.*private.*key)/i.test(source)) return err(hadkError('SECRET_SOURCE_DENIED', 'Secret-bearing files cannot be ingested.'));
    try {
      const content = readFileSync(safe.value, 'utf8');
      if (!content.trim()) return err(hadkError('BRIEF_EMPTY', 'Brief is empty.', undefined, 'Provide a non-empty markdown or text brief.'));
      if (content.length > MAX_BYTES) return err(hadkError('BRIEF_TOO_LARGE', `Brief exceeds ${MAX_BYTES} bytes.`));
      return ok({ source, source_type: 'file', retrieved_at: retrievedAt, content, checksum: sha(content), content_type: 'text/plain', warnings: [] });
    } catch (e) {
      return err(hadkError('BRIEF_READ_FAILED', `Could not read brief: ${(e as Error).message}`));
    }
  }
  try {
    let current = new URL(source);
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await fetchPinned(current, fetcher);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) return err(hadkError('REDIRECT_INVALID', 'Redirect response did not include a location.'));
        current = new URL(location, current);
        if (!/^https?:$/i.test(current.protocol)) return err(hadkError('REDIRECT_INVALID', 'Redirect target must use HTTP or HTTPS.'));
        continue;
      }
      if (!response.ok) return err(hadkError('BRIEF_FETCH_FAILED', `Could not fetch brief: HTTP ${response.status}.`));
      const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.has(contentType)) return err(hadkError('CONTENT_TYPE_DENIED', `Unsupported brief content type: ${contentType || 'unknown'}.`));
      const length = Number(response.headers.get('content-length') ?? 0);
      if (length > MAX_BYTES) return err(hadkError('BRIEF_TOO_LARGE', `Brief exceeds ${MAX_BYTES} bytes.`));
      const contentResult = await readLimitedBody(response, MAX_BYTES);
      if (!contentResult.ok) return contentResult;
      const content = contentResult.value;
      return ok({ source, source_type: 'url', retrieved_at: retrievedAt, content, checksum: sha(content), content_type: contentType, warnings: [] });
    }
    return err(hadkError('REDIRECT_LIMIT', 'Brief exceeded the redirect limit.'));
  } catch (e) {
    const message = (e as Error).message;
    if (message.startsWith('Refusing private or metadata address')) return err(hadkError('SSRF_BLOCKED', message));
    if (message.startsWith('Brief exceeds')) return err(hadkError('BRIEF_TOO_LARGE', message));
    return err(hadkError('BRIEF_FETCH_FAILED', `Could not fetch brief: ${message}`));
  }
}

async function readLimitedBody(response: Response, limit: number): Promise<ReturnType<typeof ok<string>> | ReturnType<typeof err>> {
  if (!response.body) return ok('');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return err(hadkError('BRIEF_TOO_LARGE', `Brief exceeds ${limit} bytes.`));
      }
      chunks.push(next.value);
    }
    return ok(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    return err(hadkError('BRIEF_FETCH_FAILED', `Could not read brief response: ${(error as Error).message}`));
  }
}

async function fetchPinned(url: URL, fetcher?: typeof fetch): Promise<Response> {
  const address = await resolvePublicAddress(url.hostname);
  if (fetcher) return fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000), headers: { accept: 'text/plain,text/markdown,text/html,application/xhtml+xml' } });
  return new Promise<Response>((resolveResponse, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      headers: { accept: 'text/plain,text/markdown,text/html,application/xhtml+xml' },
      timeout: 15_000,
      lookup: (_hostname, _options, callback) => callback(null, address, isIP(address) === 6 ? 6 : 4),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let exceeded = false;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          exceeded = true;
          request.destroy(new Error(`Brief exceeds ${MAX_BYTES} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        if (exceeded) return;
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) {
          if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(',') : value);
        }
        resolveResponse(new Response(Buffer.concat(chunks), { status: response.statusCode ?? 500, headers }));
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Brief request timed out.')));
    request.on('error', reject);
    request.end();
  });
}

async function resolvePublicAddress(hostname: string): Promise<string> {
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === 'metadata.google.internal') {
    throw new Error(`Refusing private or metadata address: ${hostname}`);
  }
  const addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true })).map((item) => item.address);
  const address = addresses.find((item) => !isPrivateAddress(item));
  if (!address || addresses.some(isPrivateAddress)) throw new Error(`Refusing private or metadata address: ${hostname}`);
  return address;
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.replace(/^::ffff:/i, '');
  if (normalized.includes(':')) return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
  const octets = normalized.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = octets;
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0;
}

function extractFacts(content: string, source: string, sourceRef: string): BriefReview {
  const facts: CompetitionFact[] = [];
  const add = (field: string, value: unknown, excerpt: string, factType: FactStatus = 'extracted') => facts.push({
    id: generateId('fact'), field, value, fact_type: factType, confidence: 'medium', source_ref: sourceRef, excerpt: excerpt.slice(0, 500), locator: `text:${content.indexOf(excerpt)}`, unresolved_questions: [],
  });
  const nameMatch = content.match(/(?:^#\s+|event[_ ]?name\s*:\s*)([^\n]+)/im);
  if (nameMatch) add('competition_name', nameMatch[1].trim(), nameMatch[0]);
  const deadlineMatch = content.match(/(?:deadline|due|ends?)\s*:\s*([^\n]+)/i);
  if (deadlineMatch) add('deadline', deadlineMatch[1].trim(), deadlineMatch[0]);
  const tracks = [...content.matchAll(/(?:^|\n)\s*[-*]\s*track\s*:?\s*([^\n]+)/gi)].map((m) => m[1].trim());
  if (tracks.length) add('tracks', tracks, tracks.join('\n'));
  const criteria = [...content.matchAll(/(?:^|\n)\s*[-*]\s*(?:judging criteria|criterion|rubric)\s*:?\s*([^\n]+)/gi)].map((m) => m[1].trim());
  if (criteria.length) add('judging_criteria', criteria, criteria.join('\n'));
  const requirements = [...content.matchAll(/(?:^|\n)\s*[-*]\s*(?:submission requirement|submit)\s*:?\s*([^\n]+)/gi)].map((m) => m[1].trim());
  if (requirements.length) add('submission_requirements', requirements, requirements.join('\n'));
  const important = ['competition_name', 'tracks', 'judging_criteria', 'deadline'];
  const unresolved = important.filter((field) => !facts.some((fact) => fact.field === field));
  for (const field of unresolved) facts.push({ id: generateId('fact'), field, value: null, fact_type: 'unknown', confidence: 'low', source_ref: sourceRef, excerpt: null, locator: null, unresolved_questions: [`Confirm ${field} from the official brief.`] });
  const blockers = unresolved.includes('tracks') || unresolved.includes('judging_criteria') ? ['Brief review is blocked until tracks and judging criteria are confirmed or explicitly marked unknown.'] : [];
  return { status: blockers.length || unresolved.length ? 'needs_review' : 'confirmed', facts, unresolved_questions: unresolved.map((field) => `Confirm ${field}.`), blockers, raw_source_ref: source };
}

/**
 * Hydrate the canonical CompetitionState from user-confirmed and extracted facts.
 * Preserves provenance by marking judging criteria source as `user-provided` when confirmed.
 * Tracks and name are derived from confirmed values; unknown/rejected facts are ignored.
 */
export function hydrateCompetitionState(state: CompetitionState, facts: CompetitionFact[]): void {
  for (const fact of facts) {
    if (fact.fact_type === 'rejected' || fact.fact_type === 'unknown') continue;
    if (fact.value === null || fact.value === undefined || (typeof fact.value === 'string' && fact.value.trim() === '')) continue;
    switch (fact.field) {
      case 'competition_name': {
        if (typeof fact.value === 'string' && fact.value.trim()) state.competition.name = fact.value.trim();
        break;
      }
      case 'deadline': {
        if (typeof fact.value === 'string' && fact.value.trim()) {
          const trimmed = fact.value.trim();
          const num = Number(trimmed);
          if (!Number.isNaN(num) && Number.isFinite(num) && String(num) === trimmed) {
            state.competition.remaining_hours = num;
          } else {
            state.competition.deadline = trimmed;
            // If deadline looks like an ISO date, clear a stale remaining_hours that would conflict? Keep remaining_hours as fallback.
            // Do not clear remaining_hours; remainingHours() prefers deadline when parseable.
          }
        } else if (typeof fact.value === 'number' && Number.isFinite(fact.value)) {
          state.competition.remaining_hours = fact.value;
        }
        break;
      }
      case 'tracks': {
        let names: string[] = [];
        if (Array.isArray(fact.value)) {
          for (const v of fact.value) {
            if (typeof v === 'string') {
              if (v.includes(',')) names.push(...v.split(','));
              else if (v.includes('\n')) names.push(...v.split('\n'));
              else names.push(v);
            }
          }
        } else if (typeof fact.value === 'string') {
          if (fact.value.includes(',')) names = fact.value.split(',');
          else if (fact.value.includes('\n')) names = fact.value.split('\n');
          else names = [fact.value];
        }
        names = names.map((s) => s.trim()).filter(Boolean);
        if (names.length > 0) {
          state.competition.tracks = names.map((name, idx) => ({
            id: `track-${idx + 1}`,
            name,
            description: name,
            sponsor: null,
            prize: null,
            required_tools: [],
          }));
        }
        break;
      }
      case 'judging_criteria': {
        let criteriaNames: string[] = [];
        const source: 'extracted' | 'inferred' | 'user-provided' =
          fact.fact_type === 'user_confirmed' ? 'user-provided' : fact.fact_type === 'inferred' ? 'inferred' : 'extracted';
        if (Array.isArray(fact.value)) {
          for (const v of fact.value) if (typeof v === 'string' && v.trim()) criteriaNames.push(v.trim());
        } else if (typeof fact.value === 'string' && fact.value.trim()) {
          if (fact.value.includes('\n')) criteriaNames = fact.value.split('\n').map((s) => s.trim()).filter(Boolean);
          else criteriaNames = [fact.value.trim()];
        }
        if (criteriaNames.length > 0) {
          state.competition.judging_criteria = criteriaNames.map((name) => ({ name, weight: null, description: name, source }));
        }
        break;
      }
      case 'competition_type': {
        if (typeof fact.value === 'string' && ['hackathon', 'buildathon', 'startup-contest'].includes(fact.value)) {
          state.competition.type = fact.value as CompetitionState['competition']['type'];
        }
        break;
      }
      default: break;
    }
  }
}

export function isCompetitionCanonicalReady(state: CompetitionState): boolean {
  const hasName = typeof state.competition.name === 'string' && state.competition.name.trim().length > 0;
  const hasTracks = state.competition.tracks.length > 0;
  const hasCriteria = state.competition.judging_criteria.length > 0;
  const hasDeadline = (state.competition.deadline !== null && String(state.competition.deadline).trim() !== '') || state.competition.remaining_hours !== null;
  return Boolean(hasName && hasTracks && hasCriteria && hasDeadline);
}

export function computeCompetitionGateStatus(
  state: CompetitionState,
  factsStatus: 'needs_review' | 'confirmed' | 'blocked',
): 'passed' | 'pending' | 'failed' {
  if (factsStatus === 'blocked') return 'failed';
  if (factsStatus === 'confirmed' && isCompetitionCanonicalReady(state)) return 'passed';
  return 'pending';
}

function normalizeContent(content: string, contentType: string): string {
  if (!contentType.includes('html')) return content;
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
