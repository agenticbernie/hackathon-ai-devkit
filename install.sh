#!/usr/bin/env bash
#
# HADK installer — installs the AI-native Competition Engineering Harness.
#
#   curl -fsSL https://raw.githubusercontent.com/agenticbernie/hackathon-ai-devkit/main/install.sh | bash
#
# Or, safer (inspect first):
#   curl -fsSL .../install.sh -o install.sh && less install.sh && bash install.sh
#
# Environment variables:
#   HADK_INSTALL_DIR     Where the harness source lives (default: $HOME/.hadk)
#   HADK_BIN_DIR         Where the `hadk` launcher is linked (default: $HOME/.local/bin)
#   HADK_VERSION         Git ref to install (default: main)
#   HADK_NON_INTERACTIVE Set to 1 to skip all prompts
#   HADK_REPO            Override the source repository URL
#
# The installer is idempotent and non-destructive: re-running is safe, conflicting
# files are backed up, and existing user files are never overwritten.

set -euo pipefail

# ─── Configuration ───────────────────────────────────────────────────────────
HADK_REPO="${HADK_REPO:-https://github.com/agenticbernie/hackathon-ai-devkit.git}"
HADK_VERSION="${HADK_VERSION:-main}"
HADK_INSTALL_DIR="${HADK_INSTALL_DIR:-$HOME/.hadk}"
HADK_BIN_DIR="${HADK_BIN_DIR:-$HOME/.local/bin}"
HADK_NON_INTERACTIVE="${HADK_NON_INTERACTIVE:-0}"
INSTALL_MANIFEST="$HADK_INSTALL_DIR/.hadk-install.json"

# ─── Output helpers ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_DIM=""; C_RESET=""
fi
info()  { printf '%s\n' "${C_DIM}→${C_RESET} $*"; }
ok()    { printf '%s\n' "${C_GREEN}✓${C_RESET} $*"; }
warn()  { printf '%s\n' "${C_YELLOW}⚠${C_RESET} $*"; }
fail()  { printf '%s\n' "${C_RED}✗${C_RESET} $*" >&2; }
header(){ printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_RESET"; }

confirm() {
  # confirm <prompt> — returns 0 if yes. Auto-yes in non-interactive mode.
  if [ "$HADK_NON_INTERACTIVE" = "1" ]; then return 0; fi
  local reply
  read -r -p "$1 [Y/n] " reply || return 0
  case "$reply" in [nN]*) return 1 ;; *) return 0 ;; esac
}

# ─── 1. Detect OS ────────────────────────────────────────────────────────────
header "HADK Installer"
OS="$(uname -s)"
case "$OS" in
  Linux*)  PLATFORM="linux" ;;
  Darwin*) PLATFORM="macos" ;;
  MINGW*|MSYS*|CYGWIN*) PLATFORM="windows" ;;
  *)       PLATFORM="unknown" ;;
esac
info "Operating system: $OS ($PLATFORM)"
if [ "$PLATFORM" = "unknown" ]; then
  warn "Unrecognized platform '$OS'. The installer will try to continue, but this platform is not officially supported."
fi
if [ "$PLATFORM" = "windows" ]; then
  warn "Native Windows is not supported. Please run inside WSL or Git Bash."
fi

# ─── 2. Detect shell ─────────────────────────────────────────────────────────
SHELL_NAME="$(basename "${SHELL:-unknown}")"
info "Shell: $SHELL_NAME"

# ─── 3. Detect Node.js ───────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  fail "Node.js not found. HADK requires Node.js >= 20."
  info "Install it from https://nodejs.org or via your package manager, then re-run this installer."
  exit 1
fi
NODE_VERSION="$(node -v | sed 's/^v//')"
NODE_MAJOR="${NODE_VERSION%%.*}"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js >= 20 is required (found v$NODE_VERSION)."
  exit 1
fi
ok "Node.js v$NODE_VERSION"

# ─── 4. Detect package manager ───────────────────────────────────────────────
PKG_MANAGER=""
if command -v pnpm >/dev/null 2>&1; then PKG_MANAGER="pnpm"
elif command -v npm >/dev/null 2>&1; then PKG_MANAGER="npm"
fi
if [ -z "$PKG_MANAGER" ]; then
  fail "No package manager found (need pnpm or npm)."
  exit 1
fi
ok "Package manager: $PKG_MANAGER"
if [ "$PKG_MANAGER" = "npm" ]; then
  warn "pnpm is recommended. The monorepo uses pnpm workspaces; npm will install but pnpm gives the cleanest build."
fi

# ─── 5. Detect git ───────────────────────────────────────────────────────────
if command -v git >/dev/null 2>&1; then
  ok "git: $(git --version)"
  HAVE_GIT=1
else
  warn "git not found. It is required to fetch the harness unless you are installing from a local clone."
  HAVE_GIT=0
fi

# ─── 6. Detect supported agents ──────────────────────────────────────────────
header "Detecting agents"
DETECTED_AGENTS=""
for agent in claude codex opencode; do
  if command -v "$agent" >/dev/null 2>&1; then
    ok "Agent found: $agent"
    DETECTED_AGENTS="$DETECTED_AGENTS $agent"
  fi
done
[ -z "$DETECTED_AGENTS" ] && info "No supported agents detected (claude-code, codex, opencode). You can still use the CLI directly."

