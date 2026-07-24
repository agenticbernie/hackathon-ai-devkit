---
name: startup-pilot-designer
description: >-
  Design a credible pilot / lighthouse-customer plan that de-risks the venture and
  generates traction evidence for a startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-pilot-designer

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Design a short, scoped pilot with a real customer (or a faithful simulation) that produces
traction evidence — the strongest signal a startup-contest judge can see.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea and go-to-market plan exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `beachhead_segment` | string | Yes | From startup-gtm-planner |
| `timeline_hours` | number | Yes | Time available to run the pilot |

## Outputs
| Output | Description |
|---|---|
| `pilot_scope` | What the pilot proves and what it does not |
| `success_criteria` | Measurable pilot success metrics |
| `pilot_plan` | Steps, owner, and timeline |
| `traction_artifacts` | Evidence the pilot will produce |

## Rules
1. Scope the pilot to prove one thing well, not everything poorly.
2. Define success criteria before starting (avoid post-hoc rationalizing).
3. If a real customer is not available in the timeframe, design a faithful simulation
   and label it as such.
4. Capture artifacts (screenshots, metrics, quotes) as the pilot runs.
