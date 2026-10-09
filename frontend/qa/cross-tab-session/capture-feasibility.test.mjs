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
  paddedReachedUpstream: 40,
  groups: {
    seq: { intended: '2xx', statuses: { 200: 40 } },
    burst: { intended: '2xx', statuses: { 200: 100 } },
    pad: { intended: '2xx', statuses: { 200: 40 } },
    expired: { intended: '401 expired', statuses: { 401: 10 }, messages: ['Invalid or expired token'] },
    garbage: { intended: '401 expired', statuses: { 401: 10 }, messages: ['Invalid or expired token'] },
  },
  token: { lifetimeLeftMsAtStart: 19000, lifetimeLeftMsAfterLastValidRequest: 7000 },
  refresh: { correlated: true },
  scope: { ingressAddr: '172.18.0.4', filter: 'tcp port 3001 and host 172.18.0.4', fromIngress: 200 },
})

const failuresOf = (change) => {
  const record = good()
  change(record)
  return judgeFeasibility(record)
}

test('the plan sends 200 requests', () => {
  const p = FEASIBILITY_PLAN
  assert.equal(p.sequential + p.burst + p.padded + p.expired + p.garbage, 200)
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
    r.scope.fromIngress = 150
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

// --- each group got the answers it was sent for --------------------------------

test('a valid-token group with one 401 in it fails, and names the group', () => {
  const j = failuresOf((r) => (r.groups.pad.statuses = { 200: 39, 401: 1 }))
  assert.deepEqual(j.failures.map((f) => f.check), ['every group got its intended statuses'])
  assert.match(j.failures[0].detail, /pad/)
})

test('a burst request refused by the ingress is not an intended status', () => {
  const j = failuresOf((r) => (r.groups.burst.statuses = { 200: 99, 429: 1 }))
  assert.match(j.failures[0].detail, /burst/)
})

test('an authentication-error group answered 2xx fails', () => {
  const j = failuresOf((r) => (r.groups.expired.statuses = { 200: 10 }))
  assert.match(j.failures[0].detail, /expired/)
})

test('an authentication error with another message than the expiry one fails', () => {
  const j = failuresOf((r) => (r.groups.garbage.messages = ['Session has been revoked or expired']))
  assert.deepEqual(j.failures.map((f) => f.check), ['every group got its intended statuses'])
})

test('a group with fewer answers than it sent fails', () => {
  const j = failuresOf((r) => (r.groups.seq.statuses = { 200: 39 }))
  assert.match(j.failures[0].detail, /seq/)
})

// --- the token outlived the requests that needed it ------------------------------

test('a token that had expired by the last request that needed it fails', () => {
  const j = failuresOf((r) => (r.token.lifetimeLeftMsAfterLastValidRequest = -1))
  assert.deepEqual(j.failures.map((f) => f.check), ['the current token outlived the requests that needed it'])
})

test('a token with exactly no time left is not enough; one millisecond is', () => {
  assert.equal(failuresOf((r) => (r.token.lifetimeLeftMsAfterLastValidRequest = 0)).verdict, 'fail')
  assert.equal(failuresOf((r) => (r.token.lifetimeLeftMsAfterLastValidRequest = 1)).verdict, 'pass')
})

test('an unknown remaining lifetime fails', () => {
  assert.equal(failuresOf((r) => (r.token.lifetimeLeftMsAfterLastValidRequest = null)).verdict, 'fail')
})

// --- the padding, and the refresh ----------------------------------------------

test('padding that did not reach the upstream on every padded request fails', () => {
  const j = failuresOf((r) => (r.paddedReachedUpstream = 39))
  assert.deepEqual(j.failures.map((f) => f.check), ['the padding reached the upstream on every padded request'])
})

test('the refresh before the workload is accounted for apart from the 200, and must correlate too', () => {
  const j = failuresOf((r) => (r.refresh.correlated = false))
  assert.deepEqual(j.failures.map((f) => f.check), ['the refresh before the workload is in all three sources'])
})

// --- the capture's scope ---------------------------------------------------------

test('a capture that was not scoped to the ingress address fails', () => {
  const j = failuresOf((r) => (r.scope = { ingressAddr: null, filter: null, fromIngress: 0 }))
  assert.deepEqual(j.failures.map((f) => f.check), ['every captured request came from the ingress address'])
})

test('one of the 200 arriving from another address fails', () => {
  const j = failuresOf((r) => (r.scope.fromIngress = 199))
  assert.deepEqual(j.failures.map((f) => f.check), ['every captured request came from the ingress address'])
})
