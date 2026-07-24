# Guide: Strategy Modes

`hadk strategy --mode <mode>` chooses how HADK scores and selects ideas. The
mode reweights the same idea axes toward a different winning philosophy. There
is no universally best mode — pick the one that matches the competition, the
team, and the time available.

## The three modes

### `conservative` — win on execution

Best when the rubric rewards reliability and completeness, the team is strong
but not flashy, or time is short.

Weighted toward: build feasibility, demo reliability, rubric alignment,
sponsor integration, problem clarity, novelty.

Choose it when: "Don't lose on a broken demo."

### `realistic` — win on value

Best for general hackathons with a balanced rubric and a team that can ship a
polished, useful product.

Weighted toward: problem value, rubric alignment, differentiation, build
feasibility, demo strength, business potential.

Choose it when: "Build the thing judges will actually use."

### `futuristic` — win on vision

Best for AI/infrastructure competitions where memorability and a credible
future thesis beat polish.

Weighted toward: future-thesis strength, memorability, technical credibility,
rubric alignment, core-mechanism proof, strategic upside, build feasibility.

Choose it when: "Be the project judges remember tomorrow."

## How scoring works

Each candidate idea receives a per-axis score (0–10). `scoreIdea` clamps each
axis to 0–10, defaults any missing axis to 5, and computes a weighted total
using the mode's weights (which always sum to 1.0). Candidates are ranked by
total; the top one is selected and the rest are preserved as alternatives with
rejection reasons.

## Taste profiles

`--taste auto` infers a taste profile from state:

- **technology** — derived from team skills (e.g., `ai_agents`, `blockchain`,
  `data`).
- **desired_traits** — derived from the mode (futuristic → `futuristic`,
  `technically_impressive`; conservative → `commercially_credible`,
  `visually_demoable`; realistic → `technically_impressive`,
  `visually_demoable`).
- **market / product_layer / business_shape** — sensible defaults that the
  coding agent refines using the `hackathon-taste-profiler` skill.

Use `--taste user` to supply your own taste profile and skip inference.

## Deadline interaction

The strategy mode is independent of the deadline mode. As time runs out, the
orchestrator steps down execution (`full → fast → demo_first → …`) regardless
of strategy, protecting the demo and submission first.

## Recommendation

- Unsure? Start with `realistic`.
- Strong, fast team at an AI event? Try `futuristic`.
- Tight deadline or risky integrations? Use `conservative`.

You can re-run `hadk strategy` before `hadk idea` to change modes; once ideas
are selected, use `hadk replan` to re-scope.
