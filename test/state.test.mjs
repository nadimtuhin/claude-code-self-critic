import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { rmSync } from 'node:fs'
import { loadState, saveState } from '../src/state.mjs'

const dir = join(tmpdir(), 'sc-state-test')

test('load missing -> default; save then load round-trips', () => {
  rmSync(dir, { recursive: true, force: true })
  const def = loadState(dir, 's1')
  assert.deepEqual(def, { episode: { count: 0 }, stuck: { window: [], level: 0 } })
  saveState(dir, 's1', { episode: { count: 2 }, stuck: { window: ['a'], level: 1 } })
  assert.deepEqual(loadState(dir, 's1'), { episode: { count: 2 }, stuck: { window: ['a'], level: 1 } })
})

test('load: malformed fields in a state file fall back to defaults', () => {
  rmSync(dir, { recursive: true, force: true })
  saveState(dir, 'bad', { episode: null, stuck: {} })
  assert.deepEqual(loadState(dir, 'bad'), { episode: { count: 0 }, stuck: { window: [], level: 0 } })
  saveState(dir, 'bad2', ['not', 'an', 'object'])
  assert.deepEqual(loadState(dir, 'bad2'), { episode: { count: 0 }, stuck: { window: [], level: 0 } })
})
