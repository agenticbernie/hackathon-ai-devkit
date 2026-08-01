---
name: hackathon-event-parser
description: >-
  Parse a hackathon event URL to extract tracks, judging criteria, timeline, and sponsor tools for autonomous pipeline execution.
---
# hackathon-event-parser

## Goal
Parse a hackathon event URL to extract structured information — tracks, judging criteria, timeline, and sponsor tools — required to trigger the full devkit workflow pipeline autonomously.

This is the **autonomous pipeline entry point**. When a URL is provided, this skill replaces manual track description input for all downstream skills.

---

## Trigger Conditions

Use this skill when:
- A hackathon event URL is available (Devpost, DoraHacks, Hackathon.com, MLH, or any event page)
- The team wants to run the devkit pipeline autonomously from a single input
- Track descriptions, judging criteria, or sponsor briefs must be extracted without manual copying
- Multiple tracks exist on an event page and the best-fit track must be identified
- This is always the **first skill invoked** in an autonomous pipeline; its output feeds `hackathon-track-analyzer`

---

## Inputs

```yaml
event_url: "<hackathon event URL>"           # required
preferred_track: "<track name or hint>"      # optional — if known, used to prioritize extraction
team_size: <number>                          # optional — used to filter feasibility signals
team_skills:                                 # optional — used to flag relevant sponsor tools
  - "<skill>"
extract_mode: "full | tracks_only | criteria_only"  # optional, default: full
```

---

## Outputs

```yaml
event_metadata:
  name: "<verified event name or 'unknown'>"
  organizer: "<verified organizer or 'unknown'>"
  url: "<exactly the user-provided URL>"
  submission_platform: "<Devpost | DoraHacks | Hackathon.com | other>"
  start_datetime: "<ISO 8601 or 'unknown'>"
  end_datetime: "<ISO 8601 or 'unknown'>"
  duration_hours: <number or null>
  location: "<in-person | virtual | hybrid>"
  registration_deadline: "<ISO 8601 or 'unknown'>"
  submission_deadline: "<ISO 8601 or 'unknown'>"

tracks:
  - id: "<track-id>"
    name: "<track name>"
    description: "<raw track description>"
    sponsor: "<sponsor name or null>"
    prize: "<prize description or null>"
    required_tools:
      - "<tool or API name>"
    eligibility_constraints:
      - "<constraint>"
    feasibility_signal: "<high | medium | low>"  # based on team_skills if provided

judging_criteria:
  - track_id: "<track-id or 'global'>"
    axes:
      - axis: "<criterion name>"
        weight: "<high | medium | low | percentage if stated>"
        description: "<what judges evaluate>"
    rubric_source: "<verbatim | inferred | not_published>"

sponsor_tools:
  - sponsor: "<sponsor name>"
    tools:
      - name: "<tool or API>"
        use_case: "<what it enables>"
        bonus_prize: <true | false>
        docs_url: "<URL or null>"

timeline:
  - event: "<event name>"
    datetime: "<ISO 8601 or relative>"
    notes: "<optional context>"

recommended_track:
  track_id: "<id>"
  track_name: "<name>"
  rationale: "<why this track is recommended given team size/skills>"

extraction_confidence: "<high | medium | low>"
extraction_warnings:
  - "<any ambiguity, missing data, or access issues>"

next_skill: "hackathon-track-analyzer"
```

---

## Rules

1. Extract all content directly from the event page without inference where possible.
2. If the judging rubric is not published, set `rubric_source: "not_published"` and infer typical criteria — mark inferred axes with `[INFERRED]`.
3. If the URL is inaccessible (auth wall, 404, dynamic content), set `extraction_confidence: "low"` and populate fields from available fragments; list all gaps in `extraction_warnings`.
4. Never fabricate dates, prizes, or sponsor names. Use `"unknown"` or `null` for missing values.
5. If multiple tracks exist, extract all tracks and recommend one based on team signals if provided.
6. Normalize duration to hours. If only start/end dates are given, compute `duration_hours`.
7. Flag any required tool or API that conflicts with `team_skills` as a constraint.
8. `next_skill` must always be set to `hackathon-track-analyzer` to enforce pipeline continuity.
9. The worked example in `references/example-output.yaml` is FICTIONAL test-fixture data — schema shape only, never factual evidence. Never copy any example URL, event name, organizer, date, track, sponsor, prize, or criterion into a real output.
10. When page retrieval fails, preserve the exact user-provided URL in `event_metadata.url`. Do not derive an event name or organizer from the URL slug unless explicitly labeled as unverified metadata.
11. If source content is empty or inaccessible, every event-specific field must be `unknown`, `null`, or an empty array. Never reuse example values.

