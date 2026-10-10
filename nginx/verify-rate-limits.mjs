#!/usr/bin/env node
// On-demand check of the auth rate limits and CORS through the running
// ingress, from a container with its own address. Exits non-zero on any
// mismatch or inconclusive burst.
//
// Admitted statuses (pin each by sending one before Step 1):
//   POST /api/auth/login          401 (unknown user)
//   POST /api/auth/refresh        401 (invalid token)
//   POST /api/auth/logout         204
//   GET  /api/auth/me             401 (no token)
//   PATCH /api/auth/change-password 401 (no token)

import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseLine, attribute } from './access-log.mjs'
// parseApiLimit lives with the probe that first read it and is re-exported here
// so one file still holds everything a caller of the verification needs.
import { parseApiLimit as readApiLimit } from './limiter-probe.mjs'
export { readApiLimit as parseApiLimit }

const CONCURRENCY = 6

// --- pure arithmetic -------------------------------------------------------

export function parseZones(confText) {
  const zones = {}
  const re = /limit_req_zone\s+\S+\s+zone=([a-z_]+):\d+m\s+rate=(\d+)(r\/s|r\/m);/g
  let m
  while ((m = re.exec(confText)) !== null) {
    const perSecond = m[3] === 'r/s' ? Number(m[2]) : Number(m[2]) / 60
    zones[m[1]] = { ratePerSecond: perSecond, rateText: `${m[2]}${m[3]}` }
  }
  const b = {}
  const bre = /limit_req\s+zone=(session_limit|login_limit)\s+burst=(\d+)/g
  while ((m = bre.exec(confText)) !== null) {
    b[m[1]] = Number(m[2])
  }
  for (const k of Object.keys(b)) {
    if (zones[k]) zones[k].burst = b[k]
  }
  return zones
}

export function intervalSeconds(ratePerSecond) {
  return 1 / ratePerSecond
}

// The longest burst that can still be judged exactly: 10 s when the refill
// interval exceeds 10 s, otherwise 5 s.
export function maxJudgedSeconds(ratePerSecond) {
  return intervalSeconds(ratePerSecond) > 10 ? 10 : 5
}

export function drainWaitSeconds(ratePerSecond, burst) {
  return Math.ceil((burst + 1) / ratePerSecond) + 5
}

export function requestsToExhaust(ratePerSecond, burst) {
  const tmax = maxJudgedSeconds(ratePerSecond)
  return burst + 1 + Math.ceil(ratePerSecond * tmax) + Math.max(5, Math.ceil((burst + 1) / 4))
}

export function admittedBounds(ratePerSecond, burst, measuredT) {
  const lower = burst + 1
  const upper = burst + 1 + Math.ceil(ratePerSecond * measuredT)
  return { lower, upper }
}

// Judge one exhaustion burst. `seconds` is the measured wall time of the
// burst. A zone whose refill interval is longer than the judged window must
// admit exactly burst + 1 (no request can be re-admitted inside the window);
// a faster zone is bounded by what could have drained during the burst.
// Exhaustion must be observed: a burst with no 429 fails, whatever the count.
export function judgeBurst(zone, { seconds, admitted, rejected, other }) {
  const tmax = maxJudgedSeconds(zone.ratePerSecond)
  const exact = intervalSeconds(zone.ratePerSecond) > tmax
  const lower = zone.burst + 1
  const upper = exact ? lower : lower + Math.ceil(zone.ratePerSecond * seconds)
  const bounds = { lower, upper, tmax }
  if (exact ? seconds >= tmax : seconds > tmax) return { verdict: 'inconclusive', ...bounds }
  if (other > 0 || rejected < 1) return { verdict: 'fail', ...bounds }
  if (admitted < lower || admitted > upper) return { verdict: 'fail', ...bounds }
  return { verdict: 'pass', ...bounds }
}

// Peak accumulated demand E from a list of send times, replaying the bucket.
export function peakDemand(times, ratePerSecond) {
  let e = 0
  let prev = null
  let peak = 0
  for (const t of times) {
    if (prev === null) e = Math.max(0, e - 0) + 1
    else e = Math.max(0, e - ratePerSecond * (t - prev)) + 1
    prev = t
    peak = Math.max(peak, e)
  }
  return peak
}

export function candidateBurst(peakE) {
  return Math.ceil(1.25 * (peakE - 1))
}

// --- api_limit: phases written against the probe result ---------------------
//
// Every assertion below is derived from nginx/limiter-probe-result.json, which
// is what the probe established about this build with this configuration. A
// state the probe could not establish gets no phase and blocks verification; a
// state it showed cannot be reached is documented and nothing is asserted about
// it. Nothing here assumes a limiter's behaviour.

const PHASE_OF_STATE = {
  immediate: 'G',
  delayed: 'H',
  rejectedByLimitReq: 'I',
  rejectedByLimitConn: 'J',
}

const LABEL_OF_PHASE = {
  G: 'G immediate',
  H: 'H delayed',
  I: 'I rejected by limit_req',
  J: 'J rejected by limit_conn',
}

const STATE_OF_PHASE = { G: 'immediate', H: 'delayed', I: 'rejectedByLimitReq', J: 'rejectedByLimitConn' }

