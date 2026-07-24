# Hackathon AI DevKit (HADK)

**Version: 2.0.4**

> **Turn any competition brief into a winning strategy, scoped prototype,
> executable project scaffold, reliable demo, and submission-ready package.**

HADK is an **AI-native Competition Engineering Harness**. It is not a folder of
prompts: it is a working CLI (`hadk`) with persistent state, validation gates,
a real scaffold engine, a demo-video pipeline, and multi-agent support — plus
the original standalone skills that started the project.

---

## 1. Product definition

HADK takes a competition brief (a URL or a markdown file) and drives a
disciplined pipeline from idea to submission:

```text
ingest → strategy → idea → scope → scaffold → build → demo → video → judge → submission
```

At every step it produces **real artifacts** (YAML contracts and actual project
files), enforces **quality gates**, and reports progress and blockers
truthfully. It is built for time-boxed competitions where the demo must work
and the submission must ship.

## 2. Who it is for

- **Hackathon teams** that want a repeatable process instead of a panicked
  free-for-all.
- **Solo builders** who need scope discipline and a reliable demo path.
- **AI coding agents** (Claude Code, Codex, OpenCode) that need a structured
  protocol and machine-checkable artifacts to operate autonomously.
- **Mentors and organizers** who want a transparent, inspectable workflow.

## 3. Standalone skills vs. full harness

HADK ships in two layers that share **one source of truth** (`skills/` +
`manifest.yaml`):

| Layer | Install | You get |
|---|---|---|
| **Standalone skills** | `npx skills add agenticbernie/hackathon-ai-devkit` | The markdown skills only, dropped into your agent. No CLI, no state. |
| **Full harness** | `curl -fsSL .../install.sh \| bash` | The `hadk` CLI, persistent state, validators, scaffold engine, video pipeline, and the same skills. |

Existing `npx skills add` users are fully preserved. The skills are never
duplicated, so the two layers cannot drift apart. `hadk validate registry`
verifies the registry against the files on disk.

## 4. One-command installation

```bash
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/main/install.sh | bash
```

The installer is **idempotent** and **non-destructive**: it detects Node ≥ 20,
your package manager, git, and installed agents; installs to `~/.hadk`; builds;
creates a `hadk` launcher; and validates the result before printing the next
command. See the [installer & security guide](docs/guides/installer-security.md).

## 5. Quick start

```bash
mkdir my-competition && cd my-competition
hadk setup --team-size 3 --team-skills "ai,fullstack,design"
hadk ingest /path/to/brief.md
hadk strategy --mode futuristic --taste auto
hadk idea
hadk scope
hadk scaffold --profile web-ai-fullstack
hadk status
hadk validate all
hadk video generate
```

Then build and run the generated prototype:

```bash
cd prototype && pnpm install && pnpm dev
```

A full walkthrough lives in
[docs/guides/first-hackathon.md](docs/guides/first-hackathon.md).

## 6. Three strategy modes

`hadk strategy --mode <mode>` reweights idea scoring toward a winning
philosophy:

| Mode | Wins on | Use when |
|---|---|---|
| `conservative` | Execution & reliability | Short time, risky integrations. |
| `realistic` | Value & polish | General hackathons, balanced rubric. |
| `futuristic` | Vision & memorability | AI/infra events where being remembered matters. |

Each mode's scoring weights always sum to 1.0 (validated). See
[docs/guides/strategy-modes.md](docs/guides/strategy-modes.md).

## 7. Taste profiles

A taste profile biases idea generation toward technologies and traits that fit
the team and the rubric. `--taste auto` infers it from state (team skills,
strategy mode, competition type); `--taste user` lets you supply your own. The
`hackathon-taste-profiler` skill refines it further.

## 8. Scope-driven scaffold

`hadk scope` locks an MVP contract: a core demo flow, MVP features (each
justified by demo or rubric, with hour estimates and fallbacks), deferred
features, a primary wow moment, external dependencies with fallbacks, and a
time budget. `hadk scaffold` then generates an **actual project** from that
locked scope using a data-driven profile
([ADR-004](docs/architecture/decisions/ADR-004-data-driven-scaffold.md)).

Three profiles are implemented: `web-ai-fullstack`, `web-ai-split`, and
`blockchain`. Scaffolding refuses to run on an unlocked scope, previews with
`--dry-run`, and never overwrites user-modified files without `--force`.

## 9. Persistent state

All state lives in `.hackathon/`
([state model](docs/architecture/state-model.md)). Writes are atomic
(temp + rename + `.bak`), so a crash never corrupts state and a session can
always resume. Schema migration runs on load. Checkpoints
(`hadk checkpoint`) and rollback (`hadk rollback`) let you recover from bad
turns. Phase-keyed artifacts (competition, strategy, ideas, scope, demo, pitch,
submission) are persisted alongside state.

## 10. CLI reference