# ─── 7. Acquire the harness source ───────────────────────────────────────────
header "Installing harness to $HADK_INSTALL_DIR"

# Determine if this script is running from inside a checkout of the repo.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
LOCAL_SOURCE=""
if [ -f "$SCRIPT_DIR/manifest.yaml" ] && [ -d "$SCRIPT_DIR/packages" ]; then
  LOCAL_SOURCE="$SCRIPT_DIR"
fi

if [ -n "$LOCAL_SOURCE" ]; then
  info "Installing from local checkout: $LOCAL_SOURCE"
  mkdir -p "$HADK_INSTALL_DIR"
  # Copy source into the install dir (idempotent rsync-style copy).
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete-after \
      --exclude '.git' --exclude 'node_modules' --exclude '.e2e-test' \
      "$LOCAL_SOURCE/" "$HADK_INSTALL_DIR/"
  else
    # Fallback: cp -R without clobbering .git in the target.
    ( cd "$LOCAL_SOURCE" && tar --exclude='.git' --exclude='node_modules' --exclude='.e2e-test' -cf - . ) \
      | ( cd "$HADK_INSTALL_DIR" && tar -xf - )
  fi
else
  if [ "$HAVE_GIT" = "0" ]; then
    fail "Cannot fetch the harness: git is not installed and no local checkout was found."
    exit 1
  fi
  if [ -d "$HADK_INSTALL_DIR/.git" ]; then
    info "Existing installation found — updating to $HADK_VERSION."
    git -C "$HADK_INSTALL_DIR" fetch --quiet origin
    git -C "$HADK_INSTALL_DIR" checkout --quiet "$HADK_VERSION"
    git -C "$HADK_INSTALL_DIR" pull --quiet origin "$HADK_VERSION" || warn "git pull failed; continuing with existing checkout."
  else
    info "Cloning $HADK_REPO ($HADK_VERSION)…"
    mkdir -p "$(dirname "$HADK_INSTALL_DIR")"
    git clone --quiet --branch "$HADK_VERSION" "$HADK_REPO" "$HADK_INSTALL_DIR" \
      || git clone --quiet "$HADK_REPO" "$HADK_INSTALL_DIR"
  fi
fi
ok "Harness source ready at $HADK_INSTALL_DIR"

# ─── 8. Build the CLI ────────────────────────────────────────────────────────
header "Building the CLI"
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" install )
( cd "$HADK_INSTALL_DIR" && "$PKG_MANAGER" run build )
ok "Build complete"

# ─── 9. Install the launcher ─────────────────────────────────────────────────
header "Linking the hadk launcher"
mkdir -p "$HADK_BIN_DIR"
LAUNCHER="$HADK_BIN_DIR/hadk"

# Back up an existing, non-HADK-managed launcher.
if [ -e "$LAUNCHER" ] && ! grep -q "HADK-MANAGED" "$LAUNCHER" 2>/dev/null; then
  BACKUP="$LAUNCHER.bak.$(date +%s)"
  warn "Existing $LAUNCHER is not HADK-managed — backing up to $BACKUP"
  mv "$LAUNCHER" "$BACKUP"
fi

cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
# HADK-MANAGED — do not edit. Reinstall to change.
exec node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" "\$@"
EOF
chmod +x "$LAUNCHER"
ok "Launcher installed at $LAUNCHER"

# ─── 10. PATH guidance ───────────────────────────────────────────────────────
case ":$PATH:" in
  *":$HADK_BIN_DIR:"*) ok "$HADK_BIN_DIR is already on your PATH." ;;
  *)
    warn "$HADK_BIN_DIR is not on your PATH."
    info "Add it to your shell profile:"
    printf '    export PATH="%s:$PATH"\n' "$HADK_BIN_DIR"
    ;;
esac

# ─── 11. Write installation manifest ─────────────────────────────────────────
cat > "$INSTALL_MANIFEST" <<EOF
{
  "installer": "hadk-install",
  "version": "$HADK_VERSION",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platform": "$PLATFORM",
  "node": "v$NODE_VERSION",
  "package_manager": "$PKG_MANAGER",
  "install_dir": "$HADK_INSTALL_DIR",
  "bin_dir": "$HADK_BIN_DIR",
  "launcher": "$LAUNCHER",
  "agents": "$(echo "$DETECTED_AGENTS" | xargs || true)"
}
EOF
ok "Installation manifest written to $INSTALL_MANIFEST"

# ─── 12. Validate installation ───────────────────────────────────────────────
header "Validating installation"
if node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version >/dev/null 2>&1; then
  ok "hadk --version works: $(node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version)"
else
  fail "Validation failed: hadk --version did not run."
  exit 1
fi
if [ -f "$HADK_INSTALL_DIR/scripts/validate-install.sh" ]; then
  bash "$HADK_INSTALL_DIR/scripts/validate-install.sh" || warn "Extended validation reported issues."
fi

# ─── 13. Done ────────────────────────────────────────────────────────────────
header "Installation complete"
ok "HADK is installed."
printf '\n%sNext steps:%s\n' "$C_BOLD" "$C_RESET"
printf '    cd <your-project>\n'
printf '    hadk setup\n'
printf '    hadk ingest <competition-url-or-file>\n'
printf '\n%sStandalone skills only?%s Use: npx skills add agenticbernie/hackathon-ai-devkit\n' "$C_DIM" "$C_RESET"