---

## Output Format

```yaml
event_metadata:
  name: "<string — verified name or 'unknown'>"
  organizer: "<string — verified organizer or 'unknown'>"
  url: "<string — exactly the user-provided URL>"
  submission_platform: "<string>"
  start_datetime: "<ISO 8601 or 'unknown'>"
  end_datetime: "<ISO 8601 or 'unknown'>"
  duration_hours: <number or null>
  location: "<in-person | virtual | hybrid>"
  registration_deadline: "<ISO 8601 or 'unknown'>"
  submission_deadline: "<ISO 8601 or 'unknown'>"

tracks:
  - id: "<string>"
    name: "<string>"
    description: "<string>"
    sponsor: "<string or null>"
    prize: "<string or null>"
    required_tools:
      - "<string>"
    eligibility_constraints:
      - "<string>"
    feasibility_signal: "<high | medium | low>"

judging_criteria:
  - track_id: "<string>"
    axes:
      - axis: "<string>"
        weight: "<high | medium | low | percentage>"
        description: "<string>"
    rubric_source: "<verbatim | inferred | not_published>"

sponsor_tools:
  - sponsor: "<string>"
    tools:
      - name: "<string>"
        use_case: "<string>"
        bonus_prize: <boolean>
        docs_url: "<string or null>"

timeline:
  - event: "<string>"
    datetime: "<string>"
    notes: "<string>"

recommended_track:
  track_id: "<string>"
  track_name: "<string>"
  rationale: "<string>"

extraction_confidence: "<high | medium | low>"
extraction_warnings:
  - "<string>"

next_skill: "hackathon-track-analyzer"
```

---

## Context Files

### Knowledge Base

- `knowledge/hackathon-tools.md`
- `knowledge/hackathon-judging-criteria.md`
- `knowledge/hackathon-winning-patterns.md`
- `knowledge/hackathon-submission-guidelines.md`

### Playbooks

- `playbooks/hackathon-workflow.md`
- `playbooks/24h-hackathon-playbook.md`
- `playbooks/36h-hackathon-playbook.md`
- `playbooks/48h-hackathon-playbook.md`

## Example

A schema-only placeholder example is shown below. No real or fictional event values are embedded — every field must come from the fetched page or be `unknown` (see Rules 9–11).

**Input:**
```yaml
event_url: "<USER_PROVIDED_EVENT_URL>"
team_size: <number>
team_skills:
  - "<skill>"
extract_mode: "full"
```

**Output:**
```yaml
event_metadata:
  name: "<verified event name or 'unknown'>"
  organizer: "<verified organizer or 'unknown'>"
  url: "<exactly the user-provided URL>"
  submission_platform: "<Devpost | DoraHacks | Hackathon.com | other | unknown>"
  start_datetime: "<ISO 8601 or 'unknown'>"
  end_datetime: "<ISO 8601 or 'unknown'>"
  duration_hours: <number or null>
  location: "<in-person | virtual | hybrid | unknown>"
  registration_deadline: "<ISO 8601 or 'unknown'>"
  submission_deadline: "<ISO 8601 or 'unknown'>"

tracks: []
judging_criteria: []
sponsor_tools: []
timeline: []

recommended_track: null

extraction_confidence: "<high | medium | low>"
extraction_warnings:
  - "<any ambiguity, missing data, or access issues>"

next_skill: "hackathon-track-analyzer"
```

> A fully worked (fictional) example lives in `references/example-output.yaml`. It is test-fixture data only — never treat it as source evidence.
```
