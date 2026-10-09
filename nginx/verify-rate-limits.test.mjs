import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseApiLimit,
  planPhases,
  judgeImmediate,
  judgeDelayCurve,
  judgeRejection,
  exitCodeFor,
  parseZones,
  intervalSeconds,
  maxJudgedSeconds,
  drainWaitSeconds,
  requestsToExhaust,
  admittedBounds,
  peakDemand,
  candidateBurst,
  judgeBurst,
} from './verify-rate-limits.mjs'

const conf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'nginx.conf'), 'utf8')

test('parsing the real nginx.conf yields the two zones', () => {
  const zones = parseZones(conf)
  assert.deepEqual(zones.login_limit, { ratePerSecond: 5 / 60, rateText: '5r/m', burst: 3 })
  assert.deepEqual(zones.session_limit, { ratePerSecond: 1, rateText: '1r/s', burst: 20 })
})

test('the table for 5r/m burst 3', () => {
  const r = 5 / 60
  assert.equal(intervalSeconds(r), 12)
  assert.equal(maxJudgedSeconds(r), 10)
  assert.equal(drainWaitSeconds(r, 3), 53)
  assert.equal(requestsToExhaust(r, 3), 10)
  assert.deepEqual(admittedBounds(r, 3, 10), { lower: 4, upper: 5 })
})

test('the table for 1r/s burst 20', () => {
  const r = 1
  assert.equal(intervalSeconds(r), 1)
  assert.equal(maxJudgedSeconds(r), 5)
  assert.equal(drainWaitSeconds(r, 20), 26)
  assert.equal(requestsToExhaust(r, 20), 32)
  assert.deepEqual(admittedBounds(r, 20, 5), { lower: 21, upper: 26 })
})

test('the table for 1r/s burst 60', () => {
  const r = 1
  assert.equal(drainWaitSeconds(r, 60), 66)
  assert.equal(requestsToExhaust(r, 60), 82)
  assert.deepEqual(admittedBounds(r, 60, 5), { lower: 61, upper: 66 })
})

test('the Tmax predicate at its boundary', () => {
  assert.equal(maxJudgedSeconds(5 / 60), 10) // interval 12 s
  assert.equal(maxJudgedSeconds(6 / 60), 5) // interval exactly 10 s, strict >
  assert.equal(maxJudgedSeconds(1 / 10.9), 10) // interval 10.9 s
})

test('peak demand: a spread-out burst has a low E, a dense one a high E', () => {
  const sparse = []
  for (let i = 0; i < 30; i += 1) sparse.push(i * 4)
  assert.equal(peakDemand(sparse, 1), 1)

  const dense = []
  for (let i = 0; i < 30; i += 1) dense.push(i * 0.001)
  assert.ok(peakDemand(dense, 1) > 29 && peakDemand(dense, 1) <= 30)

  const instant = new Array(30).fill(0)
  assert.equal(peakDemand(instant, 1), 30)
})

test('candidate burst is 1.25x(E-1) rounded up', () => {
  assert.equal(candidateBurst(30), 37)
  assert.equal(candidateBurst(21), 25)
})

test('judgeBurst: a slow zone must admit exactly burst + 1', () => {
  const login = { ratePerSecond: 5 / 60, burst: 3 }
  assert.equal(judgeBurst(login, { seconds: 1, admitted: 4, rejected: 6, other: 0 }).verdict, 'pass')
  assert.equal(judgeBurst(login, { seconds: 1, admitted: 5, rejected: 5, other: 0 }).verdict, 'fail')
  assert.equal(judgeBurst(login, { seconds: 1, admitted: 3, rejected: 7, other: 0 }).verdict, 'fail')
})

test('judgeBurst: a fast zone is bounded by the measured duration', () => {
  const session = { ratePerSecond: 1, burst: 20 }
  assert.equal(judgeBurst(session, { seconds: 0.4, admitted: 21, rejected: 11, other: 0 }).verdict, 'pass')
  assert.equal(judgeBurst(session, { seconds: 1.5, admitted: 23, rejected: 9, other: 0 }).verdict, 'pass')
  assert.equal(judgeBurst(session, { seconds: 0.4, admitted: 23, rejected: 9, other: 0 }).verdict, 'fail')
  assert.equal(judgeBurst(session, { seconds: 0.4, admitted: 20, rejected: 12, other: 0 }).verdict, 'fail')
})

