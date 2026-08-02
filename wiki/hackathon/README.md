# Hackathon Wiki

Use this workflow when the deliverable is a time-boxed prototype and the judging
signal is a working demo.

## Workflow

```text
setup
  -> ingest brief
  -> strategy
  -> idea
  -> scope
  -> scaffold
  -> build
  -> demo
  -> video
  -> judge
  -> submit
```

## Start here

1. Install HADK and create a project directory.
2. Run `hadk setup`.
3. Ingest the competition brief.
4. Select a strategy and idea.
5. Lock a small, demoable scope.

```bash
mkdir my-hackathon
cd my-hackathon
hadk setup --team-size 3 --team-skills "ai,fullstack,design"
hadk ingest /path/to/brief.md
hadk strategy --mode realistic --taste auto
hadk idea
hadk scope
```

Continue with [the complete workflow](workflow.md).
