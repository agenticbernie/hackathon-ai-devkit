#!/usr/bin/env bash
#
# HADK updater — pulls the latest harness and rebuilds the CLI in place.
# Idempotent and non-destructive: your .hackathon/ project state is never touched.
#
#   curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/33da63aba406b9d10f032ae7db0ccf5412b9246a/update.sh | bash
#
# Environment variables:
#   HADK_INSTALL_DIR  Where the harness source lives (default: $HOME/.hadk)
#   HADK_VERSION      Immutable tag or commit to update to
#   HADK_ALLOW_MOVING_REF Set to 1 to explicitly allow a moving ref

set -euo pipefail

HADK_INSTALL_DIR="${HADK_INSTALL_DIR:-$HOME/.hadk}"
HADK_VERSION="${HADK_VERSION:-33da63aba406b9d10f032ae7db0ccf5412b9246a}"
HADK_ALLOW_MOVING_REF="${HADK_ALLOW_MOVING_REF:-0}"
HADK_SHA256="${HADK_SHA256:-}"

case "$HADK_VERSION" in
  main|master|develop|latest|release|stable)
    [ "$HADK_ALLOW_MOVING_REF" = "1" ] || { fail "Refusing moving ref '$HADK_VERSION'. Set HADK_ALLOW_MOVING_REF=1 to opt in."; exit 1; }
    ;;
esac
if [ "$HADK_ALLOW_MOVING_REF" != "1" ] && ! printf '%s' "$HADK_VERSION" | grep -Eq '^[0-9a-fA-F]{40}$'; then
  fail "HADK_VERSION must be a full 40-character commit SHA unless HADK_ALLOW_MOVING_REF=1."
  exit 1
fi

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; X=$'\033[0m'; else G=""; Y=""; R=""; D=""; X=""; fi
info(){ printf '%s\n' "${D}→${X} $*"; }
ok(){ printf '%s\n' "${G}✓${X} $*"; }
warn(){ printf '%s\n' "${Y}⚠${X} $*"; }
fail(){ printf '%s\n' "${R}✗${X} $*" >&2; }

source_sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    git -C "$HADK_INSTALL_DIR" archive --format=tar HEAD | sha256sum | awk '{print $1}'
  else
    git -C "$HADK_INSTALL_DIR" archive --format=tar HEAD | shasum -a 256 | awk '{print $1}'
  fi
}

if [ ! -d "$HADK_INSTALL_DIR" ]; then
  fail "No installation found at $HADK_INSTALL_DIR. Run install.sh first."
  exit 1
fi

# Detect package manager.
PKG_MANAGER=""
if command -v pnpm >/dev/null 2>&1; then PKG_MANAGER="pnpm"; elif command -v npm >/dev/null 2>&1; then PKG_MANAGER="npm"; fi
[ -z "$PKG_MANAGER" ] && { fail "No package manager found (need pnpm or npm)."; exit 1; }

info "Updating HADK at $HADK_INSTALL_DIR to $HADK_VERSION"

if [ -d "$HADK_INSTALL_DIR/.git" ]; then
  git -C "$HADK_INSTALL_DIR" fetch --quiet origin
  git -C "$HADK_INSTALL_DIR" fetch --quiet origin "$HADK_VERSION"
  git -C "$HADK_INSTALL_DIR" checkout --quiet --detach "$HADK_VERSION"
  SOURCE_SHA256="$(source_sha256)"
  if [ -n "$HADK_SHA256" ] && [ "$SOURCE_SHA256" != "$HADK_SHA256" ]; then
    fail "Source checksum mismatch. Expected $HADK_SHA256, got $SOURCE_SHA256."
    exit 1
  fi
  [ -z "$HADK_SHA256" ] || ok "Source checksum verified."
  ok "Source updated."
else
  warn "Installation is not a git checkout (likely installed from a local copy)."
  info "To update, re-run install.sh from a fresh clone or set HADK_INSTALL_DIR to a git checkout."
fi

info "Rebuilding the CLI…"
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" install --frozen-lockfile )
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" run build )
ok "Rebuild complete."

if node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version >/dev/null 2>&1; then
  ok "hadk is up to date: $(node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version)"
else
  fail "Post-update validation failed."
  exit 1
fi
