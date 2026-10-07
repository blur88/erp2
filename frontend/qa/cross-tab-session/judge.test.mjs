// The judgements of cases 5, 7 and 9 to 11 (lib/judge.mjs). No browser:
//
//   node --test frontend/qa/cross-tab-session/judge.test.mjs
//
// Each judgement is shown passing on what a correct product produces and
// failing on each way it can be wrong.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judgeHeldRefresh, judgeSimultaneousRefresh, judgeSwitchedTab, otherTabPath } from './lib/judge.mjs'

const failed = (lines) => lines.filter((l) => !l.ok).map((l) => l.label)
const passes = (lines) => assert.deepEqual(failed(lines), [])
const failsOn = (lines, pattern) => {
  const labels = failed(lines)
  assert.ok(labels.some((l) => pattern.test(l)), `expected a failed line matching ${pattern}, got ${JSON.stringify(labels)}`)
}

// --- case 7 -----------------------------------------------------------------

const before = { generation: 1, access: 'acc1', refresh: 'ref1' }
const heldBoth = [
  { tab: 'A', token: 'acc1', issuedAt: 100, deliveredAt: 500 },
  { tab: 'B', token: 'acc1', issuedAt: 120, deliveredAt: 501 },
]
const rotationByA = { tab: 'A', issuedAt: 520, respondedAt: 580, presented: 'ref1', status: 200, issued: { generation: 2, refresh: 'ref2' } }
const stored2 = { generation: 2, access: 'acc2', refresh: 'ref2' }
const continuedOn = (stored) => [
  { tab: 'A', token: stored.access, stored },
  { tab: 'B', token: stored.access, stored },
]
const adopted = { before, held: heldBoth, refreshes: [rotationByA], after: stored2, continued: continuedOn(stored2) }

test('case 7: one rotation and the other tab adopting passes', () => {
  passes(judgeSimultaneousRefresh(adopted))
  assert.equal(otherTabPath(heldBoth, [rotationByA]), 'tab B adopted (it sent no refresh)')
})

test('case 7: one rotation and the other tab recovering with the same token passes', () => {
  const recovery = { tab: 'B', issuedAt: 530, respondedAt: 600, presented: 'ref1', status: 200, issued: { generation: 2, refresh: 'ref2' } }
  passes(judgeSimultaneousRefresh({ ...adopted, refreshes: [rotationByA, recovery] }))
  assert.equal(otherTabPath(heldBoth, [rotationByA, recovery]), 'both tabs sent a refresh')
})

test('case 7: a second rotation FAILS (the other tab refreshed again with the new token: generation 1 to 3)', () => {
  // What both recorded runs showed: a 200 on refresh from each tab, 1 to 3.
  const again = { tab: 'B', issuedAt: 700, respondedAt: 760, presented: 'ref2', status: 200, issued: { generation: 3, refresh: 'ref3' } }
  const stored3 = { generation: 3, access: 'acc3', refresh: 'ref3' }
  const lines = judgeSimultaneousRefresh({ ...adopted, refreshes: [rotationByA, again], after: stored3, continued: continuedOn(stored3) })
  failsOn(lines, /every refresh presented the starting refresh token/)
  failsOn(lines, /advanced by exactly one/)
  failsOn(lines, /both tabs continue on the same generation/)
})

test('case 7: a 401 delivered after the first rotation was answered FAILS (the 401s did not overlap)', () => {
  const late = [heldBoth[0], { ...heldBoth[1], deliveredAt: 650 }]
  failsOn(judgeSimultaneousRefresh({ ...adopted, held: late }), /delivered before the first refresh was answered/)
})

test('case 7: a held request that carried another access token FAILS', () => {
  const other = [heldBoth[0], { ...heldBoth[1], token: 'acc2' }]
  failsOn(judgeSimultaneousRefresh({ ...adopted, held: other }), /carrying the access token of the starting generation/)
})

test('case 7: only one tab held, or a 401 that was never delivered, FAILS', () => {
  failsOn(judgeSimultaneousRefresh({ ...adopted, held: [heldBoth[0]] }), /carrying the access token of the starting generation/)
  const undelivered = [heldBoth[0], { ...heldBoth[1], deliveredAt: null }]
  failsOn(judgeSimultaneousRefresh({ ...adopted, held: undelivered }), /delivered before the first refresh was answered/)
})

test('case 7: no refresh at all, a refused refresh, or a refresh before any 401 FAILS', () => {
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [] }), /delivered before the first refresh was answered/)
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [] }), /every refresh presented/)
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [{ ...rotationByA, status: 401, issued: undefined }] }), /every refresh presented/)
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [{ ...rotationByA, issuedAt: 400 }] }), /no refresh was sent before a forced 401/)
})

test('case 7: two refreshes from the same tab, or three refreshes, FAIL', () => {
  const twice = { ...rotationByA, issuedAt: 590, respondedAt: 640 }
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [rotationByA, twice] }), /every refresh presented/)
  const b = { ...rotationByA, tab: 'B' }
  failsOn(judgeSimultaneousRefresh({ ...adopted, refreshes: [rotationByA, b, { ...b, tab: 'C' }] }), /every refresh presented/)
})