// Which answer has to have been established for a phase to be judged at all.
// A phase that judges arrivals needs to know whether a delayed request holds a
// connection, or some of the requests it waits for may have been refused
// instead of forwarded.
const NEEDS = {
  immediate: [],
  delayed: ['delayedCountedByLimitConn', 'handlerRunsAfterOther'],
  rejectedByLimitReq: ['delayedCountedByLimitConn', 'handlerRunsAfterOther'],
  rejectedByLimitConn: ['handlerRunsAfterOther'],
}

// Which answer decides whether the other limiter's field may be asserted on a
// phase's lines, and what that answer has to say for it to be true. Absent the
// answer, the field is only required not to contradict: `judgeRejection` then
// accepts a null, which is what an unevaluated handler's field reads.
const OTHER_FIELD = {
  immediate: null,
  delayed: 'limitConnRunsOnMeteredRequests',
  rejectedByLimitReq: 'limitConnRunsWhenLimitReqRefused',
  rejectedByLimitConn: 'limitReqRunsWhenLimitConnRefused',
}

/**
 * Which phases can be judged from this probe result, and what blocks the rest.
 *
 * `probe` is null when the result file is missing, and is stale when its
 * confSha256 is not this configuration's: a result recorded against other
 * numbers says nothing about these, so nothing is judged and everything is
 * blocked. Leaving an assertion out never turns a block into a pass.
 */
export function planPhases(probe, confSha256) {
  const phases = []
  const documented = []
  const blocked = []
  const stale = !probe || probe.confSha256 !== confSha256
  const answer = (name) => (stale ? null : probe.answers?.[name])

  for (const [state, id] of Object.entries(PHASE_OF_STATE)) {
    const recorded = stale ? null : probe.states?.[state]
    if (!recorded) {
      blocked.push(state)
      continue
    }
    if (recorded.status === 'unresolved') {
      blocked.push(state)
      continue
    }
    if (recorded.status === 'unreachable') {
      documented.push(`${id} ${state}: ${recorded.explanation}`)
      continue
    }
    const missing = NEEDS[state].filter((name) => answer(name)?.status !== 'established')
    if (missing.length > 0) {
      blocked.push(state)
      continue
    }
    const detail = OTHER_FIELD[state]
    phases.push({
      id,
      label: LABEL_OF_PHASE[id],
      state,
      // How many requests to release at one instant, as the probe measured it:
      // not delay + 1, which the connection cap can make unreachable.
      requests: state === 'immediate' ? recorded.maxSimultaneousImmediate : null,
      assertOtherField: detail === null ? false : answer('handlerRunsAfterOther')?.detail?.[detail] === true,
    })
  }
  return { phases, documented, blocked, complete: blocked.length === 0 }
}

// 0 all passed and complete, 1 a mismatch, 2 something too slow to judge,
// 3 verification incomplete. 1 outranks 3 outranks 2.
export function exitCodeFor({ mismatches = 0, incomplete = false, inconclusive = false } = {}) {
  if (mismatches > 0) return 1
  if (incomplete) return 3
  if (inconclusive) return 2
  return 0
}

/**
 * Phase G: the combined limits admitted this many requests at one instant.
 *
 * `expected` is one { qaId, entry } per request sent, in the order they were
 * sent, with `entry` the ingress log line for it or null when no line arrived.
 * Every one must be PASSED by limit_req and must have reached the upstream
 * inside the tolerance the unthrottled baseline gives. A request whose log line
 * never arrived is not a pass and not a failure: the phase cannot say.
 */
export function judgeImmediate(expected, arrivals, n, toleranceMs) {
  const wanted = expected.slice(0, n)
  const missing = wanted.filter((e) => !e.entry).map((e) => e.qaId)
  if (missing.length > 0) {
    return { verdict: 'inconclusive', detail: `${missing.length} of ${n} admitted requests have no log line (${missing.slice(0, 3).join(', ')})` }
  }
  const lines = wanted.map((e) => e.entry)
  const delayed = lines.filter((e) => e.limitReq === 'DELAYED' || e.limitReq === 'REJECTED')
  if (delayed.length > 0) {
    return { verdict: 'fail', detail: `${delayed.length} of ${n} were not immediate (${[...new Set(delayed.map((e) => e.limitReq))].join(', ')})` }
  }
  const connRefused = lines.filter((e) => e.limitConn === 'REJECTED')
  if (connRefused.length > 0) {
    return { verdict: 'fail', detail: `${connRefused.length} of ${n} were refused by limit_conn` }
  }
  const times = arrivals.slice(0, n).slice().sort((a, b) => a - b)
  if (times.length < n) {
    return { verdict: 'inconclusive', detail: `the upstream recorded ${times.length} arrivals for ${n} requests` }
  }
  const spread = times[times.length - 1] - times[0]
  if (spread > toleranceMs) {
    return { verdict: 'fail', detail: `the releases were ${Math.round(spread)} ms apart, beyond the ${Math.round(toleranceMs)} ms tolerance` }
  }
  return { verdict: 'pass', detail: `${n} admitted at one instant, all PASSED, arriving within ${Math.round(spread)} ms` }
}

/**
 * Phase H: delayed forwarding conforms to the configured rate.
 *
 * The k-th delayed arrival after the first is expected k / rate seconds later.
 * Fewer than five delayed arrivals cannot show a curve, so the phase says it
 * cannot tell rather than passing on four points.
 */