test('judgeBurst: exhaustion must be observed', () => {
  const session = { ratePerSecond: 1, burst: 20 }
  assert.equal(judgeBurst(session, { seconds: 0.4, admitted: 21, rejected: 0, other: 0 }).verdict, 'fail')
})

test('judgeBurst: any status that is neither the admitted one nor 429 fails', () => {
  const session = { ratePerSecond: 1, burst: 20 }
  assert.equal(judgeBurst(session, { seconds: 0.4, admitted: 21, rejected: 10, other: 1 }).verdict, 'fail')
})

test('judgeBurst: a burst too slow to judge is inconclusive, not a pass or a fail', () => {
  const session = { ratePerSecond: 1, burst: 20 }
  assert.equal(judgeBurst(session, { seconds: 5.1, admitted: 26, rejected: 6, other: 0 }).verdict, 'inconclusive')
  const login = { ratePerSecond: 5 / 60, burst: 3 }
  assert.equal(judgeBurst(login, { seconds: 10, admitted: 4, rejected: 6, other: 0 }).verdict, 'inconclusive')
  assert.equal(judgeBurst(login, { seconds: 9.9, admitted: 4, rejected: 6, other: 0 }).verdict, 'pass')
})

// --- api_limit: every assertion written against the probe result -------------
// (Task 1, #1353.) Nothing below asserts anything about the limiter that the
// probe has not established, and a state the probe could not establish blocks
// verification instead of passing it.

const ESTABLISHED = (detail) => ({ status: 'established', finding: 'established for the fixture', evidence: ['fixture'], detail })

function probeWith(states, answers = {}) {
  return {
    nginxVersion: 'nginx/1.30.0',
    confSha256: 'abc123',
    answers: {
      handlerOrder: ESTABLISHED({ limitReqFirst: true }),
      delayedCountedByLimitConn: ESTABLISHED({ delayedCountedByLimitConn: false }),
      handlerRunsAfterOther: ESTABLISHED({
        limitConnRunsOnMeteredRequests: true,
        limitConnRunsWhenLimitReqRefused: false,
        limitReqRunsWhenLimitConnRefused: true,
      }),
      ...answers,
    },
    states: {
      immediate: { status: 'reachable', evidence: ['e'], explanation: null, maxSimultaneousImmediate: 10 },
      delayed: { status: 'reachable', evidence: ['e'], explanation: null },
      rejectedByLimitReq: { status: 'reachable', evidence: ['e'], explanation: null },
      rejectedByLimitConn: { status: 'reachable', evidence: ['e'], explanation: null },
      ...states,
    },
  }
}

const REACHABLE = (extra = {}) => ({ status: 'reachable', evidence: ['e'], explanation: null, ...extra })
const UNREACHABLE = (explanation) => ({ status: 'unreachable', evidence: ['e'], explanation })
const UNRESOLVED = () => ({ status: 'unresolved', evidence: ['could not provoke it'], explanation: null })

test('planPhases: four reachable states are four phases and verification is complete', () => {
  const { phases, documented, blocked, complete } = planPhases(probeWith({}), 'abc123')
  assert.deepEqual(phases.map((p) => p.id), ['G', 'H', 'I', 'J'])
  assert.deepEqual(documented, [])
  assert.deepEqual(blocked, [])
  assert.equal(complete, true)
})

test('planPhases: an unreachable state is documented, not asserted, and does not block', () => {
  const { phases, documented, blocked, complete } = planPhases(
    probeWith({ rejectedByLimitReq: UNREACHABLE('limit_conn refuses what limit_req would have refused') }),
    'abc123',
  )
  assert.deepEqual(phases.map((p) => p.id), ['G', 'H', 'J'])
  assert.equal(documented.length, 1)
  assert.match(documented[0], /limit_conn refuses what limit_req would have refused/)
  assert.deepEqual(blocked, [])
  assert.equal(complete, true)
})

