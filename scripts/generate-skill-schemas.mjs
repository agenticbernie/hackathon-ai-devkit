#!/usr/bin/env node
/**
 * generate-skill-schemas.mjs
 *
 * Reads manifest.yaml and generates a matching input/output JSON Schema pair for
 * every registered skill under schemas/skills/. Keeps the registry and its schema
 * files in sync so counts never drift.
 *
 * Usage: node scripts/generate-skill-schemas.mjs
 * Idempotent and non-destructive to unrelated files (only writes schema files it owns).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'manifest.yaml');
const schemasDir = join(root, 'schemas', 'skills');

const manifest = readFileSync(manifestPath, 'utf-8');

// Extract skill names: 2-space-indented keys directly under `skills:`.
const lines = manifest.split('\n');
let inSkills = false;
const skills = [];
for (const line of lines) {
  if (/^skills:\s*$/.test(line)) { inSkills = true; continue; }
  if (inSkills) {
    const m = line.match(/^  ([a-z0-9-]+):\s*$/);
    if (m) skills.push(m[1]);
    else if (/^[a-zA-Z]/.test(line)) inSkills = false; // top-level key ends skills block
  }
}

if (skills.length === 0) {
  console.error('No skills found in manifest.yaml');
  process.exit(1);
}

mkdirSync(schemasDir, { recursive: true });

function titleCase(slug) {
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function descriptionFor(name) {
  // Pull the description from the manifest entry if present.
  const re = new RegExp(`^  ${name}:[\\s\\S]*?description:\\s*"([^"]*)"`, 'm');
  const m = manifest.match(re);
  return m ? m[1] : `${titleCase(name)} skill.`;
}

let written = 0;
for (const name of skills) {
  const desc = descriptionFor(name);

  const inputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://agenticbernie.dev/hadk/skills/${name}.input.schema.json`,
    title: `${titleCase(name)} — Input`,
    description: `Input contract for the ${name} skill. ${desc}`,
    type: 'object',
    additionalProperties: true,
    properties: {
      competition: { type: 'object', description: 'Parsed competition intelligence from .hackathon/artifacts/competition.' },
      state_ref: { type: 'string', description: 'Path to the canonical .hackathon/state.yaml.' },
    },
  };

  const outputSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://agenticbernie.dev/hadk/skills/${name}.output.schema.json`,
    title: `${titleCase(name)} — Output`,
    description: `Output contract for the ${name} skill. ${desc}`,
    type: 'object',
    additionalProperties: true,
    properties: {
      artifact: { type: 'string', description: 'Path to the persisted artifact under .hackathon/artifacts/.' },
      recommended_skills: { type: 'array', items: { type: 'string' }, description: 'Next skills to invoke.' },
    },
  };

  const inputPath = join(schemasDir, `${name}.input.schema.json`);
  const outputPath = join(schemasDir, `${name}.output.schema.json`);
  writeFileSync(inputPath, JSON.stringify(inputSchema, null, 2) + '\n', 'utf-8');
  writeFileSync(outputPath, JSON.stringify(outputSchema, null, 2) + '\n', 'utf-8');
  written += 2;
}

console.log(`Generated ${written} schema files for ${skills.length} skills in schemas/skills/.`);