export function judgeDelayCurve(arrivals, ratePerSecond, toleranceMs) {
  const sorted = arrivals.slice().sort((a, b) => a - b)
  if (sorted.length < 5) {
    return { verdict: 'inconclusive', detail: `${sorted.length} delayed arrivals, fewer than the 5 a curve needs` }
  }
  const interval = 1000 / ratePerSecond
  // The rate the arrivals actually show. Requests released together were not
  // delayed at all, so a span of zero fails here rather than passing as a fast
  // curve.
  const span = sorted[sorted.length - 1] - sorted[0]
  const observed = span > 0 ? ((sorted.length - 1) * 1000) / span : Infinity
  const allowedRate = ratePerSecond * (1 + toleranceMs / interval)
  if (observed > allowedRate) {
    return {
      verdict: 'fail',
      detail:
        span > 0
          ? `${sorted.length} delayed arrivals were released at ${observed.toFixed(1)} r/s, above the ${allowedRate.toFixed(1)} r/s the configuration allows`
          : `all ${sorted.length} delayed arrivals landed at the same instant: the limiter delayed none of them apart`,
    }
  }
  let worst = { index: 0, error: 0 }
  for (let k = 1; k < sorted.length; k += 1) {
    const error = Math.abs(sorted[k] - sorted[0] - k * interval)
    if (error > worst.error) worst = { index: k, error }
  }
  const allowed = interval + toleranceMs
  if (worst.error > allowed) {
    return {
      verdict: 'fail',
      detail: `the ${worst.index}th delayed arrival was ${Math.round(worst.error)} ms from k / rate, beyond ${Math.round(allowed)} ms`,
    }
  }
  return {
    verdict: 'pass',
    detail: `${sorted.length} delayed arrivals at ${observed.toFixed(1)} r/s, worst point ${Math.round(worst.error)} ms from k / rate`,
  }
}

/**
 * A rejection phase: this limiter's own field, on this limiter's own lines.
 *
 * `assertOtherField` is true only where the probe established that the other
 * limiter's handler runs in this state. Then its field must say the handler ran
 * and did not refuse: PASSED or DELAYED, both of which mean it acted. False
 * where the probe established the handler does not run at all, so a null field
 * is what such a line must read.
 *
 * A 429 that names neither limiter is inconclusive, not a failure of either:
 * something else refused it and this evidence cannot say which. No rejected
 * line at all is a failure, whatever the statuses were.
 */
export function judgeRejection(entries, limiter, assertOtherField) {
  const own = limiter === 'limit_req' ? 'limitReq' : 'limitConn'
  const other = limiter === 'limit_req' ? 'limitConn' : 'limitReq'
  // A 429 that names neither limiter comes first: while such a line is in the
  // window there is no telling whether this limiter refused one of them, so the
  // phase cannot say it did not.
  const unattributed = entries.filter((e) => e.status === 429 && attribute(e) === 'unattributed')
  if (unattributed.length > 0) {
    return { verdict: 'inconclusive', detail: `${unattributed.length} 429 line(s) attribute as unattributed` }
  }
  const rejected = entries.filter((e) => e.status === 429 && e[own] === 'REJECTED')
  if (rejected.length === 0) {
    const byOther = entries.filter((e) => e.status === 429 && e[other] === 'REJECTED')
    return {
      verdict: 'fail',
      detail: byOther.length > 0
        ? `no line was refused by ${limiter}; ${byOther.length} were refused by ${limiter === 'limit_req' ? 'limit_conn' : 'limit_req'}`
        : 'no line was refused by this limiter',
    }
  }
  // The other handler running and not refusing reads PASSED or DELAYED: a
  // delayed request has been metered and is on its way, which is not a refusal.
  const RAN = ['PASSED', 'DELAYED']
  const badOther = assertOtherField
    ? rejected.filter((e) => !RAN.includes(e[other]))
    : rejected.filter((e) => e[other] === 'REJECTED')
  if (badOther.length > 0) {
    const seen = [...new Set(badOther.map((e) => String(e[other])))]
    return {
      verdict: 'fail',
      detail: assertOtherField
        ? `${badOther.length} line(s) read ${other} ${JSON.stringify(seen)} where the probe showed that handler runs and does not refuse`
        : `${badOther.length} line(s) read ${other}=REJECTED as well`,
    }
  }
  return {
    verdict: 'pass',
    detail: `${rejected.length} line(s) refused by ${limiter}${assertOtherField ? `, ${other} ran on each` : ''}`,
  }
}

// --- #1360: the default-credentials hint and the credential budget -----------
//
// Every login page asks GET /api/auth/show-default-credentials on mount, so a
// sign-out with several tabs open sends one per tab at the same instant. While
// that route was metered by login_limit those requests spent the budget a
// POST /api/auth/login needs. It has an exact-match location on api_limit now;
// what follows checks the configuration says so and that the limiter agrees.

export const HINT_PATH = '/api/auth/show-default-credentials'

/**
 * The limit_req directives of the hint's exact-match location, or null when
 * the configuration has no such location. Braces are counted, because the
 * block holds a nested `if { }`.
 */
