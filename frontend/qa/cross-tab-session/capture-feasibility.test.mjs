import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FEASIBILITY_PLAN, judgeFeasibility } from './lib/feasibility.mjs'

// A record in which everything the run requires holds.
const good = () => ({
  sent: 200,
  matched: 200,
  problems: [],
  fingerprintMismatches: [],
  statusMismatches: [],
  categories: { reusedStreams: 6, requestsOnReusedStreams: 200, delayed: 80, multiFrame: 40, status2xx: 180, status401: 20 },
  capture: { usable: true, why: null },
})

const failuresOf = (change) => {
  const record = good()
  change(record)
  return judgeFeasibility(record)
}

test('the plan sends 200 requests', () => {
  const p = FEASIBILITY_PLAN
  assert.equal(p.sequential + p.bursts * p.burstSize + p.padded + p.expired + p.garbage, 200)
  assert.equal(p.total, 200)
})

test('a record in which everything holds passes, with no failure named', () => {
  assert.deepEqual(judgeFeasibility(good()), { verdict: 'pass', failures: [] })
})

test('one request not matched in all three sources fails', () => {
  const j = failuresOf((r) => {
    r.matched = 199
    r.problems = [{ qaId: 'seq-007', missingFrom: ['capture'], duplicateIn: [] }]
  })
  assert.equal(j.verdict, 'fail')
  assert.deepEqual(j.failures.map((f) => f.check), ['one-to-one correlation'])
})

test('fewer requests sent than planned fails, even when all of them match', () => {
  const j = failuresOf((r) => {
    r.sent = 150
    r.matched = 150
  })
  assert.deepEqual(j.failures.map((f) => f.check), ['every planned request was sent'])
})

test('a token fingerprint that differs between browser and capture fails', () => {
  const j = failuresOf((r) => r.fingerprintMismatches.push({ qaId: 'seq-001', browser: 'aaaaaaaaaaaa', capture: 'bbbbbbbbbbbb' }))
  assert.deepEqual(j.failures.map((f) => f.check), ['token fingerprints agree'])
})

test('a status that differs between the three sources fails', () => {
  const j = failuresOf((r) => r.statusMismatches.push({ qaId: 'seq-001', browser: 200, ingress: 200, capture: 401 }))
  assert.deepEqual(j.failures.map((f) => f.check), ['statuses agree'])
})

for (const [category, check] of [
  ['reusedStreams', 'reused connections were observed'],
  ['multiFrame', 'multi-frame requests were observed'],
  ['status2xx', 'successful responses were observed'],
  ['status401', 'authentication-error responses were observed'],
]) {
  test(`an empty category fails: ${category}`, () => {
    const j = failuresOf((r) => {
      r.categories[category] = 0
    })
    assert.deepEqual(j.failures.map((f) => f.check), [check])
  })
}

test('multi-frame is judged on what the capture reassembled, not on what was sent', () => {
  // 40 padded requests were sent (the record says nothing else), and the
  // capture saw every one of them in a single frame.
  const j = failuresOf((r) => {
    r.categories.multiFrame = 0
  })
  assert.equal(j.verdict, 'fail')
})

test('fewer than a quarter of the requests delayed fails; exactly a quarter passes', () => {
  assert.deepEqual(failuresOf((r) => (r.categories.delayed = 49)).failures.map((f) => f.check), ['at least a quarter of the requests were delayed'])
  assert.equal(failuresOf((r) => (r.categories.delayed = 50)).verdict, 'pass')
})

test('a capture that may not be judged fails, with its reason', () => {
  const j = failuresOf((r) => (r.capture = { usable: false, why: 'the capture tool dropped 3 packets' }))
  assert.deepEqual(j.failures, [{ check: 'the capture is usable', detail: 'the capture tool dropped 3 packets' }])
})

test('several things wrong are all named', () => {
  const j = failuresOf((r) => {
    r.categories.multiFrame = 0
    r.capture = { usable: false, why: 'no health record' }
  })
  assert.deepEqual(j.failures.map((f) => f.check).sort(), ['multi-frame requests were observed', 'the capture is usable'])
})
