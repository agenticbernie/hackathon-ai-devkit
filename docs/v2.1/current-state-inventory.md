# HADK v2.1 Current-State Inventory

## Baseline

The repository is a pnpm TypeScript monorepo. The baseline on 2026-08-15 is:

- `pnpm build`: passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm test`: passed, 90 tests

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