export function parseHintLocation(confText) {
  const open = /location\s*=\s*\/api\/auth\/show-default-credentials\s*\{/.exec(confText)
  if (!open) return null
  let depth = 1
  let i = open.index + open[0].length
  const start = i
  while (i < confText.length && depth > 0) {
    if (confText[i] === '{') depth += 1
    else if (confText[i] === '}') depth -= 1
    i += 1
  }
  const body = confText.slice(start, i - 1)
  const limits = []
  const re = /limit_req\s+zone=([a-z_]+)\s+burst=(\d+)(?:\s+(nodelay)|\s+delay=(\d+))?;/g
  let m
  while ((m = re.exec(body)) !== null) {
    limits.push({ zone: m[1], burst: Number(m[2]), delay: m[3] ? 0 : m[4] === undefined ? null : Number(m[4]) })
  }
  return limits
}

/**
 * The configuration's half of the check: the hint has its own location, that
 * location is metered by api_limit with the numbers /api uses (the zone is one
 * bucket per address, and two sizes for it would be two different limits), and
 * the credential block is still 5r/m burst 3.
 */
export function judgeHintConf(confText) {
  const limits = parseHintLocation(confText)
  if (limits === null) return { verdict: 'fail', detail: `no exact-match location for ${HINT_PATH}` }
  if (limits.length !== 1 || limits[0].zone !== 'api_limit') {
    return { verdict: 'fail', detail: `the hint location's limit_req lines are ${JSON.stringify(limits)}, expected one on api_limit` }
  }
  const api = readApiLimit(confText)
  if (limits[0].burst !== api.burst || limits[0].delay !== api.delay) {
    return {
      verdict: 'fail',
      detail: `the hint location is burst ${limits[0].burst} delay ${limits[0].delay}, /api is burst ${api.burst} delay ${api.delay}`,
    }
  }
  const login = parseZones(confText).login_limit
  if (!login || login.rateText !== '5r/m' || login.burst !== 3) {
    return { verdict: 'fail', detail: `login_limit is ${login ? `${login.rateText} burst ${login.burst}` : 'absent'}, expected 5r/m burst 3` }
  }
  return {
    verdict: 'pass',
    detail: `hint on api_limit burst ${api.burst} delay ${api.delay}; login_limit ${login.rateText} burst ${login.burst}`,
  }
}

/**
 * Five hints at one instant, then logins one after another, from one address
 * against an empty limiter.
 *
 * Each observation is `{ qaId, entry, arrived }`: the request's access-log line
 * and whether the recording upstream saw it. "Admitted" means it reached the
 * upstream, whatever the upstream would answer.
 *
 *   separated  every hint admitted, the first burst + 1 logins admitted and the
 *              rest refused by limit_req: the hints spent none of login_limit,
 *              and login_limit is still enforced. The only pass.
 *   shared     burst + 1 hints admitted, the rest refused by limit_req, and
 *              every login refused by limit_req: the hints emptied the bucket
 *              the logins needed. This is #1360, and what the unfixed
 *              configuration must show.
 *   other      any other failure. It says nothing about #1360.
 *
 * The counts are exact only while no slot refills, so the whole sequence, by
 * the ingress clock, has to fit in a quarter of the refill interval (3 s of
 * 12 s); beyond that it is not judged.
 */
export function judgeHintThenLogin({ hints, logins }, login) {
  const all = [...hints, ...logins]
  const cannot = (detail) => ({ verdict: 'inconclusive', pattern: null, windowMs: null, detail })
  const missing = all.filter((o) => !o.entry)
  if (missing.length > 0) return cannot(`no access-log line for ${missing.map((o) => o.qaId).join(', ')}`)
  const addresses = [...new Set(all.map((o) => o.entry.remoteAddr))]
  if (addresses.length !== 1) return cannot(`the requests came from ${addresses.length} addresses: ${addresses.join(', ')}`)
  const unattributed = all.filter((o) => o.entry.status === 429 && attribute(o.entry) === 'unattributed')
  if (unattributed.length > 0) return cannot(`${unattributed.length} 429 line(s) attribute as unattributed`)
  const starts = all.map((o) => o.entry.startMs)
  const windowMs = Math.max(...starts) - Math.min(...starts)
  const limitMs = (intervalSeconds(login.ratePerSecond) * 1000) / 4
  if (windowMs >= limitMs) {
    return { ...cannot(`the sequence took ${windowMs} ms; it is judged only under ${limitMs} ms, a quarter of the refill interval`), windowMs }
  }

  const admitted = (o) => o.arrived && o.entry.status !== 429 && (o.entry.limitReq === 'PASSED' || o.entry.limitReq === 'DELAYED')
  const refused = (o) => !o.arrived && o.entry.status === 429 && o.entry.limitReq === 'REJECTED'
  const n = login.burst + 1
  const count = (list) => `${list.filter(admitted).length} admitted, ${list.filter(refused).length} refused by limit_req`
  const facts =
    `hints ${count(hints)} of ${hints.length}; logins ${count(logins)} of ${logins.length}; ` +
    `${windowMs} ms from first to last request, from ${addresses[0]}`

  if (hints.every(admitted) && logins.length > n && logins.slice(0, n).every(admitted) && logins.slice(n).every(refused)) {
    return { verdict: 'pass', pattern: 'separated', windowMs, detail: facts }
  }
  if (
    hints.length > n &&
    hints.filter(admitted).length === n &&
    hints.filter(refused).length === hints.length - n &&
    logins.length > 0 &&
    logins.every(refused)
  ) {
    return { verdict: 'fail', pattern: 'shared', windowMs, detail: `the hints spent the credential budget and the first login was refused by limit_req: ${facts}` }
  }
  return { verdict: 'fail', pattern: 'other', windowMs, detail: facts }
}

// --- CLI -------------------------------------------------------------------

const PROBE_RESULT = 'limiter-probe-result.json'

function confSha256(confPath) {
  return createHash('sha256').update(readFileSync(confPath)).digest('hex')
}

/**
 * The api_limit phases, run against the rig (the shell wrapper starts it).
 *
 * Nothing here runs against the running stack: the phases change the bucket's
 * state by design, and the recorded run must not see that. The phases are
 * planned from the probe result before anything is sent, so a stale or missing
 * result stops the run before it touches the limiter.
 */
async function apiLimitPhases({ confPath, api, rigDir }) {
  // The repository's recorded result, which is what this file asserts against.
  // PROBE_RESULT points elsewhere only to prove the run refuses a stale or
  // altered one (the stale-evidence runs), never to assert something else.
  const probePath = process.env.PROBE_RESULT || join(dirname(fileURLToPath(import.meta.url)), PROBE_RESULT)
  let probe = null
  if (existsSync(probePath)) {
    try {
      probe = JSON.parse(readFileSync(probePath, 'utf8'))
    } catch {
      probe = null
    }
  }
  const plan = planPhases(probe, confSha256(confPath))
  const base = process.env.VERIFY_BASE_URL || 'http://rig-nginx'
  const drain = Math.ceil((api.burst + 1) / api.ratePerSecond) + 5

  for (const state of plan.blocked) {
    console.log(`[BLOCKED unresolved] ${state}`)
  }
  if (plan.phases.length === 0) {
    console.log(`api_limit verification INCOMPLETE: ${plan.blocked.join(', ') || '(no phase could be planned)'}`)
    return exitCodeFor({ incomplete: true })
  }
  console.log(`api_limit: ${api.rateText} burst ${api.burst} delay ${api.delay}; probe result ${probe.confSha256.slice(0, 12)}`)

  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000))
  const logLines = () => {
    const path = join(rigDir ?? '.', 'access.log')
    if (!existsSync(path)) return []
    return readFileSync(path, 'utf8').split('\n').map(parseLine).filter(Boolean)
  }
  const arrivalsFor = (ids) => {
    // The rig's recording upstream is asked directly; arrival times are never
    // read out of the ingress log.
    return (async () => {
      const res = await fetch(new URL('/__arrivals', process.env.RIG_UPSTREAM || 'http://backend:3002'))
      const all = await res.json()
      return all.filter((a) => ids.includes(a.qaId)).map((a) => a.arrivedMs)
    })()
  }
  const clearArrivals = () =>
    fetch(new URL('/__arrivals', process.env.RIG_UPSTREAM || 'http://backend:3002'), { method: 'DELETE' })

  // What phase G measured: the largest number of requests one address has
  // admitted at one instant, which phase J needs to exceed by enough to be
  // refused.
  const immediateCount = plan.phases.find((p) => p.id === 'G')?.requests ?? Math.max(1, api.delay - 10)

  let mismatches = 0
  let inconclusive = 0
  const inconclusivePhases = []
  const finish = (phase, j) => {
    if (j.verdict === 'inconclusive') {
      console.log(`[INCONCLUSIVE] ${phase.label}: ${j.detail}`)
      inconclusive += 1
      inconclusivePhases.push(phase.label)
      return
    }
    console.log(`[${j.verdict === 'pass' ? 'PASS' : 'FAIL'}] ${phase.label}: ${j.detail}`)
    if (j.verdict !== 'pass') mismatches += 1
  }

  const request = (qaId) =>
    new Promise((resolve, reject) => {
      const started = performance.now()
      const req = http.request({ host: new URL(base).hostname, port: Number(new URL(base).port || 80), path: '/api/verify', agent: undefined, headers: { 'X-QA-Request-Id': qaId } }, (res) => {
        res.resume()
        res.on('end', () => resolve({ qaId, status: res.statusCode, ms: performance.now() - started }))
      })
      req.on('error', reject)
      req.end()
    })

  const readFor = async (ids) => {
    await wait(2) // the log is flushed every second
    const lines = logLines()
    return ids.map((qaId) => lines.find((l) => l.qaId === qaId) ?? null)
  }

  for (const phase of plan.phases) {
   try {
    await wait(drain)
    await clearArrivals()
    // The bucket must be empty before a phase, or it measures the previous one.
    const check = await request(`drain-${Date.now()}`)
    await wait(2)
    const drained = logLines().filter((l) => l.qaId === check.qaId).pop()
    if (!drained || drained.limitReq !== 'PASSED') {
      console.log(`[INCONCLUSIVE] ${phase.label}: the bucket did not drain (last line reads ${drained ? drained.limitReq : 'nothing'})`)
      inconclusive += 1
      inconclusivePhases.push(phase.label)
      continue
    }

    let ids = []
    if (phase.state === 'immediate') {
      ids = Array.from({ length: phase.requests }, (_, i) => `g-${String(i).padStart(3, '0')}`)
      await Promise.all(ids.map((qaId) => request(qaId)))
    } else if (phase.state === 'delayed') {
      // More requests than the delay allowance, on one connection, so the
      // limiter has to delay rather than refuse.
      ids = Array.from({ length: api.burst + api.delay + 5 }, (_, i) => `h-${String(i).padStart(3, '0')}`)
      const one = http.request({ host: new URL(base).hostname, port: Number(new URL(base).port || 80), path: '/api/verify', agent: undefined, headers: { 'X-QA-Request-Id': ids[0], Connection: 'keep-alive' } }, () => {})
      one.on('error', () => {})
      one.end()
      for (const qaId of ids.slice(1)) await request(qaId)
    } else if (phase.state === 'rejectedByLimitReq') {
      // The excess has to pass the burst, and requests released one after
      // another let it decay again between them (the probe measured this), so
      // they go out at one instant with nothing held at the upstream.
      ids = Array.from({ length: api.burst + api.delay + 10 }, (_, i) => `i-${String(i).padStart(3, '0')}`)
      await Promise.all(ids.map((qaId) => request(qaId)))
    } else {
      // limit_conn: more connections in flight together than its cap, held at
      // the upstream so they are in flight together. The excess stays inside the
      // delay allowance, so these lines are about the connection cap only.
      const count = immediateCount + 5
      ids = Array.from({ length: count }, (_, i) => `j-${String(i).padStart(3, '0')}`)
      await Promise.all(
        ids.map(
          (qaId) =>
            new Promise((resolve, reject) => {
              const req = http.request(
                { host: new URL(base).hostname, port: Number(new URL(base).port || 80), path: '/api/verify', agent: undefined, headers: { 'X-QA-Request-Id': qaId, 'X-Rig-Hold-Ms': '1000' } },
                (res) => {
                  res.resume()
                  res.on('end', resolve)
                },
              )
              req.on('error', reject)
              req.end()
            }),
        ),
      )
    }

    const lines = await readFor(ids)
    const present = lines.filter(Boolean)
    if (phase.state === 'immediate') {
      const arrivals = await arrivalsFor(ids)
      finish(phase, judgeImmediate(ids.map((qaId, i) => ({ qaId, entry: lines[i] })), arrivals, phase.requests, probe.toleranceMs))
    } else if (phase.state === 'delayed') {
      const delayedLines = present.filter((l) => l.limitReq === 'DELAYED')
      const refusedInstead = present.filter((l) => l.limitReq === 'REJECTED')
      if (refusedInstead.length > 0) {
        // The phase's claim is that excess requests are delayed. A refusal
        // where a delay was due answers that, and it is an answer, not thin
        // evidence: judgeDelayCurve is only reached with delays to measure.
        finish(phase, {
          verdict: 'fail',
          detail: `${refusedInstead.length} request(s) were refused where this configuration delays them, and only ${delayedLines.length} were delayed`,
        })
      } else {
        const arrivals = await arrivalsFor(ids)
        const delayedIds = new Set(delayedLines.map((l) => l.qaId))
        const delayedArrivals = arrivals.filter((_, i) => delayedIds.has(ids[i]))
        finish(phase, judgeDelayCurve(delayedArrivals, api.ratePerSecond, probe.toleranceMs))
      }
    } else {
      finish(phase, judgeRejection(present, phase.state === 'rejectedByLimitReq' ? 'limit_req' : 'limit_conn', phase.assertOtherField))
    }
   } catch (err) {
    // The phase could not be carried out: it has neither passed nor failed.
    console.log(`[INCONCLUSIVE] ${phase.label}: ${err && err.message ? err.message : 'the phase could not run'}`)
    inconclusive += 1
    inconclusivePhases.push(phase.label)
   }
  }

  for (const note of plan.documented) console.log(`[DOCUMENTED unreachable] ${note}`)
  // "Complete" means every phase was judged, not merely that none was blocked:
  // a phase that could not judge leaves the abuse limit unverified.
  const named = [...plan.blocked, ...inconclusivePhases.map((label) => `${label} (inconclusive)`)]
  console.log(named.length === 0 ? 'api_limit verification complete' : `api_limit verification INCOMPLETE: ${named.join(', ')}`)
  return exitCodeFor({ mismatches, incomplete: named.length > 0, inconclusive })
}

