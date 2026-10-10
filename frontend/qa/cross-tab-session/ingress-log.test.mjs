// What the ingress log says about a W1 round, and what it says about the
// sign-out (lib/ingress-log.mjs). Pure over parsed log lines: no file, no
// clock, no browser.
//
//   node --test frontend/qa/cross-tab-session/ingress-log.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { windowBetween, diagnostics, signOutOverlap, signOutAttemptOutcome, limiterZoneOf } from './lib/ingress-log.mjs'

/** One ingress log line, as nginx/access-log.mjs reads it. */
const line = (over = {}) => ({
  remoteAddr: '10.1.1.34',
  method: 'GET',
  uri: '/api/dashboard/stats',
  status: 200,
  endMs: 1_000_000,
  requestMs: 20,
  startMs: 999_980,
  upstream: { kind: 'single', ms: 15 },
  nonUpstreamMs: 5,
  limitReq: 'PASSED',
  limitConn: 'PASSED',
  qaId: null,
  ...over,
})

const delayed = (over = {}) => line({ limitReq: 'DELAYED', requestMs: 900, nonUpstreamMs: 885, ...over })

test('windowBetween returns the marker address\'s lines between the two markers', () => {
  const entries = [
    line({ qaId: 'mark-in', uri: '/manifest.json', limitReq: null, limitConn: null, startMs: 1000, endMs: 1005 }),
    line({ qaId: 'a', startMs: 1100 }),
    line({ qaId: 'b', startMs: 1500 }),
    line({ qaId: 'mark-out', uri: '/manifest.json', limitReq: null, limitConn: null, startMs: 1600, endMs: 1605 }),
    line({ qaId: 'c', startMs: 1700 }),
    // Another address's line inside the window: not this round's.
    line({ qaId: 'other', remoteAddr: '172.18.0.9', startMs: 1200 }),
  ]
  const window = windowBetween(entries, 'mark-in', 'mark-out')
  assert.deepEqual(window.entries.map((e) => e.qaId), ['a', 'b'])
  assert.equal(window.clientAddr, '10.1.1.34')
})

test('windowBetween is null when either marker is missing', () => {
  const entries = [line({ qaId: 'mark-in' }), line({ qaId: 'a', startMs: 1100 })]
  assert.equal(windowBetween(entries, 'mark-in', 'mark-out'), null)
  assert.equal(windowBetween(entries, 'nothing', 'mark-in'), null)
})

test('diagnostics counts each limiter\'s rejections and the unattributed ones separately', () => {
  const d = diagnostics([
    line({ status: 429, limitReq: 'REJECTED', limitConn: 'PASSED', upstream: { kind: 'none', ms: null }, nonUpstreamMs: null }),
    line({ status: 429, limitReq: 'PASSED', limitConn: 'REJECTED', upstream: { kind: 'none', ms: null }, nonUpstreamMs: null }),
    line({ status: 429, limitReq: 'PASSED', limitConn: 'PASSED', upstream: { kind: 'none', ms: null }, nonUpstreamMs: null }),
    line(),
  ])
  assert.deepEqual(d.rejectedBy, { limit_req: 1, limit_conn: 1, unattributed: 1 })
})

test('diagnostics counts a 401 on a delayed line separately', () => {
  const d = diagnostics([
    delayed({ status: 401 }),
    line({ status: 401 }),
    line({ status: 429, limitReq: 'REJECTED', limitConn: 'PASSED' }),
  ])
  assert.equal(d.status401.total, 2)
  assert.equal(d.status401.onDelayed, 1)
})

test('diagnostics keeps an entry with no upstream out of the timings, and counts multiples', () => {
  const d = diagnostics([
    line({ upstream: { kind: 'single', ms: 15 }, nonUpstreamMs: 5, requestMs: 20 }),
    line({ upstream: { kind: 'none', ms: null }, nonUpstreamMs: null, requestMs: 0 }),
    line({ upstream: { kind: 'multiple', ms: 30 }, nonUpstreamMs: 10, requestMs: 40 }),
    line({ upstream: { kind: 'single', ms: 40 }, nonUpstreamMs: 10, requestMs: 50 }),
  ])
  assert.equal(d.upstreamMs.n, 3)
  assert.equal(d.upstreamMs.none, 1)
  assert.equal(d.upstreamMs.multiple, 1)
  assert.equal(d.approxNonUpstreamMs.unavailable, 1)
  assert.equal(d.approxNonUpstreamMs.n, 3)
})

