// What the ingress recorded for each round of the device acceptance
// (device/restored-window.js). Diagnostic: the device's own measurement is the
// acceptance, this says what the limiters did while it ran.
//
//   node --test frontend/qa/cross-tab-session/device-rounds.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deviceRounds } from './lib/device-rounds.mjs'

const line = (over) => ({
  remoteAddr: '10.1.1.250', method: 'GET', uri: '/api/products', status: 200, startMs: 0, endMs: 10, requestMs: 10,
  upstream: { kind: 'single', ms: 8 }, nonUpstreamMs: 2, limitReq: 'PASSED', limitConn: 'PASSED', qaId: null, ...over,
})
const mark = (qaId, startMs, remoteAddr = '10.1.1.250') => line({ uri: '/manifest.json', qaId, startMs, endMs: startMs, remoteAddr, upstream: { kind: 'none', ms: null }, nonUpstreamMs: null, limitReq: null, limitConn: null })

test('a round is the lines between its two markers, from the address that sent them', () => {
  const rounds = deviceRounds([
    line({ startMs: 50 }),
    mark('device-current-token-1700000000000-in', 100),
    line({ startMs: 150 }),
    line({ startMs: 160, limitReq: 'DELAYED' }),
    line({ startMs: 170, status: 429, limitReq: 'REJECTED', limitConn: null }),
    line({ startMs: 180, remoteAddr: '10.1.1.9' }),
    line({ startMs: 190, uri: '/assets/index.js', upstream: { kind: 'none', ms: null }, nonUpstreamMs: null, limitReq: null, limitConn: null }),
    mark('device-current-token-1700000000000-out', 900),
    line({ startMs: 950 }),
  ])
  assert.equal(rounds.length, 1)
  const [r] = rounds
  assert.equal(r.id, 'device-current-token-1700000000000')
  assert.equal(r.kind, 'current-token')
  assert.equal(r.clientAddr, '10.1.1.250')
  assert.equal(r.closed, true)
  assert.equal(r.apiRequests, 3)
  assert.equal(r.diagnostics.delayed, 1)
  assert.equal(r.diagnostics.rejectedBy.limit_req, 1)
  assert.deepEqual(r.statuses, { 200: 2, 429: 1 })
  assert.deepEqual(r.refused, [{ method: 'GET', uri: '/api/products', by: 'limit_req', zone: 'api_limit' }])
})

test('a round whose closing marker never arrived is reported open and not measured', () => {
  const rounds = deviceRounds([mark('device-sign-out-1700000000001-in', 100), line({ startMs: 150 })])
  assert.deepEqual(rounds, [{ id: 'device-sign-out-1700000000001', kind: 'sign-out', clientAddr: '10.1.1.250', closed: false }])
})

test('rounds come out in the order they began', () => {
  const rounds = deviceRounds([
    mark('device-expired-token-1700000000005-in', 500), mark('device-expired-token-1700000000005-out', 600),
    mark('device-sign-out-1700000000002-in', 200), mark('device-sign-out-1700000000002-out', 300),
  ])
  assert.deepEqual(rounds.map((r) => r.kind), ['sign-out', 'expired-token'])
})

test('no marker, no round', () => {
  assert.deepEqual(deviceRounds([line({}), line({ qaId: 'app-3' })]), [])
})
