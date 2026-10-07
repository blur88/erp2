// What W1 blocks on and what it reports (lib/w1-judgement.mjs). No browser:
//
//   node --test frontend/qa/cross-tab-session/w1-judgement.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { W1_SCOPE, blockingChecks, byRoute, nonBlockingFindings, observed, observedLine } from './lib/w1-judgement.mjs'

const req = (route, status = 200, tab = 'N5-1') => ({ t: 0, tab, method: 'POST', path: `/api/auth/${route}`, status })

// A round as lib/w1.mjs records it, with nothing wrong in it.
function ab(round, n = 5, over = {}) {
  const requests = round === 'b' ? [req('refresh')] : []
  return {
    n,
    round,
    requests,
    total: requests.length,
    count429: 0,
    sessionRequests429DuringUsabilityCheck: 0,
    peakDemandE: requests.length,
    dataRequests: 60,
    dataRequests429: 0,
    dataRequestsFailed: [],
    everyTabUsable: true,
    tabsUsable: n,
    tabsCompleteOnFirstLoad: n,
    tabsNeedingRecovery: 0,
    recoveryActionsTotal: 0,
    maxRecoveryActions: 0,
    tabsCompanyByAutomaticRetry: 0,
    tabsRegionalRequestRefused: 0,
    tabsWithRefusedStep: 0,
    tabsNeedingActionRetry: 0,
    dataNotRecoverableByRole: {},
    tabsNotRecoverable: [],
    ...(round === 'a' ? { accessTokenRemainingMsAtStart: 15000 } : { accessTokenExpiredAtStart: true }),
    ...over,
  }
}

function c(n = 5, over = {}) {
  const requests = [req('refresh'), req('logout', 204)]
  return {
    n,
    round: 'c',
    requests,
    total: requests.length,
    count429: 0,
    peakDemandE: 1.9,
    dataRequests: 40,
    dataRequests429: 0,
    dataRequestsFailed: [],
    tabsStillLoadingAtSignOut: 1,
    tabsOnLoginPage: n,
    everyTabOnLoginPage: true,
    tabs: Array.from({ length: n }, (_, i) => ({ tab: `N${n}c-${i + 1}`, onLoginPage: true, sameDocument: true, at: '/login' })),
    ...over,
  }
}

const good = () => [ab('a'), ab('b'), c()]
const failed = (rounds, sizes = [5]) => blockingChecks(rounds, sizes).filter((k) => !k.ok).map((k) => k.label)

test('a clean N = 5 passes every blocking check, round (c) included', () => {
  assert.deepEqual(failed(good()), [])
  const labels = blockingChecks(good(), [5]).map((k) => k.label)
  assert.ok(labels.includes('N = 5 (c): no 429 on refresh, logout or me'))
  assert.ok(labels.includes('N = 5 (c): every tab is on the login page after the sign-out, without a reload'))
})

test('round (c) BLOCKS: a 429 on logout at five tabs fails W1', () => {
  const requests = [req('refresh'), req('logout', 429)]
  const labels = failed([ab('a'), ab('b'), c(5, { requests, count429: 1 })])
  assert.ok(labels.includes('N = 5 (c): no 429 on refresh, logout or me'))
  assert.ok(labels.includes('N = 5 (c): the sign-out sent a logout and it was answered 2xx'))
})

test('round (c) BLOCKS: a tab that did not reach the login page fails W1', () => {
  const tabs = c().tabs.map((t, i) => (i === 3 ? { ...t, onLoginPage: false, at: '/dashboard' } : t))
  assert.deepEqual(failed([ab('a'), ab('b'), c(5, { tabs, tabsOnLoginPage: 4, everyTabOnLoginPage: false })]), [
    'N = 5 (c): every tab is on the login page after the sign-out, without a reload',
  ])
})

test('round (c) BLOCKS: a tab that reached the login page by being reloaded fails W1', () => {
  const tabs = c().tabs.map((t, i) => (i === 0 ? { ...t, sameDocument: false } : t))
  assert.deepEqual(failed([ab('a'), ab('b'), c(5, { tabs, tabsOnLoginPage: 4, everyTabOnLoginPage: false })]), [
    'N = 5 (c): every tab is on the login page after the sign-out, without a reload',
  ])
})

test('round (c) BLOCKS: a sign-out that sent no logout fails W1', () => {
  assert.deepEqual(failed([ab('a'), ab('b'), c(5, { requests: [req('refresh')], total: 1 })]), ['N = 5 (c): the sign-out sent a logout and it was answered 2xx'])
})

