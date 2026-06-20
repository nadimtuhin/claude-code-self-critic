import { readFileSync } from 'node:fs'

export const TEST_CMD_RE =
  /\b(jest|vitest|mocha|pytest|go\s+test|cargo\s+test|node\s+--test|yarn\s+test|npm\s+(?:run\s+)?test|pnpm\s+test|rspec|phpunit|rw\s+test)\b/i

// Matches a node:test/tap summary line showing a non-zero fail count at line start:
// e.g. "ℹ fail 1", "fail 2", "failures 3" — anchored so test NAMEs can't trip it.
// Does NOT match "fail 0" or an inline mention inside a ✔ test-name line.
const FAIL_COUNT_LINE_RE = /(^|\n)\s*(?:ℹ\s*)?fail(?:ures?|ed)?\s+([1-9]\d*)\b/i
// Matches "exit code N" or "exit: N" where N is non-zero
const EXIT_CODE_RE = /\bexit\s*code\s*[: ]\s*([1-9]\d*)\b/i

function hasFailureMarker(text) {
  if (FAIL_COUNT_LINE_RE.test(text)) return true
  if (EXIT_CODE_RE.test(text)) return true
  return false
}

export function emptyEvidence() {
  return { ranTests: false, testCommands: [], readFiles: [], editedFiles: [] }
}

function parseEntries(transcriptPath) {
  let raw
  try { raw = readFileSync(transcriptPath, 'utf8') } catch { return null }
  const out = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try { out.push(JSON.parse(line)) } catch {}
  }
  return out
}

// A real user-prompt entry has type==='user' and message.content is a string.
// Tool-result user entries also have type==='user' but message.content is an array.
function isUserPrompt(entry) {
  if (entry?.type !== 'user') return false
  const content = entry?.message?.content
  return typeof content === 'string'
}

// Extract text from a tool_result content value (string or array of blocks)
function toolResultText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map(b => (typeof b === 'string' ? b : b?.text ?? '')).join('\n')
  }
  return ''
}

export function extractEvidence(transcriptPath) {
  const entries = parseEntries(transcriptPath)
  if (!entries) return emptyEvidence()

  let start = entries.length
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isUserPrompt(entries[i])) { start = i; break }
  }
  if (start === entries.length) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i]?.type === 'user') { start = i; break }
    }
  }

  // First pass: collect test tool_use ids and all tool_results
  const testToolUses = [] // { id, command }
  const toolResults = {} // tool_use_id -> { is_error, text }
  const ev = emptyEvidence()

  for (let i = start; i < entries.length; i++) {
    const entry = entries[i]
    if (entry?.type === 'assistant') {
      const content = entry?.message?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type !== 'tool_use') continue
        const name = block.name
        const input = block.input || {}
        if (name === 'Bash' && typeof input.command === 'string') {
          if (TEST_CMD_RE.test(input.command)) {
            ev.testCommands.push(input.command)
            testToolUses.push({ id: block.id, command: input.command })
          }
        } else if (name === 'Read' && input.file_path) {
          ev.readFiles.push(input.file_path)
        } else if ((name === 'Edit' || name === 'Write') && input.file_path) {
          ev.editedFiles.push(input.file_path)
        }
      }
    } else if (entry?.type === 'user') {
      const content = entry?.message?.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        if (block?.type !== 'tool_result') continue
        toolResults[block.tool_use_id] = {
          is_error: block.is_error === true,
          text: toolResultText(block.content),
        }
      }
    }
  }

  // A test command passes only if its result exists, is not an error, and has no failure markers
  const passedTests = testToolUses.filter(({ id }) => {
    const result = toolResults[id]
    if (!result) return false // no result in window -> conservative: not passing
    if (result.is_error) return false
    if (hasFailureMarker(result.text)) return false
    return true
  })

  ev.ranTests = passedTests.length > 0
  return ev
}
