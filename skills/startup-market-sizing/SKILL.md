---
name: startup-market-sizing
description: >-
  Estimate market size (TAM/SAM/SOM) with a defensible bottom-up model for a
  startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-market-sizing

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Produce a credible, bottom-up market size estimate that judges and investors can
stress-test, instead of an unverifiable top-down number.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea and target segment exist.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `pricing_hypothesis` | object | No | Assumed price point |

## Outputs
| Output | Description |
|---|---|
| `tam` | Total addressable market |
| `sam` | Serviceable available market |
| `som` | Serviceable obtainable market (realistic 1-3 yr) |
| `assumptions` | Every assumption used, labeled |
| `method` | bottom-up / top-down / mixed |

## Rules
1. Prefer bottom-up: (# customers) × (annual price).
2. State every assumption; mark which are validated vs. assumed.
3. Keep SOM honest — a small, believable number beats a large, vague one.
4. Cite sources for any external statistic.
