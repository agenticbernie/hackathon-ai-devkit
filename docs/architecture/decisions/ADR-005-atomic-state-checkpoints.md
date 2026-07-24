# ADR-005: Atomic YAML State with Backups and Checkpoints

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

`.hackathon/state.yaml` is the harness's single source of truth. A crash or a
bad write mid-pipeline must never leave it half-written or unreadable, because
the whole point of the harness is that a session can resume.

## Decision Drivers

- A crash during write must not corrupt state.
- Users must be able to roll back to a known-good phase.
- State must be human-readable and diffable (YAML).

## Considered Options

| Option | Description |
|---|---|
| **A. In-place YAML writes** | Overwrite `state.yaml` directly. |
| **B. Atomic temp+rename with `.bak` and checkpoints** | Write temp, rename, keep backup + named checkpoints. |
| **C. SQLite database** | Binary store. |

## Decision Outcome

**Chosen option:** B — atomic writes plus checkpoints.

**Because:** Writing to a temp file and renaming is atomic on POSIX, so a
crash never yields a partial file. Keeping `state.yaml.bak` and explicit
checkpoints gives cheap rollback (`hadk rollback`). YAML keeps state readable
and reviewable. SQLite (C) would hide state from users and add a dependency.

## Consequences

### Positive
- Corruption-resistant writes; `load()` distinguishes `YAML_PARSE_ERROR`
  (unparseable) from `STATE_CORRUPTED` (structurally invalid).
- Schema migration runs on load, bumping `schema_version` and filling missing
  sections from defaults.

### Negative / Trade-offs
- Extra disk churn from backups (acceptable for a config-sized file).

### Risks
- Filesystem without atomic rename; mitigated by targeting POSIX/macOS/Linux
  developer machines.

## Review Checkpoint

**When to revisit:** if state grows large or needs concurrent writers.
