#!/usr/bin/env bash
#
# install.sh — Install self-critic hooks into Claude Code.
#
# Usage:
#   ./install.sh              # test in /tmp, then install/update
#   ./install.sh --uninstall  # remove hooks
#   ./install.sh --test-only  # run tests in /tmp without installing
#
# Workflow (TDD red-green gate):
#   1. Clone current repo state into a /tmp sandbox
#   2. Run the full test suite there
#   3. RED  → tests fail: abort, do not touch ~/.claude
#   4. GREEN → tests pass: deploy hooks + merge settings.json
#
# Idempotent: safe to run multiple times. Backs up settings.json before
# modifying. Requires jq and node >=20.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
DEST="$HOME/.claude/hooks/self-critic"
SETTINGS="$HOME/.claude/settings.json"
STOP_CMD="node \$HOME/.claude/hooks/self-critic/stop-hook.mjs"
PRETOOL_CMD="node \$HOME/.claude/hooks/self-critic/pretool-hook.mjs"

# ── colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

c_red()    { echo -e "${RED}$*${NC}"; }
c_green()  { echo -e "${GREEN}$*${NC}"; }
c_yellow() { echo -e "${YELLOW}$*${NC}"; }
c_bold()   { echo -e "${BOLD}$*${NC}"; }

# ── helpers ──────────────────────────────────────────────────────────

die() { c_red "error: $*"; echo; exit 1; }

check_deps() {
  command -v node >/dev/null 2>&1 || die "node >=20 is required but not found."
  command -v jq >/dev/null 2>&1   || die "jq is required but not found."

  local node_major
  node_major=$(node -e 'console.log(process.versions.node.split(".")[0])')
  [ "$node_major" -ge 20 ] || die "node >=20 required, found v$node_major."
}

backup_settings() {
  [ -f "$SETTINGS" ] || return 0
  local bak="${SETTINGS}.bak"
  cp "$SETTINGS" "$bak"
  echo "Backed up settings.json → $bak"
}

# Check if a hook command already exists in a named array.
has_hook() {
  local event="$1" needle="$2"
  [ -f "$SETTINGS" ] || return 1
  jq -e --arg n "$needle" \
    '[.hooks["'"$event"'"] // [] | .[].hooks[]?.command] | any(test($n))' \
    "$SETTINGS" >/dev/null 2>&1
}

# ── TDD gate: run tests in /tmp sandbox ──────────────────────────────
#
# Copies the repo into a temp dir, runs `node --test`, parses the output.
# Exits the script with code 1 if tests fail.

