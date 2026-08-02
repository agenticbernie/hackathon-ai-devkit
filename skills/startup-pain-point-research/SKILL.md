---
name: startup-pain-point-research
description: Research a market, domain, or segment and map pain-point opportunities before solution ideation.
status: beta
---
# startup-pain-point-research

## Goal
Produce an evidence-aware opportunity map before selecting or inventing a solution.

## Inputs
- `market`: market or domain name.
- `target_segments`: segments to investigate.
- `source_references`: files, URLs, interviews, or other provenance references.
- `provenance`: source-level retrieval status, hash, warnings, locator, and safe excerpt.

## Outputs
Produce target segments, jobs-to-be-done, workflows, candidate pain points, rankings,
workarounds, consequences, research gaps, confidence, and one recommended pain point.

## Rules
1. Separate direct evidence, secondary research, market signals, observations, inferences, and hypotheses.
2. Preserve source references for every external claim.
3. Never turn an unverified assumption into direct user evidence.
4. Recommend a deep dive, not a product idea.

## Source handling

Local Markdown, text, YAML, and JSON files and public URLs may be supplied. Preserve
the original identifier and retrieval outcome. A failed, empty, or inaccessible source
is a research gap, never validated evidence. Use the Claude Code or Codex handoff
prompts when real source analysis is available; return YAML matching the registered
input/output schemas and preserve provenance for every claim.
