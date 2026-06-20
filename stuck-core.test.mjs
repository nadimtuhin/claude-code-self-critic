import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectRepeatedCall, REPEAT_NUDGES, normalizeBashTarget } from './stuck-core.mjs'

// detectRepeatedCall tests
const call = (target) => ({ tool: 'Bash', target })
function feedR(targets, start = { window: [], level: 0 }) {
  let s = start, last = { nudge: null, level: 0, nextState: s }
  for (const t of targets) { last = detectRepeatedCall(call(t), s); s = last.nextState }
  return last
}

test('repeat: two of the same -> no nudge', () => {
  assert.equal(feedR(['x', 'x']).nudge, null)
})
test('repeat: three of the same -> nudge level 1', () => {
  const r = feedR(['x', 'x', 'x'])
  assert.equal(r.level, 1)
  assert.equal(r.nudge, REPEAT_NUDGES[1])
})
test('repeat: a different target keeps level low (progress)', () => {
  const r = feedR(['x', 'x', 'y'])
  assert.equal(r.nudge, null)
  assert.equal(r.level, 0)
})
test('repeat: continued repetition escalates to level 2', () => {
  const r = feedR(['x', 'x', 'x', 'x'])
  assert.equal(r.level, 2)
})

// normalizeBashTarget tests
test('normalizeBashTarget: same command differing only in flags -> equal', () => {
  assert.equal(normalizeBashTarget('node --test x.mjs'), normalizeBashTarget('node --test x.mjs --verbose'))
})
test('normalizeBashTarget: different positional args -> not equal', () => {
  assert.notEqual(normalizeBashTarget('cat a'), normalizeBashTarget('cat b'))
})
test('normalizeBashTarget: empty/undefined -> empty string', () => {
  assert.equal(normalizeBashTarget(undefined), '')
  assert.equal(normalizeBashTarget('   '), '')
})
test('normalizeBashTarget: -- separator preserved so different test files are not equal', () => {
  assert.notEqual(
    normalizeBashTarget('pnpm test -- renderer/src/hooks/useInboxPanel.test.ts'),
    normalizeBashTarget('pnpm test -- renderer/src/hooks/useConversationData.test.ts')
  )
})
test('normalizeBashTarget: -- alone is not treated as a file arg', () => {
  assert.equal(
    normalizeBashTarget('pnpm test --'),
    normalizeBashTarget('pnpm test')
  )
})
test('detectRepeatedCall: test runner commands are exempt from stuck detection', () => {
  // TDD: red run -> write fix -> green run = same test file 3x in one turn. Must NOT nudge.
  const testCmd = 'pnpm vitest run renderer/src/hooks/useConversationData.test.ts'
  let state = { window: [], level: 0 }
  let last
  for (let i = 0; i < 3; i++) {
    last = detectRepeatedCall({ tool: 'Bash', target: normalizeBashTarget(testCmd), isTestRun: true }, state)
    state = last.nextState
  }
  assert.equal(last.nudge, null, 'test runner repeat should not trigger stuck nudge')
})
test('detectRepeatedCall: non-test Bash repeat still triggers nudge', () => {
  const cmd = 'ls /some/dir'
  let state = { window: [], level: 0 }
  let last
  for (let i = 0; i < 3; i++) {
    last = detectRepeatedCall({ tool: 'Bash', target: normalizeBashTarget(cmd), isTestRun: false }, state)
    state = last.nextState
  }
  assert.equal(last.level, 1, 'non-test repeat should still nudge')
})
