#!/usr/bin/env node
// The limiter-interaction probe: what `limit_req` and `limit_conn` actually do
// to each other's requests on this NGINX build, with this configuration.
//
// It runs against the isolated rig (nginx/limiter-rig/rig.sh): the real NGINX
// image in front of a recording upstream, on a network of its own. Nothing here
// touches the running stack.
//
// The result is nginx/limiter-probe-result.json, and every assertion any later
// task makes about the limiter is written against it:
//
//   answers  what the two handlers do to each other, from the NGINX source for
//            the running version read together with what was observed
//   states   which of the four states one address can reach at all
//
// A state is recorded reachable only when it was observed with evidence naming
// the limiter that produced it. Not observing one is `unresolved`, which is
// never a pass: an explanation grounded in the established handler order and
// accounting is what turns it into `unreachable`, and only a person reading
// the evidence can write that.
//
// Usage, from a container on the rig's network with nginx/ at /work and the
// rig's directory at /rig:
//   RIG_DIR=/rig node /work/limiter-probe.mjs
//   RIG_DIR=/rig node /work/limiter-probe.mjs --merge /rig/other.json

import http from 'node:http'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseLine } from './access-log.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_CONF = join(HERE, 'nginx.conf')
const RIG_DIR = process.env.RIG_DIR || HERE
const BASE = new URL(process.env.RIG_BASE || 'http://rig-nginx')
const UPSTREAM_CONTROL = new URL(process.env.RIG_UPSTREAM || 'http://backend:3002')

const BASELINE_SAMPLES = 20
// Seconds to wait after an experiment for the access log's flush (flush=1s).
const FLUSH_WAIT_SECONDS = 2

function now() {
  return performance.timeOrigin + performance.now()
}

const wait = (seconds) => new Promise((r) => setTimeout(r, seconds * 1000))

// --- pure ------------------------------------------------------------------

// The provisional limiter values, read from the configuration rather than
// written here, so no test or script can carry a stale copy.
export function parseApiLimit(confText) {
  const zone = /limit_req_zone\s+\S+\s+zone=api_limit:(\d+)m\s+rate=(\d+)(r\/s|r\/m);/.exec(confText)
  if (!zone) throw new Error('api_limit zone not found')
  const ratePerSecond = zone[3] === 'r/s' ? Number(zone[2]) : Number(zone[2]) / 60
  // The /api location is the only one on api_limit; the first match is it.
  const limit = /limit_req\s+zone=api_limit\s+burst=(\d+)(?:\s+nodelay|\s+delay=(\d+))?;/.exec(confText)
  if (!limit) throw new Error('api_limit burst not found')
  return {
    ratePerSecond,
    rateText: `${zone[2]}${zone[3]}`,
    burst: Number(limit[1]),
    delay: limit[2] === undefined ? 0 : Number(limit[2]),
  }
}

// The account one address has to spend before the bucket is empty again.
export function drainWaitSeconds({ ratePerSecond, burst }) {
  return Math.ceil((burst + 1) / ratePerSecond) + 5
}

// { status, evidence, explanation, maxSimultaneousImmediate? }
//
// `unreachable` needs three things at once: the state was never observed, an
// explanation says why the combined limits exclude it, and both answers the
// explanation rests on are established. An explanation that rests on an
// unresolved answer is not evidence of anything, so the state stays unresolved
// and the explanation is not carried over as if it were a conclusion.
export function classifyState({ observed, evidence = [], explanation = null, answers = {}, maxSimultaneousImmediate }) {
  const rest = observed
    ? { status: 'reachable', evidence, explanation: null }
    : explanation && answers.handlerOrder?.status === 'established' && answers.delayedCountedByLimitConn?.status === 'established'
      ? { status: 'unreachable', evidence, explanation }
      : { status: 'unresolved', evidence, explanation: null }
  if (rest.status === 'reachable' && Number.isFinite(maxSimultaneousImmediate)) {
    rest.maxSimultaneousImmediate = maxSimultaneousImmediate
  }
  return rest
}

