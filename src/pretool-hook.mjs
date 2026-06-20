#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectRepeatedCall, normalizeBashTarget } from './stuck-core.mjs'
import { TEST_CMD_RE } from './fact-gate.mjs'
import { loadState, saveState } from './state.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE_DIR = join(HERE, 'state')

function done() { process.exit(0) }

function targetOf(tool, input) {
  if (!input) return ''
  if (tool === 'Read') return ''
  if (tool === 'Bash') return normalizeBashTarget(input.command).slice(0, 200)
  return String(input.file_path || input.path || '')
}

function isTestCommand(tool, input) {
  if (tool !== 'Bash' || !input?.command) return false
  return TEST_CMD_RE.test(input.command)
}

try {
  if (process.env.SELF_CRITIC_NESTED === '1') done()

  const data = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const sessionId = data.session_id || 'unknown'
  const target = targetOf(data.tool_name, data.tool_input)
  if (!target) done()

  const state = loadState(STATE_DIR, sessionId)
  const r = detectRepeatedCall({ tool: data.tool_name, target, isTestRun: isTestCommand(data.tool_name, data.tool_input) }, state.stuck)
  saveState(STATE_DIR, sessionId, { ...state, stuck: r.nextState })

  if (!r.nudge) done()

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: `[self-reflection] ${r.nudge}` },
  }))
  process.exit(0)
} catch {
  done()
}
