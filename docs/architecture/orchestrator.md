# Orchestrator

`@hadk/orchestrator` is the brain of the harness. It owns the phase/gate model,
idea scoring, deadline-aware execution policy, the status report, and the
next-action engine. It never mutates state directly except through the
state-store; it reads state and tells the CLI what is true and what to do next.

## Phases and gates

The delivery pipeline has 13 phases:

```text
setup → competition-intelligence → strategy → idea → scope →
architecture → scaffold → build → demo → video → judge → submission → complete
```

Gated phases require their gate to pass before advancing:

| Gate | Guards |
|---|---|
| `competition_gate` | A brief was ingested with at least one track. |
| `idea_gate` | Exactly one idea is selected. |
| `scope_gate` | A locked, validated MVP scope exists. |
| `architecture_gate` | A scaffold profile is selected. |
| `build_gate` | The prototype builds. |
| `demo_gate` | The demo path is validated. |
| `video_gate` | A valid video project exists. |
| `submission_gate` | The submission package is ready. |

`checkGate(state, phase)` returns `{ passed, issues }` with actionable issue
strings.

## Idea scoring

`scoreIdea(scores, weights)` computes a weighted total:

- Each axis score is clamped to `0–10`.
- Missing axes default to `5` (neutral), so an incomplete breakdown still
  ranks sensibly.
- Returns `{ breakdown, total }`.

`validateScoringProfile(mode, weights)` rejects a profile whose weights do not
sum to `1.0`.

## Strategy modes and scoring weights

Each mode reweights the same idea axes to a different philosophy:

| Mode | Emphasis |
|---|---|
| `conservative` | Build feasibility, demo reliability, rubric alignment. |
| `realistic` | Problem value, rubric alignment, differentiation, demo strength. |
| `futuristic` | Future-thesis strength, memorability, technical credibility, core-mechanism proof. |

## Deadline-aware execution

`getDeadlineMode(state)` maps remaining hours to an execution mode using
`DEADLINE_THRESHOLDS`:

| Remaining | Mode | Intent |
|---|---|---|
| ≥ 24h | `full` | Everything. |
| 12–24h | `fast` | Skip nice-to-haves. |
| 6–12h | `demo_first` | Protect the demo path. |
| 3–6h | `freeze_scope` | No new scope. |
| 1–3h | `no_new_features` | Polish only. |
| 0–1h | `submission_only` | Package and submit. |

`getDeadlinePolicy(state)` returns the mode plus its `allowed_operations` and
`restrictions` from `DEADLINE_POLICIES`. A missing deadline is treated as
`full` (no false panic).

## Status and next action

- `getStatus(state)` returns a `StatusReport`: competition, time remaining,
  deadline mode, strategy mode, selected idea, `current_phase`, current gate,
  MVP completion, critical risks, demo/video/submission status, and the next
  action.
- `getNextAction(state)` inspects real state and returns the single correct
  next command (`NextAction` with `command`, `description`, `phase`,
  `blocked_by`, `deadline_mode`).
- `replan(state, reason)` unlocks the scope and records the reason so the team
  can re-scope under changing conditions.
