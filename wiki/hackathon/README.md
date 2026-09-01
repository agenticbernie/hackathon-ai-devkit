# Hackathon Wiki

**Version: 2.1.2**

Use this workflow when the deliverable is a time-boxed prototype and the judging
signal is a working demo.

> **v2.1.1 note**: After `hadk ingest`, confirm required brief facts and verify
> hydration with `hadk brief review` and `hadk status`. The canonical
> competition state (`state.competition`) now hydrates directly from
> `user_confirmed` facts, so `hadk status`, validators, and idea handoffs see the
> same competition name, tracks, judging criteria, and deadline you confirmed.

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
hadk brief review
hadk strategy --mode balanced --taste auto
hadk idea
hadk idea select <candidate-id>
hadk scope
```

Continue with [the complete workflow](workflow.md).

HADK is distributed under the [Apache License 2.0](../../LICENSE).