// Two runs of the probe must agree. An entry is compared on what it claims, not
// on the counts quoted inside its evidence, which are measurements and differ
// every run: a difference of status, of the finding, or of the admitted count
// for a reachable state is a disagreement. A disagreement becomes unresolved
// with both observations kept, so nothing is recorded as established because
// one of two runs happened to see it.
export function mergeProbeResults(a, b) {
  const same = (x, y, key) => (x?.[key] === undefined ? y?.[key] === undefined : x[key] === y?.[key])
  const answers = {}
  for (const key of new Set([...Object.keys(a.answers || {}), ...Object.keys(b.answers || {})])) {
    const x = a.answers?.[key]
    const y = b.answers?.[key]
    answers[key] =
      x && y && x.status === y.status && x.finding === y.finding
        ? { ...x, evidence: [...(x.evidence || []), `a second run agreed: ${y.status}`] }
        : { status: 'unresolved', finding: '', evidence: [`run A: ${JSON.stringify(x ?? null)}`, `run B: ${JSON.stringify(y ?? null)}`] }
  }
  const states = {}
  for (const key of new Set([...Object.keys(a.states || {}), ...Object.keys(b.states || {})])) {
    const x = a.states?.[key]
    const y = b.states?.[key]
    states[key] =
      x && y && x.status === y.status && (x.explanation ?? null) === (y.explanation ?? null) && same(x, y, 'maxSimultaneousImmediate')
        ? { ...x, evidence: [...(x.evidence || []), `a second run agreed: ${y.status}`] }
        : { status: 'unresolved', explanation: null, evidence: [`run A: ${JSON.stringify(x ?? null)}`, `run B: ${JSON.stringify(y ?? null)}`] }
  }
  return { ...a, answers, states, mergedFrom: [a.recordedAt, b.recordedAt] }
}

// --- client ----------------------------------------------------------------

function agent(maxSockets, keepAlive) {
  return new http.Agent({ keepAlive, keepAliveMsecs: 30000, maxSockets, maxFreeSockets: keepAlive ? maxSockets : 0 })
}

function send(agentForRequest, { qaId, path = '/api/x', holdMs = 0 }) {
  return new Promise((resolve, reject) => {
    const startedMs = now()
    const headers = { 'X-QA-Request-Id': qaId }
    if (holdMs > 0) headers['X-Rig-Hold-Ms'] = String(holdMs)
    const req = http.request(
      {
        host: BASE.hostname,
        port: BASE.port || 80,
        path,
        method: 'GET',
        agent: agentForRequest,
        headers,
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve({ qaId, status: res.statusCode, rtMs: now() - startedMs }))
      },
    )
    req.on('error', (err) => reject(new Error(`${qaId}: ${err.message}`)))
    req.end()
  })
}

// One after another on the agent's connections: with `parallel` workers over a
// keep-alive agent of that many sockets, each request is sent when the previous
// answer arrives.
async function sequential(count, { prefix, path = '/api/x', holdMs = 0, sockets = 1 }) {
  const a = agent(sockets, true)
  let next = 0
  const worker = async () => {
    const out = []
    while (true) {
      const i = next++
      if (i >= count) return out
      out.push(await send(a, { qaId: `${prefix}-${String(i).padStart(3, '0')}`, path, holdMs }))
    }
  }
  const results = (await Promise.all(Array.from({ length: sockets }, worker))).flat()
  a.destroy()
  return results.sort((x, y) => x.qaId.localeCompare(y.qaId))
}

// All of them released at the same instant, each on its own connection.
async function released(count, { prefix, path = '/api/x', holdMs = 0 }) {
  const a = agent(count, false)
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      send(a, { qaId: `${prefix}-${String(i).padStart(3, '0')}`, path, holdMs })),
  )
  a.destroy()
  return results
}

// --- evidence --------------------------------------------------------------

function readEntries(qaIds) {
  const path = join(RIG_DIR, 'access.log')
  if (!existsSync(path)) return []
  const wanted = new Set(qaIds)
  return readFileSync(path, 'utf8')
    .split('\n')
    .map(parseLine)
    .filter((e) => e && wanted.has(e.qaId))
}

function readErrorLines() {
  const path = join(RIG_DIR, 'error.log')
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n').filter((l) => /limiting (requests|connections)/.test(l))
}

async function clearArrivals() {
  await fetch(new URL('/__arrivals', UPSTREAM_CONTROL), { method: 'DELETE' })
}

async function readArrivals() {
  const res = await fetch(new URL('/__arrivals', UPSTREAM_CONTROL))
  return res.json()
}

function tally(values) {
  const out = {}
  for (const v of values) out[String(v)] = (out[String(v)] || 0) + 1
  return out
}

