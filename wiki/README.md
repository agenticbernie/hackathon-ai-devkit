# HADK Wiki

**Version: 2.1.6**

HADK is an AI-native competition engineering harness. It turns a competition
brief or startup thesis into structured artifacts, a scoped build, a reliable
demo, and a submission package.

> **v2.1.1** fixes a state-propagation regression where `hadk brief confirm`
> updated `competition/facts.yaml` but left `state.competition` empty. Confirmed
> facts now hydrate the canonical competition state, and `competition_gate` cannot
> pass when required canonical fields remain absent.
>
> **v2.1.2** additionally normalizes deadlines like `September 13, 2026, 23:59:00 ET (Extended)`
> to ISO so `Time remaining` computes correctly for the CTC brief.
>
> **v2.1.4** fixes rich imported idea semantics being discarded by `hadk scope`:
> scope, architecture, and handoff now derive from `core_mechanism`, `solution`,
> `demo_flow`, `wow_moment`, etc., with heuristic fallback preserved.
>
> **v2.1.5** fixes `matchesPattern()` glob corruption (`src/**/attestcoin-batch-pro/**`
> now correctly matches deep paths; forbidden boundaries not weakened).
>
> **v2.1.6** fixes handoff orchestration: `handoff implement` now tracks tasks in
> `state.yaml`, cleans stale packets, and `handoff import` invalidates `build_gate`
> fail-closed; `hadk next` no longer jumps to `demo` with pending tasks.
>
> **v2.1.6** fixes handoff orchestration: tasks are now tracked in `state.yaml`,
> stale packets are cleaned, `build_gate` is invalidated on import/generation,
> and `hadk next` no longer jumps to `demo` with pending tasks.

Choose a workflow:

- [Hackathon](hackathon/README.md): optimize for a working prototype, demo, and submission.
- [Startup](startup/README.md): validate a painful problem before committing to a solution.

## Quick distinction

| Workflow | Primary question | First useful command |
|---|---|---|
| Hackathon | What can we build and demo reliably before the deadline? | `hadk ingest <brief>` |
| Startup | Which painful problem is worth validating before we build? | `hadk startup research ...` |

Both workflows use `.hackathon/` for atomic state and YAML artifacts. Run commands
from the project directory where you want `.hackathon/` created.

## Common commands

```bash
hadk setup
hadk status
hadk next
hadk validate registry
```

The canonical skill registry is `manifest.yaml`. Skills and their JSON contracts
are stored under `skills/` and `schemas/skills/`.

## License

HADK is distributed under the Apache License 2.0. See the repository
[LICENSE](../LICENSE) for the full terms.
