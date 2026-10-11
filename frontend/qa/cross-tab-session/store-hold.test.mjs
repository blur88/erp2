// Who counts as an eligible peer when the store hold begins (lib/store-hold.mjs,
// #1370). The pure half only: the hold itself and the live probe need a browser
// and are exercised by calibration.
//
//   node --test frontend/qa/cross-tab-session/store-hold.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PROBE_MAX_AGE_MS, eligiblePeers, readiness } from './lib/store-hold.mjs'

const AT = 50_000
const before = { generation: 7, accessFingerprint: 'acc7' }
const probe = (tab, overrides = {}) => ({
  tab, probedAt: AT - 200, alive: true, initialized: true, storageWaiting: false, onSignedInRoute: true, traceGenerations: [7], ...overrides,
})
const steady = [{ t: 40_000, generation: 7 }, { t: 49_900, generation: 7 }]
const opts = { refresherTab: 'X', before, at: AT }
const peersOf = (probes, stored = steady) => eligiblePeers(probes, stored, opts).map((p) => p.tab)

test('a live, initialized tab holding the pre-refresh generation is a peer, with its evidence', () => {
  const peers = eligiblePeers([probe('Y')], steady, opts)
  assert.deepEqual(peers.map((p) => p.tab), ['Y'])
  assert.deepEqual(peers[0].evidence.probe, probe('Y'))
  assert.deepEqual(peers[0].evidence.storedSamples, { count: 2, lastAt: 49_900, generation: 7 })
})

test('the refresher is never its own peer', () => {
  assert.deepEqual(peersOf([probe('X')]), [])
})

test('a tab that was not probed is not a peer, whatever it sent earlier', () => {
  assert.deepEqual(peersOf([]), [])
  assert.deepEqual(peersOf([null]), [])
})

test(`a probe older than ${PROBE_MAX_AGE_MS} ms does not count`, () => {
  assert.deepEqual(peersOf([probe('Y', { probedAt: AT - PROBE_MAX_AGE_MS - 1 })]), [])
  assert.deepEqual(peersOf([probe('Y', { probedAt: AT - PROBE_MAX_AGE_MS })]), ['Y'])
})

for (const [name, overrides] of [
  ['in storage-waiting', { storageWaiting: true }],
  ['not initialized', { initialized: false }],
  ['not on a signed-in route', { onSignedInRoute: false }],
  ['that did not answer', { alive: false }],
  ['whose trace shows no generation yet', { traceGenerations: [] }],
  ['whose trace already shows a later generation', { traceGenerations: [7, 8] }],
]) {
  test(`a tab ${name} is not a peer`, () => {
    assert.deepEqual(peersOf([probe('Y', overrides)]), [])
  })
}

test('a stored-record sample with another generation before the trigger leaves no peers', () => {
  assert.deepEqual(peersOf([probe('Y')], [...steady, { t: 49_950, generation: 8 }]), [])
})

test('a stored record with no session before the trigger leaves no peers', () => {
  assert.deepEqual(peersOf([probe('Y')], [...steady, { t: 49_950, generation: null }]), [])
})

test('with no stored-record sample there is no evidence, so no peers', () => {
  assert.deepEqual(peersOf([probe('Y')], []), [])
})

test('a sample after the trigger, or a read that failed, changes nothing', () => {
  assert.deepEqual(peersOf([probe('Y')], [...steady, { t: 49_960, error: 'read timed out' }, { t: AT + 1, generation: 8 }]), ['Y'])
})

test('readiness counts every tab once', () => {
  const probes = [probe('Y'), probe('Z', { storageWaiting: true, initialized: false }), probe('W', { alive: false, initialized: false }), null]
  assert.deepEqual(readiness(probes, steady, ['X', 'Y', 'Z', 'W', 'V'], opts), {
    pastStartup: 2, // the refresher and Y
    eligiblePeers: 1,
    starting: 2, // W did not answer, V was never probed
    storageWaiting: 1,
  })
})

// probePeer recognises the storage-waiting screen by its heading. If the
// application's changes, a waiting tab would be read as a running one.
test("the storage-waiting heading the probe looks for is the application's", async () => {
  const { STORAGE_WAITING_HEADING, storageWaitingHeadingInSource } = await import('./lib/store-hold.mjs')
  const source = new URL('../../src/components/auth/StorageWaitingScreen.tsx', import.meta.url)
  assert.equal(storageWaitingHeadingInSource(source), STORAGE_WAITING_HEADING)
})
