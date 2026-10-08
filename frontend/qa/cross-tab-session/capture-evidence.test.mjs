import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCapture, captureUsable, correlate } from './lib/capture-evidence.mjs'

const HEALTH = { kind: 'health', frames: 10, captured: 10, dropped: null, analysis: {}, tshark: 'tshark 4.6.5' }

const request = (qaId, extra = {}) => ({
  kind: 'request',
  qaId,
  method: 'GET',
  uri: '/api/auth/me',
  tokenFingerprint: 'abc123abc123',
  stream: 0,
  frames: [1],
  frameCount: 1,
  arrivedFirstMs: 1000,
  arrivedLastMs: 1001,
  status: 200,
  answeredFrames: [2],
  answeredFrameCount: 1,
  answeredFirstMs: 1010,
  answeredLastMs: 1011,
  retransmitted: false,
  ...extra,
})

const invalid = (reason, fromMs, toMs) => ({ kind: 'invalid', reason, stream: 0, fromMs, toMs, detail: reason })

/** One element per line of a capture file. */
const lines = (...records) => records.map((r) => JSON.stringify(r))

const captureOf = (...records) => loadCapture(lines(...records, HEALTH))

test('loadCapture reads the requests, what it could not read, and how it ended', () => {
  const capture = captureOf(request('a-1'), request('a-2'), invalid('lost-segment', 900, 1100))
  assert.deepEqual([...capture.requests.keys()], ['a-1', 'a-2'])
  assert.equal(capture.invalid.length, 1)
  assert.equal(capture.health.dropped, null)
})

test('loadCapture refuses a second record with an id already seen', () => {
  const capture = captureOf(request('a-1'), request('a-1', { stream: 1 }))
  assert.equal(capture.requests.size, 1)
  assert.deepEqual(capture.duplicates, ['a-1'])
  assert.equal(capture.invalid.filter((r) => r.reason === 'duplicate-qa-id').length, 1)
})

test('captureUsable is false for an open segment: no health record, no judgement', () => {
  const capture = loadCapture(lines(request('a-1')))
  const verdict = captureUsable(capture, 900, 1100)
  assert.equal(verdict.usable, false)
  assert.match(verdict.why, /health record/)
})

test('captureUsable is false when the tool dropped a packet', () => {
  const capture = loadCapture(lines(request('a-1'), { ...HEALTH, dropped: 3 }))
  const verdict = captureUsable(capture, 900, 1100)
  assert.equal(verdict.usable, false)
  assert.match(verdict.why, /dropped 3/)
})

test('captureUsable is false for an invalid record inside the range and true for one outside it', () => {
  const capture = captureOf(
    request('a-1'),
    invalid('lost-segment', 1005, 1006),
    invalid('unseen-segment', 5000, 5001),
  )
  const inside = captureUsable(capture, 900, 1100)
  assert.equal(inside.usable, false)
  assert.match(inside.why, /lost-segment/)
  const later = captureUsable(capture, 2000, 3000)
  assert.equal(later.usable, true)
  assert.equal(later.why, null)
})

test('an invalid record that cannot be placed in time counts as inside the range', () => {
  const capture = captureOf(request('a-1'), invalid('missing-bytes', null, null))
  assert.equal(captureUsable(capture, 900, 1100).usable, false)
})

test('correlate matches one identifier across the three sources', () => {
  const capture = captureOf(request('a-1'))
  const { matched, problems } = correlate(
    [{ qaId: 'a-1', tokenFingerprint: 'abc123abc123' }],
    [{ qaId: 'a-1', status: 200 }],
    capture,
  )
  assert.equal(problems.length, 0)
  assert.equal(matched.length, 1)
  assert.equal(matched[0].statusAgree, true)
  assert.equal(matched[0].tokenAgree, true)
})

test('correlate says which source a request is missing from', () => {
  const capture = captureOf(request('a-1'))
  const { matched, problems } = correlate(
    [{ qaId: 'a-1' }, { qaId: 'a-2' }, { qaId: 'a-3' }],
    [{ qaId: 'a-1', status: 200 }, { qaId: 'a-3', status: 429 }],
    capture,
  )
  assert.equal(matched.length, 1)
  const byId = Object.fromEntries(problems.map((p) => [p.qaId, p]))
  assert.deepEqual(byId['a-2'].missingFrom, ['ingress', 'capture'])
  assert.deepEqual(byId['a-3'].missingFrom, ['capture'])
})

test('correlate reports a duplicate in each source', () => {
  const capture = captureOf(request('a-1'), request('a-1', { stream: 2 }))
  const { problems } = correlate(
    [{ qaId: 'a-1' }],
    [{ qaId: 'a-1', status: 200 }, { qaId: 'a-1', status: 200 }],
    capture,
  )
  const problem = problems.find((p) => p.qaId === 'a-1')
  assert.deepEqual(problem.duplicateIn, ['ingress', 'capture'])
  assert.equal(captureUsable(capture, 0, 2000).usable, false)
})

test('correlate reports an identifier the browser did not send', () => {
  const capture = captureOf(request('a-1'), request('ghost'))
  const { problems } = correlate(
    [{ qaId: 'a-1' }],
    [{ qaId: 'a-1', status: 200 }, { qaId: 'ghost', status: 200 }],
    capture,
  )
  assert.deepEqual(problems, [{ qaId: 'ghost', missingFrom: [], duplicateIn: [] }])
})

test('correlate does not call a status or token a match it is not', () => {
  const capture = captureOf(request('a-1', { status: 429 }))
  const { matched } = correlate([{ qaId: 'a-1', tokenFingerprint: 'abc123abc123' }], [{ qaId: 'a-1', status: 200 }], capture)
  assert.equal(matched.length, 1)
  assert.equal(matched[0].statusAgree, false)
  const other = captureOf(request('a-2', { tokenFingerprint: 'ffffffffffff' }))
  const second = correlate([{ qaId: 'a-2', tokenFingerprint: 'abc123abc123' }], [{ qaId: 'a-2', status: 200 }], other)
  assert.equal(second.matched[0].tokenAgree, false)
})
