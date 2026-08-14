/**
 * YAML utilities and Result type for HADK.
 */

import yaml from 'js-yaml';
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, copyFileSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
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
      if (lstatSync(filePath).isSymbolicLink()) {
        return err(hadkError('FILE_WRITE_ERROR', `Refusing to overwrite symlink: ${filePath}`));
      }
      const backupPath = filePath + '.bak';
      if (existsSync(backupPath) && lstatSync(backupPath).isSymbolicLink()) {
        return err(hadkError('FILE_WRITE_ERROR', `Refusing to overwrite symlink backup: ${backupPath}`));
      }
      const backupTempPath = join(dir, `.${randomUUID()}.bak.tmp`);
      copyFileSync(filePath, backupTempPath);
      renameSync(backupTempPath, backupPath);
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

const SECRET_PATH = /(^|\/)(\.env(?:\..*)?|credentials?|secrets?|.*private.*key.*|.*token.*|.*cloud.*credential.*)(\/|$)/i;

/** Resolve a path under a workspace root and reject traversal or symlink escape. */
export function safeResolvePath(root: string, requested: string, options: { allowOutsideRoot?: boolean; allowSecrets?: boolean } = {}): Result<string> {
  const workspace = resolve(root);
  const candidate = isAbsolute(requested) ? resolve(requested) : resolve(workspace, requested);
  const rel = relative(workspace, candidate);
  if (!options.allowOutsideRoot && (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel))) {
    return err(hadkError('PATH_OUTSIDE_ROOT', `Path is outside the project root: ${requested}`));
  }
  if (!options.allowSecrets && SECRET_PATH.test(relative(workspace, candidate).replaceAll('\\', '/'))) {
    return err(hadkError('SECRET_PATH_DENIED', `Secret-bearing path is not allowed: ${requested}`));
  }
  let current = candidate;
  while (current !== workspace && current !== dirname(current)) {
    if (existsSync(current)) {
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink()) {
          const target = realpathSync(current);
          const targetRel = relative(workspace, target);
          if (!options.allowOutsideRoot && (targetRel === '..' || targetRel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(targetRel))) {
            return err(hadkError('SYMLINK_ESCAPE', `Symlink escapes the project root: ${requested}`));
          }
        }
      } catch (e) {
        return err(hadkError('PATH_CHECK_FAILED', `Could not validate path ${requested}: ${(e as Error).message}`));
      }
    }
    current = dirname(current);
  }
  return ok(candidate);
}

export function redactSecrets(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PEM PRIVATE KEY]')
    .replace(/(api[_-]?key|token|password|secret|private[_-]?key)\s*[=:]\s*["']?[^"'\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\b(sk|ghp|xoxb|AIza)[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]');
}
