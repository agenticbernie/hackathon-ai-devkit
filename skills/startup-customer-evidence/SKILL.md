---
name: startup-customer-evidence
description: >-
  Gather and structure customer evidence (problem interviews, demand signals, willingness
  to pay) for a startup-contest submission. Extension module — status: beta.
status: beta
---
# startup-customer-evidence

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Produce verifiable customer evidence that the problem is real and painful enough to fund
a company, rather than a solution looking for a problem.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A selected idea exists and the team is preparing the business narrative.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `target_user` | string | Yes | Primary customer segment |
| `evidence_sources` | string[] | No | Interviews, surveys, waitlist, analytics |

## Outputs
| Output | Description |
|---|---|
| `customer_evidence` | Structured evidence artifacts |
| `pain_frequency` | How often the pain occurs |
| `willingness_to_pay_signals` | Observed or stated willingness to pay |
| `evidence_strength` | weak / moderate / strong |

## Rules
1. Prefer observed behavior over stated intent.
2. Quantify wherever possible (N interviews, % agreeing, $ committed).
3. Label every claim with its source and date.
4. Do not fabricate evidence; mark gaps explicitly.
