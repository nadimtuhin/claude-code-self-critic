import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractEvidence, emptyEvidence } from './evidence.mjs'

const here = dirname(fileURLToPath(import.meta.url))

test('a turn that ran a test -> ranTests true with the command', () => {
  const ev = extractEvidence(join(here, 'fixtures/turn-with-test.jsonl'))
  assert.equal(ev.ranTests, true)
  assert.equal(ev.testCommands.some((c) => /node\s+--test/.test(c)), true)
})

test('a turn with no test -> ranTests false', () => {
  const ev = extractEvidence(join(here, 'fixtures/turn-no-test.jsonl'))
  assert.equal(ev.ranTests, false)
})

test('missing/unreadable transcript -> empty evidence, no throw (fail-open)', () => {
  assert.deepEqual(extractEvidence('/no/such/file.jsonl'), emptyEvidence())
})

test('a turn where the test RAN BUT FAILED -> ranTests false (does not back a pass claim)', () => {
  const ev = extractEvidence(join(here, 'fixtures/turn-failed-test.jsonl'))
  assert.equal(ev.ranTests, false)
})

test('failed test detected via summary marker when is_error is absent -> ranTests false', () => {
  const ev = extractEvidence(join(here, 'fixtures/crafted-fail-no-iserror.jsonl'))
  assert.equal(ev.ranTests, false)
})

test('passing suite with a test NAME containing "error" -> ranTests true (no false failure)', () => {
  const ev = extractEvidence(join(here, 'fixtures/crafted-pass-error-name.jsonl'))
  assert.equal(ev.ranTests, true)
})

test('transcript with NO string user-prompt (sub-agent/resume) -> scans nothing, ranTests false', () => {
  // boundary unknown -> conservative: a prior-turn test run must not back a current claim
  const ev = extractEvidence(join(here, 'fixtures/no-string-prompt.jsonl'))
  assert.equal(ev.ranTests, false)
})
