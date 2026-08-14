# Repository Audit — hackathon-ai-devkit

**Date:** 2026-07-23
**Auditor:** Automated harness migration

---

## Current State

| Asset | Count | Status |
|---|---|---|
| Skills | 20 | All have SKILL.md with YAML frontmatter |
| Knowledge files | 10 | Complete, well-structured |
| Templates | 5 | Complete |
| Playbooks | 4 | Complete |
| Executable code | 0 | None — pure Markdown repository |
| Tests | 0 | None |
| Schemas | 0 | None |
| Package manifest | 0 | No package.json |
| CI/CD | 0 | None |

## Inconsistencies Found

1. **README claims 15 skills; 20 exist.** Undocumented: `hackathon-demo-script`, `hackathon-deployment-prep`, `hackathon-milestone-monitor`, `hackathon-repo-bootstrap`, `hackathon-risk-analyzer`.
2. **README architecture diagram says "15 SKILL.md agent specs"** — stale count.
3. **Phase naming mismatch:** README uses phases 0–8; `hackathon-workflow.md` uses phases 0–9 (includes Deployment Prep). Individual skills reference "Phase 5" / "Phase 6" inconsistently.
4. **No machine-readable registry** — skill discovery requires directory listing.
5. **No input/output schemas** — skill I/O is documented informally in Markdown (two different formats: YAML code blocks vs. tables).
6. **No persistent state** — pipeline depends entirely on conversational memory.
7. **No executable validation** — gate conditions are prose only.
8. **Stack recommendation hardcoded** in README/knowledge (Next.js + FastAPI + Supabase) with no abstraction for other profiles.
9. **`npx skills add` referenced** but no package.json or skills registry metadata exists to support it.
10. **No installation mechanism** — users must manually clone and point agents at files.

## Assets to Preserve

- All 20 skills (content is high quality, consistent structure)
- All 10 knowledge files
- All 5 templates
- All 4 playbooks (will be extended, not replaced)
- YAML frontmatter convention (`name`, `description`)
- LICENSE (Apache License 2.0)

## Migration Risks

| Risk | Mitigation |
|---|---|
| Breaking `npx skills add` users | Keep `skills/` directory as single source of truth; no renames |
| Skill content drift between harness and standalone | One source: `skills/` serves both layers |
| Large new directory tree confuses existing users | MIGRATION.md + deprecation notices |
| pnpm workspace complexity | Flat package structure, minimal interdependencies |

## Proposed Target State

```
hackathon-ai-devkit/
├── packages/          # TypeScript monorepo (cli, core, state-store, orchestrator,
│                      # scaffold-engine, validators, hyperframes-adapter, agent-adapters)
├── agents/            # Agent persona definitions
├── skills/            # Preserved — single source of truth for both install layers
├── knowledge/         # Preserved
├── playbooks/         # Preserved + startup-contest playbook
├── profiles/          # Scaffold profiles (web-ai-fullstack, web-ai-split, blockchain, ...)
├── schemas/           # JSON Schema contracts
├── templates/         # Preserved + hyperframes templates
├── scripts/           # Install validation
├── tests/             # Vitest suites + fixture competition
├── docs/              # Architecture docs, guides, ADRs
├── manifest.yaml      # Canonical skill registry
├── install.sh / update.sh / uninstall.sh
└── README.md          # Rewritten for harness positioning
```

## Implementation Decisions

1. **TypeScript + Node.js** for harness core (matches ecosystem, no competing indicator).
2. **pnpm workspaces** for monorepo management.
3. **commander** for CLI, **js-yaml** for YAML, **ajv** for schema validation, **vitest** for tests.
4. **Skills remain Markdown-first** — harness wraps them with machine-readable schemas in `schemas/skills/`.
5. **State lives in `.hackathon/`** within the user's project (not in this repo).
6. **Scaffold profiles are data-driven** — profile.yaml + template files, not hardcoded generators.
7. **HyperFrames adapter generates a valid project** even when rendering tools are unavailable.
8. **Existing skill names unchanged** — new skills added alongside (hackathon-idea-strategy, hackathon-taste-profiler, etc.).
