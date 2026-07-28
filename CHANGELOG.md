# Changelog

All notable changes to the HADK (Hackathon AI DevKit) project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.5] - 2026-07-28

### Fixed
- **Installer**: enforces `pnpm` for the pnpm-workspace monorepo. Auto-bootstraps pnpm via Corepack when missing and fails with clear instructions if Corepack is unavailable. Removes misleading npm fallback.
- **Strategy/taste**: `hadk strategy --taste user` now accepts real input via `--market`, `--layer`, `--technology`, `--business-shape`, `--traits`, and `--taste-file` flags. Falls back to auto inference with a warning when no taste data is supplied.
- **State consistency**: `hadk scaffold` now sets `gates.architecture_gate = 'passed'` when advancing phase to `build`.
- **Scope invalidation**: `hadk scope --unlock` and `hadk replan` now create a checkpoint, reset downstream gates (`architecture_gate` → `submission_gate`), reset `scope_gate`, invalidate architecture, and roll phase back to `scope`.
- **Checkpoint safety**: `scope --unlock` now checks the checkpoint result and aborts if the checkpoint cannot be created.
- **Generated tests**: replaced fake-pass `expect(true).toBe(true)` tests with honest `it.todo('implements the feature contract')` and contract-oriented todos.
- **API routes**: generated Next.js routes now include design-contract comments and proper 400 error handling for invalid JSON bodies.
- **Video render**: `hadk video render` now detects the HyperFrames CLI (`hyperframes` or `hf`), attempts a real render, verifies the produced MP4, and reports honest status when the CLI is unavailable.
- **Version**: synchronized version to `2.0.5` across README, root `package.json`, all workspace packages, `HADK_VERSION`, and the implementation report.
- **Pipeline lifecycle**: scope budget, gate validation, phase advancement, and render lifecycle now use consistent runtime state and permit an end-to-end completion path.
- **Input and recovery safety**: invalid configuration values and failed URL fetches are rejected; corrupt state can recover from `state.yaml.bak`; unmanaged local installer targets are protected.

### Added
- **Idea import contract**: external agent results now have a documented schema, validated candidate fields, recalculated scores, and selected-candidate consistency checks.
- **Render failure reporting**: failed or blocked video renders persist `video_status`, `video_gate`, and a render report for `hadk status` and `hadk next`.
- Provenance metadata in generated idea artifacts: `generation_mode` (`heuristic_fallback` | `declared_intent` | `agent_imported`) and `confidence` (`low` | `medium` | `high`).
- CLI flags `--agent` and `--provider` on `hadk idea` to declare intended agent/provider execution.

### Known limitations
- Idea agent/provider execution is not yet implemented; heuristic generation runs with clear provenance labeling.
- Scaffold generation is still a scope-shaped structural skeleton, not yet a fully semantic prototype derived from feature design contracts.
- Scaffold dependency installation, typecheck, build, and health verification are not yet automated.
- Competition intelligence (past winners, idea saturation, track comparison, evidence-backed reasoning) remains deferred.

## [2.0.0] - 2026-07-23

### Added
- Initial release of HADK as an AI-native Competition Engineering Harness.
- Eight TypeScript packages: `@hadk/core`, `@hadk/state-store`, `@hadk/orchestrator`, `@hadk/scaffold-engine`, `@hadk/validators`, `@hadk/hyperframes-adapter`, `@hadk/agent-adapters`, `@hadk/cli`.
- `hadk` CLI with 19 commands driving a gated, deadline-aware pipeline.
- Persistent atomic `.hackathon/` state, schema migration, checkpoints, and rollback.
- Three strategy modes (`conservative`, `realistic`, `futuristic`) and auto-inferred taste profiles.
- Scope-driven scaffold engine with dry-run, content-hash conflict detection, and three working profiles.
- HyperFrames demo-video project generator.
- Multi-agent adapters (Claude Code, Codex, OpenCode) from one canonical protocol.
- Idempotent `curl | bash` installer and standalone skill flow via `npx skills add`.
- 63-test suite covering state, scaffold, orchestrator, validators, hyperframes, and a full fixture competition end-to-end through the real CLI.
