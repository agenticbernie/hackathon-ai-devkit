# State Model

The harness keeps all durable state under a single `.hackathon/` directory in
the project root. State is the source of truth for phase, gates, scope, and
delivery progress, so a session can always resume. See
[ADR-005](./decisions/ADR-005-atomic-state-checkpoints.md).

## Directory layout

```text
.hackathon/
├── state.yaml            # canonical state (atomic writes)
├── state.yaml.bak        # backup from the previous write
├── config.yaml           # local configuration
├── artifacts/            # persisted, phase-keyed outputs
│   ├── competition/      #   competition.yaml, raw-source.md
│   ├── strategy/         #   strategy.yaml
│   ├── ideas/            #   candidates.yaml, selected.yaml
│   ├── scope/            #   scope.yaml
│   ├── demo/             #   demo-checklist.yaml
│   ├── pitch/            #   judge-prep.yaml
│   └── submission/       #   submission.yaml
├── checkpoints/          # named state snapshots for rollback
├── logs/                 # append-only event log
├── context/              # gathered context for agents
├── evidence/             # screenshots / proof for the submission
└── generated/            # harness-generated metadata
```

## `state.yaml` sections

| Section | Purpose |
|---|---|
| `schema_version` | Schema version; migrated on load. |
| `competition` | Name, type, source URL, tracks, judging criteria, sponsor requirements, deadline, remaining hours. |
| `team` | Size and skills (drives taste inference). |
| `strategy` | Mode, taste source, idea taste, scoring profile, selected track, selected idea. |
| `scope` | Status (`locked`/`unlocked`), MVP features, deferred features, demo flow, primary wow moment, external dependencies. |
| `architecture` | Scaffold profile, status, feature mapping. |
| `delivery` | Current phase, demo status, video status, submission status, autonomous mode. |
| `gates` | Per-phase gate statuses (`competition_gate` … `submission_gate`). |

`CompetitionType` is one of `hackathon | buildathon | startup-contest`.

## Atomic writes

Every save writes to a temporary file and renames it into place, so a crash
never leaves a partial `state.yaml`. The previous file is preserved as
`state.yaml.bak`.

## Corruption handling

`load()` distinguishes two failure modes:

- `YAML_PARSE_ERROR` — the file is not parseable YAML.
- `STATE_CORRUPTED` — the file parses but lacks required structure
  (`schema_version` / `gates`).

Both return actionable errors with remediation hints (roll back or re-init)
instead of crashing.

## Schema migration

On load, `migrateState` bumps an older `schema_version` to the current one and
fills any missing top-level sections from defaults. Migration is persisted
automatically and logged.

## Checkpoints and rollback

- `hadk checkpoint [--label <label>]` snapshots the current state and phase.
- `hadk rollback [checkpointId]` restores the last (or a named) checkpoint.
- Checkpoint history is preserved across rollbacks.

## Artifacts

Artifacts are phase-keyed YAML outputs written via
`store.writeArtifact(phase, name, data)` and read via
`store.readArtifact(phase, name)`. Unlike `state.yaml`, artifacts are
append-style deliverables (the full idea ranking, the locked scope contract,
the judge prep, etc.) that the submission package references.
