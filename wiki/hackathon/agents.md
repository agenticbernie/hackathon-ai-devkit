# Agents And Handoffs

HADK supports Claude Code, Codex, and OpenCode. `hadk setup` detects agents and
creates thin wrappers around the canonical `HACKATHON.md` protocol.

The protocol tells an agent to:

1. Read `.hackathon/state.yaml`.
2. Inspect persisted artifacts.
3. Run `hadk status` and `hadk next`.
4. Respect gates, checkpoints, deadlines, and non-destructive writes.

For work that requires agent judgment, use the relevant skill under `skills/` and
write the result in the registered schema under `.hackathon/artifacts/`. HADK does
not claim that an agent or provider ran unless an explicit handoff or imported
artifact records that fact.