/**
 * Phase K, run against a rig of its own (nginx/verify-hint-budget.sh starts
 * it), so the limiter is empty and every request comes from this container.
 *
 * With `expectShared` the run is the proof that the phase can fail for the
 * right reason: it is pointed at the configuration from before #1360 and
 * succeeds only when the judgement is the shared pattern. Any other failure is
 * not that proof and exits 1.
 */
async function hintBudgetPhase({ confPath, rigDir, expectShared }) {
  const base = new URL(process.env.VERIFY_BASE_URL || 'http://rig-nginx')
  const upstream = process.env.RIG_UPSTREAM || 'http://backend:3002'
  const login = parseZones(readFileSync(confPath, 'utf8')).login_limit
  const HINTS = 5
  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000))

  let mismatches = 0
  if (!expectShared) {
    // The repository's file. Under expectShared the rig serves another one,
    // which this container cannot see, so nothing is said about it.
    const c = judgeHintConf(readFileSync(confPath, 'utf8'))
    console.log(`[${c.verdict === 'pass' ? 'PASS' : 'FAIL'}] K configuration: ${c.detail}`)
    if (c.verdict !== 'pass') mismatches += 1
  }

  const send = (method, path, qaId, body) =>
    new Promise((resolve, reject) => {
      const text = body ? JSON.stringify(body) : null
      const headers = { 'X-QA-Request-Id': qaId, 'X-ERP-Session-Protocol': '2' }
      if (text) {
        headers['Content-Type'] = 'application/json'
        headers['Content-Length'] = Buffer.byteLength(text)
      }
      const req = http.request({ host: base.hostname, port: Number(base.port || 80), method, path, agent: undefined, headers }, (res) => {
        res.resume()
        res.on('end', () => resolve({ qaId, status: res.statusCode }))
      })
      req.on('error', reject)
      req.end(text ?? undefined)
    })

  const hintIds = Array.from({ length: HINTS }, (_, i) => `k-hint-${i}`)
  const loginIds = Array.from({ length: login.burst + 2 }, (_, i) => `k-login-${i}`)
  const credentials = { username: '__verify_no_such_user__', password: 'x' }
  try {
    const t0 = performance.now()
    await Promise.all(hintIds.map((qaId) => send('GET', HINT_PATH, qaId)))
    // No wait: the first login is what a user who signs in at once would send.
    for (const qaId of loginIds) await send('POST', '/api/auth/login', qaId, credentials)
    const clientMs = Math.round(performance.now() - t0)

    await wait(2) // the log is flushed every second
    const logPath = join(rigDir ?? '.', 'access.log')
    const lines = existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').map(parseLine).filter(Boolean) : []
    const arrived = new Set((await (await fetch(new URL('/__arrivals', upstream))).json()).map((a) => a.qaId))
    const observe = (qaId) => ({ qaId, entry: lines.find((l) => l.qaId === qaId) ?? null, arrived: arrived.has(qaId) })
    const hints = hintIds.map(observe)
    const logins = loginIds.map(observe)
    for (const o of [...hints, ...logins]) {
      const e = o.entry
      console.log(`  ${o.qaId}: ${e ? `${e.method} ${e.uri} ${e.status} lreq=${e.limitReq ?? '-'} lconn=${e.limitConn ?? '-'} start=${e.startMs}` : 'no line'} upstream=${o.arrived ? 'arrived' : 'absent'}`)
    }
    const j = judgeHintThenLogin({ hints, logins }, login)
    const detail = `${j.detail}; ${clientMs} ms by the client's clock; login_limit ${login.rateText} burst ${login.burst}`

    if (expectShared) {
      if (j.pattern === 'shared') {
        console.log(`[PASS] K red proof: the configuration under test shows #1360 (${detail})`)
        return 0
      }
      console.log(`[FAIL] K red proof: expected the shared pattern, judged ${j.verdict}/${j.pattern} (${detail})`)
      return 1
    }
    if (j.verdict === 'inconclusive') {
      console.log(`[INCONCLUSIVE] K hints then login: ${detail}`)
      return exitCodeFor({ mismatches, inconclusive: true })
    }
    console.log(`[${j.verdict === 'pass' ? 'PASS' : 'FAIL'}] K hints then login (${j.pattern}): ${detail}`)
    if (j.verdict !== 'pass') mismatches += 1
  } catch (err) {
    console.log(`[INCONCLUSIVE] K hints then login: ${err && err.message ? err.message : 'the phase could not run'}`)
    return expectShared ? 1 : exitCodeFor({ mismatches, inconclusive: true })
  }
  return exitCodeFor({ mismatches })
}

