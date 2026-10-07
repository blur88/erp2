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

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

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

// --- CLI -------------------------------------------------------------------

async function main() {
  const base = process.env.VERIFY_BASE_URL || 'http://nginx'
  const args = process.argv.slice(2)
  const assumeArg = args.find((a) => a.startsWith('--assume-session'))
  const confPath = join(dirname(fileURLToPath(import.meta.url)), 'nginx.conf')
  const zones = parseZones(readFileSync(confPath, 'utf8'))

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
