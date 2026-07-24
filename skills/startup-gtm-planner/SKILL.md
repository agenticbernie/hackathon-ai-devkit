---
name: startup-gtm-planner
description: >-
  Design a focused go-to-market plan (beachhead segment, channel, first-100-customers
  path) for a startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-gtm-planner

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Produce a narrow, believable go-to-market plan that shows how the venture gets its first
customers — a beachhead, not a spray-and-pray launch.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea, target segment, and pricing hypothesis exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `pricing_hypothesis` | object | No | Output of startup-pricing-hypothesis |
| `team_skills` | string[] | No | Channels the team can realistically work |

## Outputs
| Output | Description |
|---|---|
| `beachhead_segment` | The narrowest wedge to win first |
| `primary_channel` | One channel to focus on |
| `first_100_plan` | Concrete steps to reach 100 customers |
| `sales_motion` | self-serve / inside-sales / field-sales / community |

## Rules
1. Pick one beachhead and one channel; breadth is a red flag at this stage.
2. Make the first-100 plan concrete (who, where, what ask).
3. Match the sales motion to the price point.
4. Prefer channels the team already has access to.