async function main() {
  const base = process.env.VERIFY_BASE_URL || 'http://nginx'
  const args = process.argv.slice(2)
  const assumeArg = args.find((a) => a.startsWith('--assume-session'))
  const confPath = join(dirname(fileURLToPath(import.meta.url)), 'nginx.conf')
  const zones = parseZones(readFileSync(confPath, 'utf8'))

  if (args.includes('--api-limit')) {
    process.exit(
      await apiLimitPhases({ confPath, api: readApiLimit(readFileSync(confPath, 'utf8')), rigDir: process.env.RIG_DIR }),
    )
  }

  if (args.includes('--hint-budget')) {
    process.exit(await hintBudgetPhase({ confPath, rigDir: process.env.RIG_DIR, expectShared: args.includes('--expect-shared') }))
  }

  if (assumeArg) {
    const spec = args[args.indexOf(assumeArg) + 1] || assumeArg.split('=')[1] || '1r/s:20'
    const [rate, burst] = spec.split(':')
    zones.session_limit = { ratePerSecond: rate === '1r/s' ? 1 : Number(rate), rateText: rate, burst: Number(burst) }
  }

  const login = zones.login_limit
  if (login && (login.rateText !== '5r/m' || login.burst !== 3)) {
    console.error(`FAIL: login_limit is ${login.rateText} burst ${login.burst}, expected 5r/m burst 3`)
    process.exit(1)
  }

  // 0 = all passed, 1 = a mismatch, 2 = a burst too slow to judge (and no mismatch).
  let exitCode = 0
  const report = (phase, ok, detail) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${phase}: ${detail}`)
    if (!ok) exitCode = 1
  }
  // Phase 0: nginx -t is run by the shell wrapper.
  // Phases A-F run here against `base`.
  const send = async (method, path, body) => {
    const started = performance.now()
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-ERP-Session-Protocol': '2',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    return { status: res.status, text, ms: performance.now() - started }
  }

  const burst = async (requests) => {
    const results = []
    let i = 0
    const workers = Array.from({ length: Math.min(CONCURRENCY, requests.length) }, async () => {
      while (i < requests.length) {
        const idx = i++
        results[idx] = await send(...requests[idx])
      }
    })
    await Promise.all(workers)
    return results
  }

  const wait = (s) => new Promise((r) => setTimeout(r, s * 1000))

  // One exhaustion burst against a zone. `admittedStatus` is the status the
  // backend gives this request when NGINX lets it through; anything that is
  // neither that nor 429 (426, 400, 502, 503) means the request did not
  // exercise what the phase claims.
  const exhaust = async (phase, zone, request, admittedStatus, claim) => {
    const n = requestsToExhaust(zone.ratePerSecond, zone.burst)
    const t0 = performance.now()
    const results = await burst(Array.from({ length: n }, () => request))
    const seconds = (performance.now() - t0) / 1000
    const admitted = results.filter((r) => r.status === admittedStatus).length
    const rejected = results.filter((r) => r.status === 429).length
    const otherStatuses = results.filter((r) => r.status !== admittedStatus && r.status !== 429).map((r) => r.status)
    const j = judgeBurst(zone, { seconds, admitted, rejected, other: otherStatuses.length })
    const detail =
      `${claim}: ${zone.rateText} burst ${zone.burst}, sent ${n}, ` +
      `${admitted} x ${admittedStatus}, ${rejected} x 429` +
      (otherStatuses.length ? `, other ${JSON.stringify(otherStatuses)}` : '') +
      `, T=${seconds.toFixed(2)}s (Tmax ${j.tmax}s), admitted bounds ${j.lower}-${j.upper}`
    if (j.verdict === 'inconclusive') {
      console.log(`[INCONCLUSIVE] ${phase}: ${detail}`)
      if (exitCode === 0) exitCode = 2
      return
    }
    report(phase, j.verdict === 'pass', detail)
  }

  const single = async (phase, request, expected) => {
    const res = await send(...request)
    report(phase, res.status === expected, `${request[0]} ${request[1]} -> ${res.status}, expected ${expected}`)
  }

  try {
    const session = zones.session_limit
    if (!login || login.burst === undefined) {
      report('A', false, 'login_limit zone or its burst not found in nginx.conf')
      process.exit(1)
    }
    if (!session || session.burst === undefined) {
      report('B', false, 'no session_limit zone and none assumed')
      process.exit(1)
    }

    const loginReq = ['POST', '/api/auth/login', { username: '__verify_no_such_user__', password: 'x' }]
    const refreshReq = ['POST', '/api/auth/refresh', { refreshToken: 'not-a-real-token' }]
    const logoutReq = ['POST', '/api/auth/logout', { refreshToken: 'not-a-real-token' }]
    const meReq = ['GET', '/api/auth/me']
    const changePasswordReq = ['PATCH', '/api/auth/change-password', { currentPassword: 'x', newPassword: 'y' }]

    // Both buckets empty. Docker can hand this container an address an
    // earlier run used, so "fresh container" is not "empty bucket".
    const drainBoth = Math.max(
      drainWaitSeconds(login.ratePerSecond, login.burst),
      drainWaitSeconds(session.ratePerSecond, session.burst),
    )

    console.log(`waiting ${drainBoth}s for both zones to drain`)
    await wait(drainBoth)
    await exhaust('A', login, loginReq, 401, 'login budget')
    // No wait: B runs while A has spent the login budget.
    await exhaust('B', session, refreshReq, 401, 'session upkeep while the login budget is spent')

    console.log(`waiting ${drainBoth}s for both zones to drain`)
    await wait(drainBoth)
    await exhaust('C', session, refreshReq, 401, 'session budget')
    // No wait: D runs while C has spent the session budget.
    await exhaust('D', login, loginReq, 401, 'login budget while the session budget is spent')

    console.log(`waiting ${drainBoth}s for both zones to drain`)
    await wait(drainBoth)
    await exhaust('E change-password', login, changePasswordReq, 401, 'change-password is on the strict budget')
    await single('E logout', logoutReq, 204)
    await single('E me', meReq, 401)

    // Phase F: CORS preflight.
    for (const path of ['/api/auth/login', '/api/auth/refresh']) {
      const res = await fetch(`${base}${path}`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Headers': 'x-erp-session-protocol',
        },
      })
      const allow = res.headers.get('access-control-allow-headers') || ''
      report(`F ${path}`, res.status === 204 && /x-erp-session-protocol/i.test(allow),
        `status ${res.status}, allow-headers "${allow}"`)
    }
  } catch (err) {
    console.error('script error:', err)
    process.exit(1)
  }

  process.exit(exitCode)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
