---
name: startup-judge-simulator
description: >-
  Simulate investor-style judge Q&A for a startup-contest submission, surfacing the hard
  questions and preparing defensible answers. Extension module — status: beta.
status: beta
---
# startup-judge-simulator

> **Extension module (startup-contest). Status: beta.** Part of the startup competition
> mode. The core harness works without it.

## Goal
Stress-test the pitch by simulating the hardest investor-style questions a startup-contest
judge will ask, and prepare concise, evidence-backed answers.

## Trigger Conditions
- `competition.type` is `startup-contest`.
- A pitch / submission narrative exists and the team is preparing for Q&A.

## Inputs
| Input | Type | Required | Description |
|---|---|---|---|
| `selected_idea` | object | Yes | The locked idea |
| `business_model` | object | No | Output of startup-business-model |
| `market_sizing` | object | No | Output of startup-market-sizing |
| `customer_evidence` | object | No | Output of startup-customer-evidence |
| `judging_criteria` | object[] | Yes | The contest rubric |

## Outputs
| Output | Description |
|---|---|
| `questions` | Ranked hard questions by likelihood and damage |
| `answers` | Prepared answer for each, with evidence pointers |
| `weak_spots` | Claims a judge will challenge and how to shore them up |

## Rules
1. Ask the questions a skeptical investor would ask, not softballs.
2. Every answer must point to evidence in the submission or state it as a hypothesis.
3. Prioritize questions about market, traction, differentiation, and team.
4. Flag any claim that cannot be defended and recommend softening it.
