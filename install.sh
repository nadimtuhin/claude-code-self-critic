#!/usr/bin/env bash
#
# install.sh — Install self-critic hooks into Claude Code.
#
# Usage:
#   ./install.sh              # install hooks
#   ./install.sh --uninstall  # remove hooks
#
# Idempotent: safe to run multiple times. Backs up settings.json before
# modifying. Requires jq.
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
DEST="$HOME/.claude/hooks/self-critic"
SETTINGS="$HOME/.claude/settings.json"
STOP_CMD="node \$HOME/.claude/hooks/self-critic/stop-hook.mjs"
PRETOOL_CMD="node \$HOME/.claude/hooks/self-critic/pretool-hook.mjs"

# ── helpers ──────────────────────────────────────────────────────────

die() { echo "error: $*" >&2; exit 1; }

need_jq() {
  command -v jq >/dev/null 2>&1 || die "jq is required but not found in PATH."
}

backup_settings() {
  [ -f "$SETTINGS" ] || return 0
  local bak="${SETTINGS}.bak"
  cp "$SETTINGS" "$bak"
  echo "Backed up settings.json → $bak"
}

# Check if a hook command already exists in a named array.
# Args: <event-name> <command-substring>
has_hook() {
  local event="$1" needle="$2"
  [ -f "$SETTINGS" ] || return 1
  jq -e --arg n "$needle" \
    '[.hooks["'"$event"'"] // [] | .[].hooks[]?.command] | any(test($n))' \
    "$SETTINGS" >/dev/null 2>&1
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
    echo "No settings changes needed."
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
  need_jq

  case "${1:-}" in
    --uninstall|-u)
      uninstall_settings
      uninstall_files
      echo "Self-critic hooks uninstalled."
      ;;
    --help|-h)
      echo "Usage: ./install.sh [--uninstall]"
      ;;
    ""|install)
      install_files
      install_settings
      echo ""
      echo "Done. Restart Claude Code sessions to activate."
      ;;
    *)
      die "Unknown argument: $1. Use --uninstall or --help."
      ;;
  esac
}

main "$@"
