import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FIXTURES = join(ROOT, 'test', 'fixtures')

// The Stop hook must find the `claude` CLI on PATH when CLAUDE_CLI is unset.
// Previously it defaulted to a path that only exists on the author's machine, so the
// veto call always failed and the hook silently allowed every turn for everyone else.
test('stop-hook: resolves `claude` from PATH when CLAUDE_CLI is unset', () => {
  const bin = mkdtempSync(join(tmpdir(), 'sc-bin-'))
  const fake = join(bin, 'claude')
  writeFileSync(fake, '#!/bin/sh\necho PROBLEM\n')
  chmodSync(fake, 0o755)
  const sessionId = `hooktest-${process.pid}-${Date.now()}`
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
  delete env.CLAUDE_CLI
  delete env.SELF_CRITIC_NESTED
  const input = JSON.stringify({
    session_id: sessionId,
    transcript_path: join(FIXTURES, 'turn-no-test.jsonl'),
    stop_hook_active: false,
    last_assistant_message:
      'I refactored the parser and updated the call sites. All tests pass and the change is complete now.',
  })
  try {
    const r = spawnSync(process.execPath, [join(ROOT, 'src', 'stop-hook.mjs')], { input, env, encoding: 'utf8' })
    assert.equal(r.status, 0)
    const out = JSON.parse(r.stdout)
    assert.equal(out.decision, 'block')
    assert.match(out.reason, /self-critic/)
  } finally {
    rmSync(join(ROOT, 'src', 'state', `${sessionId}.json`), { force: true })
    rmSync(bin, { recursive: true, force: true })
  }
})

// Simulates `curl ... | bash` run from inside some other project that has its own src/ dir.
// A fake `git` "clones" this repo by copying it, so no network is needed.
test('install.sh piped from curl: ignores an unrelated ./src and exits 0 without leaking the clone', () => {
  const work = mkdtempSync(join(tmpdir(), 'sc-work-'))
  const bin = join(work, 'bin')
  const proj = join(work, 'otherproject')
  mkdirSync(bin)
  mkdirSync(join(proj, 'src'), { recursive: true })
  writeFileSync(join(proj, 'src', 'index.js'), 'console.log(1)\n')
  writeFileSync(join(bin, 'git'),
    `#!/bin/sh\n# fake: git clone --depth 1 URL DEST\nfor last; do :; done\ncp -R "${ROOT}/src" "${ROOT}/test" "${ROOT}/package.json" "$last"/\n` +
    // install.sh runs the suite inside the clone; drop this file there to avoid recursion.
    `rm -f "$last/test/hooks.test.mjs"; rm -rf "$last/src/state"\n`)
  chmodSync(join(bin, 'git'), 0o755)
  try {
    const before = new Set(readdirSync('/tmp').filter((n) => n.startsWith('self-critic-install-')))
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, HOME: work }
    delete env.NODE_TEST_CONTEXT // let the nested `node --test` in install.sh run standalone
    const r = spawnSync('bash', ['-s', '--', '--test-only'], {
      input: require_install(),
      cwd: proj,
      env,
      encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.doesNotMatch(r.stderr, /unbound variable/)
    const leaked = readdirSync('/tmp').filter((n) => n.startsWith('self-critic-install-') && !before.has(n))
    assert.deepEqual(leaked, [], 'remote-install clone dir should be removed on exit')
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
})

function require_install() {
  return spawnSync('cat', [join(ROOT, 'install.sh')], { encoding: 'utf8' }).stdout
}
