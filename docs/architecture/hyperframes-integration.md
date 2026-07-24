# HyperFrames Integration

`@hadk/hyperframes-adapter` produces a complete demo-video project from the
locked demo flow, and reports rendering status honestly
([ADR-006](./decisions/ADR-006-honest-render-reporting.md)).

## What gets generated

`hadk video generate` writes a `demo-video/` project:

```text
demo-video/
├── storyboard.yaml                      # scenes derived from the demo flow
├── asset-manifest.yaml                  # required assets + their status
├── compositions/
│   └── submission-video.html            # the HyperFrames composition (HTML/CSS/JS)
└── package.json                         # render scripts
```

- **Storyboard** — one scene per demo-flow step plus intro/outro, with timing
  that sums to the requested duration (default 60s).
- **Asset manifest** — each `VideoAsset` has `id`, `type`
  (`screenshot | recording | logo | illustration | audio | diagram`), `path`,
  `description`, and `status` (`available | missing | placeholder`). Missing
  assets are declared, not hidden.
- **Composition** — an HTML/CSS/JS composition previewable in any browser.

## API

- `buildPlan(state, options?)` — derives a `VideoPlan` (title, scenes,
  duration) from the locked demo flow without writing files.
- `generate(options?)` — writes the project and returns a
  `VideoGenerateResult` including `files_written`, `video_dir`,
  `render_status`, and `render_blocker`.
- `validate()` — checks the generated project structure (storyboard, asset
  manifest, composition present and well-formed).
- `detectHyperFrames()` — probes for the HyperFrames CLI on `PATH`.

## Honest render reporting

`render_status` is one of:

| Status | Meaning |
|---|---|
| `not_attempted` | Generation succeeded; rendering not run. |
| `blocked` | The HyperFrames CLI is unavailable; `render_blocker` explains why. |
| `rendered` | An MP4 was produced. |

Generation never fakes a render. When the CLI is missing (e.g., in CI), the
project is still generated, valid, and previewable; the blocker is reported
explicitly.

## CLI commands

| Command | Effect |
|---|---|
| `hadk video plan` | Build and summarize the video plan. |
| `hadk video generate [--duration <s>]` | Generate the project. |
| `hadk video preview` | Show how to preview the composition. |
| `hadk video render` | Render to MP4 (requires the HyperFrames CLI). |
| `hadk video validate` | Validate the generated project. |
