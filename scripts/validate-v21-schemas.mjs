import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const registry = JSON.parse(readFileSync(join(root, 'schemas/v2.1/registry.json'), 'utf8'));
const failures = [];
for (const [name, relative] of Object.entries(registry.schemas ?? {})) {
  const path = join(root, relative);
  if (!existsSync(path)) failures.push(`${name}: missing ${relative}`);
  else {
    try { JSON.parse(readFileSync(path, 'utf8')); }
    catch (error) { failures.push(`${name}: ${(error).message}`); }
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Validated ${Object.keys(registry.schemas ?? {}).length} v2.1 schemas.`);
