#!/usr/bin/env node
// The capture feasibility run (#1353, Task 2 Step 5): 200 identified requests
// through the ingress, inside one upstream capture segment, then the question
// whether the browser's record, the ingress log and the capture agree request
// by request.
//
// It validates the evidence pipeline and nothing else. It does not exercise the
// expiry case the pipeline is later used for, and a pass here says nothing
// about that case.
//
// Run by capture-feasibility.sh, in the Playwright container, against the QA
// stack. Writes <scratch>/capture-feasibility.json and exits non-zero unless
// the record passes (lib/feasibility.mjs).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT, launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run, fingerprint, pageFetch, readStored } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { captureSegment } from './lib/probe.mjs'
import { captureUsable, correlate } from './lib/capture-evidence.mjs'
import { windowBetween } from './lib/ingress-log.mjs'
import { FEASIBILITY_PLAN, judgeFeasibility } from './lib/feasibility.mjs'

const { parseLine } = await import(pathToFileURL(join(REPO_ROOT, 'nginx/access-log.mjs')).href)

const ROUTE = '/api/settings/regional' // a read every role may make
const SEGMENT = 'feasibility'
const START = 'feasibility-start'
const END = 'feasibility-end'
const GARBAGE_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.not-a-real-token.signature'

const messageOf = (response) => {
  const m = response?.json?.message
  return typeof m === 'string' ? m : m && typeof m.text === 'string' ? m.text : null
}

async function storedSession(page) {
  const stored = await readStored(page)
  const session = stored?.record?.session ?? null
  if (!session) throw new Error('the profile holds no stored session')
  return session
}

