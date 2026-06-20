import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decideCritique, episodeAfterVeto, MIN_CRITIQUE_CHARS, MAX_ROUNDS } from './critic-core.mjs'

const clean = { claims: [], unbacked: [] }
const tripped = { claims: [{ id: 'tests-pass' }], unbacked: [{ id: 'tests-pass' }] }
const longText = 'x'.repeat(MIN_CRITIQUE_CHARS + 1)

test('trivial (short) turn -> no block', () => {
  const r = decideCritique({ stopHookActive: false, episode: { count: 0 }, text: 'Done.', gate: tripped })
  assert.equal(r.block, false)
})

test('clean gate on a substantial turn -> no block', () => {
  const r = decideCritique({ stopHookActive: false, episode: { count: 0 }, text: longText, gate: clean })
  assert.equal(r.block, false)
})

test('tripped gate, fresh episode -> block, episode count -> 1', () => {
  const r = decideCritique({ stopHookActive: false, episode: { count: 0 }, text: longText, gate: tripped })
  assert.equal(r.block, true)
  assert.equal(r.nextEpisode.count, 1)
})

test('episode at cap -> no block (prevents infinite critique)', () => {
  const r = decideCritique({ stopHookActive: true, episode: { count: MAX_ROUNDS }, text: longText, gate: tripped })
  assert.equal(r.block, false)
})

test('stop_hook_active=false resets the episode before deciding', () => {
  const r = decideCritique({ stopHookActive: false, episode: { count: 99 }, text: longText, gate: tripped })
  assert.equal(r.block, true)
  assert.equal(r.nextEpisode.count, 1)
})

test('MAX_ROUNDS is 1 (single critique round)', () => {
  assert.equal(MAX_ROUNDS, 1)
  // after one block (count=1), a continuation does not block again
  const r = decideCritique({ stopHookActive: true, episode: { count: 1 }, text: 'x'.repeat(MIN_CRITIQUE_CHARS + 1), gate: { claims: [{id:'tests-pass'}], unbacked: [{id:'tests-pass'}] } })
  assert.equal(r.block, false)
})

// episodeAfterVeto tests
test('veto confirmed PROBLEM -> episode count incremented (round consumed)', () => {
  const decision = { block: true, nextEpisode: { count: 1 } }
  const ep = episodeAfterVeto(decision, true)
  assert.equal(ep.count, 1)
})

test('veto said OK (false positive) -> episode count reset to 0 (round NOT consumed)', () => {
  const decision = { block: true, nextEpisode: { count: 1 } }
  const ep = episodeAfterVeto(decision, false)
  assert.equal(ep.count, 0)
})

test('episodeAfterVeto on a non-blocking decision returns nextEpisode unchanged', () => {
  const decision = { block: false, nextEpisode: { count: 0 } }
  assert.deepEqual(episodeAfterVeto(decision, false), { count: 0 })
  assert.deepEqual(episodeAfterVeto(decision, true), { count: 0 })
})
