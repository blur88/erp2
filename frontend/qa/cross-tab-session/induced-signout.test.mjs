// The induced-delay sign-out scenario (case 17), as pure functions
// (lib/induced-signout.mjs).
//
// The evidence starts at the sign-out, not at the logout request: a request of
// the application that the harness saw still pending immediately before the
// sign-out was initiated, that the ingress log shows the limiter was delaying,
// and whose end - answered, or cancelled by the sign-out - is recorded. The
// application aborts its in-flight requests when it signs out, before it sends
// the logout; that is valid behaviour and is what the scenario observes.
//
//   node --test frontend/qa/cross-tab-session/induced-signout.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { INDUCED_SIZES, MAX_INDUCED_ATTEMPTS, SIGN_OUT_SETTLE_MS, fateOf, judgeInducedSignOut, pendingAtSignOut, preLogoutWindow } from './lib/induced-signout.mjs'

const SIGN_OUT = 10_000 // the harness's clock, when the sign-out was initiated
const LOGOUT_ANSWERED = 10_300
const CLEANUP = 20_000

/** One of the application's requests, as the harness records it. */
const request = (over = {}) => ({
  qaId: 'app-40', tab: 't2', zone: 'business', method: 'GET', path: '/api/sales-orders',
  issuedAt: 9_700, respondedAt: null, failedAt: null, failed: null, status: null, ...over,
})
/** Pending at the sign-out and aborted by it. */
const aborted = (over = {}) => request({ failed: 'net::ERR_ABORTED', failedAt: 10_050, ...over })
/** Pending at the sign-out and answered after it. */
const answered = (over = {}) => request({ status: 401, respondedAt: 10_200, ...over })

/** One ingress line, as nginx/access-log.mjs parses it. */
const line = (over = {}) => ({
  remoteAddr: '172.18.0.1', method: 'GET', uri: '/api/sales-orders', status: 499, startMs: 500, endMs: 900, requestMs: 400,
  upstream: { kind: 'none', ms: null }, nonUpstreamMs: null, limitReq: 'DELAYED', limitConn: null, qaId: 'app-40', ...over,
})
const fillerLine = (i) => line({ qaId: `fill-10-1-0000${i}`, status: 401, upstream: { kind: 'single', ms: 2 }, limitConn: 'PASSED' })
const logoutLine = (over = {}) => line({ method: 'POST', uri: '/api/auth/logout', status: 204, limitReq: 'PASSED', limitConn: 'PASSED', startMs: 950, endMs: 970, qaId: 'app-90', upstream: { kind: 'single', ms: 15 }, ...over })

const tabs = (n, over = () => ({})) => Array.from({ length: n }, (_, i) => ({ tab: `t${i + 1}`, onLoginPage: true, sameDocument: true, staleUi: false, ...over(i) }))

/** An attempt in which everything the scenario requires happened. */
const good = (over = {}) => ({
  n: 10,
  attempt: 1,
  signOutAt: SIGN_OUT,
  logoutAnsweredAt: LOGOUT_ANSWERED,
  cleanupAt: CLEANUP,
  app: [request({ qaId: 'app-1', issuedAt: 8_000, respondedAt: 8_100, status: 200 }), aborted()],
  ingress: [line({ qaId: 'app-1', status: 200, limitReq: 'PASSED' }), line(), fillerLine(1), fillerLine(2), logoutLine()],
  tabs: tabs(10),
  logoutStatuses: [204],
  sessionRoute429: 0,
  ...over,
})
const verdictOf = (over) => judgeInducedSignOut(good(over))

test('the scenario runs at 5, 10 and 20 application tabs, with at most three attempts each', () => {
  assert.deepEqual(INDUCED_SIZES, [5, 10, 20])
  assert.equal(MAX_INDUCED_ATTEMPTS, 3)
})

// --- pending immediately before the sign-out ---------------------------------------

test('a data request of the application issued before the sign-out and not yet ended is pending at it', () => {
  assert.deepEqual(pendingAtSignOut([aborted(), answered({ qaId: 'app-41' })], SIGN_OUT).map((e) => e.qaId), ['app-40', 'app-41'])
})

test('a request that had already ended, either way, was not pending', () => {
  const ended = [request({ status: 200, respondedAt: 9_990 }), request({ qaId: 'app-41', failed: 'net::ERR_ABORTED', failedAt: 9_999 })]
  assert.deepEqual(pendingAtSignOut(ended, SIGN_OUT), [])
})

test('a request issued after the sign-out was initiated was not pending before it', () => {
  assert.deepEqual(pendingAtSignOut([aborted({ issuedAt: 10_001, failedAt: 10_050 })], SIGN_OUT), [])
})

