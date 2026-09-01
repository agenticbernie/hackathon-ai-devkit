# Guide: Your First Hackathon with HADK

This walkthrough takes a fresh project from an empty directory to a
submission-ready package using the `hadk` CLI.

## Prerequisites

- Node.js ≥ 20
- pnpm (or npm)
- The harness installed:

```bash
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/v2.1.4/install.sh | bash
```

Verify with `hadk --version`.

## 1. Set up state

In your project directory:

```bash
hadk setup --team-size 3 --team-skills "ai,fullstack,design"
```

This creates `.hackathon/`, detects your package manager and agents, and
installs agent adapters.

## 2. Ingest the brief

Save the competition page as `brief.md` (or use a URL), then:

```bash
hadk ingest brief.md
```

HADK parses the event name, tracks, judging criteria, sponsors, and deadline
into `.hackathon/artifacts/competition/competition.yaml`.

## 3. Choose a strategy

```bash
hadk strategy --mode futuristic --taste auto
```

Pick `conservative`, `realistic`, or `futuristic`. `--taste auto` infers a
taste profile from your team skills and the rubric.

## 4. Generate and select an idea

```bash
hadk idea --count 5
```

HADK generates candidates, scores them against the strategy weights, ranks
them, and selects the winner. Losers are kept in
`.hackathon/artifacts/ideas/candidates.yaml` with rejection reasons.

## 5. Lock the scope

```bash
hadk scope
```

HADK builds a locked MVP scope contract: core demo flow, MVP features (each
justified by demo or rubric), deferred features, a primary wow moment,
external dependencies with fallbacks, and a time budget.

## 6. Scaffold the prototype

```bash
hadk scaffold --profile web-ai-fullstack
```

Real project files are written to `prototype/`. Preview first with
`--dry-run`; use `--force` only to overwrite conflicts you accept.

```bash
cd prototype && pnpm install && pnpm dev
```

## 7. Check status and validate

```bash
hadk status
hadk validate all
```

`status` shows phase, gates, deadline mode, and the next action. `validate all`
runs every gate and reports issues truthfully.

## 8. Build the demo video project

```bash
hadk video generate
```

A `demo-video/` HyperFrames project is generated. If the HyperFrames CLI is not
installed, rendering is reported as `blocked` (not faked); the composition is
still previewable in a browser.

## 9. Prepare to submit

```bash
hadk demo      # validate the demo path
hadk judge     # generate judge Q&A prep
hadk package submission    # assemble the local submission package
```

## Tips

- Run `hadk next` at any time to get the single correct next command.
- Create checkpoints before risky changes: `hadk checkpoint --label "before-api"`.
- Roll back with `hadk rollback`.
- As the deadline approaches, HADK automatically steps down its execution mode
  to protect the demo and the submission.
