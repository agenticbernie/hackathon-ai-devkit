# ADR-007: Canonical Agent Protocol with Thin Adapters

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** HADK maintainers

---

## Context

The harness must work with multiple coding agents (Claude Code, Codex,
OpenCode). Each agent reads instructions from a different file
(`CLAUDE.md`, `AGENTS.md`, etc.). Copying the full operating protocol into each
file guarantees drift.

## Decision Drivers

- One authoritative protocol, regardless of agent.
- Adding an agent should be a small wrapper, not a rewrite.
- `hadk setup` should install the right files for detected agents.

## Considered Options

| Option | Description |
|---|---|
| **A. Full protocol duplicated per agent file** | Independent copies. |
| **B. Canonical protocol file + thin per-agent wrappers** | Wrappers point to the canonical source. |

## Decision Outcome

**Chosen option:** B — canonical protocol with thin adapters.

**Because:** `@hadk/agent-adapters` writes one canonical protocol and a small
wrapper per supported agent that references it. Adding an agent is a new thin
adapter, not a new protocol. `hadk setup` detects installed agents and writes
only the relevant wrappers.

## Consequences

### Positive
- Protocol changes propagate to every agent automatically.
- `supported_agents` is declared per skill in `manifest.yaml`.

### Negative / Trade-offs
- Agents that cannot follow a referenced file get a slightly less rich wrapper.

### Risks
- An agent ignoring the canonical reference; mitigated by embedding the
  essential commands in the wrapper itself.

## Review Checkpoint

**When to revisit:** when supporting an agent with an incompatible instruction
format.
