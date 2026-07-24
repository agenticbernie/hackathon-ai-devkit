# Guide: Agent Adapters

HADK works with multiple coding agents through a single canonical protocol and
thin per-agent wrappers ([ADR-007](../architecture/decisions/ADR-007-canonical-agent-protocol.md)).

## Supported agents

| Agent | Detected via | Wrapper |
|---|---|---|
| Claude Code | `.claude/` dir or `claude` on PATH | `.claude/HACKATHON.md` |
| Codex | `.codex/` dir or `codex` on PATH | `.codex/HACKATHON.md` |
| OpenCode | `.agents/` dir or `opencode` on PATH | `.agents/HACKATHON.md` |

`SUPPORTED_AGENTS` in `@hadk/core` is the authoritative list, and each skill in
`manifest.yaml` declares its own `supported_agents`.

## What `hadk setup` writes

`@hadk/agent-adapters` `install()` writes:

```text
HACKATHON.md            # canonical protocol — the single source of truth
AGENTS.md               # generic entry point referencing HACKATHON.md
.claude/HACKATHON.md    # thin wrapper → references ../../HACKATHON.md
.codex/HACKATHON.md     # thin wrapper → references ../HACKATHON.md
.agents/HACKATHON.md    # thin wrapper → references ../HACKATHON.md
```

The wrappers are deliberately small: they point the agent back to the canonical
`HACKATHON.md` and embed only the essential commands. Protocol changes are made
once, in `HACKATHON.md`, and propagate to every agent.

## Detection

`detectAgents()` reports which agents are present (config directory or CLI on
PATH). `hadk setup` prints the detected agents and writes the relevant
wrappers. The result is `{ files_written, detected_agents }`.

## Managed-file safety

Wrappers are written via a managed-write helper: HADK only overwrites files it
recognizes as its own, so a user-customized agent config is not clobbered.

## Adding a new agent

1. Add the agent id to `SUPPORTED_AGENTS` in `@hadk/core`.
2. Add a thin wrapper generator in `@hadk/agent-adapters` that references
   `HACKATHON.md`.
3. Add detection logic to `detectAgents()`.
4. List the agent in each relevant skill's `supported_agents` in
   `manifest.yaml`, then run `hadk validate registry`.

The canonical protocol itself does not change when you add an agent.
