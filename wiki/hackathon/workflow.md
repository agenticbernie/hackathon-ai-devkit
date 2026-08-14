# Hackathon Workflow

## 1. Initialize

```bash
hadk setup --team-size 3 --team-skills "ai,fullstack,design"
```

This creates `.hackathon/` without overwriting existing state. Setup also detects
available package managers, git, and supported coding agents.

## 2. Ingest the brief

```bash
hadk ingest ./brief.md
hadk brief review
hadk brief confirm competition_name
```

The result is written to:

```text
.hackathon/artifacts/competition/competition.yaml
.hackathon/artifacts/competition/raw-source.md
```

Unavailable URLs are recorded with low confidence. They are not treated as a
successful extraction.

## 3. Choose strategy and idea

```bash
hadk strategy --mode balanced --taste auto
hadk idea
hadk idea select <candidate-id>
```

Strategy modes:

- `conservative`: execution and reliability.
- `realistic`: value, polish, and feasibility.
- `futuristic`: vision and memorability, while retaining a buildable core.

Idea artifacts preserve all candidates and the selected idea:

```text
.hackathon/artifacts/strategy/strategy.yaml
.hackathon/artifacts/ideas/candidates.yaml
.hackathon/artifacts/ideas/selected.yaml
```

## 4. Lock scope

```bash
hadk scope
```

Scope must contain a core demo flow, MVP features, a primary wow moment, time
budget, and fallbacks for external dependencies. To change a locked scope:

```bash
hadk replan --reason "critical integration changed"
```

Replanning creates a checkpoint and resets downstream gates.

## 5. Scaffold and build

```bash
hadk architecture plan
hadk handoff implement --agent claude-code
hadk verify build
hadk scaffold --profile web-ai-fullstack
cd prototype
pnpm install
pnpm build
cd ..
hadk package submission
hadk package review
```

The scaffold engine is non-destructive by default. Use `--dry-run` to preview a
scaffold. Use `--force` only when intentionally overwriting conflicts.

## 6. Prepare demo and video

```bash
hadk verify demo
hadk video generate
hadk video preview
hadk video render
```

Rendering requires the HyperFrames CLI. If it is unavailable, HADK reports the
render as blocked and keeps the previewable composition.

## 7. Judge and submit

```bash
hadk judge
hadk package submission --repository https://github.com/org/project
hadk package review
```

Review the generated artifacts before any external submission. HADK only creates
a local package and never submits to external systems.