function summarize(results, entries, arrivals, extra = {}) {
  return {
    sent: results.length,
    statuses: tally(results.map((r) => r.status)),
    clientRoundTripMs: {
      n: results.length,
      max: Math.max(0, ...results.map((r) => Math.round(r.rtMs))),
    },
    limitReq: tally(entries.map((e) => e.limitReq)),
    limitConn: tally(entries.map((e) => e.limitConn)),
    logLines: entries.length,
    arrivals: arrivals.length,
    ...extra,
  }
}

// One experiment: send, wait for the flush, then read every piece of evidence
// it produced. The arrival list is the upstream's own record, so an arrival is
// not inferred from the ingress log.
async function experiment(id, { what, establishes, run, observations }) {
  console.log(`== ${id}: ${what}`)
  await drain()
  await clearArrivals()
  const errorLinesBefore = readErrorLines().length
  const results = await run(id.toLowerCase())
  await wait(FLUSH_WAIT_SECONDS)
  const entries = readEntries(results.map((r) => r.qaId))
  const allErrorLines = readErrorLines()
  const arrivals = await readArrivals()
  const raw = summarize(results, entries, arrivals)
  raw.errorLogRefusals = allErrorLines.length - errorLinesBefore
  raw.errorLogSamples = allErrorLines.slice(errorLinesBefore, errorLinesBefore + 4)
  const obs = observations({ id, results, entries, arrivals, errorLines: allErrorLines, raw })
  console.log(`   ${JSON.stringify(raw)}`)
  return { id, what, establishes, ...raw, observations: obs }
}

// Between experiments the bucket is emptied and the log is shown to read
// PASSED, so an experiment's counts are its own and not a leftover's.
async function drain() {
  await wait(drainWaitSeconds(api))
  const res = await send(agent(1, false), { qaId: `drain-${Date.now()}`, path: '/api/drain' })
  if (res.status !== 200) throw new Error(`the drain request was answered ${res.status}, not 200`)
  await wait(FLUSH_WAIT_SECONDS)
  const lines = readFileSync(join(RIG_DIR, 'access.log'), 'utf8')
    .split('\n')
    .map(parseLine)
    .filter(Boolean)
  const last = lines[lines.length - 1]
  if (!last || last.qaId !== res.qaId || last.limitReq !== 'PASSED') {
    throw new Error(`after draining, the last line is ${last ? `${last.qaId} ${last.limitReq}` : '(none)'}, not ${res.qaId} PASSED`)
  }
}

// --- the observations ------------------------------------------------------

// E1: limit_conn on its own. Which requests it refuses, and what limit_req's
// field reads on such a line. Under the order the source gives, limit_req has
// already metered the request, so its field reads PASSED.
function observeE1({ entries }) {
  const refused = entries.filter((e) => e.limitConn === 'REJECTED')
  const admitted = entries.filter((e) => e.limitConn === 'PASSED')
  return {
    refused: refused.length,
    admitted: admitted.length,
    lreqOnConnRefused: tally(refused.map((e) => e.limitReq)),
    lreqOnConnAdmitted: tally(admitted.map((e) => e.limitReq)),
    sourceSays:
      'limit_req runs first, so a request limit_conn refuses has already been metered and lreq reads PASSED',
    observedAsSourceSays: refused.length > 0 && refused.every((e) => e.limitReq === 'PASSED'),
  }
}

// E2: delayed forwarding over few connections. lconn on a delayed line, and
// the arrival curve at the upstream.
function observeE2({ entries, arrivals, api, toleranceMs }) {
  const byQa = new Map(arrivals.map((a) => [a.qaId, a]))
  const delayed = entries.filter((e) => e.limitReq === 'DELAYED').sort((x, y) => x.startMs - y.startMs)
  const curve = delayed
    .map((e, k) => {
      const arrived = byQa.get(e.qaId)
      if (!arrived) return null
      return { k, qaId: e.qaId, expectedAfterMs: (1000 * (k + 1)) / api.ratePerSecond, afterFirstArrivalMs: arrived.arrivedMs - byQa.get(delayed[0]?.qaId)?.arrivedMs }
    })
    .filter(Boolean)
  const accepted = curve.every((c) => Math.abs(c.afterFirstArrivalMs - c.expectedAfterMs) <= 1000 / api.ratePerSecond + toleranceMs)
  return {
    delayed: delayed.length,
    lconnOnDelayed: tally(delayed.map((e) => e.limitConn)),
    nonDelayed: entries.length - delayed.length,
    curve,
    curveAccepted: delayed.length > 0 && accepted,
  }
}