test('a round (c) that was not run fails W1', () => {
  const labels = failed([ab('a'), ab('b')])
  assert.ok(labels.includes('N = 5 (c): no 429 on refresh, logout or me'))
  assert.ok(labels.includes('N = 5 (c): every tab is on the login page after the sign-out, without a reload'))
})

test('how many tabs were still loading at the sign-out is reported and never required', () => {
  for (const tabsStillLoadingAtSignOut of [0, 1, 4]) assert.deepEqual(failed([ab('a'), ab('b'), c(5, { tabsStillLoadingAtSignOut })]), [])
  assert.match(observedLine(observed(c(5, { tabsStillLoadingAtSignOut: 0 }), 20)), /still loading at the sign-out 0\/5/)
})

test('round (a) counts only with a current token: no time left on it fails W1', () => {
  for (const accessTokenRemainingMsAtStart of [0, -1200, undefined]) {
    assert.deepEqual(failed([ab('a', 5, { accessTokenRemainingMsAtStart }), ab('b'), c()]), ['N = 5 (a): the access token was current when the tabs opened'])
  }
})

test('rounds (a) and (b) still block on a session 429, also one during the usability check, and on an unusable tab', () => {
  assert.deepEqual(failed([ab('a', 5, { count429: 1 }), ab('b'), c()]), ['N = 5 (a): no 429 on refresh, logout or me'])
  assert.deepEqual(failed([ab('a'), ab('b', 5, { sessionRequests429DuringUsabilityCheck: 1 }), c()]), ['N = 5 (b): no 429 on refresh, logout or me'])
  assert.equal(failed([ab('a'), ab('b', 5, { everyTabUsable: false, tabsUsable: 4 }), c()]).length, 1)
  assert.deepEqual(failed([ab('a'), ab('b', 5, { accessTokenExpiredAtStart: false }), c()]), ['N = 5 (b): every tab did start with an expired access token'])
})

test('a run without N = 5 fails', () => {
  assert.deepEqual(failed([ab('a', 10), ab('b', 10), c(10)], [10]), ['N = 5 was run (the blocking size)'])
})

test('nothing at N = 10 or 20 blocks; it is reported', () => {
  const rounds = [...good(), ab('a', 10, { count429: 2, everyTabUsable: false, tabsNotRecoverable: [{ tab: 'N10a-3', whyNot: 'no rows' }] }), c(20, { everyTabOnLoginPage: false, count429: 1 })]
  assert.deepEqual(failed(rounds, [5, 10, 20]), [])
  const { findings } = nonBlockingFindings(rounds, 'sales_staff')
  assert.ok(findings.some((f) => /^N=10 \(a\): 2 request\(s\) to refresh, logout or me answered 429$/.test(f)))
  assert.ok(findings.some((f) => /^N=10 \(a\): 1 of 10 tabs were NOT usable/.test(f)))
  assert.ok(findings.some((f) => /^N=20 \(c\): not every tab reached the login page/.test(f)))
})

test('session-zone requests are counted by route', () => {
  assert.deepEqual(byRoute([req('refresh'), req('refresh'), req('logout', 204), req('me')]), { refresh: 2, logout: 1, me: 1 })
  assert.deepEqual(byRoute([]), { refresh: 0, logout: 0, me: 0 })
})

test('what is reported is what was observed, against the configured burst, and no capacity', () => {
  const o = observed(ab('b', 10, { tabsUsable: 9, tabsCompleteOnFirstLoad: 4, recoveryActionsTotal: 7, maxRecoveryActions: 2, dataRequests429: 39, dataRequests: 75 }), 20)
  assert.deepEqual(o.sessionZoneRequests, { refresh: 1, logout: 0, me: 0, total: 1 })
  assert.equal(
    observedLine(o),
    'N=10 (b): session zone 1 request(s) (refresh 1, logout 0, me 0), 429s 0, peak accumulated demand 1 against burst 20; ' +
      'usable 9/10; complete on first load 4/10; recovery actions 7 (most for one tab 2); business-endpoint 429s 39 of 75',
  )
  assert.equal('capacityTabs' in o, false)
  assert.doesNotMatch(observedLine(o), /capacity/i)
  assert.match(observedLine(observed(c(), 20)), /^N=5 \(c\) blocking: session zone 2 request\(s\) \(refresh 1, logout 1, me 0\)/)
})

test('the scope sentence says what W1 shows and that it measures no capacity', () => {
  assert.match(W1_SCOPE, /coordinate their refresh/)
  assert.match(W1_SCOPE, /little load on session_limit/)
  assert.match(W1_SCOPE, /does not measure the capacity of that zone, which is never approached/)
  assert.match(W1_SCOPE, /bounded by the general api_limit \(issue #1353\)/)
})
