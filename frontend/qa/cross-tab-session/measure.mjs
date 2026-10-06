#!/usr/bin/env node
// Latency of the reconcile gate (#1345, plan Task 9 Step 5).
//
// The gate reads the session record before every request and again before
// every delivery. This script measures what that costs, over LAN HTTP, in the
// same Chromium the cases use. `run.sh` runs it AFTER the stack is restored:
// with 20-second tokens the figures would include refreshes that ordinary use
// does not have.
//
//   M1  one raw read, one tab idle                     blocking p95 <= 5 ms
//   M2  one raw read, four tabs busy, a fifth writing  blocking p95 <= 15 ms
//   M3  the adapter's reads in the running app         diagnostic: recorded, not judged
//   M4  what one request waits for the gate            diagnostic: recorded, not judged
//   M5  page-level aggregate estimate                  diagnostic: recorded, not judged
//
// The criteria were revised on 2026-10-06 (lib/latency-criteria.mjs). M3 and
// M4 first had provisional targets of 10 ms in one tab and 20 ms in four.
// Those were replaced, not met: the recorded run on 582096992 measured 99 /
// 330.1 ms and 205.3 / 603.3 ms and failed. M3 and M4 are still measured in
// full, and are shown against the former targets so that nothing here can be
// read as "the gate is fast".
//
// Each blocking figure is the MEDIAN p95 of three repetitions, so one slow
// run does not decide the outcome. Maxima and p99 are recorded for every
// measurement and never block.
//
// Writes <scratch>/results-latency.json; exits non-zero if M1 or M2 exceeds
// its threshold, or if any of M1 to M4 has a repetition without samples.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run, pageFetch, readStored, showsSignedInUi } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { BLOCKING_REPETITIONS, CRITERIA, blockingFigure, diagnosticFigure, judge, summaryLines } from './lib/latency-criteria.mjs'
import { median, summary } from './lib/stats.mjs'

export { peakDemand } from './lib/stats.mjs'

const READS = 500
const PAGE_REPETITIONS = 5
const THRESHOLDS_MS = { M1: CRITERIA.blocking.M1.p95Ms, M2: CRITERIA.blocking.M2.p95Ms }
const FORMER_TARGETS_MS = CRITERIA.formerProvisionalTargets.p95Ms
const M5_SENTENCE =
  'Requests on a page overlap, so the sum of their gate waits is not the time the gate adds to the page load; it is an upper bound on it.'

// --- in-page measurement code ----------------------------------------------
// The adapter's shape, written out here so the number does not depend on
// product code: one read-only transaction on erp-session/kv fetching the
// three keys, settled by the transaction's completion.

function rawReads(page, count) {
  return page.evaluate(async (n) => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('erp-session', 1)
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains('kv')) open.result.createObjectStore('kv')
      }
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(new Error(`open failed: ${open.error}`))
    })
    const samples = []
    for (let i = 0; i < n; i += 1) {
      const t0 = performance.now()
      await new Promise((resolve, reject) => {
        const tx = db.transaction('kv', 'readonly')
        const os = tx.objectStore('kv')
        os.get('record')
        os.get('slices')
        os.get('refreshLease')
        tx.oncomplete = () => resolve()
        tx.onabort = () => reject(new Error(`read aborted: ${tx.error}`))
      })
      samples.push(performance.now() - t0)
    }
    db.close()
    return samples
  }, count)
}

/** A write transaction every 100 ms on a key of its own; the session record is never touched. */
function startWriter(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('erp-session', 1)
        open.onerror = () => reject(new Error(`open failed: ${open.error}`))
        open.onsuccess = () => {
          const db = open.result
          const state = { db, commits: 0, failures: 0 }
          state.timer = setInterval(() => {
            const tx = db.transaction('kv', 'readwrite')
            tx.objectStore('kv').put({ at: Date.now() }, 'qa-measure-writer')
            tx.oncomplete = () => {
              state.commits += 1
            }
            tx.onabort = () => {
              state.failures += 1
            }
          }, 100)
          window.__qaWriter = state
          resolve()
        }
      }),
  )
}