test('signOutOverlap: a delayed line outstanding at the logout is an overlap', () => {
  const entries = [
    delayed({ uri: '/api/dashboard/stats', qaId: 'd1', startMs: 1000, endMs: 2000 }),
    line({ method: 'POST', uri: '/api/auth/logout', qaId: 'out', startMs: 1500, endMs: 1560 }),
  ]
  const overlap = signOutOverlap(entries)
  assert.equal(overlap.verdict, 'overlap')
  assert.equal(overlap.delayedOutstanding, 1)
  assert.equal(overlap.logoutStartMs, 1500)
})

test('signOutOverlap: a delayed line that ended first, or one that was not delayed, is not', () => {
  assert.equal(
    signOutOverlap([
      delayed({ startMs: 1000, endMs: 1400 }),
      line({ method: 'POST', uri: '/api/auth/logout', startMs: 1500, endMs: 1560 }),
    ]).verdict,
    'no-overlap',
  )
  assert.equal(
    signOutOverlap([
      line({ startMs: 1000, endMs: 2000 }),
      line({ method: 'POST', uri: '/api/auth/logout', startMs: 1500, endMs: 1560 }),
    ]).verdict,
    'no-overlap',
  )
})

test('signOutOverlap: no logout line at all says so', () => {
  const overlap = signOutOverlap([delayed({ startMs: 1000, endMs: 2000 })])
  assert.equal(overlap.verdict, 'no-logout')
  assert.equal(overlap.logoutStartMs, null)
  assert.equal(overlap.delayedOutstanding, 0)
})

// --- the attempt's outcome --------------------------------------------------

const goodAttempt = (over = {}) => ({
  n: 5,
  round: 'c',
  attempt: 1,
  count429: 0,
  sessionRequests429DuringUsabilityCheck: 0,
  requests: [{ path: '/api/auth/logout', status: 204 }],
  everyTabOnLoginPage: true,
  tabsOnLoginPage: 5,
  tabs: Array.from({ length: 5 }, (_, i) => ({ onLoginPage: true, sameDocument: true, tab: `t${i + 1}` })),
  ingress: { unavailable: null, rejectedBy: { limit_req: 0, limit_conn: 0, unattributed: 0 } },
  ...over,
})

test('a session-route 429 fails the attempt whatever the overlap says', () => {
  assert.equal(
    signOutAttemptOutcome(goodAttempt({ count429: 1, ingress: { rejectedBy: { limit_req: 1, limit_conn: 0, unattributed: 0 } }, signOutOverlap: { verdict: 'overlap' } })),
    'behaviour-failed',
  )
})

test('a tab left signed in, or on the login page in another document, fails the attempt', () => {
  assert.equal(signOutAttemptOutcome(goodAttempt({ everyTabOnLoginPage: false, tabsOnLoginPage: 4, signOutOverlap: { verdict: 'overlap' } })), 'behaviour-failed')
  const reloaded = goodAttempt().tabs.map((t, i) => (i === 0 ? { ...t, sameDocument: false } : t))
  assert.equal(signOutAttemptOutcome(goodAttempt({ tabs: reloaded, signOutOverlap: { verdict: 'overlap' } })), 'behaviour-failed')
  assert.equal(signOutAttemptOutcome(goodAttempt({ tabs: goodAttempt().tabs.slice(1), signOutOverlap: { verdict: 'overlap' } })), 'behaviour-failed')
})

test('a logout answered with an error fails the attempt', () => {
  assert.equal(signOutAttemptOutcome(goodAttempt({ requests: [{ path: '/api/auth/logout', status: 500 }] })), 'behaviour-failed')
  assert.equal(signOutAttemptOutcome(goodAttempt({ requests: [] })), 'behaviour-failed')
})

test('all gates good: the attempt is the overlap, or setup-missed when there was none', () => {
  assert.equal(signOutAttemptOutcome(goodAttempt({ signOutOverlap: { verdict: 'overlap' } })), 'overlap')
  assert.equal(signOutAttemptOutcome(goodAttempt({ signOutOverlap: { verdict: 'no-overlap' } })), 'setup-missed')
  assert.equal(signOutAttemptOutcome(goodAttempt({ signOutOverlap: { verdict: 'no-logout' } })), 'setup-missed')
})

test('without an ingress log the attempt is setup-missed only when the behaviour passed', () => {
  assert.equal(signOutAttemptOutcome(goodAttempt({ ingress: { unavailable: 'no ingress log' }, signOutOverlap: { verdict: 'no-logout' } })), 'setup-missed')
  assert.equal(signOutAttemptOutcome(goodAttempt({ ingress: { unavailable: 'no ingress log' }, requests: [{ path: '/api/auth/logout', status: 500 }] })), 'behaviour-failed')
})