| Command | Description |
|---|---|
| `hadk setup` | Initialize `.hackathon/`, detect environment, install agent adapters. |
| `hadk ingest <source>` | Ingest a brief from a URL or file. |
| `hadk configure` | Update team and competition configuration. |
| `hadk strategy` | Select strategy mode and taste profile. |
| `hadk idea` | Generate, score, rank, and select candidate ideas. |
| `hadk scope` | Create and lock the MVP scope (`--unlock` to reopen). |
| `hadk scaffold` | Generate a project scaffold (`--profile`, `--dry-run`, `--force`). |
| `hadk status` | Show phase, gates, deadline mode, and next action (`--json`). |
| `hadk next` | Print the single correct next command. |
| `hadk checkpoint` | Snapshot state (`--label`). |
| `hadk rollback` | Restore a checkpoint. |
| `hadk replan` | Unlock scope and re-plan (`--reason`). |
| `hadk validate [target]` | Run validation gates (`state\|registry\|scope\|scaffold\|video\|all\|…`). |
| `hadk demo` | Validate and prepare the demo path. |
| `hadk video <plan\|generate\|preview\|render\|validate>` | HyperFrames demo-video pipeline. |
| `hadk judge` | Prepare judge Q&A artifacts. |
| `hadk submit` | Assemble the submission package. |
| `hadk doctor` | Diagnose the environment. |
| `hadk update` | Show how to update the installation. |

## 11. HyperFrames video workflow

`hadk video generate` produces a complete `demo-video/` project: a storyboard
derived from the demo flow, an asset manifest (with honest
available/missing/placeholder statuses), and an HTML/CSS/JS composition you can
preview in a browser. Rendering to MP4 requires the HyperFrames CLI; if it is
absent, the render is reported as `blocked` — never faked
([ADR-006](docs/architecture/decisions/ADR-006-honest-render-reporting.md)).
See [hyperframes-integration](docs/architecture/hyperframes-integration.md).

## 12. Supported agents

HADK writes one canonical protocol (`HACKATHON.md`) plus thin wrappers for each
detected agent: **Claude Code** (`.claude/`), **Codex** (`.codex/`), and
**OpenCode** (`.agents/`). Protocol changes propagate to every agent
automatically ([ADR-007](docs/architecture/decisions/ADR-007-canonical-agent-protocol.md)).
See [agent-adapters guide](docs/guides/agent-adapters.md).

## 13. Architecture overview

HADK is a pnpm workspace monorepo of eight TypeScript packages with one-way
dependencies: `core` → `state-store` → `orchestrator` / `scaffold-engine` /
`validators` / `hyperframes-adapter` / `agent-adapters` → `cli`. Errors use a
`Result<T,E>` type so every failure is actionable. Read the
[architecture overview](docs/architecture/overview.md) and the
[ADRs](docs/architecture/decisions/).

## 14. Competition types

HADK models three competition types, inferred from the brief and reflected in
state and scope:

- **`hackathon`** — time-boxed build competitions (the default).
- **`buildathon`** — build-focused events.
- **`startup-contest`** — adds business-model, market-sizing, GTM, pricing, and
  investor-readiness skills (beta). See
  [playbooks/startup-contest-playbook.md](playbooks/startup-contest-playbook.md).

## 15. Safety and non-destructive behavior

- Scaffolding never overwrites user-modified files without `--force`; identical
  files are skipped, conflicts are reported.
- State writes are atomic with backups; checkpoints enable rollback.
- The installer is idempotent, backs up unmanaged launchers, and never touches
  project `.hackathon/` state.
- Uninstall moves the install aside rather than deleting it.
- Incomplete work (e.g., an unrendered video) is reported truthfully, never as
  a false success.

## 16. Current limitations

- Idea generation and brief parsing use deterministic heuristics; the coding
  agent refines artifacts using the corresponding skills. They are a starting
  point, not a replacement for team judgment.
- Rendering a demo MP4 requires the external HyperFrames CLI; without it, only
  the (valid, previewable) composition is produced.
- Startup-contest skills are beta.
- The installer targets POSIX/macOS/Linux developer machines with Node ≥ 20.
- Skill counts and metadata are validated against `manifest.yaml` by
  `hadk validate registry` rather than hardcoded here, so they cannot silently
  drift.

## 17. Development instructions

```bash
git clone https://github.com/agenticbernie/hackathon-ai-devkit.git
cd hackathon-ai-devkit
pnpm install
pnpm build      # builds all packages in topological order
pnpm test       # runs the vitest suite (unit + integration + fixture e2e)
pnpm validate   # validates the skill registry against the files on disk
```

Packages live under `packages/*`; tests under `tests/`. Tests run against the
built `dist`, so `pnpm build` must precede `pnpm test`.

## 18. Roadmap

- More scaffold profiles (mobile, data/ML, full-stack + DB).
- Live brief fetching with structured extraction (beyond heuristics).
- Real HyperFrames rendering integration and asset auto-capture.
- CI templates that run the full fixture competition on every PR.
- Promotion of startup-contest skills from beta to stable.
- A marketplace distribution channel for skills.

---

## License

MIT — see [LICENSE](LICENSE).
