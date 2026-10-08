// What W1 blocks on and what it reports (lib/w1-judgement.mjs). No browser:
//
//   node --test frontend/qa/cross-tab-session/w1-judgement.test.mjs
//
// Since #1353 the loading rounds block at 5, 10 and 20 tabs, each with a
// deadline and with zero in-app recovery actions, and the sign-out round blocks
// at all three as well.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLOCKING_SIZES,
  DEADLINE_MS,
  W1_SCOPE,
  blockingChecks,
  byRoute,
  nonBlockingFindings,
  observed,
  observedLine,
} from './lib/w1-judgement.mjs'

const req = (route, status = 200, tab = 'N5-1') => ({ t: 0, tab, method: 'POST', path: `/api/auth/${route}`, status })

// A round as lib/w1.mjs records it, with nothing wrong in it.
function ab(round, n = 5, over = {}) {
  const requests = round === 'b' ? [req('refresh', 200, `N${n}b-1`)] : []
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
    completedAfterMs: 1000,
    completionPollMs: 250,
    deadlineMs: DEADLINE_MS[n],
    ...(round === 'a' ? { accessTokenRemainingMsAtStart: 15000 } : { accessTokenExpiredAtStart: true }),
    ...over,
  }
}

function c(n = 5, over = {}) {
  const requests = [req('refresh', 200, `N${n}c-1`), req('logout', 204, `N${n}c-1`)]
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
const goodAll = () => [ab('a', 5), ab('b', 5), c(5), ab('a', 10), ab('b', 10), c(10), ab('a', 20), ab('b', 20), c(20)]
/**
 * The nine good rounds, with one or more of them patched. Every mutation test
 * starts from this, so the only failing check is the one the mutation causes:
 * a size with no rounds at all would fail for a different reason.
 */
const all = (mutations = []) => {
  const rounds = goodAll()
  for (const [n, round, patch] of mutations) {
    const i = rounds.findIndex((r) => r.n === n && r.round === round)
    rounds[i] = { ...rounds[i], ...patch }
  }
  return rounds
}

// Judged against the sizes the fixture actually has rounds for: a size with no
// rounds fails every one of its checks, which is a different test.
const sizesOf = (rounds) => [...new Set(rounds.map((r) => r.n))].sort((a, b) => a - b)
const failed = (rounds, sizes = sizesOf(rounds)) => blockingChecks(rounds, sizes).filter((k) => !k.ok).map((k) => k.label)
const labelsOf = (rounds, sizes = sizesOf(rounds)) => blockingChecks(rounds, sizes).map((k) => k.label)

test('rounds for 5, 10 and 20 all good: every check passes, and each size has checks', () => {
  assert.deepEqual(failed(goodAll()), [])
  const labels = labelsOf(goodAll())
  for (const n of BLOCKING_SIZES) {
    assert.ok(labels.some((l) => l.startsWith(`N = ${n} (`)), `no check labelled for N = ${n}`)
  }
})

test('a size that was not run fails with its own label, and its rounds are not judged', () => {
  assert.deepEqual(failed(good(), [5]), ['N = 10 was run', 'N = 20 was run'])
  const withTen = all().filter((r) => r.n !== 20)
  assert.deepEqual(failed(withTen, [5, 10]), ['N = 20 was run'])
  assert.deepEqual(failed(all()), [])
  // A size that was declared but has no rounds fails each of its own checks.
  assert.deepEqual(failed(withTen, [5, 10, 20]).slice(0, 2), [
    'N = 20 (a): no 429 on refresh, logout or me',
    "N = 20 (a): every tab usable for the non-administrator (data present, the shell's included, and an action working; no reload, no new sign-in, no administrator-only page)",
  ])
})

test('one in-app recovery action at N = 10 fails its own check', () => {
  const rounds = all([[10, 'a', { recoveryActionsTotal: 1, tabsNeedingRecovery: 1 }]])
  const labels = failed(rounds)
  assert.deepEqual(labels, ['N = 10 (a): no in-app recovery action'])
  assert.ok(labelsOf(rounds).some((l) => l.includes('no in-app recovery action')))
})

test('the deadline is inclusive: 15000 passes at N = 20, 15001 fails, null fails', () => {
  const deadlineFail = 'N = 20 (b): complete within the deadline'
  assert.deepEqual(failed(all([[20, 'b', { completedAfterMs: 15000 }]])), [])
  assert.deepEqual(failed(all([[20, 'b', { completedAfterMs: 15001 }]])), [deadlineFail])
  assert.deepEqual(failed(all([[20, 'b', { completedAfterMs: null }]])), [deadlineFail])
  // The same deadline applies at every size.
  assert.deepEqual(failed(all([[5, 'a', { completedAfterMs: 5001 }]])), ['N = 5 (a): complete within the deadline'])
  assert.deepEqual(failed(all([[10, 'b', { completedAfterMs: 10001 }]])), ['N = 10 (b): complete within the deadline'])
})

test('a tab left signed in at N = 10 fails the sign-out round at that size', () => {
  const tabs = c(10).tabs.map((t, i) => (i === 3 ? { ...t, onLoginPage: false, at: '/dashboard' } : t))
  const rounds = all([[10, 'c', { tabs, tabsOnLoginPage: 9, everyTabOnLoginPage: false }]])
  assert.deepEqual(failed(rounds), ['N = 10 (c): every tab is on the login page after the sign-out, without a reload'])
})

test('a session-route 429 at N = 20 fails; business 429s do not', () => {
  assert.deepEqual(failed(all([[20, 'a', { count429: 1 }]])), ['N = 20 (a): no 429 on refresh, logout or me'])
  // A 429 on a session route during the usability check counts at any size too.
  assert.deepEqual(failed(all([[20, 'b', { sessionRequests429DuringUsabilityCheck: 1 }]])), [
    'N = 20 (b): no 429 on refresh, logout or me',
  ])
  assert.deepEqual(failed(all([[20, 'a', { dataRequests429: 40 }]])), [])
})

test('the token-state and logout gates apply at every size', () => {
  assert.deepEqual(failed(all([[10, 'a', { accessTokenRemainingMsAtStart: 0 }]])), [
    'N = 10 (a): the access token was current when the tabs opened',
  ])
  assert.deepEqual(failed(all([[20, 'b', { accessTokenExpiredAtStart: false }]])), [
    'N = 20 (b): every tab did start with an expired access token',
  ])
  assert.deepEqual(failed(all([[20, 'c', { requests: [req('refresh')], total: 1 }]])), [
    'N = 20 (c): the sign-out sent a logout and it was answered 2xx',
  ])
  assert.deepEqual(failed(all([[20, 'c', { requests: [req('refresh'), req('logout', 500)], total: 2 }]])), [
    'N = 20 (c): the sign-out sent a logout and it was answered 2xx',
  ])
})

test('a round that was not run fails the checks of its own size', () => {
  const rounds = all().filter((r) => !(r.n === 20 && r.round === 'a'))
  const labels = failed(rounds)
  // Every check of the round that was not run, and nothing from the rounds that
  // were: a round that is absent has not passed, and it is absent ones own
  // checks that say so.
  assert.deepEqual(labels, [
    'N = 20 (a): no 429 on refresh, logout or me',
    "N = 20 (a): every tab usable for the non-administrator (data present, the shell's included, and an action working; no reload, no new sign-in, no administrator-only page)",
    'N = 20 (a): no in-app recovery action',
    'N = 20 (a): complete within the deadline',
    'N = 20 (a): the access token was current when the tabs opened',
  ])
})

test('a login page reached by reloading still fails', () => {
  const tabs = c(10).tabs.map((t, i) => (i === 0 ? { ...t, sameDocument: false } : t))
  const rounds = all([[10, 'c', { tabs, tabsOnLoginPage: 9, everyTabOnLoginPage: false }]])
  assert.deepEqual(failed(rounds), ['N = 10 (c): every tab is on the login page after the sign-out, without a reload'])
})

test('how many tabs were still loading at the sign-out is reported and never required', () => {
  for (const tabsStillLoadingAtSignOut of [0, 1, 4]) {
    const rounds = all([[5, 'c', { tabsStillLoadingAtSignOut }]])
    assert.deepEqual(failed(rounds), [])
  }
  assert.match(observedLine(observed(c(5, { tabsStillLoadingAtSignOut: 0 }), 20)), /still loading at the sign-out 0\/5/)
})

test('session-zone requests are counted by route', () => {
  assert.deepEqual(byRoute([req('refresh'), req('refresh'), req('logout', 204), req('me')]), { refresh: 2, logout: 1, me: 1 })
  assert.deepEqual(byRoute([]), { refresh: 0, logout: 0, me: 0 })
})

test('what is reported is what was observed, against the configured burst, and no capacity', () => {
  const o = observed(ab('b', 10, { tabsUsable: 9, tabsCompleteOnFirstLoad: 4, recoveryActionsTotal: 7, maxRecoveryActions: 2, dataRequests429: 39, dataRequests: 75, completedAfterMs: 2100 }), 20)
  assert.deepEqual(o.sessionZoneRequests, { refresh: 1, logout: 0, me: 0, total: 1 })
  assert.equal(
    observedLine(o),
    'N=10 (b) blocking: session zone 1 request(s) (refresh 1, logout 0, me 0), 429s 0, peak accumulated demand 1 against burst 20; ' +
      'usable 9/10; complete on first load 4/10; recovery actions 7 (most for one tab 2); complete after 2100 ms of 10000 ms; ' +
      'business-endpoint 429s 39 of 75',
  )
  assert.equal('capacityTabs' in o, false)
  assert.doesNotMatch(observedLine(o), /capacity/i)
  assert.match(observedLine(observed(c(), 20)), /^N=5 \(c\) blocking: session zone 2 request\(s\) \(refresh 1, logout 1, me 0\)/)
})

test('every size prints blocking, since every size blocks', () => {
  for (const n of BLOCKING_SIZES) {
    assert.match(observedLine(observed(ab('a', n), 20)), new RegExp(`^N=${n} \\(a\\) blocking: `))
  }
})

test('the scope sentence says what W1 shows, and that the sizing note is a diagnostic', () => {
  assert.match(W1_SCOPE, /coordinate their refresh/)
  assert.match(W1_SCOPE, /does not measure the capacity of that zone, which is never approached/)
  assert.match(W1_SCOPE, /bounded by the general api_limit \(issue #1353\)/)
  assert.match(W1_SCOPE, /deadline/)
})

test('business 429s stay a finding, not a gate', () => {
  const { findings } = nonBlockingFindings(all([[20, 'a', { dataRequests429: 40 }]]), 'sales_staff')
  assert.ok(findings.some((f) => /^N=20 \(a\): 40 of 60 data requests/.test(f)))
})
