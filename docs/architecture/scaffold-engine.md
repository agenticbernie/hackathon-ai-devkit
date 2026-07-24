# Scaffold Engine

`@hadk/scaffold-engine` turns a **locked scope** into an actual, runnable
project skeleton. It is data-driven ([ADR-004](./decisions/ADR-004-data-driven-scaffold.md)):
profiles declare files and feature mappings, and one engine interprets them.

## Profiles

Three profiles are implemented (`IMPLEMENTED_PROFILES`):

| Profile | Shape |
|---|---|
| `web-ai-fullstack` | Next.js-style full-stack app with an API route and AI call in one project. |
| `web-ai-split` | Separate frontend and backend services. |
| `blockchain` | Smart-contract project with a web front end. |

`listProfiles()` returns the available profile names. The default is
`web-ai-fullstack`.

## Plan vs. generate

- `plan(options)` builds a `ScaffoldPlan` (project name, profile, output dir,
  feature mapping, file list with content hashes, startup command, health
  check) **without** touching disk.
- `generate(options)` writes the files and returns a `ScaffoldResult`
  (`plan`, `files_written`, `files_skipped`, `conflicts`, `dry_run`,
  `output_dir`).

`ScaffoldOptions`: `{ profile?, output?, dryRun?, force?, installDeps? }`.
Default output directory is `prototype/`.

## Scope gate

`generate()` refuses to run unless the scope is locked
(`SCOPE_NOT_LOCKED`), unless `dryRun` is set. This prevents scaffolding a
moving target.

## Non-destructive conflict handling

For every target file:

1. If the file exists and `--force` is not set:
   - identical content (matching hash) → recorded in `files_skipped`;
   - different content → recorded in `conflicts` and **left untouched**.
2. Otherwise the file is written and recorded in `files_written`.

User-modified files are therefore never overwritten without an explicit
`--force`.

## Dry-run semantics

In dry-run mode nothing is written. `files_written` reports the files that
*would* be written (the CLI labels them "to write"), and the output directory
is not created. The guarantee is: **no disk changes**.

## Traceability

On a real generate, the engine writes `hadk.project.yaml` into the project
(profile, project name, startup command, health check, features) and updates
state: `architecture.profile`, `architecture.status = 'generated'`,
`architecture.feature_mapping`, and advances the phase to `build`.

## Helpers

- `slugify(name)` — URL/identifier-safe slug.
- `hashContent(content)` — stable content hash for conflict detection.
- `pascalCase(slug)` — component-name casing.
