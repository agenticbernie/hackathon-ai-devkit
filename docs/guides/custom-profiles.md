# Guide: Custom Scaffold Profiles

The scaffold engine is data-driven ([ADR-004](../architecture/decisions/ADR-004-data-driven-scaffold.md)).
A profile is a `ProfileDefinition`; the engine interprets it. Adding a profile
means adding a definition and registering it — no new engine code.

## The `ProfileDefinition` contract

```ts
interface ProfileDefinition {
  name: string;                 // e.g. "web-ai-fullstack"
  description: string;          // shown in help / listings
  stack: string[];              // e.g. ["next.js", "openai", "tailwind"]
  startupCommand: string;       // e.g. "pnpm dev"
  healthCheck: string;          // e.g. "curl http://localhost:3000/api/health"
  postInstallCommands: string[];// e.g. ["pnpm prisma generate"]
  generateFiles(ctx: ProfileContext): ScaffoldFile[]; // the file set
  mapFeature(featureId: string, featureName: string): FeatureMapping; // scope → files
}
```

`generateFiles` returns the list of `ScaffoldFile` objects (path, template
content, and a content hash). `mapFeature` maps each locked scope feature to
the files that implement it, giving end-to-end traceability from scope to code.

## Registering a profile

Profiles live in a registry inside `packages/scaffold-engine/src/profiles.ts`:

```ts
const PROFILES: Record<string, ProfileDefinition> = {
  'web-ai-fullstack': webAiFullstackProfile,
  'web-ai-split': webAiSplitProfile,
  blockchain: blockchainProfile,
  // 'my-profile': myProfile,   ← add here
};
```

`listProfiles()` and `getProfile(name)` read from this registry, and the CLI's
`--profile` option is generated from `listProfiles()`, so a newly registered
profile shows up automatically in help and tab-completion text.

## Authoring tips

- **Generate a health endpoint.** Every built-in profile emits a `/api/health`
  (or equivalent) route so the smoke test and `healthCheck` work.
- **Keep templates deterministic.** Content hashes drive conflict detection;
  stable output means re-running `hadk scaffold` skips identical files instead
  of flagging false conflicts.
- **Map every MVP feature.** `mapFeature` should return a meaningful mapping
  for each feature id the scope can contain (`core_mechanism`, `input_surface`,
  `output_view`, `demo_data`, …).
- **Declare realistic commands.** `startupCommand` and `postInstallCommands`
  are surfaced to the user and recorded in `hadk.project.yaml`.

## Testing a new profile

Add a case to the scaffold tests (which iterate `IMPLEMENTED_PROFILES`) or run
manually:

```bash
pnpm build
hadk scaffold --profile my-profile --dry-run   # preview the file set
hadk scaffold --profile my-profile             # generate for real
```

Remember to add the profile name to `IMPLEMENTED_PROFILES` in `@hadk/core` if
it should be part of the guaranteed-working set covered by tests.
