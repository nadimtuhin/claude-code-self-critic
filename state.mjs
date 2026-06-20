import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function defaultState() {
  return { episode: { count: 0 }, stuck: { window: [], level: 0 } }
}

function fileFor(dir, sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(dir, `${safe}.json`)
}

export function loadState(dir, sessionId) {
  try {
    return { ...defaultState(), ...JSON.parse(readFileSync(fileFor(dir, sessionId), 'utf8')) }
  } catch {
    return defaultState()
  }
}

export function saveState(dir, sessionId, state) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(fileFor(dir, sessionId), JSON.stringify(state))
}