// E3: is a request delayed by limit_req counted by limit_conn while it is
// delayed? The excess is already above `delay`, so the requests are delayed.
// Under the order the source gives, the engine never reaches limit_conn's
// handler until the delay expires, so they are accounted one at a time as the
// limiter releases them at the configured rate and none is refused. The release
// spacing is recorded as well: without it, "none refused" would also fit
// requests whose delays never overlapped.
function observeE3({ entries, arrivals, api, toleranceMs }) {
  const byQa = new Map(arrivals.map((a) => [a.qaId, a]))
  const delayed = entries.filter((e) => e.limitReq === 'DELAYED').sort((x, y) => x.startMs - y.startMs)
  const times = delayed.map((e) => byQa.get(e.qaId)?.arrivedMs).filter((t) => typeof t === 'number')
  const gaps = times.slice(1).map((t, i) => Math.round((t - times[i]) * 1000) / 1000)
  const expectedGapMs = Math.round((1000 / api.ratePerSecond) * 1000) / 1000
  const connRefused = entries.filter((e) => e.limitConn === 'REJECTED')
  return {
    released: entries.length,
    delayed: delayed.length,
    connRefused: connRefused.length,
    lreqOnConnRefused: tally(connRefused.map((e) => e.limitReq)),
    admittedAndDelayed: entries.filter((e) => e.limitReq === 'DELAYED' && e.limitConn === 'PASSED').length,
    releaseGapsMs: gaps,
    expectedGapMs,
    // The releases were spread by the limiter rather than arriving together,
    // which is what makes "none refused" a statement about the accounting.
    releasesWereSpread: gaps.length > 0 && gaps.every((g) => Math.abs(g - expectedGapMs) <= expectedGapMs + toleranceMs),
    sourceSays:
      "limit_req's handler returns NGX_AGAIN while a request is delayed, so limit_conn's handler is not reached until the delay expires; the accounting is then taken as the limiter releases requests at the configured rate",
    observedAsSourceSays:
      delayed.length > 0 &&
      connRefused.length === 0 &&
      gaps.length > 0 &&
      gaps.every((g) => Math.abs(g - expectedGapMs) <= expectedGapMs + toleranceMs),
  }
}

// E4: can limit_req refuse a request from one address at all, and what does
// lconn read on such a line? The concurrent form first, then the same excess
// raised on one connection, because "could not provoke it" and "impossible" are
// different answers and only the second one may be recorded as unreachable.
function observeE4({ entries, parts }) {
  const rejected = entries.filter((e) => e.limitReq === 'REJECTED')
  const perPart = {}
  for (const [name, ids] of Object.entries(parts)) {
    const inPart = entries.filter((e) => ids.includes(e.qaId))
    perPart[name] = {
      released: inPart.length,
      rejectedByReq: inPart.filter((e) => e.limitReq === 'REJECTED').length,
      refusedByConn: inPart.filter((e) => e.limitConn === 'REJECTED').length,
    }
  }
  return {
    rejectedByLimitReq: rejected.length,
    lconnOnReqRefused: tally(rejected.map((e) => e.limitConn)),
    perPart,
    observedAsSourceSays: rejected.length > 0 && rejected.every((e) => e.limitConn === null),
  }
}

// E5: the largest number of requests one address has admitted at one instant.
// Two variants of the same release, because they answer different questions:
// with no hold, a request completes in about a millisecond, so whether eleven
// released together are ever eleven in flight at once is a race, and a count
// that passed once may fail another time. With the upstream holding each
// response, every released request is in flight together by construction, and
// the count is the combined limit's own. The recorded number is the one the
// held variant measured; the no-hold variant is kept beside it as what the
// browser's own shape of traffic does.
function observeSize(g) {
  const arrivals = g.arrivals.slice().sort((a, b) => a.arrivedMs - b.arrivedMs)
  const spanMs = arrivals.length > 1 ? arrivals[arrivals.length - 1].arrivedMs - arrivals[0].arrivedMs : 0
  const allAdmitted =
    g.entries.length === g.count &&
    g.entries.every((e) => e.limitReq === 'PASSED' && e.limitConn === 'PASSED')
  return {
    count: g.count,
    logLines: g.entries.length,
    arrivals: arrivals.length,
    arrivalSpanMs: Math.round(spanMs * 1000) / 1000,
    refusedByConn: g.entries.filter((e) => e.limitConn === 'REJECTED').length,
    refusedByReq: g.entries.filter((e) => e.limitReq === 'REJECTED').length,
    delayed: g.entries.filter((e) => e.limitReq === 'DELAYED').length,
    allAdmitted,
    allImmediate: allAdmitted && arrivals.length === g.count && spanMs <= g.toleranceMs,
  }
}

