# Guide: Installer & Security

The full harness is installed with:

```bash
curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/33da63aba406b9d10f032ae7db0ccf5412b9246a/install.sh | bash
```

This guide explains what the installer does, how to control it, and the safety
guarantees it provides.

For v2.1, prefer an immutable release tag or commit revision. Moving branches
are supported only with explicit opt-in and must be recorded in the install
manifest. Package installation uses the repository lockfile. Never place
credentials in installer output or generated project artifacts.

## What the installer does

1. Detects the OS, shell, Node.js (requires ≥ 20), pnpm (bootstraps via Corepack
   if missing), git, and installed agents.
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
| `HADK_VERSION` | pinned v2.1 commit SHA | Full 40-character commit SHA; moving refs require explicit opt-in. |
| `HADK_ALLOW_MOVING_REF` | `0` | Set to `1` only when intentionally using a moving ref. |
| `HADK_SHA256` | unset | Optional SHA-256 pin for the deterministic Git source archive. |
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
- **Checksum-aware.** When `HADK_SHA256` is supplied, install/update refuses a
  source archive whose checksum does not match and records the actual checksum.

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
HADK_VERSION=33da63aba406b9d10f032ae7db0ccf5412b9246a HADK_NON_INTERACTIVE=1 bash install.sh
```

To calculate the archive checksum for a checked-out revision:

```bash
git archive --format=tar HEAD | sha256sum
```
