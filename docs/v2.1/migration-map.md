# HADK v2.0 → v2.1 Migration Map

## State and evidence

Existing `schema_version: 1.0` state is loaded and migrated in memory before
being written back atomically as the v2.1 state contract. Existing competition,
strategy, scope, architecture, delivery, and gate values are preserved. New
metadata defaults to `unverified` or `pending`; it is never promoted from file
existence.

Existing artifacts remain readable. New artifacts use the common metadata
envelope and evidence references.

## Command migration

| v2.0 | v2.1 |
|---|---|
| `hadk ingest` | `hadk ingest` plus `hadk brief review` and explicit confirmation |
| `hadk strategy --mode conservative|realistic|futuristic` | `execution-first|balanced|differentiation-first`; old values warn and map |
| `hadk idea` | heuristic drafts are unverified; use human import or validated agent import |
| `hadk scaffold` | deprecated experimental path; use `hadk architecture plan` and `hadk handoff implement` |
| `hadk validate build` | `hadk verify build` executes the verification contract |
| `hadk demo` | `hadk verify demo`; `hadk demo` is a compatibility alias |
| `hadk video generate/render` | `hadk package` consumes a video plan; rendering is optional evidence |
| `hadk submit` | `hadk package submission`, `review`, and `export` |

## Compatibility policy

- No existing user artifact is deleted.
- Existing startup discovery remains available but is outside the v2.1 core path.
- Existing scaffold profiles remain deprecated experimental functionality.
- HyperFrames remains optional and cannot advance a v2.1 core gate by itself.
- Migration warnings identify commands whose old success semantics are no longer trusted.