test('requests to the session routes and requests without an identifier are not the application data requests meant', () => {
  const others = [aborted({ zone: 'session', path: '/api/auth/me' }), aborted({ qaId: null }), aborted({ qaId: 'fill-10-1-00007' }), aborted({ zone: 'health', path: '/api/health' })]
  assert.deepEqual(pendingAtSignOut(others, SIGN_OUT), [])
})

// --- what became of it ----------------------------------------------------------------

const ctx = { signOutAt: SIGN_OUT, logoutAnsweredAt: LOGOUT_ANSWERED, cleanupAt: CLEANUP, tabs: tabs(10) }

test('answered: the status and when', () => {
  assert.deepEqual(fateOf(answered(), ctx), { fate: 'completed', status: 401, atMs: 10_200 })
})

test('aborted between the sign-out and shortly after the logout was answered, in a tab that kept its document: the sign-out', () => {
  assert.equal(fateOf(aborted(), ctx).fate, 'cancelled-by-sign-out')
  assert.equal(fateOf(aborted({ failedAt: LOGOUT_ANSWERED + SIGN_OUT_SETTLE_MS }), ctx).fate, 'cancelled-by-sign-out')
})

test('aborted long after the logout was answered: not attributed to the sign-out', () => {
  assert.equal(fateOf(aborted({ failedAt: LOGOUT_ANSWERED + SIGN_OUT_SETTLE_MS + 1 }), ctx).fate, 'cancelled-other')
})

test('aborted once the harness had begun closing the tabs: harness cleanup, not the sign-out', () => {
  assert.equal(fateOf(aborted({ failedAt: CLEANUP + 5 }), ctx).fate, 'cancelled-by-harness-cleanup')
  // Even inside the sign-out's interval: cleanup that early would be the harness's doing.
  assert.equal(fateOf(aborted({ failedAt: 10_050 }), { ...ctx, cleanupAt: 10_040 }).fate, 'cancelled-by-harness-cleanup')
})

test('aborted in a tab whose document changed: a navigation, not the sign-out', () => {
  const navigated = { ...ctx, tabs: tabs(10, (i) => (i === 1 ? { sameDocument: false } : {})) }
  assert.equal(fateOf(aborted({ tab: 't2' }), navigated).fate, 'cancelled-by-navigation')
})

test('a failure that is not an abort is not a cancellation by anything', () => {
  assert.equal(fateOf(request({ failed: 'net::ERR_CONNECTION_RESET', failedAt: 10_050 }), ctx).fate, 'failed-other')
})

test('neither answered nor failed when the attempt ended: unknown', () => {
  assert.equal(fateOf(request(), ctx).fate, 'unknown')
})

test('without a recorded logout answer the sign-out interval is measured from the sign-out itself', () => {
  assert.equal(fateOf(aborted({ failedAt: SIGN_OUT + SIGN_OUT_SETTLE_MS }), { ...ctx, logoutAnsweredAt: null }).fate, 'cancelled-by-sign-out')
  assert.equal(fateOf(aborted({ failedAt: SIGN_OUT + SIGN_OUT_SETTLE_MS + 1 }), { ...ctx, logoutAnsweredAt: null }).fate, 'cancelled-other')
})

// --- the verdict -----------------------------------------------------------------------

test('a request pending at the sign-out, delayed by the limiter, and aborted by the sign-out: pass', () => {
  const v = verdictOf({})
  assert.deepEqual([v.verdict, v.behaviour], ['pass', 'ok'], v.reason)
  assert.deepEqual(v.evidence.map((e) => [e.qaId, e.fate]), [['app-40', 'cancelled-by-sign-out']])
})

test('a request pending at the sign-out, delayed by the limiter, and answered afterwards: pass too', () => {
  const v = verdictOf({ app: [answered()], ingress: [line({ status: 401, upstream: { kind: 'single', ms: 3 } }), fillerLine(1), logoutLine()] })
  assert.equal(v.verdict, 'pass')
  assert.equal(v.evidence[0].fate, 'completed')
})

const behaviourFails = (name, over, pattern) =>
  test(`a behavioural failure is a fail, evidence or not: ${name}`, () => {
    for (const app of [good().app, []]) {
      const v = verdictOf({ ...over, app })
      assert.deepEqual([v.verdict, v.behaviour, v.retry], ['fail', 'failed', false], v.reason)
      assert.match(v.reason, pattern)
    }
  })

