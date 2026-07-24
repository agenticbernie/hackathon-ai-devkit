# ADR-006: Honest Render Reporting for the Video Pipeline

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

`hadk video generate` produces a complete HyperFrames project (storyboard,
asset manifest, HTML composition). Actually rendering an MP4 requires the
external HyperFrames CLI, which may not be installed in CI or on a user's
machine. The mission forbids claiming success for actions that did not run.

## Decision Drivers

- Generation must always succeed and be inspectable, even without the CLI.
- Render status must never be faked.
- The composition must remain valid and previewable regardless of rendering.

## Considered Options

| Option | Description |
|---|---|
| **A. Fail generation if the CLI is missing** | Hard dependency on HyperFrames. |
| **B. Generate always; report render status honestly** | `render_status` ∈ {not_attempted, blocked, rendered}. |

## Decision Outcome

**Chosen option:** B — generate always, report render status truthfully.

**Because:** The storyboard and composition are valuable, reviewable artifacts
on their own. When the CLI is absent, `render_status` is `blocked` with a
`render_blocker` explaining exactly what is missing, so users are never
misled. This satisfies the "report truthfully" requirement directly.

## Consequences

### Positive
- `hadk video generate` works offline and in CI; `validate video` checks the
  generated project structure.
- Clear, actionable blocker messages instead of silent failure.

### Negative / Trade-offs
- A rendered MP4 still requires installing the HyperFrames CLI.

### Risks
- Users may expect an MP4 from `generate`; mitigated by explicit messaging and
  a separate `hadk video render` command.

## Review Checkpoint

**When to revisit:** if HyperFrames becomes a bundled dependency.
