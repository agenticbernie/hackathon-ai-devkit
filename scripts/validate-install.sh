#!/usr/bin/env bash
#
# validate-install.sh — verifies a HADK installation is healthy.
# Called automatically by install.sh and usable standalone:
#   bash scripts/validate-install.sh
#
# Exit code 0 = healthy, non-zero = one or more checks failed.

set -uo pipefail

HADK_INSTALL_DIR="${HADK_INSTALL_DIR:-$HOME/.hadk}"
# When run from within the repo, validate that repo; otherwise the install dir.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
if [ -f "$SCRIPT_DIR/../manifest.yaml" ] && [ -d "$SCRIPT_DIR/../packages" ]; then
  HADK_INSTALL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi

if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; D=$'\033[2m'; X=$'\033[0m'; else G=""; R=""; D=""; X=""; fi
PASS=0; FAIL=0
check_file(){ if [ -f "$2" ]; then printf '%s\n' "${G}✓${X} $1"; PASS=$((PASS+1)); else printf '%s\n' "${R}✗${X} $1"; FAIL=$((FAIL+1)); fi; }
check_dir(){ if [ -d "$2" ]; then printf '%s\n' "${G}✓${X} $1"; PASS=$((PASS+1)); else printf '%s\n' "${R}✗${X} $1"; FAIL=$((FAIL+1)); fi; }
check_cmd(){ if "$@" >/dev/null 2>&1; then printf '%s\n' "${G}✓${X} $1"; PASS=$((PASS+1)); else printf '%s\n' "${R}✗${X} $1"; FAIL=$((FAIL+1)); fi; }

printf '%sValidating HADK at %s%s\n' "$D" "$HADK_INSTALL_DIR" "$X"

check_file "manifest.yaml exists" "$HADK_INSTALL_DIR/manifest.yaml"
check_dir "packages/ exists" "$HADK_INSTALL_DIR/packages"
check_dir "skills/ exists" "$HADK_INSTALL_DIR/skills"
check_file "CLI is built (dist/index.js)" "$HADK_INSTALL_DIR/packages/cli/dist/index.js"
check_cmd "node is available" command -v node
check_cmd "hadk --version runs" node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --version
check_cmd "hadk --help runs" node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" --help
check_cmd "registry validates" node "$HADK_INSTALL_DIR/packages/cli/dist/index.js" validate registry

printf '\n%s%d passed, %d failed%s\n' "$D" "$PASS" "$FAIL" "$X"
[ "$FAIL" -eq 0 ]
