export const STUCK_THRESHOLD = 3

// Normalize a Bash command for repetition comparison: drop flag tokens (start with '-'),
// collapse whitespace. Keeps program + positional args so `node --test x` == `node --test x --verbose`
// but `cat a` != `cat b`.
export function normalizeBashTarget(command) {
  return String(command || '')
    .trim()
    .split(/\s+/)
    .filter((tok) => tok && !tok.startsWith('-'))
    .join(' ')
}
const WINDOW_MAX = 6

export const REPEAT_NUDGES = {
  1: 'You have attempted the same action repeatedly. Stop — re-read the last result, question your assumption, and try a DIFFERENT approach instead of repeating this call.',
  2: 'Still repeating the same action. Step back: state explicitly why it is not working and change strategy. Do not issue this same command again.',
  3: 'Repeated attempts are not progressing. The approach is likely wrong. Summarize what you have tried and why each failed before doing anything else.',
}

export function detectRepeatedCall(event, state) {
  // Test-runner commands (vitest, jest, node --test, etc.) are exempt: running the same
  // test file multiple times in one turn is normal TDD behaviour (red -> fix -> green).
  if (event.isTestRun) {
    return { nudge: null, level: 0, nextState: state || { window: [], level: 0 } }
  }
  const prev = state || { window: [], level: 0 }
  const window = [...prev.window, event.target].slice(-WINDOW_MAX)
  const repeats = window.filter((t) => t === event.target).length
  if (repeats < STUCK_THRESHOLD) {
    return { nudge: null, level: 0, nextState: { window, level: 0 } }
  }
  const level = Math.min(3, prev.level + 1)
  return { nudge: REPEAT_NUDGES[level], level, nextState: { window, level } }
}

