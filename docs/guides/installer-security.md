# Guide: Installer & Security

The full harness is installed with:

```bash
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/main/install.sh | bash
```

This guide explains what the installer does, how to control it, and the safety
guarantees it provides.

## What the installer does

1. Detects the OS, shell, Node.js (requires ≥ 20), a package manager
   (pnpm → npm fallback), git, and installed agents.
2. Obtains the source: from a local checkout (if `manifest.yaml` + `packages/`
   are present) or by `git clone`.
3. Installs it to `HADK_INSTALL_DIR` (default `~/.hadk`).
4. Runs the package manager install and build.
5. Creates a `hadk` launcher in `HADK_BIN_DIR` (default `~/.local/bin`).
6. Writes `.hadk-install.json` recording what was installed.
7. Validates the result (`hadk --version` + `scripts/validate-install.sh`) and
   prints the next command.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `HADK_INSTALL_DIR` | `~/.hadk` | Where the harness is installed. |
| `HADK_BIN_DIR` | `~/.local/bin` | Where the `hadk` launcher is written. |
| `HADK_VERSION` | latest | Pin a git ref/version. |
| `HADK_REPO` | upstream URL | Override the source repository. |
| `HADK_NON_INTERACTIVE` | unset | Set to `1` to skip confirmations (CI). |

## Safety guarantees

- **Idempotent.** Re-running the installer is safe; it updates in place.
- **Non-destructive to projects.** The installer never touches any project's
  `.hackathon/` state.
- **Launcher conflict handling.** The launcher is marked `# HADK-MANAGED`. A
  pre-existing *unmanaged* `hadk` is backed up rather than overwritten.
- **Validated.** Installation is confirmed by running the CLI and a validation
  script before reporting success.

## Uninstalling

```bash
bash uninstall.sh
```

- Removes the HADK-managed launcher (backs up any unmanaged one).
- Moves the install dir to `~/.hadk.uninstalled.<timestamp>` instead of
  deleting it. Set `HADK_PURGE=1` to delete permanently.
- Never touches project `.hackathon/` directories.

## Security considerations for `curl | bash`

Piping a remote script to a shell executes whatever the server returns. Treat
it accordingly:

- **Inspect first.** Download and read the script before running:
  ```bash
  curl -fsSL .../install.sh -o install.sh
  less install.sh
  bash install.sh
  ```
- **Pin a version.** Use `HADK_VERSION` to install a specific, reviewed ref
  rather than a moving `main`.
- **Prefer a local checkout** for air-gapped or high-assurance environments:
  clone the repo and run `bash install.sh` from inside it.
- The installer downloads only from the configured source repository and
  standard package registries; it does not fetch arbitrary third-party
  binaries.

## Reproducible installs

For CI, combine a pinned version with non-interactive mode:

```bash
HADK_VERSION=v2.0.0 HADK_NON_INTERACTIVE=1 bash install.sh
```
