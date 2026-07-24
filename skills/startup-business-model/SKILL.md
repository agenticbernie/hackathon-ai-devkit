---
name: startup-business-model
description: >-
  Define the business model (value proposition, revenue streams, cost structure, unit
  economics) for a startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-business-model

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Articulate a coherent business model that shows how the venture creates, delivers, and
captures value — with unit economics that at least directionally work.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea, target segment, and pricing hypothesis exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `pricing_hypothesis` | object | No | Assumed price point |
| `market_sizing` | object | No | Output of startup-market-sizing |

## Outputs
| Output | Description |
|---|---|
| `value_proposition` | Why the customer buys |
| `revenue_streams` | How money comes in |
| `cost_structure` | Major cost drivers |
| `unit_economics` | CAC, LTV, gross margin (labeled as estimates) |
| `key_metrics` | The 2-3 numbers to watch |

## Rules
1. Keep the model simple — one primary revenue stream beats five vague ones.
2. Show at least directional unit economics (LTV > CAC story).
3. Label every number as an estimate with its assumption.
4. Tie the model to the demo: the prototype should illustrate the core value loop.