test('planPhases: an unresolved state blocks verification and gets no phase', () => {
  const { phases, blocked, complete } = planPhases(probeWith({ rejectedByLimitReq: UNRESOLVED() }), 'abc123')
  assert.deepEqual(phases.map((p) => p.id), ['G', 'H', 'J'])
  assert.deepEqual(blocked, ['rejectedByLimitReq'])
  assert.equal(complete, false)
})

test('planPhases: an unresolved delayedCountedByLimitConn blocks every phase that depends on it', () => {
  const { phases, blocked, complete } = planPhases(
    probeWith({}, { delayedCountedByLimitConn: { status: 'unresolved', finding: '', evidence: ['e'], detail: null } }),
    'abc123',
  )
  // The phases H and I cannot be judged, so the states they would judge are
  // what the CLI names as blocked.
  assert.deepEqual(phases.map((p) => p.id), ['G', 'J'])
  assert.deepEqual(blocked, ['delayed', 'rejectedByLimitReq'])
  assert.equal(complete, false)
})

test('planPhases: no probe result at all blocks every state', () => {
  const { phases, blocked, complete } = planPhases(null, 'abc123')
  assert.deepEqual(phases, [])
  assert.equal(blocked.length, 4)
  assert.equal(complete, false)
})

test('planPhases: a probe result for another configuration is stale and blocks every state', () => {
  const { phases, blocked, complete } = planPhases(probeWith({}), 'a-different-hash')
  assert.deepEqual(phases, [])
  assert.equal(blocked.length, 4)
  assert.equal(complete, false)
})

test('planPhases: G asserts the count the probe measured, not delay + 1', () => {
  const probe = probeWith({ immediate: REACHABLE({ maxSimultaneousImmediate: 7 }) })
  const { phases } = planPhases(probe, 'abc123')
  const g = phases.find((p) => p.id === 'G')
  assert.equal(g.requests, 7)
  assert.notEqual(g.requests, probe.api?.delay + 1)
})

test('planPhases: the other limiter\'s field is asserted only where the probe saw its handler run', () => {
  const { phases } = planPhases(probeWith({}), 'abc123')
  const byId = Object.fromEntries(phases.map((p) => [p.id, p]))
  // limit_req refused: limit_conn never runs, so its field is null and must not
  // be asserted to read PASSED.
  assert.equal(byId.I.assertOtherField, false)
  // limit_conn refused: limit_req had already run and passed.
  assert.equal(byId.J.assertOtherField, true)
})

test('planPhases: an unresolved handlerRunsAfterOther blocks the phases that assert the other field', () => {
  const { blocked, complete } = planPhases(
    probeWith({}, { handlerRunsAfterOther: { status: 'unresolved', finding: '', evidence: ['e'], detail: null } }),
    'abc123',
  )
  assert.deepEqual(blocked, ['delayed', 'rejectedByLimitReq', 'rejectedByLimitConn'])
  assert.equal(complete, false)
})

// judgeImmediate, judgeDelayCurve, judgeRejection

const entry = (over = {}) => ({
  remoteAddr: '10.0.0.7',
  method: 'GET',
  uri: '/api/x',
  status: 200,
  endMs: 1000,
  requestMs: 5,
  startMs: 995,
  upstream: { kind: 'single', ms: 3 },
  nonUpstreamMs: 2,
  limitReq: 'PASSED',
  limitConn: 'PASSED',
  qaId: 'g-1',
  ...over,
})

// `expected` is what the phase sent: one { qaId, entry } per request, `entry`
// being its ingress log line or null when none arrived.
const expected = (...over) =>
  [0, 1].map((i) => ({ qaId: `g-${i + 1}`, entry: entry({ qaId: `g-${i + 1}`, ...(over[i] ?? {}) }) }))

test('judgeImmediate: all PASSED inside the tolerance passes', () => {
  const j = judgeImmediate(expected(), [1000, 1010], 2, 50)
  assert.equal(j.verdict, 'pass')
})

test('judgeImmediate: one DELAYED among them fails', () => {
  const sent = expected()
  sent[1].entry = entry({ qaId: 'g-2', limitReq: 'DELAYED' })
  assert.equal(judgeImmediate(sent, [1000, 1010], 2, 50).verdict, 'fail')
})

test('judgeImmediate: a request whose log line is missing is inconclusive, not a pass', () => {
  const sent = expected()
  sent[1].entry = null
  const j = judgeImmediate(sent, [1000, 1010], 2, 50)
  assert.equal(j.verdict, 'inconclusive')
  assert.match(j.detail, /g-2/)
})

