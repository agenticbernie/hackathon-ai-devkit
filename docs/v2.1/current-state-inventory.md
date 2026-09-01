# HADK v2.1 Current-State Inventory

## Baseline

The repository is a pnpm TypeScript monorepo. The baseline on 2026-09-01 (v2.1.6) is:

- `pnpm build`: passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm test`: passed, 124 tests (including `tests/competition-propagation.test.ts` + `tests/rich-scope.test.ts` + `tests/agent-bridge-glob.test.ts` + `tests/handoff-orchestration.test.ts`)
- `pnpm validate` (registry): passed, 35 skills, 13 schemas

### v2.1.6 delta (2026-09-01)

- **Handoff orchestration**: `handoff implement` now tracks `delivery.tasks` deterministically
  (`task-{feature}-{scopeVersion}`), cleans stale `generated/handoff/tasks/*.yaml`, and
  invalidates `build_gate` on new generation. `handoff import` now updates the
  canonical task to `done`/`blocked`/`in_progress`, reconstructs tasks if `tasks: []`,
  invalidates `build_gate` (fail-closed), and ensures `phase` stays `build` while
  tasks are pending. `Orchestrator` and `validators` now block `build`/`demo` when
  tasks are pending or `build_gate` is stale, and `hadk next` correctly stays in
  `build` (`handoff import`/`verify build`) instead of incorrectly advancing to
  `demo`. Added `tests/handoff-orchestration.test.ts` (5 tests) for full lifecycle.

### v2.1.5 delta (2026-09-01)

- **Agent-bridge glob**: `matchesPattern()` now uses placeholder-based glob-to-regex to avoid
  sequential `*` replacement corrupting `**/` fragments (`src/**/attestcoin-batch-pro/**`
  now correctly matches `src/app/api/attestcoin-batch-pro/route.ts`). Added
  `tests/agent-bridge-glob.test.ts` (8 tests).

### v2.1.4 delta (2026-09-01)

- **Rich idea → scope**: `hadk scope` now derives MVP contract from imported idea's
  `core_mechanism`, `solution`, `demo_flow`, `wow_moment`, `build_plan_summary`,
  `critical_dependencies`, `fallbacks`, `failure_modes` instead of generic placeholders.
  `hadk architecture plan` now consumes concrete scope; `hadk handoff implement`
  preserves rich semantics for coding agents. Heuristic ideas remain compatible via fallback.

### v2.1.3 delta (2026-09-01)

- Installer now accepts `vX.Y.Z` tags and defaults to `v2.1.3`; `curl …/v2.1.3/install.sh | bash`
  correctly installs `v2.1.3` (previously `v2.1.2` installer pointed to old hash and installed `2.1.0`).

### v2.1.2 delta (2026-09-01)

- Deadline ` ET (Extended)` suffix (CTC brief) now normalized to ISO so
  `remainingHours()` computes `Time remaining: 292.9h` instead of `(unknown)`.

### v2.1.1 delta (2026-09-01)

- Fixed `hadk brief confirm` state propagation: `hydrateCompetitionState()` now
  populates `state.competition` from `competition/facts.yaml` (comma-separated
  tracks, single/multi judging criteria with `user-provided` provenance,
  `deadline` vs. `remaining_hours`). `competition_gate` now requires canonical
  `name` + `tracks` + `judging_criteria` + `deadline`/`remaining_hours` and
  cannot pass while canonical state remains absent (migration downgrades stale
  `passed` gates). `orchestrator` and `hadk ingest` updated to use the same
  hydration.

The previous baseline on 2026-08-15 was:

## Existing packages

| Package | Current responsibility | v2.1 disposition |
|---|---|---|
| `core` | Types, constants, YAML utilities, `Result` | Keep and extend with contracts, evidence, status vocabulary, and safe paths |
| `state-store` | `.hackathon` state, atomic writes, checkpoints, artifacts | Keep; add migration metadata, evidence persistence, confinement |
| `orchestrator` | Phases, deadline policy, next action, replan | Keep; consume validators and expose honest status |
| `scaffold-engine` | Profile-driven project generation | Keep only as deprecated experimental support; remove it from the primary handoff path |
| `validators` | Registry and phase validators | Keep; replace structural build/demo/video assumptions with evidence-backed gates |
| `agent-adapters` | Canonical agent instruction wrappers | Keep and evolve into agent-compatible handoff, not execution |
| `hyperframes-adapter` | Video project generation/rendering | Keep as optional legacy integration, not a v2.1 core gate |
| `cli` | Commander wiring and domain-heavy handlers | Keep the CLI surface; move new domain logic into packages |

## Existing command surface

The current CLI includes setup, ingest, configure, strategy, idea, scope,
scaffold, status, next, checkpoint, rollback, replan, validate, demo, video,
judge, submit, doctor, update, and startup discovery commands.

v2.1 adds `brief review|confirm|reject|show`, `architecture plan`,
`handoff implement|import`, `verify build|demo`, and `package submission|review|export`.
Legacy commands remain available with deprecation notices where their semantics
are no longer the v2.1 core path.

## False-positive findings

1. Brief ingestion fetches URLs without SSRF, content-size, content-type, or redirect controls.
2. Missing rubric data can still leave an incomplete competition artifact without a first-class blocker.
3. Heuristic ideas are automatically selected and can pass the idea gate.
4. Scope features do not require acceptance criteria, owners, verification methods, or budget buckets.
5. Architecture is represented primarily as a scaffold profile.
6. Agent prompt export and agent result import are not a canonical task-packet protocol.
7. `validateBuild()` checks `node_modules` existence and never executes install, typecheck, test, build, startup, or healthcheck.
8. `hadk demo` promotes a documented flow to validated without executing it or recording human attestation.
9. Video status is part of the primary route even though v2.1 only requires a video plan and optional media evidence.
10. Submission status is not requirement-driven and can mark missing artifacts complete.

## v2.1 core boundaries

The core product is a control plane for evidence-backed delivery:

```text
brief → reviewed facts → strategy → explicitly selected idea → locked scope
→ architecture plan → agent-compatible handoff → real verification
→ demo verification → requirements-driven package
```

It is not an autonomous agent runtime, generic application generator, video
renderer, startup research suite, or automatic external submission bot.
