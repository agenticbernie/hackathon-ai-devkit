#!/usr/bin/env bash
#
# HADK updater — pulls the latest harness and rebuilds the CLI in place.
# Idempotent and non-destructive: your .hackathon/ project state is never touched.
#
#   curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/main/update.sh | bash
#
# Environment variables:
#   HADK_INSTALL_DIR  Where the harness source lives (default: $HOME/.hadk)
#   HADK_VERSION      Git ref to update to (default: main)

set -euo pipefail

HADK_INSTALL_DIR="${HADK_INSTALL_DIR:-$HOME/.hadk}"
HADK_VERSION="${HADK_VERSION:-main}"

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; X=$'\033[0m'; else G=""; Y=""; R=""; D=""; X=""; fi
info(){ printf '%s\n' "${D}→${X} $*"; }
ok(){ printf '%s\n' "${G}✓${X} $*"; }
warn(){ printf '%s\n' "${Y}⚠${X} $*"; }
fail(){ printf '%s\n' "${R}✗${X} $*" >&2; }

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
  git -C "$HADK_INSTALL_DIR" checkout --quiet "$HADK_VERSION"
  git -C "$HADK_INSTALL_DIR" pull --quiet origin "$HADK_VERSION" || warn "git pull failed; continuing with existing checkout."
  ok "Source updated."
else
  warn "Installation is not a git checkout (likely installed from a local copy)."
  info "To update, re-run install.sh from a fresh clone or set HADK_INSTALL_DIR to a git checkout."
fi

info "Rebuilding the CLI…"
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" install )
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" run build )
ok "Rebuild complete."

if node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version >/dev/null 2>&1; then
  ok "hadk is up to date: $(node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version)"
else
  fail "Post-update validation failed."
  exit 1
fi
