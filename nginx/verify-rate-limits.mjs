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

  let firstFailure = 0
  const report = (phase, ok, detail) => {
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${phase}: ${detail}`)
    if (!ok && firstFailure === 0) firstFailure = 1
  }

  // Phase 0: nginx -t is run by the shell wrapper.
  // Phases A-F: see verify-rate-limits.sh. This stub implements the request
  // phases against `base`.
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

  try {
    const loginReq = ['POST', '/api/auth/login', { username: '__verify_no_such_user__', password: 'x' }]
    const sessionReq = ['POST', '/api/auth/refresh', { refreshToken: 'not-a-real-token' }]

    await wait(drainWaitSeconds(login.ratePerSecond, login.burst))
    const nLogin = requestsToExhaust(login.ratePerSecond, login.burst)
    const t0 = performance.now()
    const aRes = await burst(Array.from({ length: nLogin }, () => loginReq))
    const tA = (performance.now() - t0) / 1000
    const aAdmitted = aRes.filter((r) => r.status === 401).length
    const aRejected = aRes.filter((r) => r.status === 429).length
    const aOther = aRes.filter((r) => r.status !== 401 && r.status !== 429)
    report('A', aOther.length === 0 && aRejected >= 1 && aAdmitted === login.burst + 1,
      `login burst: ${aAdmitted} admitted, ${aRejected} rejected, T=${tA.toFixed(2)}s`)

    if (zones.session_limit) {
      const s = zones.session_limit
      const nSession = requestsToExhaust(s.ratePerSecond, s.burst)
      const t1 = performance.now()
      const bRes = await burst(Array.from({ length: nSession }, () => sessionReq))
      const tB = (performance.now() - t1) / 1000
      const bAdmitted = bRes.filter((r) => r.status === 401).length
      const bRejected = bRes.filter((r) => r.status === 429).length
      const bOther = bRes.filter((r) => r.status !== 401 && r.status !== 429)
      const bounds = admittedBounds(s.ratePerSecond, s.burst, tB)
      report('B', bOther.length === 0 && bRejected >= 1 && bAdmitted >= bounds.lower && bAdmitted <= bounds.upper,
        `refresh burst: ${bAdmitted} admitted, ${bRejected} rejected, T=${tB.toFixed(2)}s, bounds ${bounds.lower}-${bounds.upper}`)

      // Phase C: same as B after draining both zones.
      await wait(drainWaitSeconds(s.ratePerSecond, s.burst))
      const t2 = performance.now()
      const cRes = await burst(Array.from({ length: nSession }, () => sessionReq))
      const tC = (performance.now() - t2) / 1000
      const cAdmitted = cRes.filter((r) => r.status === 401).length
      const cRejected = cRes.filter((r) => r.status === 429).length
      const cOther = cRes.filter((r) => r.status !== 401 && r.status !== 429)
      const cBounds = admittedBounds(s.ratePerSecond, s.burst, tC)
      report('C', cOther.length === 0 && cRejected >= 1 && cAdmitted >= cBounds.lower && cAdmitted <= cBounds.upper,
        `refresh burst: ${cAdmitted} admitted, ${cRejected} rejected, T=${tC.toFixed(2)}s`)

      // Phase D: login while the session budget is spent (independence).
      // Drain the login zone so D starts from a known-empty bucket.
      await wait(drainWaitSeconds(login.ratePerSecond, login.burst))
      const nLogin2 = requestsToExhaust(login.ratePerSecond, login.burst)
      const t3 = performance.now()
      const dRes = await burst(Array.from({ length: nLogin2 }, () => loginReq))
      const tD = (performance.now() - t3) / 1000
      const dAdmitted = dRes.filter((r) => r.status === 401).length
      const dRejected = dRes.filter((r) => r.status === 429).length
      const dOther = dRes.filter((r) => r.status !== 401 && r.status !== 429)
      report('D', dOther.length === 0 && dRejected >= 1 && dAdmitted === login.burst + 1,
        `login burst while session spent: ${dAdmitted} admitted, ${dRejected} rejected, T=${tD.toFixed(2)}s`)
    } else {
      report('B', false, 'no session_limit zone and none assumed')
    }

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

  process.exit(firstFailure)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) main()