test('a business 429 does not fail the attempt', () => {
  const attempt = goodAttempt({
    signOutOverlap: { verdict: 'overlap' },
    ingress: { unavailable: null, rejectedBy: { limit_req: 0, limit_conn: 0, unattributed: 0 }, business429: 12 },
  })
  assert.equal(signOutAttemptOutcome(attempt), 'overlap')
})

// --- the records the workload really writes ---------------------------------------
//
// The three sign-out attempts at five tabs of the recorded run on 198943047,
// exactly as W1 wrote them. The classifier read a field these records do not
// have, so every one of them came out `setup-missed`, the second included.

const recordedAttempts = JSON.parse(readFileSync(new URL('./fixtures/w1-signout-attempts-198943047.json', import.meta.url), 'utf8')).attempts

test('the recorded attempt that overlapped a delayed request is classified overlap', () => {
  const second = recordedAttempts.find((a) => a.attempt === 2)
  assert.equal(second.signOutOverlap.verdict, 'overlap') // what the workload wrote
  assert.equal(second.outcome, 'setup-missed') // what the classifier said then
  assert.equal(signOutAttemptOutcome(second), 'overlap')
})

test('the recorded attempts that overlapped nothing are setup-missed', () => {
  for (const attempt of recordedAttempts.filter((a) => a.signOutOverlap.verdict === 'no-overlap')) {
    assert.equal(signOutAttemptOutcome(attempt), 'setup-missed', `attempt ${attempt.attempt}`)
  }
})

test('a top-level `overlap` field, which the workload never writes, is not read', () => {
  const second = recordedAttempts.find((a) => a.attempt === 2)
  const { signOutOverlap: _dropped, ...without } = second
  assert.equal(signOutAttemptOutcome({ ...without, overlap: 'overlap' }), 'setup-missed')
})

// --- which zone a refused request belongs to ---------------------------------------

test('a refused request is given the zone its route is limited by', () => {
  assert.equal(limiterZoneOf('POST', '/api/auth/login'), 'login_limit')
  // #1360: the hint has an exact-match location on api_limit. The match is
  // exact, so a trailing slash is still the credential block's.
  assert.equal(limiterZoneOf('GET', '/api/auth/show-default-credentials'), 'api_limit')
  assert.equal(limiterZoneOf('GET', '/api/auth/show-default-credentials?x=1'), 'api_limit')
  assert.equal(limiterZoneOf('GET', '/api/auth/show-default-credentials/'), 'login_limit')
  assert.equal(limiterZoneOf('PATCH', '/api/auth/change-password'), 'login_limit')
  assert.equal(limiterZoneOf('POST', '/api/auth/refresh'), 'session_limit')
  assert.equal(limiterZoneOf('POST', '/api/auth/logout/'), 'session_limit')
  assert.equal(limiterZoneOf('GET', '/api/auth/me?x=1'), 'session_limit')
  assert.equal(limiterZoneOf('GET', '/api/settings/regional'), 'api_limit')
  assert.equal(limiterZoneOf('GET', '/api/users'), 'api_limit')
})

test('creating a user is on two zones, and the log cannot say which refused it', () => {
  assert.equal(limiterZoneOf('POST', '/api/users'), 'api_limit or user_create_limit')
})

test('a route no limit_req zone covers has no zone', () => {
  assert.equal(limiterZoneOf('GET', '/manifest.json'), null)
})

test('the route patterns are the ones nginx.conf uses', () => {
  const conf = readFileSync(new URL('../../../nginx/nginx.conf', import.meta.url), 'utf8')
  assert.ok(conf.includes('location ~ ^/api/auth/(refresh|logout|me)/?$ {'), 'the session-upkeep location')
  assert.ok(conf.includes('location ~ ^/api/(auth|login|register) {'), 'the credential location')
  assert.ok(conf.includes('"~^POST:/api/users/?$"'), 'the user-creation key')
})

test('diagnostics counts limit_req rejections per zone, from real lines of the recorded run', () => {
  // POST /api/auth/login answered 429 by login_limit, as the run's ingress log has it.
  const login = line({ method: 'POST', uri: '/api/auth/login', status: 429, limitReq: 'REJECTED', limitConn: null, upstream: { kind: 'none', ms: null }, nonUpstreamMs: null })
  const business = line({ uri: '/api/settings/regional', status: 429, limitReq: 'REJECTED', limitConn: null, upstream: { kind: 'none', ms: null }, nonUpstreamMs: null })
  const d = diagnostics([login, login, business, line()])
  assert.equal(d.rejectedBy.limit_req, 3)
  assert.deepEqual(d.rejectedByZone, { api_limit: 1, session_limit: 0, login_limit: 2, 'api_limit or user_create_limit': 0, unknown: 0 })
})
