// The induced-delay sign-out scenario (case 17), as pure functions
// (lib/induced-signout.mjs). Run on sign-out attempts W1 recorded, as the ingress
// saw them, and on changes to them.
//
//   node --test frontend/qa/cross-tab-session/induced-signout.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appOverlap, judgeInducedSignOut, MAX_INDUCED_ATTEMPTS, INDUCED_SIZES } from './lib/induced-signout.mjs'

/** One ingress line, as nginx/access-log.mjs parses it. */
const line = (over = {}) => ({
  remoteAddr: '172.18.0.1',
  method: 'GET',
  uri: '/api/sales-orders',
  status: 200,
  startMs: 1_000,
  endMs: 1_050,
  requestMs: 50,
  upstream: { kind: 'single', ms: 40 },
  nonUpstreamMs: 10,
  limitReq: 'PASSED',
  limitConn: 'PASSED',
  qaId: 'app-1',
  ...over,
})
const logout = (over = {}) => line({ method: 'POST', uri: '/api/auth/logout', status: 204, startMs: 2_000, endMs: 2_020, qaId: 'app-90', ...over })
const filler = (i, over = {}) => line({ qaId: `fill-${i}`, status: 401, limitReq: 'DELAYED', startMs: 1_500 + i, endMs: 2_600 + i, ...over })
/** An application request the limiter was delaying when the logout reached the ingress. */
const held = (over = {}) => line({ qaId: 'app-40', limitReq: 'DELAYED', startMs: 1_700, endMs: 2_500, ...over })

const tabs = (n, over = () => ({})) => Array.from({ length: n }, (_, i) => ({ tab: `t${i + 1}`, onLoginPage: true, sameDocument: true, ...over(i) }))

/** An attempt in which everything the scenario requires happened. */
const good = (n = 10, over = {}) => ({
  n,
  attempt: 1,
  ingress: [line(), held(), filler(1), filler(2), logout()],
  tabs: tabs(n),
  logoutStatuses: [204],
  sessionRoute429: 0,
  ...over,
})

test('the scenario runs at 5, 10 and 20 application tabs, with at most three attempts each', () => {
  assert.deepEqual(INDUCED_SIZES, [5, 10, 20])
  assert.equal(MAX_INDUCED_ATTEMPTS, 3)
})

// --- what counts as the overlap --------------------------------------------------

test('an application request delayed by the limiter and outstanding at the logout is the overlap', () => {
  const o = appOverlap([line(), held(), logout()])
  assert.equal(o.verdict, 'overlap')
  assert.deepEqual(o.outstanding, ['app-40'])
})

test('a filler being delayed at the logout is not the overlap: it is not the application\'s request', () => {
  assert.equal(appOverlap([line(), filler(1), filler(2), logout()]).verdict, 'no-overlap')
})

test('an application request the limiter passed, however long it took, is not the overlap', () => {
  assert.equal(appOverlap([held({ limitReq: 'PASSED' }), logout()]).verdict, 'no-overlap')
})

test('a delayed application request that was already answered, or had not arrived, when the logout did is not the overlap', () => {
  assert.equal(appOverlap([held({ endMs: 1_999 }), logout()]).verdict, 'no-overlap')
  assert.equal(appOverlap([held({ startMs: 2_001, endMs: 2_900 }), logout()]).verdict, 'no-overlap')
})

test('the logout itself, and requests to the session routes, are not the delayed request', () => {
  assert.equal(appOverlap([logout({ limitReq: 'DELAYED', startMs: 1_900, endMs: 2_400 })]).verdict, 'no-overlap')
  assert.equal(appOverlap([line({ uri: '/api/auth/me', limitReq: 'DELAYED', qaId: 'app-5', startMs: 1_700, endMs: 2_500 }), logout()]).verdict, 'no-overlap')
})

test('without a logout in the log there is nothing to overlap', () => {
  assert.equal(appOverlap([line(), held()]).verdict, 'no-logout')
})

// --- the verdict ------------------------------------------------------------------

test('everything the scenario requires: pass', () => {
  assert.deepEqual(judgeInducedSignOut(good()), { verdict: 'pass', behaviour: 'ok', reason: 'the logout reached the ingress while 1 delayed request(s) of the application were outstanding; it was answered 2xx and all 10 tabs reached the login page without a reload' })
})

const behaviourFails = (name, over, pattern) =>
  test(`a behavioural failure is a fail, overlap or not: ${name}`, () => {
    for (const ingress of [good().ingress, [line(), logout()]]) {
      const v = judgeInducedSignOut(good(10, { ...over, ingress }))
      assert.deepEqual([v.verdict, v.behaviour], ['fail', 'failed'], v.reason)
      assert.match(v.reason, pattern)
    }
  })

behaviourFails('a tab left signed in', { tabs: tabs(10, (i) => (i === 3 ? { onLoginPage: false } : {})) }, /login page/)
behaviourFails('a tab that reached the login page by being reloaded', { tabs: tabs(10, (i) => (i === 0 ? { sameDocument: false } : {})) }, /reload/)
behaviourFails('fewer tabs recorded than were opened', { tabs: tabs(9) }, /9 of 10/)
behaviourFails('the logout answered with an error', { logoutStatuses: [500] }, /logout/)
behaviourFails('no logout sent', { logoutStatuses: [] }, /logout/)
behaviourFails('a 429 on a session route', { sessionRoute429: 1 }, /429/)

const inconclusive = (name, over, pattern) =>
  test(`missing evidence is inconclusive, never a pass: ${name}`, () => {
    const v = judgeInducedSignOut(good(10, over))
    assert.deepEqual([v.verdict, v.behaviour], ['inconclusive', 'ok'], v.reason)
    assert.match(v.reason, pattern)
  })

inconclusive('no ingress log', { ingress: null }, /ingress log/)
inconclusive('the attempt\'s markers were not in the log', { ingress: undefined }, /ingress log/)
inconclusive('the application and the fillers reached the ingress from two addresses', { ingress: [line(), held(), filler(1, { remoteAddr: '172.18.0.9' }), logout()] }, /address/)
inconclusive('no filler reached the ingress at all', { ingress: [line(), held(), logout()] }, /filler/)
inconclusive('behaved, and no application request was being delayed at the logout', { ingress: [line(), filler(1), logout()] }, /no delayed request of the application/)

test('only an attempt that behaved and lacked the overlap may be set up again', () => {
  assert.equal(judgeInducedSignOut(good(10, { ingress: [line(), filler(1), logout()] })).retry, true)
  assert.equal(judgeInducedSignOut(good(10, { sessionRoute429: 1 })).retry, false)
  assert.equal(judgeInducedSignOut(good()).retry ?? false, false)
})
