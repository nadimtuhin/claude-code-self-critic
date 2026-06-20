import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanTurn, explainUnbacked } from '../src/fact-gate.mjs'

const noEvidence = { ranTests: false, testCommands: [], readFiles: [], editedFiles: [] }
const withTests = { ranTests: true, testCommands: ['yarn test'], readFiles: [], editedFiles: [] }

test('claims tests pass with no test run -> unbacked', () => {
  const r = scanTurn('All tests pass now.', noEvidence)
  assert.equal(r.claims.length, 1)
  assert.equal(r.unbacked.length, 1)
  assert.equal(r.unbacked[0].id, 'tests-pass')
})

test('claims tests pass WITH a test run -> backed (not flagged)', () => {
  const r = scanTurn('All tests pass now.', withTests)
  assert.equal(r.claims.length, 1)
  assert.equal(r.unbacked.length, 0)
})

test('vague "done"/"fixed" is NOT gated (precision over recall)', () => {
  const r = scanTurn('Done. Fixed the bug.', noEvidence)
  assert.equal(r.claims.length, 0)
})

test('R3 test-validity claim only arms when turn mentions test, and checks file', () => {
  const txt = 'This is covered by foo.test.ts already.'
  const miss = scanTurn(txt, noEvidence)
  assert.equal(miss.unbacked.some(c => c.id === 'covered-by'), true)
  const hit = scanTurn(txt, { ...noEvidence, readFiles: ['src/foo.test.ts'] })
  assert.equal(hit.unbacked.some(c => c.id === 'covered-by'), false)
})

test('empty text -> no claims, no throw', () => {
  const r = scanTurn('', noEvidence)
  assert.deepEqual(r, { claims: [], unbacked: [] })
})

test('verified claim with no evidence -> unbacked', () => {
  const r = scanTurn('I have verified the behavior is correct across the module.', noEvidence)
  assert.equal(r.unbacked.some(c => c.id === 'verified'), true)
})

test('verified claim backed by a file read -> not flagged', () => {
  const r = scanTurn('I have verified the behavior is correct across the module.', { ...noEvidence, readFiles: ['src/x.ts'] })
  assert.equal(r.unbacked.some(c => c.id === 'verified'), false)
})

test('explainUnbacked: tests-pass id maps to deterministic text', () => {
  const reason = explainUnbacked([{ id: 'tests-pass', match: 'tests pass' }])
  assert.ok(reason.startsWith('[self-critic] '))
  assert.ok(reason.includes('you claimed tests pass'))
  assert.ok(reason.endsWith('. Run the check and show the result, or remove the claim.'))
})

test('explainUnbacked: verified id maps to deterministic text', () => {
  const reason = explainUnbacked([{ id: 'verified', match: 'verified' }])
  assert.ok(reason.includes('you claimed the work is verified/working'))
})

test('explainUnbacked: covered-by id maps to deterministic text', () => {
  const reason = explainUnbacked([{ id: 'covered-by', match: 'covered by foo.test.ts' }])
  assert.ok(reason.includes('you claimed something is covered by a test file'))
})

test('explainUnbacked: multiple unbacked claims joined with semicolon', () => {
  const reason = explainUnbacked([
    { id: 'tests-pass', match: 'tests pass' },
    { id: 'verified', match: 'verified' },
  ])
  assert.ok(reason.includes('; '))
  assert.ok(reason.includes('you claimed tests pass'))
  assert.ok(reason.includes('you claimed the work is verified/working'))
})

test('explainUnbacked: unknown id falls back to match-based text', () => {
  const reason = explainUnbacked([{ id: 'unknown-claim', match: 'it definitely works' }])
  assert.ok(reason.includes('you made a claim ("it definitely works") without visible evidence'))
})
