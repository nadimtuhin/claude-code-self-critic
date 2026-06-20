#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scanTurn, explainUnbacked } from './fact-gate.mjs'
import { extractEvidence } from './evidence.mjs'
import { decideCritique, episodeAfterVeto } from './critic-core.mjs'
import { loadState, saveState } from './state.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const STATE_DIR = join(HERE, 'state')
const CLI = process.env.CLAUDE_CLI || '/Users/nadimtuhin/.local/bin/claude'
const MODEL = 'haiku'
const TIMEOUT_MS = 60000

function allow() { process.exit(0) }

// Returns 'OK' | 'PROBLEM' | '' (error/timeout = fail-open)
function runVeto(text, deterministicReason) {
  const prompt =
    `You are a false-positive detector. A self-critic gate flagged this assistant turn.\n\n` +
    `Concern: ${deterministicReason}\n\n` +
    `Reply EXACTLY "OK" if the concern is a false alarm (the turn is actually fine). ` +
    `Reply EXACTLY "PROBLEM" if the concern is legitimate.\n\n` +
    `Assistant turn:\n${text.slice(0, 1500)}`
  try {
    const out = execFileSync(CLI, ['-p', '--model', MODEL, '--setting-sources', 'project', prompt], {
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      cwd: tmpdir(),
      env: { ...process.env, SELF_CRITIC_NESTED: '1' },
    })
    return out.trim()
  } catch {
    return ''
  }
}

try {
  if (process.env.SELF_CRITIC_NESTED === '1') allow()

  const data = JSON.parse(readFileSync(0, 'utf8') || '{}')
  const sessionId = data.session_id || 'unknown'
  const text = data.last_assistant_message || ''

  const evidence = extractEvidence(data.transcript_path)
  const gate = scanTurn(text, evidence)

  const state = loadState(STATE_DIR, sessionId)
  const decision = decideCritique({
    stopHookActive: data.stop_hook_active === true,
    episode: state.episode,
    text,
    gate,
  })

  if (!decision.block) {
    // Clean turn: reset stuck window, preserve episode count.
    saveState(STATE_DIR, sessionId, { episode: decision.nextEpisode, stuck: { window: [], level: 0 } })
    allow()
  }

  const reason = explainUnbacked(gate.unbacked)
  const veto = runVeto(text, reason)
  // Save AFTER veto so the episode count reflects the actual outcome:
  // false-positive veto (OK) does not consume a critique round.
  const finalEpisode = episodeAfterVeto(decision, veto === 'PROBLEM')
  saveState(STATE_DIR, sessionId, { episode: finalEpisode, stuck: { window: [], level: 0 } })

  if (veto !== 'PROBLEM') allow()

  process.stdout.write(JSON.stringify({ decision: 'block', reason }))
  process.exit(0)
} catch {
  allow()
}
