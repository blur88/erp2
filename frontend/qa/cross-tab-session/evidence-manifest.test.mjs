// The manifest of the evidence kept outside the repository (#1370): one line
// per file with its hash, and a refusal to list anything that holds a token.
//
//   node --test frontend/qa/cross-tab-session/evidence-manifest.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findTokens } from './evidence-manifest.mjs'

const SCRIPT = fileURLToPath(new URL('./evidence-manifest.mjs', import.meta.url))
const sha = (text) => createHash('sha256').update(text).digest('hex')
const JWT = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'].join('.')

function tree(files) {
  const root = mkdtempSync(join(tmpdir(), 'evidence-'))
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })

test('one sorted line per file: cell, relative path, bytes, sha256', () => {
  const root = tree({ 'H21/2026-10-12T01:00:00Z/stall-diagnosis.json': '{"a":1}', 'H12/2026-10-12T00:00:00Z/judge.out': 'round 1\n' })
  const out = join(root, '..', `manifest-${Date.now()}.tsv`)
  const result = run(root, out)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(
    readFileSync(out, 'utf8'),
    `H12\tH12/2026-10-12T00:00:00Z/judge.out\t8\t${sha('round 1\n')}\n` +
      `H21\tH21/2026-10-12T01:00:00Z/stall-diagnosis.json\t7\t${sha('{"a":1}')}\n`,
  )
})

test('--verify passes on an untouched tree and fails once a byte changes or a file is gone', () => {
  const root = tree({ 'P/t/a.json': '{"a":1}', 'P/t/b.json': '{"b":2}' })
  const out = join(root, '..', `manifest-${Date.now()}-v.tsv`)
  assert.equal(run(root, out).status, 0)
  assert.equal(run(root, '--verify', out).status, 0)
  writeFileSync(join(root, 'P/t/a.json'), '{"a":2}')
  const changed = run(root, '--verify', out)
  assert.equal(changed.status, 1)
  assert.match(changed.stderr, /P\/t\/a\.json/)
})

for (const [name, text] of [
  ['a refreshToken value', '{"session":{"refreshToken":"abc.def-ghi"}}'],
  ['an accessToken value', '{ "accessToken" : "anything-at-all" }'],
  ['a JWT-shaped string', `{"note":"${JWT}"}`],
]) {
  test(`a file holding ${name} stops the manifest: nothing is written and the file is named`, () => {
    const root = tree({ 'H12/t/ok.json': '{"fingerprint":"a1b2c3d4e5f6"}', 'H12/t/bad.json': text })
    const out = join(root, '..', `manifest-${Date.now()}-${name.length}.tsv`)
    const result = run(root, out)
    assert.equal(result.status, 3)
    assert.match(result.stderr, /H12\/t\/bad\.json/)
    assert.equal(existsSync(out), false)
  })
}

test('fingerprints, generations and null tokens are not tokens', () => {
  assert.deepEqual(findTokens('{"refreshFingerprint":"a1b2c3d4e5f6","accessFingerprint":"0f9e8d7c6b5a","generation":8}'), [])
  assert.deepEqual(findTokens('{"accessToken":null,"refreshToken": null}'), [])
  assert.equal(findTokens(`Authorization: Bearer ${JWT}`).length, 1)
})

test('without a root or an output file it says how it is used', () => {
  assert.equal(run().status, 2)
})
