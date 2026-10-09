// What W1 blocks on and what it reports (lib/w1-judgement.mjs). No browser:
//
//   node --test frontend/qa/cross-tab-session/w1-judgement.test.mjs
//
// Since #1353 the loading rounds block at 5, 10 and 20 tabs, each with a
// deadline and with zero in-app recovery actions, and the sign-out round blocks
// at all three as well.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signOutOverlap, diagnostics } from './lib/ingress-log.mjs'
import {
  BLOCKING_SIZES,
  MAX_SIGN_OUT_ATTEMPTS,
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

// The ingress log of a sign-out that overlapped a request the limiter was
// holding: one delayed line still outstanding when the logout went out.
const OVERLAP_ENTRIES = [
  { remoteAddr: '10.1.1.34', method: 'GET', uri: '/api/dashboard/stats', status: 200, endMs: 2000, requestMs: 900, startMs: 1100, upstream: { kind: 'single', ms: 10 }, nonUpstreamMs: 890, limitReq: 'DELAYED', limitConn: 'PASSED', qaId: 'd1' },
  { remoteAddr: '10.1.1.34', method: 'POST', uri: '/api/auth/logout', status: 204, endMs: 1560, requestMs: 20, startMs: 1500, upstream: { kind: 'single', ms: 8 }, nonUpstreamMs: 12, limitReq: 'PASSED', limitConn: 'PASSED', qaId: 'out1' },
]

// A sign-out round that behaved and overlapped a delayed request, which is what
// a passing round now has to be. A good round without that evidence fails: the
// run has then not shown what it exists to show.
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
    attempt: 1,
    ingress: diagnostics(OVERLAP_ENTRIES),
    signOutOverlap: signOutOverlap(OVERLAP_ENTRIES),
    outcome: 'overlap',
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

test('the deadline blocks at five tabs only, and is inclusive: 8000 passes, 8001 fails, null fails', () => {
  const deadlineFail = 'N = 5 (b): complete within the deadline'
  assert.deepEqual(failed(all([[5, 'b', { completedAfterMs: 8000 }]])), [])
  assert.deepEqual(failed(all([[5, 'b', { completedAfterMs: 8001 }]])), [deadlineFail])
  assert.deepEqual(failed(all([[5, 'b', { completedAfterMs: null }]])), [deadlineFail])
  assert.deepEqual(failed(all([[5, 'a', { completedAfterMs: 8001 }]])), ['N = 5 (a): complete within the deadline'])
})

test('at ten and twenty tabs the time is diagnostic: no check on it, and a finding that says so', () => {
  for (const [n, ms] of [[10, 10001], [20, 15001], [20, null]]) {
    const rounds = all([[n, 'b', { completedAfterMs: ms }]])
    assert.deepEqual(failed(rounds), [])
    assert.ok(!labelsOf(rounds).some((l) => l.startsWith(`N = ${n} `) && l.includes('within the deadline')))
    const { findings } = nonBlockingFindings(rounds, 'sales_staff')
    assert.ok(findings.some((f) => f.includes(`N=${n}`) && /diagnostic/.test(f) && /#1359/.test(f)), findings.join('\n'))
  }
  // Five tabs: the finding is behind a failing check and is not called diagnostic.
  const { findings } = nonBlockingFindings(all([[5, 'b', { completedAfterMs: 8001 }]]), 'sales_staff')
  assert.ok(findings.some((f) => f.includes('8001 ms') && !/diagnostic/.test(f)))
})

test('a tab left signed in at N = 10 fails the sign-out round at that size', () => {
  const tabs = c(10).tabs.map((t, i) => (i === 3 ? { ...t, onLoginPage: false, at: '/dashboard' } : t))
  const rounds = all([[10, 'c', { tabs, tabsOnLoginPage: 9, everyTabOnLoginPage: false }]])
  assert.deepEqual(failed(rounds), ['N = 10 (c) attempt 1: every tab is on the login page after the sign-out, without a reload'])
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
    'N = 20 (c) attempt 1: the sign-out sent a logout and it was answered 2xx',
  ])
  assert.deepEqual(failed(all([[20, 'c', { requests: [req('refresh'), req('logout', 500)], total: 2 }]])), [
    'N = 20 (c) attempt 1: the sign-out sent a logout and it was answered 2xx',
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
    'N = 20 (a): the access token was current when the tabs opened',
  ])
})

test('a login page reached by reloading still fails', () => {
  const tabs = c(10).tabs.map((t, i) => (i === 0 ? { ...t, sameDocument: false } : t))
  const rounds = all([[10, 'c', { tabs, tabsOnLoginPage: 9, everyTabOnLoginPage: false }]])
  assert.deepEqual(failed(rounds), ['N = 10 (c) attempt 1: every tab is on the login page after the sign-out, without a reload'])
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

// --- the sign-out round: ingress evidence and a bounded number of attempts ---
//
// The round must be shown to have overlapped a request the limiter was still
// holding, or the evidence for what a sign-out does to a delayed request is not
// there. A round with no overlap is inconclusive, not passed, and may be set up
// again a bounded number of times; a behavioural failure in any attempt is not
// retried at all.

test('the baseline with ingress evidence present passes every check', () => {
  assert.deepEqual(failed(goodAll()), [])
})

test('every recorded sign-out entry of a size is judged on its behaviour, whatever its overlap', () => {
  const rounds = goodAll().flatMap((r) => {
    if (!(r.n === 10 && r.round === 'c')) return [r]
    const missed = { ...r, attempt: 1, outcome: 'setup-missed', signOutOverlap: { verdict: 'no-overlap', delayedOutstanding: 0, logoutStartMs: 1500 } }
    const hit = { ...r, attempt: 2, outcome: 'overlap' }
    return [missed, hit]
  })
  assert.deepEqual(failed(rounds), [])
  assert.equal(labelsOf(rounds).filter((l) => l.includes('overlapped')).length, 0, 'no overlap check in W1')
  assert.ok(labelsOf(rounds).some((l) => /N = 10 \(c\) attempt 1/.test(l)) && labelsOf(rounds).some((l) => /N = 10 \(c\) attempt 2/.test(l)))
})

// Amendment of 2026-10-09: whether a delayed request overlapped a natural
// sign-out is diagnostic in W1. The condition is tested, as a blocking case of
// its own, by the induced-delay scenario (case 17).
test('a natural sign-out that overlapped no delayed request fails nothing in W1', () => {
  const rounds = goodAll().flatMap((r) => {
    if (!(r.n === 5 && r.round === 'c')) return [r]
    return [1, 2, 3].map((attempt) => ({
      ...r,
      attempt,
      outcome: 'setup-missed',
      signOutOverlap: { verdict: 'no-overlap', delayedOutstanding: 0, logoutStartMs: 1500 },
    }))
  })
  assert.deepEqual(failed(rounds), [])
})

test('a behavioural failure in the first attempt fails the run and names the attempt', () => {
  const rounds = goodAll().flatMap((r) => {
    if (!(r.n === 10 && r.round === 'c')) return [r]
    const bad = {
      ...r,
      attempt: 1,
      outcome: 'behaviour-failed',
      count429: 1,
      ingress: { ...r.ingress, rejectedBy: { limit_req: 1, limit_conn: 0, unattributed: 0 } },
    }
    const clean = { ...r, attempt: 2, outcome: 'overlap' }
    return [bad, clean]
  })
  const labels = failed(rounds)
  assert.deepEqual(labels, ['N = 10 (c) attempt 1: no 429 on refresh, logout or me'])
  assert.match(labels[0], /attempt 1/)
})

test('a loading round without the ingress log does not fail a check, and is reported', () => {
  const rounds = goodAll().map((r) => (r.n === 20 && r.round === 'a' ? { ...r, ingress: { unavailable: 'no ingress log' } } : r))
  assert.deepEqual(failed(rounds), [])
  const { findings } = nonBlockingFindings(rounds, 'sales_staff')
  assert.ok(findings.some((f) => /ingress log/.test(f)), `no finding about the missing log: ${JSON.stringify(findings)}`)
})

test('a natural sign-out without the ingress log fails nothing in W1, and is reported', () => {
  const rounds = goodAll().map((r) =>
    r.n === 5 && r.round === 'c'
      ? { ...r, ingress: { unavailable: 'no ingress log' }, outcome: 'setup-missed', signOutOverlap: { verdict: 'no-logout', delayedOutstanding: 0, logoutStartMs: null } }
      : r,
  )
  assert.deepEqual(failed(rounds), [])
  const { findings } = nonBlockingFindings(rounds, 'sales_staff')
  assert.ok(findings.some((f) => /N=5 \(c\).*evidence missing/.test(f)), JSON.stringify(findings))
})

test('a natural sign-out is attempted once: nothing in it is set up again', () => {
  assert.equal(MAX_SIGN_OUT_ATTEMPTS, 1)
})

test('for each mutation of the baseline the exact set of checks fails', () => {
  // One failing check per mutation, and nothing else fails with it.
  const cases = [
    [[10, 'a', { recoveryActionsTotal: 1, tabsNeedingRecovery: 1 }], 'N = 10 (a): no in-app recovery action'],
    [[5, 'b', { completedAfterMs: 8001 }], 'N = 5 (b): complete within the deadline'],
    [[5, 'b', { everyTabUsable: false, tabsUsable: 4, tabsNotRecoverable: [{ tab: 't', whyNot: 'no rows' }] }],
      'N = 5 (b): every tab usable for the non-administrator (data present, the shell\'s included, and an action working; no reload, no new sign-in, no administrator-only page)'],
    [[20, 'a', { count429: 2 }], 'N = 20 (a): no 429 on refresh, logout or me'],
    [[5, 'a', { accessTokenRemainingMsAtStart: -1 }], 'N = 5 (a): the access token was current when the tabs opened'],
    [[20, 'b', { accessTokenExpiredAtStart: false }], 'N = 20 (b): every tab did start with an expired access token'],
    [[10, 'c', { everyTabOnLoginPage: false, tabsOnLoginPage: 9 }], 'N = 10 (c) attempt 1: every tab is on the login page after the sign-out, without a reload'],
  ]
  for (const [patch, expected] of cases) {
    const rounds = goodAll()
    const i = rounds.findIndex((r) => r.n === patch[0] && r.round === patch[1])
    rounds[i] = { ...rounds[i], ...patch[2] }
    assert.deepEqual(failed(rounds), [expected])
  }
})

// --- what a sign-out gate that did not pass actually was ---------------------------
//
// The three cannot be told apart from "the check failed": no delayed request
// happened to be outstanding at the sign-out; the evidence to look for one was
// missing; or the sign-out itself misbehaved. Run on the attempts the recorded
// run on db0cc890e wrote.

import { readFileSync as readFixture } from 'node:fs'
import { signOutGate } from './lib/w1-judgement.mjs'

const recordedSignOuts = JSON.parse(readFixture(new URL('./fixtures/w1-signout-attempts-db0cc890e.json', import.meta.url), 'utf8')).attempts
const at = (n) => recordedSignOuts.filter((a) => a.n === n)

test('five tabs in the recorded run: the overlap was found', () => {
  const gate = signOutGate(at(5))
  assert.equal(gate.state, 'overlap')
  assert.equal(gate.attempts, 1)
})

test('ten tabs in the recorded run: every attempt behaved, the evidence was there, and no delayed request was outstanding', () => {
  const gate = signOutGate(at(10))
  assert.equal(gate.state, 'overlap-absent')
  assert.equal(gate.attempts, 3)
  assert.deepEqual(gate.perAttempt.map((a) => a.state), ['overlap-absent', 'overlap-absent', 'overlap-absent'])
})

test('an attempt without its ingress evidence is evidence-missing, not overlap-absent', () => {
  const attempts = at(10).map((a) => ({ ...a, ingress: { unavailable: 'no ingress log' }, signOutOverlap: { verdict: 'no-logout', delayedOutstanding: 0, logoutStartMs: null } }))
  assert.equal(signOutGate(attempts).state, 'evidence-missing')
})

test('an attempt whose markers were not in the log is evidence-missing too', () => {
  const attempts = at(10).map((a) => ({ ...a, ingress: { unavailable: "the attempt's markers were not in the ingress log" } }))
  assert.equal(signOutGate(attempts).state, 'evidence-missing')
})

test('a sign-out that misbehaved is behaviour-failed, whatever else the attempts were', () => {
  const [first, ...rest] = at(10)
  const stuck = { ...first, everyTabOnLoginPage: false, tabsOnLoginPage: 9, outcome: 'behaviour-failed' }
  const gate = signOutGate([stuck, ...rest])
  assert.equal(gate.state, 'behaviour-failed')
  assert.equal(gate.perAttempt[0].state, 'behaviour-failed')
})

test('a mixture without an overlap is reported by its worst part: missing evidence outranks an absent overlap', () => {
  const [first, ...rest] = at(10)
  const gate = signOutGate([{ ...first, ingress: { unavailable: 'no ingress log' } }, ...rest])
  assert.equal(gate.state, 'evidence-missing')
})

test('no attempt at all is evidence-missing', () => {
  assert.equal(signOutGate([]).state, 'evidence-missing')
})

test('W1 has no blocking check about the overlap any more, at any size', () => {
  for (const attempts of [at(5), at(10)]) {
    const checks = blockingChecks(attempts, [attempts[0].n])
    assert.equal(checks.filter((c) => /overlap/.test(c.label)).length, 0)
  }
})

test('the sign-out round\'s other gates are as they were: the recorded ten-tab attempts pass them', () => {
  const checks = blockingChecks(at(10), [10]).filter((c) => / \(c\)/.test(c.label))
  assert.ok(checks.length >= 3)
  assert.deepEqual(checks.filter((c) => !c.ok).map((c) => c.label), [])
})

test('what the natural sign-out was is reported per size, as a finding and not a verdict', () => {
  const five = nonBlockingFindings(at(5), 'sales_staff').findings
  const ten = nonBlockingFindings(at(10), 'sales_staff').findings
  assert.ok(five.some((f) => /N=5 \(c\).*overlapped a request the limiter was delaying/.test(f)), JSON.stringify(five))
  assert.ok(ten.some((f) => /N=10 \(c\).*overlap absent/.test(f)), JSON.stringify(ten))
})

test('a sign-out that misbehaved still fails W1 on its own check', () => {
  const [first] = at(10)
  const stuck = { ...first, everyTabOnLoginPage: false, tabsOnLoginPage: 9, tabs: first.tabs.map((t, i) => (i === 0 ? { ...t, onLoginPage: false } : t)) }
  assert.ok(blockingChecks([stuck], [10]).some((c) => !c.ok && /login page/.test(c.label)))
})
