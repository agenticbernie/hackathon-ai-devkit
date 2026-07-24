---
name: hackathon-idea-strategy
description: >-
  Select one of three idea strategy modes (conservative, realistic, futuristic) and
  set the scoring weights and hard constraints that govern idea generation before any
  ideas are produced.
---
# hackathon-idea-strategy

## Goal
Choose the single strategy mode that maximizes this team's probability of winning this
specific competition, and lock the scoring profile that idea generation will optimize
against. This skill runs **before** `hackathon-idea-generator` and determines *what kind*
of idea the team should pursue.

---

## Trigger Conditions

Use this skill when:
- Competition intelligence (`hackathon-event-parser`) is available.
- The team profile (size, skills, assets) is known.
- Time remaining is known.
- The team is about to generate ideas but has not yet chosen a strategic posture.
- Invoked after `hackathon-track-analyzer`, before `hackathon-taste-profiler` and
  `hackathon-idea-generator`.

---

## The Three Modes

Exactly three top-level modes are supported. Pick **one**.

### conservative
Optimize for execution reliability and a high probability of shipping.

Best when: short duration, small/inexperienced team, heavy sponsor compliance, crowded
track, weak existing assets, or the rubric rewards polish over novelty.

Default scoring weights:
```yaml
build_feasibility: 0.25
demo_reliability: 0.20
rubric_alignment: 0.20
sponsor_integration: 0.15
problem_clarity: 0.10
novelty: 0.10
```

### realistic (default)
Optimize for a real current pain, meaningful differentiation, and a credible path from
prototype to pilot. Balanced novelty and buildability with a strong demo.

Default scoring weights:
```yaml
problem_value: 0.20
rubric_alignment: 0.20
differentiation: 0.15
build_feasibility: 0.15
demo_strength: 0.15
business_potential: 0.15
```

### futuristic
Optimize for a future state 5-10 years ahead and the infrastructure that becomes
necessary in that future. A strong future thesis, memorable narrative, technical
credibility, and a prototype that proves one core primitive.

Default scoring weights:
```yaml
future_thesis_strength: 0.20
memorability: 0.15
technical_credibility: 0.15
rubric_alignment: 0.15
core_mechanism_proof: 0.15
strategic_upside: 0.10
build_feasibility: 0.10
```

Hard constraints applied in futuristic mode:
```yaml
core_mechanism_buildable: true
demoable_within_time: true
technical_claims_must_be_evidence_based: true
science_fiction_without_proof: false
```

The futuristic mode must **not** merely add futuristic wording to ordinary ideas. It must
reason through the chain:
```text
current state
→ emerging forces
→ plausible future state
→ missing infrastructure
→ first buildable primitive
→ prototype proof
```

---

## Inputs

| Input | Type | Required | Description |
|---|---|---|---|
| `competition` | object | Yes | Parsed competition intelligence |
| `judging_criteria` | object[] | Yes | Rubric with weights |
| `team_size` | integer | Yes | Number of team members |
| `team_skills` | string[] | Yes | Team capability tags |
| `existing_assets` | string[] | No | Reusable code / integrations |
| `remaining_hours` | number | Yes | Time until submission |
| `sponsor_requirements` | string[] | No | Mandatory sponsor integrations |
| `requested_mode` | string | No | Force a mode: conservative/realistic/futuristic |

---

## Outputs

| Output | Description |
|---|---|
| `strategy_mode` | The selected mode |
| `selection_reason` | Why this mode maximizes winning probability |
| `scoring_profile` | The scoring axes and weights (sum to 1.0) |
| `hard_constraints` | Mode-specific non-negotiable constraints |
| `recommended_skills` | Next skills to invoke |

---

## Rules

1. Select exactly one mode. Never blend modes at the top level.
2. Scoring weights for the selected mode must sum to 1.0.
3. If `requested_mode` is provided, use it but still record the reasoning.
4. If the team lacks the skills to build a futuristic core primitive, do not select
   futuristic unless `requested_mode` forces it — record the override risk.
5. In futuristic mode, reject any idea that fails a hard constraint.
6. Document why the chosen mode maximizes winning probability for *this* team and
   *this* competition, not in general.

---

## Output Format

```yaml
strategy_mode: "realistic"
selection_reason: "<why this mode wins here>"
scoring_profile:
  problem_value: 0.20
  rubric_alignment: 0.20
  differentiation: 0.15
  build_feasibility: 0.15
  demo_strength: 0.15
  business_potential: 0.15
hard_constraints: {}
recommended_skills:
  - "hackathon-taste-profiler"
  - "hackathon-idea-generator"
```

---

## Context Files

### Knowledge Base
- `knowledge/hackathon-winning-patterns.md`
- `knowledge/hackathon-judging-criteria.md`
- `knowledge/hackathon-mvp-strategy.md`

### Playbooks
- `playbooks/hackathon-workflow.md`
