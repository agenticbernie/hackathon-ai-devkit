# ADR-001: pnpm Workspace Monorepo with TypeScript Project References

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

HADK 2.0 grows from a flat collection of markdown skills into a working harness
with a CLI, persistent state, validators, a scaffold engine, and a video
pipeline. These concerns have different dependency graphs and release
cadences, but must build and test together as one product.

## Decision Drivers

- Clear package boundaries so each concern can evolve independently.
- A single `pnpm install && pnpm build && pnpm test` must work from a clone.
- No circular dependencies between packages.
- Fast, incremental builds during development.

## Considered Options

| Option | Description |
|---|---|
| **A. Single package** | One `src/` tree, many modules. |
| **B. pnpm workspace monorepo** | `packages/*` with project references. |
| **C. Separate published repos** | One repository per package. |

## Decision Outcome

**Chosen option:** B — pnpm workspace monorepo.

**Because:** It gives strong boundaries and independent `package.json` files
while keeping a single clone/install/build/test loop. Project references give
incremental builds. Separate repos (C) would add release coordination cost far
beyond the project's needs; a single package (A) hides the dependency graph we
explicitly want to enforce.

## Consequences

### Positive
- Eight packages with one-way dependencies: `core` ← `state-store` ←
  `orchestrator` / `scaffold-engine` / `validators` / `hyperframes-adapter` /
  `agent-adapters` ← `cli`.
- `pnpm -r run build` builds in topological order.

### Negative / Trade-offs
- Tests resolve workspace packages via explicit aliases in `vitest.config.ts`
  because the root package does not depend on every `@hadk/*` package.

### Risks
- Accidental cross-package imports could create cycles; mitigated by the
  one-way dependency rule and `validate registry`/build checks.

## Review Checkpoint

**When to revisit:** if a package needs an independent public release cadence.
