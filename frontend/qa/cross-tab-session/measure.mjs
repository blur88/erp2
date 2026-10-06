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
//   M3  the adapter's reads in the running app         blocking p95 <= 10 ms (one tab), <= 20 ms (four)
//   M4  what one request waits for the gate            blocking p95 <= 10 ms (one tab), <= 20 ms (four)
//   M5  page-level aggregate estimate                  none: diagnostic only
//
// Each blocking figure is the MEDIAN p95 of three repetitions, so one slow
// run does not decide the outcome. Maxima and p99 are recorded for every
// measurement and never block.
//
// Writes <scratch>/results-latency.json; exits non-zero if a blocking
// threshold is exceeded or a blocking measurement has no samples.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run, pageFetch, readStored, showsSignedInUi } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { median, summary } from './lib/stats.mjs'

export { peakDemand } from './lib/stats.mjs'

const READS = 500
const BLOCKING_REPETITIONS = 3
const PAGE_REPETITIONS = 5
const THRESHOLDS_MS = { M1: 5, M2: 15, M3: { oneTab: 10, fourTabs: 20 }, M4: { oneTab: 10, fourTabs: 20 } }
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

/** Median of the per-repetition p95s, with the repetitions shown. */
function blockingFigure(repetitions, limit) {
  const used = repetitions.slice(0, BLOCKING_REPETITIONS)
  const stats = used.map(summary)
  const p95s = stats.map((s) => s.p95).filter((v) => v !== null)
  const medianP95 = p95s.length === used.length && used.length === BLOCKING_REPETITIONS ? round3(median(p95s)) : null
  return {
    repetitions: stats,
    medianP95Ms: medianP95,
    thresholdMs: limit,
    pass: medianP95 !== null && medianP95 <= limit,
    reason: medianP95 === null ? 'no samples in at least one repetition' : undefined,
    maxMs: round3(Math.max(0, ...stats.map((s) => s.max ?? 0))),
    p99Ms: stats.map((s) => s.p99),
  }
}

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
    variants[name] = {
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
    rule: `Each blocking figure is the median p95 of ${BLOCKING_REPETITIONS} repetitions. Maxima and p99 are recorded and never block.`,
    M1: { what: `one raw read, one tab idle; ${READS} sequential read-only transactions per repetition`, ...blockingFigure(m1, THRESHOLDS_MS.M1) },
    M2: {
      what: `one raw read in four tabs at once (${READS} each per repetition) while a fifth tab commits a write every 100 ms`,
      ...blockingFigure(m2, THRESHOLDS_MS.M2),
      writer: writerCommits,
    },
    M3: {
      what: "the adapter's own `read` timings while the dashboard, the products list and a sales order load",
      oneTab: blockingFigure(variants.oneTab.reads, THRESHOLDS_MS.M3.oneTab),
      fourTabs: blockingFigure(variants.fourTabs.reads, THRESHOLDS_MS.M3.fourTabs),
      transactTimings: { oneTab: variants.oneTab.transacts, fourTabs: variants.fourTabs.transacts },
    },
    M4: {
      what: 'per request, gate-before + gate-after: wall time added to that request, queueing included',
      oneTab: { ...blockingFigure(variants.oneTab.gates, THRESHOLDS_MS.M4.oneTab), pairing: variants.oneTab.pairing, inFlight: variants.oneTab.inFlight },
      fourTabs: { ...blockingFigure(variants.fourTabs.gates, THRESHOLDS_MS.M4.fourTabs), pairing: variants.fourTabs.pairing, inFlight: variants.fourTabs.inFlight },
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
  const blocking = [
    ['M1', latency.M1],
    ['M2', latency.M2],
    ['M3 one tab', latency.M3.oneTab],
    ['M3 four tabs', latency.M3.fourTabs],
    ['M4 one tab', latency.M4.oneTab],
    ['M4 four tabs', latency.M4.fourTabs],
  ]
  latency.maximaAbove100Ms = blocking.filter(([, f]) => f.maxMs > 100).map(([name, f]) => `${name}: max ${f.maxMs} ms`)
  latency.blockingFailures = blocking
    .filter(([, f]) => !f.pass)
    .map(([name, f]) => `${name}: ${f.reason ?? `median p95 ${f.medianP95Ms} ms over the ${f.thresholdMs} ms threshold`}`)
  latency.pass = latency.blockingFailures.length === 0
  latency.signInWaits = run.signInWaits

  await ctx.close()
  await browser.close()

  const out = join(config.scratch, 'results-latency.json')
  writeFileSync(out, JSON.stringify(latency, null, 2))
  for (const [name, f] of blocking) {
    console.log(`  ${f.pass ? 'ok  ' : 'FAIL'} ${name}: median p95 ${f.medianP95Ms} ms (threshold ${f.thresholdMs}), max ${f.maxMs} ms`)
  }
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
