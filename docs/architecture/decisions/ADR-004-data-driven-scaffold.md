# ADR-004: Data-Driven Scaffold Profiles

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

`hadk scaffold` must generate an actual, runnable project skeleton — not a
prompt. The mission requires three working profiles
(`web-ai-fullstack`, `web-ai-split`, `blockchain`) and a mechanism that can
grow to more profiles without bespoke generators per stack.

## Decision Drivers

- Generate real files that install and run.
- Never overwrite user-modified files without `--force`.
- Adding a profile should be declarative, not a new code path.
- The generated project must map back to the locked scope features.

## Considered Options

| Option | Description |
|---|---|
| **A. Hand-written generator per stack** | One imperative builder each. |
| **B. Data-driven `ProfileDefinition` + template files** | Profiles declare files and feature mappings. |

## Decision Outcome

**Chosen option:** B — data-driven profiles.

**Because:** A `ProfileDefinition` declares files, feature mappings, startup
command, and health check. The engine interprets the definition, so a new
profile is data plus templates, not new control flow. Content hashing lets the
engine skip identical files and detect conflicts, satisfying the
non-destructive requirement uniformly.

## Consequences

### Positive
- Three profiles share one engine; dry-run, conflict detection, and
  `--force` behave identically for all.
- `hadk.project.yaml` records the profile and feature mapping for traceability.

### Negative / Trade-offs
- Highly irregular stacks may stretch the declarative model.

### Risks
- Template drift from real framework conventions; mitigated by generating a
  health endpoint and startup command that the smoke test can exercise.

## Review Checkpoint

**When to revisit:** when adding a profile that does not fit the file/feature
mapping model.
