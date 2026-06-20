# Self-Critic Hooks for Claude Code

**Catch your AI agent lying to you — before the turn ends.**

Two zero-dependency hooks that give Claude Code real-time self-critique and stuck-detection. Deterministic fact-gating extracts evidence, applies rule-based checks, and only escalates to a cheap LLM call to suppress false positives. The LLM never authors the critique — it only votes.

---

## The Problem

You've seen it. Your agent says "all tests pass" — but you check, and they don't. It claims "the build succeeds" — but there's a compile error. It repeats the same failing command 5 times in a row, convinced this time will be different.

Agents hallucinate success. They get stuck in loops. And there's no safety net.

## The Solution

Two hooks that run at the right moments:

**Stop Hook (Self-Critic)** — Runs at the end of each turn. Extracts evidence from the transcript (did it actually run tests? did it read the file it claims verified?). Applies deterministic rule-based gates. If claims are unbacked by evidence, it blocks the turn and tells the agent exactly what's missing. Escalates to a Haiku veto only to suppress false positives — Haiku never writes the critique.

**PreToolUse Stuck-Detector** — Runs before every Bash, Edit, or Write. Detects when the same flag-normalized command or file target is repeated 3+ times. Sends a mid-turn nudge to course-correct before the turn spirals. Window resets each turn.

---

## Quick Start

**One-liner (no clone needed):**

```bash
curl -fsSL https://raw.githubusercontent.com/nadimtuhin/claude-code-self-critic/main/install.sh | bash
```

**Or clone and run:**

```bash
git clone https://github.com/nadimtuhin/claude-code-self-critic
cd claude-code-self-critic
./install.sh
```

That's it. The installer runs the full test suite in `/tmp` first. If tests pass, it deploys hooks and auto-merges them into `~/.claude/settings.json`. If tests fail, it aborts without touching anything.

Requires `node >=20` and `jq`.

```bash
./install.sh              # test in /tmp, then install/update
./install.sh --test-only  # just run tests, don't deploy
./install.sh --uninstall  # remove hooks cleanly
```

---

## Why This Approach

| Approach | Problem |
|----------|---------|
| Trust the agent | Agents hallucinate success claims |
| Pure LLM critic | Expensive, slow, unreliable, writes its own opinions |
| Pure rules | Rigid, can't suppress false positives |
| **This: Deterministic-first + LLM veto** | **Cheap, reliable, LLM only votes to suppress** |

The key insight: don't let the LLM write the critique. Extract evidence deterministically, apply rules, build a block reason from unbacked claims. Then — and only then — let a cheap Haiku call vote "is this a false positive?" The LLM is a tiebreaker, not the author.

---

## Architecture

```
src/
  fact-gate.mjs     # Evidence extraction + rule-based gates (pure, testable)
  critic-core.mjs   # Fact-gate decision logic + episode tracking (pure)
  stuck-core.mjs    # Repeat detection + escalation logic (pure)
  evidence.mjs      # Test-run detection, command parsing (I/O edge)
  state.mjs         # File-based state persistence (I/O edge)
  stop-hook.mjs     # Stop hook entry point (thin wiring)
  pretool-hook.mjs  # PreToolUse hook entry point (thin wiring)
test/
  *.test.mjs        # 40 tests, zero dependencies
  fixtures/         # Real transcript fixtures
```

Pure cores have no I/O — 100% testable. I/O lives at the edges. Thin hooks wire them together. This is a deliberate separation: the decision logic is deterministic and fast; the LLM is isolated to a single veto call with a hard timeout.

## Key Design Decisions

- **Deterministic fact-gating first** — Extract evidence (ran tests? read files?) before any LLM call
- **Haiku veto, not Haiku critic** — LLM only suppresses false positives, never authors the critique
- **Episode cap of 1** — Prevents infinite critique loops (critique-the-critique-the-critique)
- **Fail-open everywhere** — Any hook error allows the turn. A bug degrades to "un-critiqued," never a wrongful block
- **Flag-normalized Bash matching** — `npm test -- --grep foo` and `npm test --grep foo` are the same target

## Hardcoded Defaults

No config file. Tuned defaults baked in:
- `model=haiku` — Fast, cheap, good for veto
- `MAX_ROUNDS=1` — Episode cap (prevent infinite loops)
- `STUCK_THRESHOLD=3` — Nudge after 3 repeats
- `MIN_CRITIQUE_CHARS=80` — Turns shorter than this are trivial, skipped
- `CRITIC_TIMEOUT=60s` — Haiku veto wall-clock timeout

## Test

```bash
node --test
```

40 tests across fact-gate, evidence, critic-core, stuck-core, and state. Zero dependencies.

## Fail-Open Guarantee

Any hook error (file I/O, JSON parse, LLM timeout) allows the turn to proceed. Hooks never block due to their own bug — only due to detected agent issues.

## Known Limitations

- **Per-turn latency:** A turn that trips the fact-gate incurs one synchronous ~7-10s Haiku call. Only tripped turns pay this; clean turns are free.
- **Stuck-detector is coarse:** Matches flag-normalized Bash target or exact file_path. Editing the same file 3x in one turn can produce a spurious nudge (non-blocking, window resets each turn).
- **Transcript boundary:** Evidence scanning scopes to the current turn. On transcripts with no string-content user prompt (some sub-agent/resume shapes), it conservatively reports `ranTests=false`.

## License

MIT © Nadim Tuhin. See [LICENSE](LICENSE).
