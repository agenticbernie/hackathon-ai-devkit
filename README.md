# Hackathon AI DevKit (HADK)

**Version: 2.1.4**

> **Competition Delivery Control Plane for teams and coding agents.**

HADK helps a team move from a competition brief to reviewed requirements,
strategy, explicit idea selection, locked MVP scope, architecture, an
agent-compatible handoff, real build/demo verification, and a local
submission package. It is not an autonomous winning-project generator,
generic application generator, multi-agent runtime, video renderer, startup
research platform, or automatic submission bot.

---

## 1. Product definition

HADK takes a competition brief (a URL or a markdown file) and drives a
disciplined pipeline from idea to submission:

```text
    brief → review → strategy → idea selection → scope → architecture
    → handoff → real verification → demo verification → package review

Startup discovery can run independently of `selected-idea`:

    research pain → deep dive → validation plan → customer evidence

With opportunity ranking:

    research source → scorecard → deep dive → validation plan → customer evidence
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
  protocol and machine-checkable artifacts to operate with explicit approvals.
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
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/v2.1.4/install.sh | bash
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
hadk brief show
hadk brief confirm competition_name
hadk strategy --mode balanced --taste auto
hadk idea
hadk idea select <candidate-id>
hadk scope
hadk architecture plan
hadk handoff implement --agent claude-code
hadk verify build
hadk verify demo
hadk package submission
hadk status
hadk package review
```

Then build and run the generated prototype:

```bash
cd prototype && pnpm install && pnpm dev
```

A full walkthrough lives in
[docs/guides/first-hackathon.md](docs/guides/first-hackathon.md).

For task-oriented user documentation, see the [HADK wiki](wiki/README.md),
including separate [hackathon](wiki/hackathon/README.md) and
[startup](wiki/startup/README.md) sections.

## 6. Three strategy modes

`hadk strategy --mode <mode>` reweights decision aids. Scores include rationale
and confidence and are not objective truth:

| Mode | Wins on | Use when |
|---|---|---|
| `execution-first` | Execution & reliability | Short time, risky integrations. |
| `balanced` | Value, fit, and proof | Default planning when evidence is mixed. |
| `differentiation-first` | Memorability with proof | A demonstrated mechanism can support it. |

Each mode's scoring weights always sum to 1.0 (validated). See
[docs/guides/strategy-modes.md](docs/guides/strategy-modes.md).

## 7. Taste profiles

A taste profile biases idea generation toward technologies and traits that fit
the team and the rubric. `--taste auto` infers it from state (team skills,
strategy mode, competition type); `--taste user` lets you supply your own. The
`hackathon-taste-profiler` skill refines it further.

## 8. Scope-driven scaffold

`hadk scope` locks an MVP contract: acceptance criteria, owners, hour budgets,
fallbacks, demo steps, verification methods, cut-list, reset/seed strategy,
and explicit risk/buffer budgets. `hadk architecture plan` then records system
boundaries and verification strategy. The old `hadk scaffold` command remains
deprecated experimental functionality and is not the v2.1 core path.
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
| `hadk ingest <source>` | Capture a brief as untrusted data and extract reviewable facts. |
| `hadk brief review` | Show facts, excerpts, confidence, and blockers. |
| `hadk brief confirm <field>` | Confirm one fact as explicit user evidence. |
| `hadk brief reject <field>` | Reject one fact without altering the raw source. |
| `hadk configure` | Update team and competition configuration. |
| `hadk strategy` | Select strategy mode and taste profile. |
| `hadk idea` | Generate unverified heuristic drafts or export an agent handoff. |
| `hadk idea select <id>` | Explicitly select a reviewed candidate. |
 | `hadk startup research` | Map market pain points before solution ideation. |
| `hadk startup scorecard` | Rank pain points with transparent 1–5 evidence-aware scores. |
| `hadk startup deep-dive <id>` | Investigate one pain point and seek disconfirming evidence. |
| `hadk startup validate` | Create a falsifiable validation plan. |
| `hadk startup status [--json]` | Show startup discovery artifacts, blockers, and next action. |
| `hadk startup next` | Recommend the next valid startup discovery action. |
| `hadk startup adapt-hackathon` | Map hackathon skills to startup workflows. |
| `hadk scope` | Create and lock the MVP scope (`--unlock` to reopen). |
| `hadk architecture plan` | Create the architecture contract. |
| `hadk handoff implement` | Export canonical context and typed task packets. |
| `hadk handoff import <file>` | Import an agent-reported result without claiming verification. |
| `hadk scaffold` | Deprecated experimental scaffold generation. |
| `hadk status` | Show phase, gates, deadline mode, and next action (`--json`). |
| `hadk next` | Print the single correct next command. |
| `hadk checkpoint` | Snapshot state (`--label`). |
| `hadk rollback` | Restore a checkpoint. |
| `hadk replan` | Unlock scope and re-plan (`--reason`). |
| `hadk validate [target]` | Run structural and evidence checks. |
| `hadk verify build` | Actually install, typecheck, test, build, start, and healthcheck. |
| `hadk verify demo` | Run the configured demo journey or record human attestation. |
| `hadk video <plan\|generate\|preview\|render\|validate>` | HyperFrames demo-video pipeline. |
| `hadk judge` | Prepare judge Q&A artifacts. |
| `hadk package submission` | Assemble a requirements-driven local package. |
| `hadk package review` | Review mandatory evidence and blockers. |
| `hadk package export` | Export the package locally; no external submission occurs. |
| `hadk doctor` | Diagnose the environment. |
| `hadk update` | Show how to update the installation. |

## 11. Optional video planning

The v2.1 core uses a demo video plan, storyboard markdown, and asset checklist.
`hadk video generate` is a deprecated optional HyperFrames integration and does
not advance a v2.1 package gate. A zero-byte or merely present MP4 is never
accepted as evidence.

`hadk video generate` produces a legacy `demo-video/` project: a storyboard
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

- Heuristic ideas and fact extraction are reviewable starting points, not
  confirmed competition truth or a replacement for team judgment.
- Rendering a demo MP4 requires the external HyperFrames CLI; without it, only
  the (valid, previewable) composition is produced.
- Startup-contest skills remain available but are outside the v2.1 core path.
- Startup scorecards are prioritization tools, not proof of product-market fit. Missing evidence and confidence are retained in every score.
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
- Real venture research integrations with human-reviewed source extraction.

Explicitly outside the v2.1 core path: autonomous multi-agent execution,
universal scaffold profiles, HyperFrames rendering, startup research, and
automatic external submission.
- A marketplace distribution channel for skills.

---

## License

Apache License 2.0 — see [LICENSE](LICENSE).
