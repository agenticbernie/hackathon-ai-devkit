/**
 * YAML utilities and Result type for HADK.
 */

import yaml from 'js-yaml';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E = HadkError> = { ok: true; value: T } | { ok: false; error: E };

export interface HadkError {
  code: string;
  message: string;
  details?: string[];
  hint?: string;
}

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = HadkError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function hadkError(code: string, message: string, details?: string[], hint?: string): HadkError {
  return { code, message, details, hint };
}

// ─── YAML I/O ────────────────────────────────────────────────────────────────

export function parseYaml<T>(content: string): Result<T> {
  try {
    // js-yaml v4 DEFAULT_SCHEMA only supports standard YAML types (no code execution),
    // but we explicitly pin the schema to prevent arbitrary object construction.
    const data = yaml.load(content, { schema: yaml.DEFAULT_SCHEMA }) as T;
    return ok(data);
  } catch (e) {
    return err(hadkError('YAML_PARSE_ERROR', `Failed to parse YAML: ${(e as Error).message}`));
  }
}

export function stringifyYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function readYamlFile<T>(filePath: string): Result<T> {
  try {
    if (!existsSync(filePath)) {
      return err(hadkError('FILE_NOT_FOUND', `File not found: ${filePath}`, undefined, 'Run `hadk setup` to initialize the project.'));
    }
    const content = readFileSync(filePath, 'utf-8');
    return parseYaml<T>(content);
  } catch (e) {
    return err(hadkError('FILE_READ_ERROR', `Failed to read ${filePath}: ${(e as Error).message}`));
  }
}

/**
 * Atomic write: writes to a temp file then renames, preventing corruption.
 */
export function writeYamlFileAtomic(filePath: string, data: unknown): Result<void> {
  try {
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });

    const content = stringifyYaml(data);
    const tmpPath = join(dir, `.${randomUUID()}.tmp`);

    // Backup existing file for corruption protection
    if (existsSync(filePath)) {
      const backupPath = filePath + '.bak';
      copyFileSync(filePath, backupPath);
    }

    writeFileSync(tmpPath, content, 'utf-8');
    renameSync(tmpPath, filePath);
    return ok(undefined);
  } catch (e) {
    return err(hadkError('FILE_WRITE_ERROR', `Failed to write ${filePath}: ${(e as Error).message}`));
  }
}

// ─── Utilities ───────────────────────────────────────────────────────────────

export function generateId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

/** Resolve the authoritative time budget, preferring a valid absolute deadline. */
export function remainingHours(deadline: string | null, configuredHours: number | null, now = new Date()): number | null {
  if (deadline) {
    const parsed = new Date(deadline);
    if (!Number.isNaN(parsed.getTime())) return Math.round(hoursBetween(now, parsed) * 10) / 10;
  }
  return typeof configuredHours === 'number' && Number.isFinite(configuredHours) && configuredHours >= 0
    ? configuredHours
    : null;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sumWeights(weights: Record<string, number>): number {
  return Object.values(weights).reduce((a, b) => a + b, 0);
}

export function weightsSumToOne(weights: Record<string, number>, tolerance = 0.001): boolean {
  return Math.abs(sumWeights(weights) - 1.0) <= tolerance;
}
