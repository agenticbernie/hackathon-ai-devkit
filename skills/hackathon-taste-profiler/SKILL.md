---
name: hackathon-taste-profiler
description: >-
  Build an idea taste profile (market, product layer, technology, business shape,
  desired traits) from explicit user selection or automatic inference, to bias idea
  generation toward the highest-probability winning profile.
---
# hackathon-taste-profiler

## Goal
Produce a machine-readable `idea_taste` profile that biases idea generation toward the
kind of project most likely to win this competition for this team. Supports explicit user
selection (`taste_source: user`) and autonomous inference (`taste_source: auto`).

---

## Trigger Conditions

Use this skill when:
- A strategy mode has been selected (`hackathon-idea-strategy`).
- The team is in autonomous mode (must use `taste_source: auto` — do not prompt the user).
- The user wants to steer the *flavor* of ideas (market, tech, business shape) before
  generation.
- Invoked after `hackathon-idea-strategy`, before `hackathon-idea-generator`.

---

## Taste Dimensions

```yaml
idea_taste:
  market:
    - b2b
    - b2c
    - b2g
    - developer_tools

  product_layer:
    - application
    - tooling
    - infrastructure
    - protocol
    - platform

  technology:
    - ai_agents
    - blockchain
    - climate
    - robotics
    - cybersecurity
    - data
    - fintech
    - healthcare
    - education
    - iot

  business_shape:
    - vertical_saas
    - horizontal_platform
    - open_source
    - enterprise
    - marketplace

  desired_traits:
    - technically_impressive
    - commercially_credible
    - visually_demoable
    - socially_impactful
    - futuristic
```

---

## Inputs

| Input | Type | Required | Description |
|---|---|---|---|
| `taste_source` | string | Yes | `user` or `auto` |
| `user_taste` | object | If `user` | Explicit taste selections from the user |
| `strategy_mode` | string | Yes | Selected strategy mode |
| `judging_criteria` | object[] | Yes | Competition rubric |
| `sponsor_requirements` | string[] | No | Sponsor priorities |
| `team_skills` | string[] | Yes | Team capability tags |
| `team_size` | integer | Yes | Number of team members |
| `remaining_hours` | number | Yes | Time until submission |
| `existing_assets` | string[] | No | Reusable code / integrations |

---

## Outputs

| Output | Description |
|---|---|
| `idea_taste` | The resolved taste profile |
| `taste_source` | `user` or `auto` |
| `inference_rationale` | Why this profile maximizes winning probability (auto only) |
| `recommended_skills` | Next skills to invoke |

---

## Rules

1. When `taste_source` is `user`, use the provided selections verbatim (validate against
   the allowed values; drop unknown values with a warning).
2. When `taste_source` is `auto`, **do not ask the user**. Infer the highest-probability
   idea profile from:
   - the competition rubric;
   - sponsor priorities;
   - team skills;
   - team size;
   - duration / time remaining;
   - existing assets;
   - likely competing-idea saturation;
   - demo potential;
   - technical feasibility;
   - differentiation whitespace.
3. Always document *why* the selected taste profile maximizes winning probability.
4. The taste profile biases generation; it must never violate the strategy mode's hard
   constraints.
5. Prefer `visually_demoable` when the rubric weights presentation/demo heavily.
6. Prefer `technically_impressive` when the rubric weights technical complexity heavily.

---

## Output Format

```yaml
idea_taste:
  market: ["developer_tools"]
  product_layer: ["tooling"]
  technology: ["ai_agents"]
  business_shape: ["open_source"]
  desired_traits: ["technically_impressive", "visually_demoable"]
taste_source: "auto"
inference_rationale: "<why this profile wins here>"
recommended_skills:
  - "hackathon-idea-generator"
```

---

## Context Files

### Knowledge Base
- `knowledge/hackathon-winning-patterns.md`
- `knowledge/hackathon-judging-criteria.md`
- `knowledge/hackathon-demo-psychology.md`

### Playbooks
- `playbooks/hackathon-workflow.md`