test('case 7: tabs that end on different refresh tokens, or a tab not on the stored token, FAIL', () => {
  const split = [
    { tab: 'A', token: 'acc2', stored: stored2 },
    { tab: 'B', token: 'acc2b', stored: { generation: 2, access: 'acc2b', refresh: 'ref2b' } },
  ]
  failsOn(judgeSimultaneousRefresh({ ...adopted, continued: split }), /both tabs continue/)
  const offStored = [continuedOn(stored2)[0], { tab: 'B', token: 'acc1', stored: stored2 }]
  failsOn(judgeSimultaneousRefresh({ ...adopted, continued: offStored }), /both tabs continue/)
  failsOn(judgeSimultaneousRefresh({ ...adopted, continued: [continuedOn(stored2)[0]] }), /both tabs continue/)
})

// --- cases 9 to 11 ----------------------------------------------------------

const heldEntry = (over = {}) => ({ status: 200, presented: 'refG', releasedAt: 13000, ...over })
const inside = (over = {}) => ({ held: heldEntry(), expected: 'refG', supersededAt: 10000, graceMs: 5000, expect: 'inside', ...over })
const after = (over = {}) => ({ held: heldEntry({ status: 401, releasedAt: 18000 }), expected: 'refG', supersededAt: 10000, graceMs: 5000, expect: 'after', ...over })

test('held refresh inside the grace: sent, the superseded token, released at 3 s of 5 s, answered 200 passes', () => {
  passes(judgeHeldRefresh(inside()))
})

test('held refresh inside the grace: a request that never reached the server FAILS', () => {
  failsOn(judgeHeldRefresh(inside({ held: undefined })), /was sent and the server answered it/)
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ status: null, failed: 'net::ERR_ABORTED' }) })), /was sent and the server answered it/)
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ status: null }) })), /answered the held refresh 200/)
})

test('held refresh inside the grace: answered 401, or released after the grace, FAILS', () => {
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ status: 401 }) })), /answered the held refresh 200/)
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ releasedAt: 15001 }) })), /released inside its grace/)
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ releasedAt: 9000 }) })), /released inside its grace/)
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ releasedAt: undefined }) })), /released inside its grace/)
})

test('held refresh: the grace is the configured one, not a constant', () => {
  // Released 3 s after supersession: inside a 5 s grace, outside a 2 s one.
  passes(judgeHeldRefresh(inside({ graceMs: 5000 })))
  failsOn(judgeHeldRefresh(inside({ graceMs: 2000 })), /released inside its grace \(2000 ms\)/)
})

test('held refresh: a request that presented another token FAILS', () => {
  failsOn(judgeHeldRefresh(inside({ held: heldEntry({ presented: 'refCurrent' }) })), /presented the superseded token/)
})

test('held refresh after the grace: sent, released at 8 s of 5 s, answered 401 passes', () => {
  passes(judgeHeldRefresh(after()))
})

test('held refresh after the grace: answered 200, released inside the grace, or never sent FAILS', () => {
  failsOn(judgeHeldRefresh(after({ held: heldEntry({ status: 200, releasedAt: 18000 }) })), /answered the held refresh 401/)
  failsOn(judgeHeldRefresh(after({ held: heldEntry({ status: 401, releasedAt: 14000 }) })), /released after its grace/)
  failsOn(judgeHeldRefresh(after({ held: undefined })), /was sent and the server answered it/)
})

// --- case 5 -----------------------------------------------------------------

const switched = (over = {}) => ({
  xTokens: ['x1'],
  yTokens: ['y1'],
  signedInAt: 1000,
  list: { captured: true, token: 'y1', issuedAt: 1500 },
  rowsWhileHeld: 0,
  rowsAfter: 4,
  requests: [
    { path: '/api/dashboard/kpis', token: 'y1', issuedAt: 1100, status: 200 },
    { path: '/api/customers', token: 'y1', issuedAt: 1500, status: 200 },
  ],
  ...over,
})

test('case 5: a fresh request under Y, nothing on screen until it is answered, then rows, passes', () => {
  passes(judgeSwitchedTab(switched()))
})

test("case 5: X's rows on screen while Y's request is unanswered FAIL (a cache that was not reset)", () => {
  failsOn(judgeSwitchedTab(switched({ rowsWhileHeld: 4 })), /showed none of the rows X had loaded/)
})

test('case 5: a list drawn without any request FAILS', () => {
  const lines = judgeSwitchedTab(switched({ list: { captured: false }, rowsWhileHeld: 4 }))
  failsOn(lines, /sent a fresh request/)
  failsOn(lines, /issued after Y's sign-in and carries Y's token/)
})

test("case 5: a request under X's token, or one issued before the sign-in, FAILS", () => {
  failsOn(judgeSwitchedTab(switched({ list: { captured: true, token: 'x1', issuedAt: 1500 } })), /carries Y's token/)
  failsOn(judgeSwitchedTab(switched({ list: { captured: true, token: 'y1', issuedAt: 900 } })), /carries Y's token/)
  const xDelivered = switched()
  xDelivered.requests.push({ path: '/api/customers', token: 'x1', issuedAt: 800, status: 200 })
  failsOn(judgeSwitchedTab(xDelivered), /none carried X's/)
  const xRefused = switched()
  xRefused.requests.push({ path: '/api/products', token: 'x1', issuedAt: 1600, status: 401 })
  failsOn(judgeSwitchedTab(xRefused), /none carried X's/)
})

test('case 5: a page that never shows rows, or a tab that was answered nothing, FAILS', () => {
  failsOn(judgeSwitchedTab(switched({ rowsAfter: 0 })), /shows the rows/)
  failsOn(judgeSwitchedTab(switched({ requests: [] })), /every data request answered to the tab/)
})

test('case 5: a row count that was not read is not a pass', () => {
  failsOn(judgeSwitchedTab(switched({ rowsWhileHeld: undefined })), /showed none of the rows X had loaded/)
})
