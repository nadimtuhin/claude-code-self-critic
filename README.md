# Self-Critic Hooks

Two Claude Code hooks that provide real-time self-critique and stuck-detection during agent execution.

## What It Is

**Stop Hook** — A self-critic that runs at the end of each turn. Uses deterministic fact-gating (evidence extraction + rule-based checks) to build a block reason from unbacked claims. If the gate fires, escalates to a brief Haiku LLM veto — Haiku is used only to suppress false-positives, not to author the critique. Episode cap of 1 prevents infinite critique loops.

**PreToolUse Stuck-Detector** — Runs before executing Bash, Edit, or Write. Detects when the same flag-normalized Bash target (or file_path for Edit/Write) is repeated 3+ times in a window and sends a mid-turn nudge to course-correct. Read tool calls are excluded entirely (re-reading files during iteration is normal). Window resets each turn. Escalates level if the issue persists.

## Architecture

Pure cores (no I/O, 100% testable):
- **`fact-gate.mjs`** — Extracts evidence from turns, applies rule-based gates (test claims, vague completions, etc.)
- **`critic-core.mjs`** — Fact-gate decision logic + episode tracking
- **`stuck-core.mjs`** — Failure window tracking, repeat detection, escalation logic

I/O edge modules:
- **`evidence.mjs`** — Test-run detection, command parsing, file reads for test-validity checks (reads filesystem)
- **`state.mjs`** — File-based state persistence (JSON, reads/writes filesystem)

Thin wiring (hooks):
- **`stop-hook.mjs`** — Stop hook entry point; reads last assistant message, runs critique, writes state
- **`pretool-hook.mjs`** — PreToolUse hook entry point; detects repeats, nudges if needed

All unit tests (`*.test.mjs`) run with zero dependencies: `node --test`.

## Key Validated Facts

- **`stop_hook_active` gates re-critique** — A turn only gets critiqued if the previous critique didn't already run. Prevents cascading critiques.
- **Last message on Stop stdin** — The Stop hook receives the agent's last assistant message via stdin.
- **Haiku critic invocation** — Uses `claude -p --model haiku --setting-sources project` from a temporary working directory with `SELF_CRITIC_NESTED=1` guard. NOT `--bare`, which breaks OAuth auth.
- **PostToolUse does NOT fire on tool failures** — The stuck-detector must wire on PreToolUse, not PostToolUse.
- **Fail-open** — Any hook error allows the turn (never blocks on hook bug).

## Install

```bash
bash deploy.sh
```

This copies all `.mjs` files to `~/.claude/hooks/self-critic/` and prints the settings.json snippet.

Merge the printed snippet into `~/.claude/settings.json` manually. Use the absolute `$HOME` path in hook commands (Claude Code does not expand `~`):

```json
  "hooks": {
    "Stop": [
      { "hooks": [ { "type": "command", "command": "node $HOME/.claude/hooks/self-critic/stop-hook.mjs", "timeout": 75 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash|Edit|Write", "hooks": [ { "type": "command", "command": "node $HOME/.claude/hooks/self-critic/pretool-hook.mjs", "timeout": 15 } ] }
    ]
  }
```

## Hardcoded Defaults

No config file. Tuned defaults baked in:
- **`model=haiku`** — Fast, cheap, good for critique
- **`MAX_ROUNDS=1`** — Episode cap (prevent infinite loops)
- **`STUCK_THRESHOLD=3`** — Nudge after 3 repeats
- **`MIN_CRITIQUE_CHARS=80`** — Minimum assistant-turn length; turns shorter than this are treated as trivial and skipped (gates the input turn, not the critique output)
- **`CRITIC_TIMEOUT=60s`** — Haiku critique wall-clock timeout

## Test

```bash
node --test
```

Runs all 40 tests (fact-gate, evidence, critic-core, stuck-core, state) with zero dependencies.

## Fail-Open Guarantee

Any hook error (file I/O, JSON parse, LLM timeout, etc.) allows the turn to proceed. Hooks never block due to their own bug—only due to detected agent issues.

## Known limitations

- **Per-turn latency:** a turn that trips the fact-gate incurs one synchronous ~7–10s `haiku` veto call before control returns (max 1 round). Only tripped turns pay this; clean turns are free.
- **Stuck-detector is coarse:** matches a flag-normalized Bash target or exact `file_path`. Editing the same file 3× in one turn (normal iterative work) can produce a spurious nudge; the nudge is non-blocking and the window resets each turn. Attached-value flags (`--name=a` vs `--name=b`) normalize alike.
- **Transcript boundary:** evidence scanning scopes to the current turn via the last string-content user prompt. On transcripts with no such entry (some sub-agent/resume shapes) it scans nothing and reports `ranTests=false` (conservative — never certifies stale evidence).
- **Fail-open everywhere:** any hook error allows the turn. A bug degrades to "turn proceeds un-critiqued," never a wrongful block or crash.

## License

MIT © Nadim Tuhin. See [LICENSE](LICENSE).