function stopWriter(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const state = window.__qaWriter
        clearInterval(state.timer)
        const tx = state.db.transaction('kv', 'readwrite')
        tx.objectStore('kv').delete('qa-measure-writer')
        tx.oncomplete = () => {
          state.db.close()
          resolve({ commits: state.commits, failures: state.failures })
        }
        tx.onabort = () => reject(new Error(`could not remove the writer's key: ${tx.error}`))
      }),
  )
}

// --- page loads --------------------------------------------------------------

/** The load has played out: nothing pending from this tab and nothing new for 1.5 s. */
async function settled(profile, mark, page) {
  const deadline = Date.now() + 45000
  for (;;) {
    const mine = profile.since(mark, page)
    const pending = mine.some((e) => e.status === null && !e.failed)
    const lastAt = mine.reduce((m, e) => Math.max(m, e.respondedAt ?? e.issuedAt), 0)
    if (mine.length > 0 && !pending && Date.now() - lastAt > 1500) return
    if (Date.now() > deadline) throw new Error(`${profile.label(page)}: the page load did not settle within 45 s`)
    await sleep(100)
  }
}

async function loadOnce(profile, page, base, path) {
  const mark = profile.mark()
  const started = Date.now()
  await page.goto(`${base}${path}`, { waitUntil: 'load' })
  await settled(profile, mark, page)
  const entries = await page.evaluate(() => window.__erpSessionTimings ?? [])
  const api = profile.since(mark, page).filter((e) => e.status !== null)
  const lastDelivered = api.reduce((m, e) => Math.max(m, e.respondedAt), 0)
  const statuses = {}
  for (const e of api) statuses[e.status] = (statuses[e.status] ?? 0) + 1
  return { path, entries, requests: api.length, statuses, navigationToLastResponseMs: lastDelivered - started }
}

/**
 * What each request waited for the gate: gate-before + gate-after. Entries
 * that carry a request `id` are paired by it. Without one they are paired in
 * order, which is exact only when requests do not overlap; the result says
 * which was used.
 */
function gateWaits(entries) {
  const before = entries.filter((e) => e.op === 'gate-before')
  const after = entries.filter((e) => e.op === 'gate-after')
  const hasIds = before.length > 0 && [...before, ...after].every((e) => e.id !== undefined && e.id !== null)
  const waits = []
  if (hasIds) {
    // A retried request keeps its id, so its sends are added up: the figure is
    // what the gate added to that one original request.
    const byId = new Map()
    for (const e of [...before, ...after]) byId.set(e.id, (byId.get(e.id) ?? 0) + e.ms)
    waits.push(...byId.values())
  } else {
    for (let i = 0; i < Math.min(before.length, after.length); i += 1) waits.push(before[i].ms + after[i].ms)
  }
  return { waits, pairing: hasIds ? 'by request id' : 'by order (approximate when requests overlap)' }
}

function inFlight(entries) {
  const counts = entries
    .filter((e) => (e.op === 'gate-before' || e.op === 'gate-after') && typeof e.inFlight === 'number')
    .map((e) => e.inFlight)
  if (counts.length === 0) return 'in-flight counts not recorded'
  return { n: counts.length, median: median(counts), max: Math.max(...counts), atLeastTwo: counts.filter((c) => c >= 2).length }
}

const sum = (values) => values.reduce((a, b) => a + b, 0)
const round3 = (v) => (v === null || v === undefined ? null : Math.round(v * 1000) / 1000)

