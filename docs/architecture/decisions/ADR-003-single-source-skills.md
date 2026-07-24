# ADR-003: One Source of Truth for Skills with Dual Distribution

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

HADK must keep supporting the existing standalone flow
(`npx skills add agenticbernie/hackathon-ai-devkit`) while adding a full
harness installed via `curl | bash`. The mission forbids breaking existing
users and forbids maintaining two divergent copies of the same skills.

## Decision Drivers

- Existing `npx skills add` users must keep working unchanged.
- The harness and the standalone skills must never drift apart.
- Skill metadata (inputs/outputs/dependencies) must be machine-checkable.

## Considered Options

| Option | Description |
|---|---|
| **A. Duplicate skills into the harness** | Two copies, manually synced. |
| **B. Single `skills/` tree + `manifest.yaml` registry** | One source, two installers read it. |

## Decision Outcome

**Chosen option:** B — a single `skills/` directory described by one
`manifest.yaml` registry.

**Because:** Both install layers read the same `skills/` tree, so they cannot
drift. `manifest.yaml` records each skill's phase, schemas, dependencies, and
supported agents, and `hadk validate registry` verifies the registry against
the files on disk. Duplication (A) guarantees eventual divergence.

## Consequences

### Positive
- 30 skills registered once; `validate registry` fails on any drift.
- Per-skill JSON Schema input/output contracts generated under `schemas/skills/`.

### Negative / Trade-offs
- Adding a skill requires updating both `skills/<name>/SKILL.md` and
  `manifest.yaml` (enforced by the registry validator).

### Risks
- Manifest/files mismatch; mitigated by `hadk validate registry` in CI/tests.

## Review Checkpoint

**When to revisit:** if a third distribution channel (e.g., a marketplace) is
added.