run_tests_in_tmp() {
  local sandbox tmp_dir test_output pass_count fail_count

  c_bold "Running test suite in /tmp sandbox..."
  echo

  tmp_dir=$(mktemp -d "/tmp/self-critic-test-XXXXXX")

  # Copy only what's needed: src/, test/, package.json
  mkdir -p "$tmp_dir/src" "$tmp_dir/test/fixtures"
  cp "$SRC"/*.mjs "$tmp_dir/src/"
  cp "$ROOT"/test/*.test.mjs "$tmp_dir/test/"
  cp "$ROOT"/test/fixtures/* "$tmp_dir/test/fixtures/"
  cp "$ROOT/package.json" "$tmp_dir/"

  # Run tests in sandbox — capture both output and exit code
  set +e
  test_output=$(cd "$tmp_dir" && node --test 2>&1)
  test_exit=$?
  set -e

  # Parse summary lines (node --test uses ℹ prefix, fallback to # for TAP)
  pass_count=$(echo "$test_output" | grep -oE '(pass|tests)\s+[0-9]+' | grep -oE '[0-9]+' | head -1)
  fail_count=$(echo "$test_output" | grep -oE 'fail\s+[0-9]+' | grep -oE '[0-9]+' | head -1)
  pass_count=${pass_count:-0}
  fail_count=${fail_count:-0}

  # Clean up sandbox
  rm -rf "$tmp_dir"

  echo "$test_output" | tail -20
  echo

  if [ "$test_exit" -ne 0 ] || [ "$fail_count" -gt 0 ]; then
    c_red "  RED  — $fail_count test(s) failed, $pass_count passed"
    echo
    c_bold "INSTALL ABORTED"
    c_red "Tests failed. Fix the failing tests before deploying."
    exit 1
  fi

  c_green "  GREEN — $pass_count test(s) passed, 0 failed"
  echo
}

# ── install ──────────────────────────────────────────────────────────

install_files() {
  mkdir -p "$DEST" "$DEST/state"
  find "$SRC" -maxdepth 1 -name '*.mjs' -exec cp {} "$DEST"/ \;
  # prune stale per-session state (older than 14 days)
  find "$DEST/state" -maxdepth 1 -name '*.json' -type f -mtime +14 -delete 2>/dev/null || true
  echo "Copied hooks → $DEST"
}

install_settings() {
  # Ensure settings.json exists with minimal structure.
  if [ ! -f "$SETTINGS" ]; then
    mkdir -p "$(dirname "$SETTINGS")"
    echo '{}' > "$SETTINGS"
    echo "Created $SETTINGS"
  fi

  backup_settings

  local changed=false

  # Stop hook
  if has_hook "Stop" "self-critic/stop-hook"; then
    echo "Stop hook already configured — skipping."
  else
    local tmp
    tmp=$(mktemp)
    jq --arg cmd "$STOP_CMD" \
      '.hooks.Stop = ((.hooks.Stop // []) + [{"hooks":[{"type":"command","command":$cmd,"timeout":75}]}])' \
      "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    echo "Added Stop hook."
    changed=true
  fi

  # PreToolUse hook (matcher: Bash|Edit|Write)
  if has_hook "PreToolUse" "self-critic/pretool-hook"; then
    echo "PreToolUse hook already configured — skipping."
  else
    local tmp
    tmp=$(mktemp)
    jq --arg cmd "$PRETOOL_CMD" \
      '.hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"matcher":"Bash|Edit|Write","hooks":[{"type":"command","command":$cmd,"timeout":15}]}])' \
      "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
    echo "Added PreToolUse hook (matcher: Bash|Edit|Write)."
    changed=true
  fi

  if [ "$changed" = true ]; then
    echo "settings.json updated."
  else
    echo "No settings changes needed (already up to date)."
  fi
}

# ── uninstall ────────────────────────────────────────────────────────

uninstall_settings() {
  [ -f "$SETTINGS" ] || { echo "No settings.json found — nothing to remove."; return; }
  backup_settings

  local tmp
  tmp=$(mktemp)
  # Remove self-critic commands from inner hooks arrays; drop entries
  # left with no hooks. Preserves matcher keys and all non-self-critic hooks.
  jq '
    .hooks |= map_values(
      map(
        .hooks |= map(select(.command | test("self-critic") | not)) |
        select(.hooks | length > 0)
      )
    )
  ' "$SETTINGS" > "$tmp" && mv "$tmp" "$SETTINGS"
  echo "Removed self-critic hooks from settings.json."
}

uninstall_files() {
  if [ -d "$DEST" ]; then
    rm -rf "$DEST"
    echo "Removed $DEST"
  else
    echo "No hook directory found — already clean."
  fi
}

# ── main ─────────────────────────────────────────────────────────────

main() {
  check_deps

  case "${1:-}" in
    --uninstall|-u)
      c_bold "Uninstalling self-critic hooks..."
      echo
      uninstall_settings
      uninstall_files
      echo
      c_green "Self-critic hooks uninstalled."
      ;;
    --test-only|-t)
      run_tests_in_tmp
      c_green "All tests passed."
      ;;
    --help|-h)
      cat <<'USAGE'
install.sh — Install self-critic hooks for Claude Code

Usage:
  ./install.sh              Test in /tmp, then install/update hooks
  ./install.sh --test-only  Run tests in /tmp without installing
  ./install.sh --uninstall  Remove hooks and hook directory
  ./install.sh --help       Show this help

Tests run in an isolated /tmp sandbox before any files are deployed.
If tests fail (RED), installation is aborted. If tests pass (GREEN),
hooks are deployed and settings.json is merged.
USAGE
      ;;
    ""|install)
      c_bold "self-critic installer"
      echo
      run_tests_in_tmp
      c_bold "Deploying hooks..."
      echo
      install_files
      install_settings
      echo
      c_green "Done. Restart Claude Code sessions to activate."
      ;;
    *)
      die "Unknown argument: $1. Use --uninstall, --test-only, or --help."
      ;;
  esac
}

main "$@"