test('judgeImmediate: an arrival later than the tolerance fails', () => {
  assert.equal(judgeImmediate(expected(), [1000, 1200], 2, 50).verdict, 'fail')
})

test('judgeDelayCurve: arrivals at exactly k / rate pass', () => {
  const arrivals = [0, 50, 100, 150, 200, 250]
  assert.equal(judgeDelayCurve(arrivals, 20, 50).verdict, 'pass')
})

test('judgeDelayCurve: arrivals all at once fail', () => {
  assert.equal(judgeDelayCurve([0, 0, 0, 0, 0, 0], 20, 50).verdict, 'fail')
})

test('judgeDelayCurve: fewer than five delayed arrivals are inconclusive', () => {
  const j = judgeDelayCurve([0, 50, 100, 200], 20, 50)
  assert.equal(j.verdict, 'inconclusive')
  assert.match(j.detail, /4/)
})

test('judgeRejection: with assertOtherField false a null other field passes', () => {
  const entries = [entry({ status: 429, limitReq: 'REJECTED', limitConn: null })]
  assert.equal(judgeRejection(entries, 'limit_req', false).verdict, 'pass')
})

test('judgeRejection: with assertOtherField true the other handler must have run', () => {
  // null means its handler did not run, which the probe did not show here.
  const notRun = [entry({ status: 429, limitReq: 'REJECTED', limitConn: null })]
  assert.equal(judgeRejection(notRun, 'limit_req', true).verdict, 'fail')
  const passed = [entry({ status: 429, limitReq: 'REJECTED', limitConn: 'PASSED' })]
  assert.equal(judgeRejection(passed, 'limit_req', true).verdict, 'pass')
  // DELAYED is not a refusal either: the request was metered and is on its way.
  const delayed = [entry({ status: 429, limitReq: 'REJECTED', limitConn: 'DELAYED' })]
  assert.equal(judgeRejection(delayed, 'limit_req', true).verdict, 'pass')
})

test('judgeRejection: both limiters refusing is not this phase\'s claim', () => {
  const both = [entry({ status: 429, limitReq: 'REJECTED', limitConn: 'REJECTED' })]
  assert.equal(judgeRejection(both, 'limit_req', false).verdict, 'fail')
})

test('judgeRejection: a 429 attribute calls unattributed is inconclusive', () => {
  const entries = [entry({ status: 429, limitReq: 'PASSED', limitConn: 'PASSED' })]
  const j = judgeRejection(entries, 'limit_req', false)
  assert.equal(j.verdict, 'inconclusive')
  assert.match(j.detail, /unattributed/)
})

test('judgeRejection: no rejected line at all fails', () => {
  const entries = [entry({ status: 200 })]
  assert.equal(judgeRejection(entries, 'limit_req', false).verdict, 'fail')
})

test('judgeRejection: a rejection by the other limiter is not this phase\'s rejection', () => {
  const entries = [entry({ status: 429, limitReq: 'PASSED', limitConn: 'REJECTED' })]
  const j = judgeRejection(entries, 'limit_req', false)
  assert.equal(j.verdict, 'fail')
  assert.match(j.detail, /limit_conn/)
})

test('parseApiLimit reads the real nginx.conf, and its burst is above its delay', () => {
  const api = parseApiLimit(conf)
  assert.ok(api.ratePerSecond > 0)
  assert.equal(api.rateText, '20r/s')
  assert.ok(api.burst > api.delay, `burst ${api.burst} must be above delay ${api.delay}`)
  assert.ok(api.delay > 0)
})

test('exit codes: 1 outranks 3 outranks 2', () => {
  assert.deepEqual(exitCodeFor({ mismatches: 1, incomplete: true, inconclusive: true }), 1)
  assert.deepEqual(exitCodeFor({ mismatches: 0, incomplete: true, inconclusive: true }), 3)
  assert.deepEqual(exitCodeFor({ mismatches: 0, incomplete: false, inconclusive: true }), 2)
  assert.deepEqual(exitCodeFor({ mismatches: 0, incomplete: false, inconclusive: false }), 0)
})
