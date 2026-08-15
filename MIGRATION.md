# Migration Guide — HADK 1.x (skills) → 2.0 (harness)

HADK 2.0 transforms the project from a **skill-only suite** into an **AI-native
Competition Engineering Harness**. This guide explains what changed and how
existing users are preserved.

**Short version:** if you only use `npx skills add`, nothing breaks. If you
want the new CLI/state/scaffold/video pipeline, install the full harness with
`curl | bash`.

---

## Previous architecture (1.x)

- A flat collection of markdown skills under `skills/`, plus `knowledge/`,
  `playbooks/`, and `templates/`.
- Installed into an agent via `npx skills add agenticbernie/hackathon-ai-devkit`.
- No CLI, no persistent state, no validation, no scaffolding, no video
  pipeline. The agent interpreted the skills directly.

## New architecture (2.0)

- A pnpm workspace monorepo of eight TypeScript packages under `packages/`
  (`core`, `state-store`, `orchestrator`, `scaffold-engine`, `validators`,
  `hyperframes-adapter`, `agent-adapters`, `cli`).
- A `hadk` CLI that drives a gated pipeline with persistent `.hackathon/`
  state, real scaffolding, and a HyperFrames video project.
- A central `manifest.yaml` skill registry with per-skill JSON Schema
  contracts, validated by `hadk validate registry`.
- The original `skills/`, `knowledge/`, `playbooks/`, and `templates/` are
  retained and remain the single source of truth for skills.

See the [architecture overview](docs/architecture/overview.md).

---

## For existing `npx skills add` users

**No action required.** The `skills/` directory is unchanged in location and
purpose, and `npx skills add agenticbernie/hackathon-ai-devkit` continues to
work. New skills were *added*; none were removed or renamed (see
[Changed skill names](#changed-skill-names)).

## For new `curl | bash` users

Install the full harness:

```bash
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/215f0def5e1cfbdb51be9f1ee8b0e075db09fdfe/install.sh | bash
```

Then in a project directory:

```bash
hadk setup
hadk ingest /path/to/brief.md
hadk strategy --mode realistic --taste auto
hadk idea
hadk scope
hadk scaffold --profile web-ai-fullstack
```

See the [README quick start](README.md#5-quick-start) and
[first-hackathon guide](docs/guides/first-hackathon.md).

---

## Changed skill names

**No skill was renamed or removed.** All 1.x skills keep their exact names and
paths. 2.0 only **adds** skills:

| Added skill | Purpose |
|---|---|
| `hackathon-idea-strategy` | Strategy-mode selection (conservative/realistic/futuristic). |
| `hackathon-taste-profiler` | Taste-profile inference and refinement. |
| `startup-customer-evidence` | Startup-contest customer discovery (beta). |
| `startup-market-sizing` | Market sizing (beta). |
| `startup-competitor-mapper` | Competitive mapping (beta). |
| `startup-business-model` | Business model canvas (beta). |
| `startup-pricing-hypothesis` | Pricing hypotheses (beta). |
| `startup-gtm-planner` | Go-to-market planning (beta). |
| `startup-pilot-designer` | Pilot design (beta). |
| `startup-judge-simulator` | Startup pitch simulation (beta). |

Because nothing was renamed, existing agent configurations and references keep
working.

## State initialization

2.0 introduces `.hackathon/` state. It is created **only** when you run
`hadk setup` (or any `hadk` command, which auto-initializes). Existing
projects that never run `hadk` are untouched — there is no automatic migration
of project files, and the installer never creates `.hackathon/` in your
projects.

If you used an earlier 2.0 pre-release with a different `schema_version`,
`hadk` migrates state automatically on load (bumping the version and filling
missing sections from defaults).

## Removed or deprecated paths

**Nothing was deleted.** To preserve existing users, 2.0 favors deprecation
over destructive removal:

- The legacy skill-only layout is still valid and still installed by
  `npx skills add`.
- No public path was removed. New harness output lives in clearly separated
  locations (`packages/`, `manifest.yaml`, `schemas/`, `.hackathon/`,
  `prototype/`, `demo-video/`).

If a future release deprecates a path, it will be announced here and in the
release notes before any removal.

## Compatibility notes

- **Node.js:** the harness requires Node ≥ 20. The standalone skills have no
  runtime requirement.
- **Package manager:** pnpm is recommended; npm works as a fallback.
- **Agents:** Claude Code, Codex, and OpenCode are supported via thin wrappers
  around a canonical `HACKATHON.md`.
- **Skills ↔ harness:** both layers read the same `skills/` tree, so they stay
  in sync. `hadk validate registry` fails if the registry and files drift.
- **State:** `.hackathon/` is project-local and safe to commit or gitignore as
  you prefer; checkpoints make it easy to roll back.

---

## Need help?

- Run `hadk doctor` to diagnose your environment.
- Run `hadk validate all` inside a project to see gate status.
- Read the [docs](docs/architecture/overview.md) and the
  [ADRs](docs/architecture/decisions/).
