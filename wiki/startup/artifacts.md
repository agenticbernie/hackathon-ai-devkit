# Startup Artifacts

Startup artifacts are stored under:

```text
.hackathon/artifacts/startup-discovery/
```

| Artifact | Meaning |
|---|---|
| `pain-point-research.yaml` | Candidate pains, workflows, assumptions, gaps, and source provenance. |
| `opportunity-scorecard.yaml` | Transparent opportunity ranking and missing evidence. |
| `pain-point-deep-dive.yaml` | One pain point with buyer analysis and disconfirming evidence. |
| `validation-plan.yaml` | Falsifiable hypotheses and test decision rules. |
| `hackathon-adapter.yaml` | Mapping from hackathon skills to startup workflows. |
| `agent-handoffs/` | Claude Code and Codex research prompt packages. |

The startup section of `.hackathon/state.yaml` stores lightweight statuses and
artifact pointers. Status is primarily derived from artifact existence so manually
reviewed or imported artifacts remain usable.

## Evidence labels

- `direct_user_evidence`: observed or recorded directly from users.
- `secondary_research`: sourced external research with provenance.
- `market_signal`: a traceable market or behavioral signal.
- `founder_observation`: founder-provided observation.
- `inference`: reasoning derived from evidence.
- `hypothesis`: unvalidated assumption.

Never upgrade a hypothesis to direct evidence without a source and provenance.