function observeE5({ groups, heldGroups, toleranceMs }) {
  const noHold = groups.map((g) => observeSize({ ...g, toleranceMs }))
  const held = heldGroups.map((g) => observeSize({ ...g, toleranceMs }))
  const admitted = (sizes) => sizes.filter((g) => g.allAdmitted)
  return {
    toleranceMs: Math.round(toleranceMs),
    noHold: { perSize: noHold, maxCount: admitted(noHold).length ? Math.max(...admitted(noHold).map((g) => g.count)) : 0 },
    held: { perSize: held, maxCount: admitted(held).length ? Math.max(...admitted(held).map((g) => g.count)) : 0 },
    maxSimultaneousImmediate: admitted(held).length ? Math.max(...admitted(held).map((g) => g.count)) : 0,
  }
}

// --- the probe -------------------------------------------------------------

let api = null
let rig = { baseUrl: BASE.href, confSha256: null, nginxVersion: null, nginxConfigureArgs: null }
const experiments = []

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--merge') {
    const [otherPath, outPath] = [args[1], args[2] || join(RIG_DIR, 'limiter-probe-result.json')]
    const a = JSON.parse(readFileSync(outPath, 'utf8'))
    const b = JSON.parse(readFileSync(otherPath, 'utf8'))
    writeFileSync(outPath, JSON.stringify(mergeProbeResults(a, b), null, 2) + '\n')
    console.log(`merged into ${outPath}`)
    return
  }

  if (existsSync(join(RIG_DIR, 'rig.json'))) {
    rig = JSON.parse(readFileSync(join(RIG_DIR, 'rig.json'), 'utf8'))
  }
  api = parseApiLimit(readFileSync(REPO_CONF, 'utf8'))
  const confSha256 = createHash('sha256').update(readFileSync(REPO_CONF)).digest('hex')
  if (rig.confSha256 && rig.confSha256 !== confSha256) {
    console.error(
      `refusing: the rig served ${rig.confPath} (${rig.confSha256}) and this result would claim ` +
        `the repository's nginx.conf (${confSha256}).`,
    )
    process.exit(1)
  }

  console.log(`api_limit: ${api.rateText} burst ${api.burst} delay ${api.delay}`)
  console.log(`drain wait between experiments: ${drainWaitSeconds(api)}s`)

  // E0: the unthrottled baseline every tolerance is taken from.
  const e0 = await experiment('E0', {
    what: '20 single requests, one at a time, no hold',
    establishes: 'the baseline field values and the unthrottled round-trip time',
    run: (prefix) => sequential(BASELINE_SAMPLES, { prefix, path: '/api/e0' }),
    observations: ({ results, entries }) => ({
      samples: results.map((r) => Math.round(r.rtMs * 1000) / 1000),
      maxMs: Math.max(...results.map((r) => Math.round(r.rtMs * 1000) / 1000)),
      medianMs: results.map((r) => Math.round(r.rtMs)).sort((x, y) => x - y)[Math.floor(results.length / 2)],
      fieldValues: {
        limitReq: tally(entries.map((e) => e.limitReq)),
        limitConn: tally(entries.map((e) => e.limitConn)),
        upstreamKinds: tally(entries.map((e) => e.upstream.kind)),
      },
    }),
  })
  experiments.push(e0)
  const toleranceMs = e0.observations.maxMs + 50

  // E1
  const e1 = await experiment('E1', {
    what: '12 concurrent requests, each held 2000 ms at the upstream',
    establishes: 'limit_conn alone: which requests it refuses, and what lreq reads on such a line',
    run: (prefix) => released(12, { prefix, path: '/api/e1', holdMs: 2000 }),
    observations: observeE1,
  })
  experiments.push(e1)

  // E2
  const e2 = await experiment('E2', {
    what: '80 requests over 4 keep-alive connections, each sent when the previous answer arrives, no hold',
    establishes: 'delayed forwarding with few connections, lconn on a delayed line, the arrival curve at the upstream',
    run: (prefix) => sequential(80, { prefix, path: '/api/e2', sockets: 4 }),
    observations: ({ entries, arrivals }) => observeE2({ entries, arrivals, api, toleranceMs }),
  })
  experiments.push(e2)

  // E3
  const e3 = await experiment('E3', {
    what: `${api.delay + 1} requests one after another on 1 connection, then 14 concurrent single-request connections, no hold`,
    establishes: 'whether a request delayed by limit_req is counted by limit_conn while it is delayed',
    run: async (prefix) => {
      const first = await sequential(api.delay + 1, { prefix: `${prefix}-a`, path: '/api/e3a', sockets: 1 })
      const second = await released(14, { prefix: `${prefix}-b`, path: '/api/e3b' })
      return [...first, ...second]
    },
    observations: ({ entries, arrivals }) => observeE3({ entries, arrivals, api, toleranceMs }),
  })
  experiments.push(e3)

  // E4
  const e4Parts = {}
  const e4 = await experiment('E4', {
    what: `${api.delay + 1} requests on 1 connection, then 40 concurrent single-request connections, no hold, then the same excess on one connection`,
    establishes: 'whether rejection by limit_req can be reached from one address, and what lconn reads on such a line',
    run: async (prefix) => {
      const first = await sequential(api.delay + 1, { prefix: `${prefix}-a`, path: '/api/e4a', sockets: 1 })
      e4Parts.a = first.map((r) => r.qaId)
      const concurrent = await released(40, { prefix: `${prefix}-b`, path: '/api/e4b' })
      e4Parts.b = concurrent.map((r) => r.qaId)
      // The same excess on a single connection, where limit_conn allows one
      // request at a time and cannot refuse anything: only limit_req can.
      const single = await sequential(api.burst + api.delay + 2, { prefix: `${prefix}-c`, path: '/api/e4c', sockets: 1 })
      e4Parts.c = single.map((r) => r.qaId)
      return [...first, ...concurrent, ...single]
    },
    observations: ({ entries }) => observeE4({ entries, parts: e4Parts }),
  })
  experiments.push(e4)

  // E5
  const e5Groups = []
  const e5HeldGroups = []
  const SIZES = [1, 5, 10, 11, 15, 21, 25]
  const releaseEachSize = async (prefix, groups, holdMs) => {
    const out = []
    for (const count of SIZES) {
      await drain()
      await clearArrivals()
      const results = await released(count, { prefix: `${prefix}-${count}`, path: '/api/e5', holdMs })
      await wait(FLUSH_WAIT_SECONDS)
      groups.push({
        count,
        entries: readEntries(results.map((r) => r.qaId)),
        arrivals: await readArrivals(),
      })
      out.push(...results)
    }
    return out
  }
  const e5 = await experiment('E5', {
    what: '1, 5, 10, 11, 15, 21 and 25 requests released at one instant on that many connections, each from a drained bucket, with no hold and then with each response held 500 ms',
    establishes: 'maxSimultaneousImmediate: the largest count the combined limits admitted with every request PASSED and every request reaching the upstream',
    run: async (prefix) => [
      ...(await releaseEachSize(`${prefix}-nohold`, e5Groups, 0)),
      ...(await releaseEachSize(`${prefix}-held`, e5HeldGroups, 500)),
    ],
    observations: () => observeE5({ groups: e5Groups, heldGroups: e5HeldGroups, toleranceMs }),
  })
  experiments.push(e5)

  const result = assemble({ confSha256, toleranceMs })
  const outPath = join(RIG_DIR, 'limiter-probe-result.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n')
  console.log(`wrote ${outPath}`)
}

