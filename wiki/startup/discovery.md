# Startup Discovery

## 1. Research pain points

Provide a market and one or more target segments. Sources may be local Markdown,
text, YAML, JSON, or public URLs. Repeat `--source` for multiple sources.

```bash
hadk startup research \
  --market "AI developer tools" \
  --segments "solo founders,small startup teams" \
  --source ./research/interviews.md \
  --source https://example.com/report
```

For a source list:

```yaml
sources:
  - ./research/interviews.md
  - https://example.com/report
```

```bash
hadk startup research \
  --market "AI developer tools" \
  --segments "solo founders,small startup teams" \
  --sources-file ./research/sources.yaml
```

Research creates:

```text
.hackathon/artifacts/startup-discovery/pain-point-research.yaml
```

Each source records type, retrieval status, timestamp, content hash when available,
warnings, confidence, and a safe excerpt. Failed or empty sources are not evidence.

## 2. Generate handoff prompts

To ask Claude Code and Codex to perform research using available tools:

```bash
hadk startup research \
  --market "AI developer tools" \
  --segments "solo founders,small startup teams" \
  --source ./research/notes.md \
  --agent-handoff
```

Prompts are written to:

```text
.hackathon/artifacts/startup-discovery/agent-handoffs/
```

The prompts require schema-compliant YAML, source provenance, confidence labels,
disconfirming evidence, research gaps, and anti-fabrication safeguards.

## 3. Rank opportunities

```bash
hadk startup scorecard
```

The scorecard uses provisional 1–5 dimensions:

- Severity: how harmful the problem is.
- Frequency: how often it occurs.
- Urgency: how quickly users need change.
- Buyer access: how reachable the person who can buy is.
- Willingness to pay: observed or stated payment signal.

The weighted score is a prioritization signal, not proof of product-market fit.
Every score includes rationale, evidence, confidence, evidence status, risks, and
missing evidence.

Output:

```text
.hackathon/artifacts/startup-discovery/opportunity-scorecard.yaml
```

## 4. Deep dive one pain point

```bash
hadk startup deep-dive <pain-point-id>
```

The deep dive examines user, buyer, decision maker, triggers, workflows, alternatives,
switching barriers, consequences, willingness-to-pay signals, and disconfirming evidence.
The default verdict is `insufficient_evidence` when no direct evidence exists.

## 5. Create a validation plan

```bash
hadk startup validate \
  --methods user_interview,manual_workflow_experiment \
  --timeline-days 7
```

Every hypothesis has a validation method, success threshold, falsification threshold,
evidence artifact, status, and next decision.

## 6. Inspect progress

```bash
hadk startup status
hadk startup status --json
hadk startup next
```

`status` summarizes persisted artifacts. `next` returns the next valid action and
labels actions requiring manual or agent work, such as customer interviews.