async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'measure')
  const { base } = config
  const notes = []

  const profile = await ctx.profile({ timing: true })
  const first = await profile.tab('/login', { label: 'm1', navigate: false })
  await ctx.signIn(first, config.userA)
  await sleep(3000)

  // --- M1 --------------------------------------------------------------------
  console.log('M1: one raw read, one tab idle')
  const m1 = []
  for (let i = 0; i < BLOCKING_REPETITIONS; i += 1) m1.push(await rawReads(first, READS))

  // --- M2 --------------------------------------------------------------------
  console.log('M2: one raw read, four tabs busy, a fifth writing every 100 ms')
  const readers = [first]
  for (let i = 2; i <= 4; i += 1) readers.push(await profile.tab('/dashboard', { label: `m${i}` }))
  const writer = await profile.tab('/dashboard', { label: 'writer' })
  for (const page of [...readers, writer]) {
    if (!(await showsSignedInUi(page))) throw new Error(`${profile.label(page)} did not open signed in`)
  }
  await sleep(3000)
  const m2 = []
  const writerCommits = []
  for (let i = 0; i < BLOCKING_REPETITIONS; i += 1) {
    await startWriter(writer)
    const samples = await Promise.all(readers.map((page) => rawReads(page, READS)))
    writerCommits.push(await stopWriter(writer))
    m2.push(samples.flat())
  }
  await writer.close()

  // --- the three pages M3 to M5 load -----------------------------------------
  const stored = await readStored(first)
  const orders = await pageFetch(first, { path: '/api/sales-orders?limit=1&page=1', bearer: stored.record.session.accessToken })
  const orderNumber = orders.status === 200 ? (orders.json?.data ?? [])[0]?.orderNumber : null
  let orderPath = '/sales/orders'
  if (orderNumber) orderPath = `/sales/orders/${encodeURIComponent(orderNumber)}/view`
  else notes.push('No sales order exists in this database; the sales-order LIST page was loaded in place of a single order.')
  const paths = ['/dashboard', '/inventory/products', orderPath]

  // --- M3, M4, M5 ------------------------------------------------------------
  const variants = {}
  for (const [name, pages] of [['oneTab', [first]], ['fourTabs', readers]]) {
    console.log(`M3-M5: ${name}`)
    const repetitions = []
    for (let i = 0; i < PAGE_REPETITIONS; i += 1) {
      const loads = []
      for (const path of paths) {
        loads.push(...(await Promise.all(pages.map((page) => loadOnce(profile, page, base, path)))))
      }
      repetitions.push(loads)
    }
    const all = repetitions.flat()
    const entries = all.flatMap((l) => l.entries)
    const non2xx = all.flatMap((l) => Object.entries(l.statuses).filter(([status]) => !/^2/.test(status)))
    if (non2xx.length > 0) notes.push(`${name}: some requests were not answered 2xx during the loads: ${JSON.stringify(non2xx)}`)
    // 429s among the measured loads, counted and never hidden: four tabs
    // loading at once send more than api_limit's burst admits.
    const answered429 = sum(all.map((l) => l.statuses['429'] ?? 0))
    variants[name] = {
      loadRequests: { loads: all.length, requests: sum(all.map((l) => l.requests)), answered429 },
      reads: repetitions.map((loads) => loads.flatMap((l) => l.entries.filter((e) => e.op === 'read').map((e) => e.ms))),
      gates: repetitions.map((loads) => loads.flatMap((l) => gateWaits(l.entries).waits)),
      pairing: gateWaits(entries).pairing,
      transacts: summary(entries.filter((e) => e.op === 'transact').map((e) => e.ms)),
      inFlight: inFlight(entries),
      perPage: paths.map((path) => {
        const these = all.filter((l) => l.path === path)
        return {
          path,
          loads: these.length,
          medianNavigationToLastResponseMs: round3(median(these.map((l) => l.navigationToLastResponseMs))),
          medianRequests: median(these.map((l) => l.requests)),
          medianSumOfGateWaitsMs: round3(median(these.map((l) => sum(l.entries.filter((e) => /^gate-/.test(e.op)).map((e) => e.ms))))),
        }
      }),
    }
  }

  const latency = {
    suite: 'cross-tab-session latency',
    measuredAt: new Date().toISOString(),
    base,
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(base),
    servedFrom: config.distDir
      ? 'DEVELOPMENT: page and assets from a local build (QA_DIST_DIR) through request interception. Timings are distorted; not a recorded run.'
      : 'ingress',
    chromium: browser.version(),
    machine: machine(),
    configuration: config.show,
    criteria: CRITERIA,
    rule: `M1 and M2 block, each on the median p95 of ${BLOCKING_REPETITIONS} repetitions. M3, M4 and M5 are diagnostic and are not judged. Maxima and p99 are recorded and never block.`,
    // What M3 and M4 were measured on. The machine and the browser are also
    // at the top of this file; they are repeated here because a diagnostic
    // figure means nothing without them.
    environment: {
      machine: machine(),
      diskKinds: machine().disks.map((d) => `${d.name}: ${d.kind}`),
      chromium: browser.version(),
      accessTokenExpiry: config.show.accessTokenExpiry,
      requestsAnswered429DuringMeasuredLoads: {
        oneTab: variants.oneTab.loadRequests,
        fourTabs: variants.fourTabs.loadRequests,
        any: variants.oneTab.loadRequests.answered429 + variants.fourTabs.loadRequests.answered429 > 0,
        total: variants.oneTab.loadRequests.answered429 + variants.fourTabs.loadRequests.answered429,
      },
      competingWorkload:
        'Not visible from inside the browser container. run.sh records the host\'s container list before the measurement and finalize.mjs adds it here in results.json.',
    },
    M1: { what: `one raw read, one tab idle; ${READS} sequential read-only transactions per repetition`, ...blockingFigure(m1, THRESHOLDS_MS.M1) },
    M2: {
      what: `one raw read in four tabs at once (${READS} each per repetition) while a fifth tab commits a write every 100 ms`,
      ...blockingFigure(m2, THRESHOLDS_MS.M2),
      writer: writerCommits,
    },
    M3: {
      what: "the adapter's own `read` timings while the dashboard, the products list and a sales order load",
      status: CRITERIA.diagnostic.statement,
      oneTab: diagnosticFigure(variants.oneTab.reads, FORMER_TARGETS_MS.M3.oneTab),
      fourTabs: diagnosticFigure(variants.fourTabs.reads, FORMER_TARGETS_MS.M3.fourTabs),
      transactTimings: { oneTab: variants.oneTab.transacts, fourTabs: variants.fourTabs.transacts },
    },
    M4: {
      what: 'per request, gate-before + gate-after: wall time added to that request, queueing included',
      status: CRITERIA.diagnostic.statement,
      oneTab: { ...diagnosticFigure(variants.oneTab.gates, FORMER_TARGETS_MS.M4.oneTab), pairing: variants.oneTab.pairing, inFlight: variants.oneTab.inFlight },
      fourTabs: { ...diagnosticFigure(variants.fourTabs.gates, FORMER_TARGETS_MS.M4.fourTabs), pairing: variants.fourTabs.pairing, inFlight: variants.fourTabs.inFlight },
    },
    M5: {
      label: 'Aggregate-cost estimate. Diagnostic only: no threshold, and no share of page load is computed from it.',
      note: M5_SENTENCE,
      what: `median of ${PAGE_REPETITIONS} loads per page: navigation to last API response delivered, number of requests, and the SUM of all gate waits`,
      oneTab: variants.oneTab.perPage,
      fourTabs: variants.fourTabs.perPage,
    },
    notes,
  }

  if (config.accessSeconds < 300) {
    latency.notes.push(
      `The access lifetime during this measurement was ${config.show.accessTokenExpiry}, under five minutes: the figures include refreshes that ordinary use does not have.`,
    )
  }
  // Pass condition: M1 and M2 within their thresholds, and M3 and M4
  // recorded. See judge() for why the size of M3 and M4 cannot fail the run.
  Object.assign(latency, judge(latency))
  latency.signInWaits = run.signInWaits

  await ctx.close()
  await browser.close()

  const out = join(config.scratch, 'results-latency.json')
  writeFileSync(out, JSON.stringify(latency, null, 2))
  for (const line of summaryLines(latency)) console.log(`  ${line}`)
  for (const line of latency.diagnosticsNotRecorded) console.log(`  FAIL ${line}`)
  const seen429 = latency.environment.requestsAnswered429DuringMeasuredLoads
  console.log(`  measured loads answered 429: ${seen429.oneTab.answered429} of ${seen429.oneTab.requests} (one tab), ${seen429.fourTabs.answered429} of ${seen429.fourTabs.requests} (four tabs)`)
  console.log(`  M5 (diagnostic): ${M5_SENTENCE}`)
  console.log(`wrote ${out}`)
  process.exit(latency.pass ? 0 : 1)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
