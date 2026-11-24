import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

export function defaultState() {
  return { episode: { count: 0 }, stuck: { window: [], level: 0 } }
}

function fileFor(dir, sessionId) {
  const safe = String(sessionId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(dir, `${safe}.json`)
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

export function loadState(dir, sessionId) {
  try {
    const raw = JSON.parse(readFileSync(fileFor(dir, sessionId), 'utf8'))
    const def = defaultState()
    if (!isObj(raw)) return def
    // Validate each field so a malformed file can't wedge the hooks for the whole session.
    const episode = isObj(raw.episode) && Number.isFinite(raw.episode.count) ? raw.episode : def.episode
    const stuck = isObj(raw.stuck) && Array.isArray(raw.stuck.window) ? raw.stuck : def.stuck
    return { ...raw, episode, stuck }
  } catch {
    return defaultState()
  }
}

export function saveState(dir, sessionId, state) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(fileFor(dir, sessionId), JSON.stringify(state))
}
