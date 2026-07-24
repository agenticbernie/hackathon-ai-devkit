# ADR-002: Result<T, E> Error Handling Instead of Exceptions

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

The harness runs unattended through long pipelines (ingest → strategy → idea →
scope → scaffold → video). A thrown exception in the middle of a pipeline
produces a stack trace, not an actionable next step. The mission requires that
"errors are actionable" and that incomplete work is "reported truthfully".

## Decision Drivers

- Every failure must carry a stable machine-readable `code`, a human message,
  optional hints, and optional remediation.
- Callers must be forced to handle failure (no silent swallowing).
- CLI exit codes and validator output must be derived from the same errors.

## Considered Options

| Option | Description |
|---|---|
| **A. Throw/catch exceptions** | Standard JS error throwing. |
| **B. Result<T, E> discriminated union** | `{ ok: true, value } | { ok: false, error }`. |

## Decision Outcome

**Chosen option:** B — a `Result<T, E>` union with a structured `HadkError`.

**Because:** Results make failure explicit at the type level, compose across
package boundaries, and let the CLI/validators render consistent, actionable
messages. Exceptions hide the failure path and make partial-success reporting
harder.

## Consequences

### Positive
- Uniform error shape (`code`, `message`, `hints`, `remediation`) across all
  packages.
- Easy aggregation in `validate all` and honest blocker reporting.

### Negative / Trade-offs
- More verbose call sites (`if (!result.ok) return result;`).

### Risks
- Developers may ignore a returned error; mitigated by code review and the
  narrow `Result` type making the unhandled branch obvious.

## Review Checkpoint

**When to revisit:** never for internal APIs; reconsider only if adopting a
runtime with native effect typing.