async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'feasibility')
  const plan = FEASIBILITY_PLAN
  const out = join(config.scratch, 'capture-feasibility.json')

  const record = {
    what: 'capture feasibility: does the evidence pipeline record what happened. Not a validation of the expiry case.',
    startedAt: new Date().toISOString(),
    base: config.base,
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    chromium: browser.version(),
    machine: machine(),
    configurationDuring: config.show,
    apiLimit: zones.api ? { rate: zones.api.rateText, burst: zones.api.burst } : null,
    plan,
  }

  let exit = 1
  try {
    // Both ways a request gets its identifier are in use: the ones this script
    // names itself, and the harness's own for anything else the profile sends.
    const profile = await ctx.profile({ intercept: true, tagRequests: true })
    const page = await profile.tab('/login', { label: 'holder', navigate: false })
    await ctx.signIn(page, config.userC)
    const first = await storedSession(page)
    // A static document of the same origin from here on: it runs no
    // application code, so every API request in the segment is one of the 200.
    await page.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })

    // An access token that has really expired: the first one, once its
    // lifetime is over. Then a current one, by refreshing.
    const untilExpired = first.accessTokenExpiresAt * 1000 + 1500 - Date.now()
    if (untilExpired > 0) await sleep(untilExpired)
    const refreshed = await pageFetch(page, { method: 'POST', path: '/api/auth/refresh', qaId: 'pre-refresh', body: { refreshToken: first.refreshToken } })
    const tokens = refreshed.json?.data ?? refreshed.json
    if (refreshed.status < 200 || refreshed.status >= 300 || typeof tokens?.accessToken !== 'string') {
      throw new Error(`the refresh before the run was answered ${refreshed.status}`)
    }
    const current = tokens.accessToken
    const expired = first.accessToken
    record.tokens = {
      currentFingerprint: fingerprint(current),
      expiredFingerprint: fingerprint(expired),
      garbageFingerprint: fingerprint(GARBAGE_TOKEN),
      currentLifetimeLeftMsAtStart: tokens.accessTokenExpiresAt * 1000 - Date.now(),
    }

    // The limiter's bucket is empty before the first request.
    await sleep(zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst) * 1000)

    const mark = profile.mark()
    const answers = { expired: [], garbage: [] }
    let n = 0
    const id = (group) => `fz-${group}-${String((n += 1)).padStart(3, '0')}`
    const padding = { 'X-QA-Padding': 'x'.repeat(plan.paddingBytes) }

    const capture = await captureSegment(config, SEGMENT, async () => {
      await pageFetch(page, { path: '/manifest.json', qaId: START })
      // Reused connections: one request at a time.
      for (let i = 0; i < plan.sequential; i += 1) await pageFetch(page, { path: ROUTE, qaId: id('seq'), bearer: current })
      // Concurrent traffic, enough of it that the limiter delays.
      for (let b = 0; b < plan.bursts; b += 1) {
        await Promise.all(Array.from({ length: plan.burstSize }, () => pageFetch(page, { path: ROUTE, qaId: id('burst'), bearer: current })))
      }
      // Requests meant to span several frames.
      for (let i = 0; i < plan.padded; i += 1) await pageFetch(page, { path: ROUTE, qaId: id('pad'), bearer: current, headers: padding })
      // Authentication errors, with what the backend said.
      for (let i = 0; i < plan.expired; i += 1) answers.expired.push(await pageFetch(page, { path: ROUTE, qaId: id('expired'), bearer: expired }))
      for (let i = 0; i < plan.garbage; i += 1) answers.garbage.push(await pageFetch(page, { path: ROUTE, qaId: id('garbage'), bearer: GARBAGE_TOKEN }))
      await pageFetch(page, { path: '/manifest.json', qaId: END })
      // The ingress writes its log once a second.
      await sleep(2500)
    })
    record.currentLifetimeLeftMsAtEnd = tokens.accessTokenExpiresAt * 1000 - Date.now()

    // ---- the three sources ---------------------------------------------------
    const browserEntries = profile.since(mark).filter((e) => e.qaId && String(e.qaId).startsWith('fz-'))
    const harnessNamed = profile.since(mark).filter((e) => e.qaId && String(e.qaId).startsWith('app-'))
    const ingressAll = config.ingressLog && existsSync(config.ingressLog) ? readFileSync(config.ingressLog, 'utf8').split('\n').map(parseLine).filter(Boolean) : null
    const window = ingressAll ? windowBetween(ingressAll, START, END) : null
    const ingressEntries = window ? window.entries : []
    const { matched, problems } = correlate(browserEntries, ingressEntries, capture)

    const fingerprintMismatches = []
    const statusMismatches = []
    for (const m of matched) {
      const b = browserEntries.find((e) => e.qaId === m.qaId)
      const i = ingressEntries.find((e) => e.qaId === m.qaId)
      const c = capture.requests.get(m.qaId)
      if (b.token !== c.tokenFingerprint) fingerprintMismatches.push({ qaId: m.qaId, browser: b.token, capture: c.tokenFingerprint })
      if (b.status !== i.status || b.status !== c.status) statusMismatches.push({ qaId: m.qaId, browser: b.status, ingress: i.status, capture: c.status })
    }

    const captured = browserEntries.map((e) => capture.requests.get(e.qaId)).filter(Boolean)
    const perStream = new Map()
    for (const c of captured) perStream.set(c.stream, (perStream.get(c.stream) ?? 0) + 1)
    const reused = [...perStream.values()].filter((count) => count > 1)
    const ours = ingressEntries.filter((e) => e.qaId && e.qaId.startsWith('fz-'))
    const usable = captureUsable(capture, 0, Number.MAX_SAFE_INTEGER)

    Object.assign(record, {
      sent: browserEntries.length,
      matched: matched.length,
      problems,
      fingerprintMismatches,
      statusMismatches,
      categories: {
        reusedStreams: reused.length,
        requestsOnReusedStreams: reused.reduce((sum, count) => sum + count, 0),
        upstreamStreams: perStream.size,
        delayed: ours.filter((e) => e.limitReq === 'DELAYED').length,
        refusedByIngress: ours.filter((e) => e.status === 429).length,
        multiFrame: captured.filter((c) => c.frameCount > 1).length,
        multiFrameAmongPadded: captured.filter((c) => c.frameCount > 1 && c.qaId.startsWith('fz-pad-')).length,
        status2xx: browserEntries.filter((e) => e.status >= 200 && e.status < 300).length,
        status401: browserEntries.filter((e) => e.status === 401).length,
        otherStatuses: [...new Set(browserEntries.map((e) => e.status).filter((s) => !(s >= 200 && s < 300) && s !== 401))],
      },
      authenticationErrors: {
        expired: [...new Set(answers.expired.map((a) => `${a.status} ${messageOf(a)}`))],
        garbage: [...new Set(answers.garbage.map((a) => `${a.status} ${messageOf(a)}`))],
      },
      // Requests the profile sent in the segment that this script did not name.
      harnessNamedRequests: harnessNamed.map((e) => `${e.qaId} ${e.method} ${e.path} ${e.status}`),
      ingress: { available: ingressAll !== null, windowFound: window !== null, clientAddr: window?.clientAddr ?? null, linesInWindow: ingressEntries.length },
      capture: {
        usable: usable.usable,
        why: usable.why,
        health: capture.health,
        invalid: capture.invalid,
        requests: capture.requests.size,
        stopError: capture.stopError,
        failure: capture.failure ? String(capture.failure.message ?? capture.failure) : null,
      },
    })
    record.judgement = judgeFeasibility(record)
    exit = record.judgement.verdict === 'pass' ? 0 : 1
  } catch (err) {
    record.error = err && err.stack ? err.stack : String(err)
    record.judgement = { verdict: 'fail', failures: [{ check: 'the run completed', detail: String(err && err.message ? err.message : err) }] }
  } finally {
    try {
      await ctx.close()
    } catch {
      // closing the profile cannot change what was recorded
    }
    await browser.close()
  }

  record.finishedAt = new Date().toISOString()
  writeFileSync(out, JSON.stringify(record, null, 2))
  console.log(`capture feasibility: ${record.judgement.verdict}`)
  for (const f of record.judgement.failures) console.log(`  FAILED ${f.check}: ${f.detail}`)
  if (record.categories) console.log(`  sent ${record.sent}, matched ${record.matched}, categories ${JSON.stringify(record.categories)}`)
  console.log(`wrote ${out}`)
  process.exit(exit)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
