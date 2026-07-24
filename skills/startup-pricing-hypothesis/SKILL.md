---
name: startup-pricing-hypothesis
description: >-
  Form and test a pricing hypothesis (price point, model, willingness to pay) for a
  startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-pricing-hypothesis

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Produce a concrete, testable pricing hypothesis rather than "we'll figure out pricing
later" — pricing is a signal of how well the team understands the customer and market.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea, target segment, and customer evidence exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `customer_evidence` | object | No | Output of startup-customer-evidence |
| `competitor_pricing` | object[] | No | Known competitor price points |

## Outputs
| Output | Description |
|---|---|
| `pricing_model` | subscription / usage / seat / transaction / freemium |
| `price_point` | Concrete number with unit |
| `rationale` | Why this price, anchored to value or comparables |
| `validation_plan` | How the hypothesis will be tested |

## Rules
1. Give a concrete number, not a range with no anchor.
2. Anchor to value delivered or a comparable, and say which.
3. State what would falsify the hypothesis.
4. Keep it simple enough to explain in one sentence during the pitch.