behaviourFails('a tab left signed in', { tabs: tabs(10, (i) => (i === 3 ? { onLoginPage: false } : {})) }, /login page/)
behaviourFails('a tab that reached the login page by being reloaded', { tabs: tabs(10, (i) => (i === 0 ? { sameDocument: false } : {})) }, /reload/)
behaviourFails('stale data shown in a signed-out tab', { tabs: tabs(10, (i) => (i === 5 ? { staleUi: true } : {})) }, /stale/)
behaviourFails('fewer tabs recorded than were opened', { tabs: tabs(9) }, /9 of 10/)
behaviourFails('the logout answered with an error', { logoutStatuses: [500] }, /logout/)
behaviourFails('no logout sent', { logoutStatuses: [] }, /logout/)
behaviourFails('a 429 on a session route', { sessionRoute429: 1 }, /429/)

const inconclusive = (name, over, pattern, retry) =>
  test(`inconclusive, never a pass: ${name}`, () => {
    const v = verdictOf(over)
    assert.deepEqual([v.verdict, v.behaviour], ['inconclusive', 'ok'], v.reason)
    assert.match(v.reason, pattern)
    assert.equal(v.retry, retry)
  })

inconclusive('the sign-out\'s initiation was not recorded', { signOutAt: null }, /initiation/, false)
inconclusive('no ingress log, or no markers in it', { ingress: null }, /ingress log/, false)
inconclusive('no filler reached the ingress', { ingress: [line(), logoutLine()] }, /filler/, false)
inconclusive('the application and the fillers reached the ingress from two addresses', { ingress: [line(), { ...fillerLine(1), remoteAddr: '172.18.0.9' }, logoutLine()] }, /address/, false)
inconclusive('nothing of the application was pending when the sign-out began', { app: [request({ status: 200, respondedAt: 9_000 })] }, /pending/, true)
inconclusive('the pending request has no line in the ingress log: not correlated', { ingress: [fillerLine(1), logoutLine()] }, /not in the ingress log/, true)
inconclusive('the pending request was not delayed by the limiter', { ingress: [line({ limitReq: 'PASSED' }), fillerLine(1), logoutLine()] }, /not delayed/, true)
inconclusive('the pending, delayed request\'s end was never recorded', { app: [request()] }, /what became of it/, true)

// --- the two cancellations that must not count -----------------------------------------

test('negative: a request cancelled BEFORE the sign-out is not evidence, however close to the logout the ingress shows it', () => {
  // Aborted 10 ms before the sign-out was initiated: its ingress line ends
  // right before the logout's, inside any "window before the logout".
  const v = verdictOf({
    app: [request({ failed: 'net::ERR_ABORTED', failedAt: SIGN_OUT - 10 })],
    ingress: [line({ endMs: 945 }), fillerLine(1), logoutLine({ startMs: 950 })],
  })
  assert.equal(v.verdict, 'inconclusive')
  assert.match(v.reason, /pending/)
  // The corroborating window still sees it, which is why it is only that.
  assert.equal(preLogoutWindow([line({ endMs: 945 }), logoutLine({ startMs: 950 })]).abortedWhileDelayed, 1)
})

test('negative: an unrelated cancellation near the logout is not evidence', () => {
  const cases = {
    'issued after the sign-out began': { app: [aborted({ issuedAt: SIGN_OUT + 20, failedAt: SIGN_OUT + 60 })] },
    'cancelled by the harness closing the tab': { app: [aborted({ failedAt: 10_050 })], cleanupAt: 10_040 },
    'cancelled by a navigation of its tab': { app: [aborted({ tab: 't2' })], tabs: tabs(10, (i) => (i === 1 ? { sameDocument: false } : {})) },
    'a filler cancelled near the logout': { app: [aborted({ qaId: 'fill-10-1-00003' })] },
  }
  for (const [name, over] of Object.entries(cases)) {
    const v = verdictOf(over)
    assert.notEqual(v.verdict, 'pass', name)
  }
})

test('one request that qualifies is enough, and the ones that do not are still listed with why', () => {
  const v = verdictOf({
    app: [aborted(), aborted({ qaId: 'app-41', failedAt: CLEANUP + 1 }), request({ qaId: 'app-42' })],
    ingress: [line(), line({ qaId: 'app-41' }), line({ qaId: 'app-42', limitReq: 'PASSED' }), fillerLine(1), logoutLine()],
  })
  assert.equal(v.verdict, 'pass')
  assert.deepEqual(v.evidence.map((e) => e.qaId), ['app-40'])
  assert.deepEqual(v.pending.map((e) => [e.qaId, e.delayed, e.fate]), [['app-40', true, 'cancelled-by-sign-out'], ['app-41', true, 'cancelled-by-harness-cleanup'], ['app-42', false, 'unknown']])
})