// The recorded answers and states, each one either what was observed with the
// evidence for it, or unresolved.
function assemble({ confSha256, toleranceMs }) {
  const [e0, e1, e2, e3, e4, e5] = experiments
  // `detail` is the same claim as the finding, in a form code can read: which
  // handler runs when, and whether a delayed request is accounted while it
  // waits. A verification phase asserts a limiter's field only where the detail
  // says that handler ran, so these are derived from the observations and are
  // absent when the observation is not there.
  const established = (finding, evidence, detail = null) => ({ status: 'established', finding, evidence, detail })
  const unresolved = (why) => ({ status: 'unresolved', finding: '', evidence: [why] })

  const ORDER = [
    'src/http/ngx_http.c: ngx_http_init_phase_handlers() fills the phase engine with `for (j = cmcf->phases[i].handlers.nelts - 1; j >= 0; j--)`, so the handler registered last is the one run first',
    'auto/modules (release-1.30.0): the HTTP_LIMIT_CONN block precedes the HTTP_LIMIT_REQ block, so limit_conn registers first and limit_req runs first',
    'src/http/modules/ngx_http_limit_req_module.c: ngx_http_limit_req_init pushes ngx_http_limit_req_handler onto phases[NGX_HTTP_PREACCESS_PHASE].handlers',
    'src/http/modules/ngx_http_limit_conn_module.c: ngx_http_limit_conn_init pushes ngx_http_limit_conn_handler onto the same array',
  ]

  const orderObserved = e1.observations.observedAsSourceSays && e4.observations.observedAsSourceSays
  const handlerOrder = orderObserved
    ? established(
        'limit_req runs first and limit_conn second: a request refused by limit_conn has already been metered (lreq=PASSED), and a request refused by limit_req never reaches limit_conn at all (lconn="-")',
        [
          ...ORDER,
          `E1: ${e1.observations.refused} lines refused by limit_conn, all of them with lreq=${JSON.stringify(e1.observations.lreqOnConnRefused)}`,
          `E4: ${e4.observations.rejectedByLimitReq} lines refused by limit_req, all of them with lconn=${JSON.stringify(e4.observations.lconnOnReqRefused)}`,
        ],
        { limitReqFirst: true },
      )
    : unresolved(
        `the source says limit_req runs first, but the experiments did not agree: E1 limit_conn refusals ${e1.observations.refused} with lreq ${JSON.stringify(e1.observations.lreqOnConnRefused)}; E4 limit_req refusals ${e4.observations.rejectedByLimitReq} with lconn ${JSON.stringify(e4.observations.lconnOnReqRefused)}`,
      )

  const delayedCounted = e3.observations.observedAsSourceSays
    ? established(
        'a request delayed by limit_req is NOT counted by limit_conn while it is delayed: limit_req runs first and returns NGX_AGAIN, so limit_conn\'s handler is not reached until the delay has expired, by which time the limiter has already released the request at the configured rate',
        [
          ...ORDER,
          'src/http/modules/ngx_http_limit_req_module.c: a delayed request sets limit_req_status = DELAYED, write_event_handler = ngx_http_limit_req_delay, a timer, and returns NGX_AGAIN; ngx_http_limit_req_delay then resumes ngx_http_core_run_phases, where limit_req returns NGX_DECLINED because its status is set, so limit_conn runs next',
          `E3: ${e3.observations.delayed} of ${e3.observations.released} concurrent requests were delayed, ${e3.observations.connRefused} were refused by limit_conn, and the ${e3.observations.delayed} releases arrived ${JSON.stringify(e3.observations.releaseGapsMs)} ms apart against an expected ${e3.observations.expectedGapMs} ms`,
        ],
        { delayedCountedByLimitConn: false },
      )
    : unresolved(
        `E3 released ${e3.observations.released} concurrent requests with the excess above delay=${api.delay}: ${e3.observations.delayed} delayed, ${e3.observations.connRefused} refused by limit_conn, release gaps ${JSON.stringify(e3.observations.releaseGapsMs)} ms against an expected ${1000 / api.ratePerSecond} ms; the source says a delayed request is not accounted by limit_conn until its delay expires`,
      )

  const handlerRunsAfterOther = orderObserved
    ? established(
        'limit_conn runs on a request limit_req metered (including one it refused), and does not run at all on a request limit_req refused: lconn then reads "-", because ngx_http_limit_conn_status_variable returns not_found while limit_conn_status is 0. In the other direction limit_req has already run and passed on a request limit_conn refuses, so lreq reads PASSED.',
        [
          ...ORDER,
          'src/http/ngx_http_core_module.c: ngx_http_core_generic_phase finalizes the request when a phase handler returns a status code, which is what stops limit_conn from being reached after limit_req refuses',
          'src/http/modules/ngx_http_limit_conn_module.c: ngx_http_limit_conn_status_variable sets v->not_found while limit_conn_status is 0, so the log field writes "-"',
          `E1: ${e1.observations.refused} limit_conn refusals with lreq ${JSON.stringify(e1.observations.lreqOnConnRefused)}`,
          `E4: ${e4.observations.rejectedByLimitReq} limit_req refusals with lconn ${JSON.stringify(e4.observations.lconnOnReqRefused)}`,
          `E2: ${e2.observations.delayed} delayed lines with lconn ${JSON.stringify(e2.observations.lconnOnDelayed)}`,
        ],
        {
          // On a request limit_req refused, limit_conn's handler was reached or
          // it was not: E4's lines say. On a request limit_conn refused,
          // limit_req had already run: E1's lines say. On a request limit_req
          // delayed, limit_conn's handler runs once the delay expires: E2's
          // lines say.
          limitConnRunsOnMeteredRequests: e2.observations.delayed > 0 && e2.observations.lconnOnDelayed.PASSED === e2.observations.delayed,
          limitConnRunsWhenLimitReqRefused:
            e4.observations.rejectedByLimitReq > 0 && e4.observations.lconnOnReqRefused.PASSED === e4.observations.rejectedByLimitReq,
          limitReqRunsWhenLimitConnRefused:
            e1.observations.refused > 0 && e1.observations.lreqOnConnRefused.PASSED === e1.observations.refused,
        },
      )
    : unresolved(
        `one of the two directions was not observed: limit_conn refusals ${e1.observations.refused} (lreq ${JSON.stringify(e1.observations.lreqOnConnRefused)}), limit_req refusals ${e4.observations.rejectedByLimitReq} (lconn ${JSON.stringify(e4.observations.lconnOnReqRefused)})`,
      )

  const answers = { handlerOrder, delayedCountedByLimitConn: delayedCounted, handlerRunsAfterOther }

  const immediateObserved = e5.observations.maxSimultaneousImmediate > 0
  const immediate = classifyState({
    observed: immediateObserved,
    maxSimultaneousImmediate: e5.observations.maxSimultaneousImmediate,
    evidence: [
      `E5 released 1, 5, 10, 11, 15, 21 and 25 at one instant, each from a drained bucket; with every response held 500 ms so that they are in flight together, the largest count all PASSED and all reaching the upstream was ${e5.observations.maxSimultaneousImmediate}`,
      ...e5.observations.held.perSize.map((g) => `E5 held ${g.count}: ${g.logLines} lines, ${g.refusedByConn} refused by limit_conn, ${g.refusedByReq} refused by limit_req, ${g.arrivals} arrivals`),
      ...e5.observations.noHold.perSize.map((g) => `E5 no hold ${g.count}: ${g.logLines} lines, ${g.refusedByConn} refused by limit_conn, ${g.arrivals} arrivals over ${g.arrivalSpanMs} ms`),
      `E0 unthrottled round-trip baseline: max ${e0.observations.maxMs} ms, so a release is "at one instant" within ${Math.round(toleranceMs)} ms of its first arrival`,
    ],
    answers,
  })

  const delayedObserved = e2.observations.delayed > 0
  const delayed = classifyState({
    observed: delayedObserved,
    evidence: [
      `E2 sent 80 requests over 4 keep-alive connections: ${e2.observations.nonDelayed} not delayed, ${e2.observations.delayed} with lreq=DELAYED, lconn on those lines ${JSON.stringify(e2.observations.lconnOnDelayed)}`,
      `the k-th delayed arrival followed the first by ${e2.observations.curveAccepted ? 'k / rate within tolerance' : 'a curve that did not match k / rate'}`,
    ],
    answers,
  })

  const rejectedByLimitReq = classifyState({
    observed: e4.observations.rejectedByLimitReq > 0,
    evidence: [
      `E4 released ${e4.sent} requests in three parts (${JSON.stringify(e4.observations.perPart)})`,
      `${e4.observations.rejectedByLimitReq} lines read lreq=REJECTED, with lconn ${JSON.stringify(e4.observations.lconnOnReqRefused)}`,
      `the error log's own refusals for the run: ${e4.errorLogRefusals.length}`,
    ],
    answers,
  })

  const rejectedByLimitConn = classifyState({
    observed: e1.observations.refused > 0,
    evidence: [
      `E1 released 12 concurrent requests held 2000 ms: ${e1.observations.admitted} admitted, ${e1.observations.refused} refused with lconn=REJECTED`,
      `the error log's own refusals for the run: ${e1.errorLogRefusals.length}`,
    ],
    answers,
  })

  return {
    nginxVersion: rig.nginxVersion,
    nginxConfigureArgs: rig.nginxConfigureArgs,
    confSha256,
    recordedAt: new Date().toISOString(),
    rig: { baseUrl: rig.baseUrl, image: rig.image ?? null, confPath: rig.confPath ?? null },
    api,
    toleranceMs: Math.round(toleranceMs),
    answers,
    states: { immediate, delayed, rejectedByLimitReq, rejectedByLimitConn },
    experiments,
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  main().catch((err) => {
    console.error('probe error:', err)
    process.exit(1)
  })
}
