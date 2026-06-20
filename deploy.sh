#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC="$ROOT/src"
DEST="$HOME/.claude/hooks/self-critic"
mkdir -p "$DEST"
find "$SRC" -maxdepth 1 -name '*.mjs' -exec cp {} "$DEST"/ \;
# prune stale per-session state (older than 14 days)
mkdir -p "$DEST/state"
find "$DEST/state" -maxdepth 1 -name '*.json' -type f -mtime +14 -delete 2>/dev/null || true
echo "Deployed .mjs files to $DEST"
echo ""
echo "Now add these to ~/.claude/settings.json (merge into existing hooks, do not replace):"
echo ""
cat <<'JSON'
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node $HOME/.claude/hooks/self-critic/stop-hook.mjs", "timeout": 75 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|Edit|Write", "hooks": [ { "type": "command", "command": "node $HOME/.claude/hooks/self-critic/pretool-hook.mjs", "timeout": 15 } ] }
    ]
  }
JSON
echo ""
echo "Note: Use the absolute \$HOME path in the command, not ~. Claude Code does not expand ~ in hook commands."
