#!/usr/bin/env bash
#
# HADK uninstaller — removes the harness installation and launcher.
#
# Non-destructive by default: the install directory is moved to a timestamped
# backup instead of being deleted. Your per-project .hackathon/ state is NEVER
# touched — uninstalling the harness does not remove any competition work.
#
# Environment variables:
#   HADK_INSTALL_DIR     Where the harness source lives (default: $HOME/.hadk)
#   HADK_BIN_DIR         Where the launcher lives (default: $HOME/.local/bin)
#   HADK_NON_INTERACTIVE Set to 1 to skip prompts
#   HADK_PURGE           Set to 1 to permanently delete instead of backing up

set -euo pipefail

HADK_INSTALL_DIR="${HADK_INSTALL_DIR:-$HOME/.hadk}"
HADK_BIN_DIR="${HADK_BIN_DIR:-$HOME/.local/bin}"
HADK_NON_INTERACTIVE="${HADK_NON_INTERACTIVE:-0}"
HADK_PURGE="${HADK_PURGE:-0}"
LAUNCHER="$HADK_BIN_DIR/hadk"

if [ -t 1 ]; then G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; X=$'\033[0m'; else G=""; Y=""; R=""; D=""; X=""; fi
info(){ printf '%s\n' "${D}→${X} $*"; }
ok(){ printf '%s\n' "${G}✓${X} $*"; }
warn(){ printf '%s\n' "${Y}⚠${X} $*"; }

confirm() {
  if [ "$HADK_NON_INTERACTIVE" = "1" ]; then return 0; fi
  local reply; read -r -p "$1 [y/N] " reply || return 1
  case "$reply" in [yY]*) return 0 ;; *) return 1 ;; esac
}

printf '\n%sUninstall HADK%s\n' "$( [ -t 1 ] && printf '\033[1m' )" "$( [ -t 1 ] && printf '\033[0m' )"
info "Install dir: $HADK_INSTALL_DIR"
info "Launcher:    $LAUNCHER"
info "Your project .hackathon/ state will NOT be removed."

if ! confirm "Proceed with uninstall?"; then
  info "Aborted. Nothing was changed."
  exit 0
fi

# Remove launcher (only if HADK-managed; otherwise back it up).
if [ -e "$LAUNCHER" ]; then
  if grep -q "HADK-MANAGED" "$LAUNCHER" 2>/dev/null; then
    rm -f "$LAUNCHER"
    ok "Removed launcher $LAUNCHER"
  else
    BACKUP="$LAUNCHER.bak.$(date +%s)"
    warn "$LAUNCHER is not HADK-managed — moving to $BACKUP"
    mv "$LAUNCHER" "$BACKUP"
  fi
fi

# Remove install dir (backup by default, purge only if explicitly requested).
if [ -d "$HADK_INSTALL_DIR" ]; then
  if [ "$HADK_PURGE" = "1" ]; then
    rm -rf "$HADK_INSTALL_DIR"
    ok "Permanently deleted $HADK_INSTALL_DIR"
  else
    BACKUP_DIR="${HADK_INSTALL_DIR}.uninstalled.$(date +%s)"
    mv "$HADK_INSTALL_DIR" "$BACKUP_DIR"
    ok "Moved $HADK_INSTALL_DIR → $BACKUP_DIR"
    info "Set HADK_PURGE=1 to permanently delete instead of backing up."
  fi
fi

ok "Uninstall complete. Your competition state in any project's .hackathon/ is untouched."
