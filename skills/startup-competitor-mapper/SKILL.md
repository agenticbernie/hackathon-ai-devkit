---
name: startup-competitor-mapper
description: >-
  Map direct and indirect competitors, identify differentiation whitespace, and position
  the venture for a startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-competitor-mapper

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Produce an honest competitor landscape that shows where real whitespace exists and why
this venture can win it, avoiding both "no competitors" naivety and vague hand-waving.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea and target segment exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `known_competitors` | string[] | No | Competitors the team already knows |

## Outputs
| Output | Description |
|---|---|
| `competitors` | Direct, indirect, and substitute competitors |
| `positioning_map` | Axes and where each player sits |
| `whitespace` | The defensible gap this venture occupies |
| `moat_hypothesis` | Why the gap is defensible |

## Rules
1. Always include indirect competitors and the "do nothing" alternative.
2. Position on axes that matter to the customer, not arbitrary ones.
3. State the moat hypothesis explicitly; label it as a hypothesis.
4. Never claim "no competitors" — that signals an unvalidated market.
