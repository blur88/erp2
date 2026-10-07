#!/usr/bin/env node
// Where the reconcile gate's time goes (#1345). Diagnostic only: no threshold,
// no pass or fail, and nothing here is a recorded run.
//
// measure.mjs says how long the gate takes. This script says which layer the
// time is spent in, by recording, while the same three pages load:
//
//   - every transaction on erp-session/kv with the time of each of its events
//     (created, each request's success, complete), so a read splits into
//     "until the first result" / "between results" / "last result to complete";
//   - main-thread delay: a 4 ms timer's lateness, long tasks, long animation
//     frames;
//   - raw reads on the main thread and from a worker during the load (variant
//     `probed`): the worker's do not wait for the page's main thread;
//   - the application's own gate timings, each stamped with its end time.
//
// The other variants are SIMULATIONS made in the page by the script, with
// product code unchanged, to size a change before anyone writes it:
//   memoryReads      reads answered from a copy in the page. A baseline for
//                    scale only: the spec forbids resolving the gate from memory.
//   settleOnSuccess  a read settles when its last request succeeded instead of
//                    on the transaction's `complete` event.
//   noWrites         the page's writes (the persisted-slices write of each
//                    load) do not happen, so no read queues behind them.
//   coalesce         reads asked within 1 ms share one read (optimistic).
//   lean             one key instead of three + settleOnSuccess + noWrites.
//   leanCoalesce     lean + coalesce: every candidate that keeps the gate.
//
//   QA_DIAG_VARIANTS  comma-separated; default: all of them
//   QA_DIAG_REPS      loads of each page per variant; default 3
//   QA_DIAG_TABS      comma-separated tab counts; default 1,4
//
// Writes <scratch>/results-diagnose.json (summary) and diagnose-raw.json.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run, pageFetch, readStored, showsSignedInUi } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { median, summary } from './lib/stats.mjs'
import {
  DIAG_MODE_KEY,
  WORKER_PATH,
  WORKER_SOURCE,
  collect,
  diagInit,
  experimentIdlePhases,
  experimentReadBehindWrite,
  experimentReadWhileBlocked,
} from './lib/diag-page.mjs'

const VARIANT_MODES = {
  observe: '',
  probed: 'rawMain,rawWorker',
  memoryReads: 'memoryReads',
  settleOnSuccess: 'settleOnSuccess',
  noWrites: 'noWrites',
  coalesce: 'coalesce',
  lean: 'oneKey,settleOnSuccess,noWrites',
  leanCoalesce: 'oneKey,settleOnSuccess,noWrites,coalesce',
}

const round = (v) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10)
const sum = (values) => values.reduce((a, b) => a + b, 0)

// --- analysis (pure; exported for the test) ----------------------------------

/** Length of [a0, a1] covered by the union of `intervals` ([start, end] pairs). */
export function coveredBy(a0, a1, intervals) {
  const clipped = intervals
    .map(([s, e]) => [Math.max(s, a0), Math.min(e, a1)])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let reach = -Infinity
  for (const [s, e] of clipped) {
    if (e <= reach) continue
    total += e - Math.max(s, reach)
    reach = e
  }
  return total
}

/** Sizes of the groups of entries whose starts are within `gapMs` of the previous one. */
export function clusters(starts, gapMs) {
  const sorted = [...starts].sort((a, b) => a - b)
  const sizes = []
  let prev = null
  for (const t of sorted) {
    if (prev !== null && t - prev <= gapMs) sizes[sizes.length - 1] += 1
    else sizes.push(1)
    prev = t
  }
  return sizes
}

/** Pearson correlation; null when it is not defined. */
export function correlation(xs, ys) {
  const n = xs.length
  if (n < 3) return null
  const mx = sum(xs) / n
  const my = sum(ys) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy)
}

/**
 * One batch is the documents that loaded at the same time (one per tab).
 * Times inside a document are relative to its own time origin; `origin` makes
 * them comparable between tabs.
 */
function analyseBatch(batch) {
  const writesAbs = batch.flatMap((load) =>
    load.diag.tx.filter((t) => t.mode === 'readwrite' && t.done !== null && !t.simulated).map((t) => [load.diag.origin + t.created, load.diag.origin + t.done]),
  )
  return batch.map((load) => {
    const d = load.diag
    const lastApiEnd = d.api.reduce((m, e) => Math.max(m, e.end), 0)
    const inLoad = (t) => t <= lastApiEnd
    const busy = d.lag.map(([due, late]) => [due, due + late])
    const longtasks = (d.longtasks ?? []).map(([s, ms]) => [s, s + ms])

    const reads = d.tx
      .filter((t) => t.mode === 'readonly' && t.outcome === 'complete' && t.s.length > 0)
      .map((t) => {
        const end = t.settledEarly ?? t.done
        const createdAbs = d.origin + t.created
        const firstAbs = d.origin + t.s[0]
        let behindWrite = 0
        for (const [ws, we] of writesAbs) {
          if (ws < createdAbs && createdAbs < we) behindWrite = Math.max(behindWrite, Math.min(firstAbs, we) - createdAbs)
        }
        return {
          created: t.created,
          ms: end - t.created,
          toFirst: t.s[0] - t.created,
          between: t.s[t.s.length - 1] - t.s[0],
          toComplete: t.done - t.s[t.s.length - 1],
          busyMs: coveredBy(t.created, end, busy),
          longtaskMs: coveredBy(t.created, end, longtasks),
          behindWriteMs: behindWrite,
          simulated: t.simulated ?? null,
        }
      })
    const writes = d.tx
      .filter((t) => t.mode === 'readwrite' && t.done !== null && !t.simulated)
      .map((t) => ({ created: t.created, ms: t.done - t.created, toFirst: t.s.length ? t.s[0] - t.created : null, outcome: t.outcome }))

    const gates = load.timings.filter((e) => /^gate-/.test(e.op)).map((e) => ({ ...e, start: e.at - e.ms }))
    const adapterReads = load.timings.filter((e) => e.op === 'read')
    // A gate ends in the task its read ended in: pair each with the adapter
    // read that ended last before it, within 2 ms.
    const outside = []
    for (const g of gates) {
      const own = adapterReads.filter((r) => r.at <= g.at && g.at - r.at < 2).sort((a, b) => b.at - a.at)[0]
      if (own) outside.push(g.ms - own.ms)
    }
    // How long after each gate read was asked the main thread was next free:
    // no read that answers through a callback can settle sooner.
    const freeAfterAsk = gates.map((g) => {
      const held = busy.find(([due, end]) => end > g.start && due <= g.start + 4)
      return held ? held[1] - g.start : 0
    })
    // Reads asked in the same turn: how much later the last one settles than
    // the first, which is all that sharing one read could save them.
    const sortedGates = [...gates].sort((x, y) => x.start - y.start)
    const turnSpread = []
    for (let i = 0; i < sortedGates.length; ) {
      let j = i
      while (j + 1 < sortedGates.length && sortedGates[j + 1].start - sortedGates[j].start <= 1) j += 1
      if (j > i) {
        const group = sortedGates.slice(i, j + 1).map((g) => g.ms)
        turnSpread.push(Math.max(...group) - Math.min(...group))
      }
      i = j + 1
    }
    const byId = new Map()
    for (const g of gates) byId.set(g.id, (byId.get(g.id) ?? 0) + g.ms)

    return {
      tab: load.tab,
      path: load.path,
      reads,
      writes,
      gates,
      gateOutsideAdapterMs: outside,
      perRequestGateMs: [...byId.values()],
      turnSizes: clusters(gates.map((g) => g.start), 1),
      turnSpread,
      freeAfterAsk,
      rawMain: d.rawMain.filter(([t0, , ms]) => inLoad(t0) && ms >= 0).map(([t0, first, ms]) => ({ ms, first, busyMs: coveredBy(t0, t0 + ms, busy) })),
      rawWorker: d.rawWorker.filter(([t0, ms]) => t0 >= 0 && inLoad(t0) && ms >= 0).map(([, ms]) => ms),
      workerError: d.workerError ?? null,
      lag: {
        samples: d.lagSamples,
        late: d.lag.filter(([due]) => inLoad(due)).map(([, late]) => late),
        busyMsInLoad: coveredBy(0, lastApiEnd, busy),
      },
      longtasks: (d.longtasks ?? []).filter(([s]) => inLoad(s)).map(([, ms]) => ms),
      longtaskMsInLoad: coveredBy(0, lastApiEnd, longtasks),
      loaf: (d.loaf ?? []).filter((f) => inLoad(f.start)),
      lastApiEndMs: lastApiEnd,
      navigationToLastResponseMs: load.navigationToLastResponseMs,
      requests: load.requests,
      statuses: load.statuses,
      api: d.api,
    }
  })
}

const share = (part, whole) => (whole > 0 ? round((100 * part) / whole) : null)

function summarise(loads) {
  const reads = loads.flatMap((l) => l.reads)
  const realReads = reads.filter((r) => !r.simulated)
  const writes = loads.flatMap((l) => l.writes)
  const gates = loads.flatMap((l) => l.gates)
  const totalRead = sum(realReads.map((r) => r.ms))
  const phaseTotal = sum(realReads.map((r) => r.toFirst + r.between + r.toComplete))
  const slow = realReads.filter((r) => r.ms >= 20)
  const rawMain = loads.flatMap((l) => l.rawMain)
  const turnSizes = loads.flatMap((l) => l.turnSizes)
  const statuses = {}
  for (const l of loads) for (const [s, n] of Object.entries(l.statuses)) statuses[s] = (statuses[s] ?? 0) + n
  const scripts = new Map()
  for (const f of loads.flatMap((l) => l.loaf)) {
    for (const s of f.scripts) {
      const key = `${s.type}:${s.invoker}`
      scripts.set(key, (scripts.get(key) ?? 0) + s.ms)
    }
  }
  return {
    loads: loads.length,
    statuses,
    reads: {
      note: 'read-only transactions on erp-session/kv created by the page; ms is created to settled',
      ms: summary(reads.map((r) => r.ms)),
      phases: {
        note: 'of real transactions: created to first result, first to last result, last result to the complete event',
        toFirst: summary(realReads.map((r) => r.toFirst)),
        between: summary(realReads.map((r) => r.between)),
        toComplete: summary(realReads.map((r) => r.toComplete)),
        shareOfReadTimePercent: {
          toFirst: share(sum(realReads.map((r) => r.toFirst)), phaseTotal),
          between: share(sum(realReads.map((r) => r.between)), phaseTotal),
          toComplete: share(sum(realReads.map((r) => r.toComplete)), phaseTotal),
        },
      },
      mainThreadBusy: {
        note: 'time inside a read during which the 4 ms timer was running late (the main thread was occupied)',
        shareOfReadTimePercent: share(sum(realReads.map((r) => r.busyMs)), totalRead),
        longtaskShareOfReadTimePercent: share(sum(realReads.map((r) => r.longtaskMs)), totalRead),
        correlationOfReadMsWithBusyMs: round((correlation(realReads.map((r) => r.ms), realReads.map((r) => r.busyMs)) ?? NaN) * 100) / 100,
        slowReads: slow.length,
        slowReadsMostlyBusy: slow.filter((r) => r.busyMs >= 0.5 * r.ms).length,
        notBusyRemainderMs: summary(realReads.map((r) => r.ms - r.busyMs)),
      },
      behindOwnWrites: {
        note: 'reads created while a read-write transaction of any tab of the batch was open: time until that write completed or the read got its first result',
        reads: realReads.filter((r) => r.behindWriteMs > 0).length,
        ofReads: realReads.length,
        ms: summary(realReads.filter((r) => r.behindWriteMs > 0).map((r) => r.behindWriteMs)),
        shareOfReadTimePercent: share(sum(realReads.map((r) => r.behindWriteMs)), totalRead),
      },
    },
    writes: {
      perLoad: summary(loads.map((l) => l.writes.length)),
      ms: summary(writes.map((w) => w.ms)),
      createdAtMs: summary(writes.map((w) => w.created)),
    },
    gates: {
      perLoad: summary(loads.map((l) => l.gates.length)),
      before: summary(gates.filter((g) => g.op === 'gate-before').map((g) => g.ms)),
      after: summary(gates.filter((g) => g.op === 'gate-after').map((g) => g.ms)),
      perRequest: summary(loads.flatMap((l) => l.perRequestGateMs)),
      inFlight: summary(gates.map((g) => g.inFlight ?? 0)),
      inFlightAtLeastTwo: gates.filter((g) => (g.inFlight ?? 0) >= 2).length,
      outsideAdapterMs: summary(loads.flatMap((l) => l.gateOutsideAdapterMs)),
      sameTurn: {
        note: 'gate reads whose starts are within 1 ms of the previous one are counted as one turn (an approximation: entries carry no turn id)',
        gates: gates.length,
        turns: turnSizes.length,
        turnSize: summary(turnSizes),
        readsCoalescingWouldRemove: gates.length - turnSizes.length,
        slowestMinusFastestInATurnMs: summary(loads.flatMap((l) => l.turnSpread)),
      },
      mainThreadNextFreeAfterAskMs: summary(loads.flatMap((l) => l.freeAfterAsk)),
    },
    rawMainThread: {
      ms: summary(rawMain.map((r) => r.ms)),
      whenNotBusy: summary(rawMain.filter((r) => r.busyMs < 1).map((r) => r.ms)),
      whenBusy: summary(rawMain.filter((r) => r.busyMs >= 1).map((r) => r.ms)),
    },
    rawWorker: { ms: summary(loads.flatMap((l) => l.rawWorker)), errors: loads.map((l) => l.workerError).filter(Boolean).slice(0, 3) },
    mainThread: {
      timerLateMs: summary(loads.flatMap((l) => l.lag.late)),
      busyShareOfLoadPercent: share(sum(loads.map((l) => l.lag.busyMsInLoad)), sum(loads.map((l) => l.lastApiEndMs))),
      longtasksPerLoad: summary(loads.map((l) => l.longtasks.length)),
      longtaskMs: summary(loads.flatMap((l) => l.longtasks)),
      longtaskShareOfLoadPercent: share(sum(loads.map((l) => l.longtaskMsInLoad)), sum(loads.map((l) => l.lastApiEndMs))),
      longestScriptsMs: [...scripts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, ms]) => `${k} ${ms}`),
    },
    page: {
      navigationToLastResponseMs: summary(loads.map((l) => l.navigationToLastResponseMs)),
      lastApiEndInPageMs: summary(loads.map((l) => l.lastApiEndMs)),
      requests: median(loads.map((l) => l.requests)),
      sumOfGateWaitsMs: summary(loads.map((l) => sum(l.gates.map((g) => g.ms)))),
    },
  }
}

export function analyse(raw) {
  const out = {}
  for (const [tabs, byVariant] of Object.entries(raw)) {
    out[tabs] = {}
    for (const [variant, batches] of Object.entries(byVariant)) {
      const loads = batches.flatMap(analyseBatch)
      const paths = [...new Set(loads.map((l) => l.path))]
      out[tabs][variant] = {
        all: summarise(loads),
        perPage: Object.fromEntries(paths.map((p) => [p, summarise(loads.filter((l) => l.path === p))])),
      }
    }
  }
  return out
}

// --- the run -------------------------------------------------------------------

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
  const diag = await collect(page)
  const api = profile.since(mark, page).filter((e) => e.status !== null)
  const statuses = {}
  for (const e of api) statuses[e.status] = (statuses[e.status] ?? 0) + 1
  const { timings, ...rest } = diag
  return {
    tab: profile.label(page),
    path,
    diag: rest,
    timings,
    requests: api.length,
    statuses,
    navigationToLastResponseMs: api.reduce((m, e) => Math.max(m, e.respondedAt), 0) - started,
  }
}

const phaseSummary = (rows) => ({
  toFirst: summary(rows.map((r) => r.first)),
  firstToLast: summary(rows.map((r) => r.last - r.first)),
  lastToComplete: summary(rows.map((r) => r.complete - r.last)),
  total: summary(rows.map((r) => r.complete)),
})

async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'diagnose')
  ctx.allow429 = true
  const { base } = config
  const variants = (process.env.QA_DIAG_VARIANTS || Object.keys(VARIANT_MODES).join(',')).split(',')
  for (const v of variants) if (!(v in VARIANT_MODES)) throw new Error(`unknown variant ${v}`)
  const reps = Number(process.env.QA_DIAG_REPS || 3)
  const tabCounts = (process.env.QA_DIAG_TABS || '1,4').split(',').map(Number)
  const notes = []

  const profile = await ctx.profile({ timing: true })
  await profile.context.route(`**${WORKER_PATH}`, (route) => route.fulfill({ contentType: 'application/javascript', body: WORKER_SOURCE }))
  await profile.context.addInitScript(diagInit, { modeKey: DIAG_MODE_KEY, workerPath: WORKER_PATH })

  const first = await profile.tab('/login', { label: 't1', navigate: false })
  await ctx.signIn(first, config.userA)
  await sleep(3000)

  console.log('idle-page experiments')
  const idle = await experimentIdlePhases(first, 100)
  const experiments = {
    idlePhases: {
      note: 'one tab, idle, 100 of each; a write also reads the three keys, as the adapter does',
      readThreeKeys: phaseSummary(idle.readThreeKeys),
      readOneKey: phaseSummary(idle.readOneKey),
      write: phaseSummary(idle.write),
      writeRelaxed: phaseSummary(idle.writeRelaxed),
      writeStrict: phaseSummary(idle.writeStrict),
    },
    readBehindOpenWrite: [],
    readWhileMainThreadBlocked: [],
  }
  for (const hold of [50, 200]) experiments.readBehindOpenWrite.push(await experimentReadBehindWrite(first, hold))
  for (const block of [0, 50, 200]) experiments.readWhileMainThreadBlocked.push(await experimentReadWhileBlocked(first, block))

  const stored = await readStored(first)
  const orders = await pageFetch(first, { path: '/api/sales-orders?limit=1&page=1', bearer: stored.record.session.accessToken })
  const orderNumber = orders.status === 200 ? (orders.json?.data ?? [])[0]?.orderNumber : null
  let orderPath = '/sales/orders'
  if (orderNumber) orderPath = `/sales/orders/${encodeURIComponent(orderNumber)}/view`
  else notes.push('No sales order exists; the sales-order list was loaded in place of a single order.')
  const paths = ['/dashboard', '/inventory/products', orderPath]

  const pages = [first]
  const raw = {}
  for (const count of tabCounts) {
    while (pages.length < count) {
      const page = await profile.tab('/dashboard', { label: `t${pages.length + 1}` })
      if (!(await showsSignedInUi(page))) throw new Error(`${profile.label(page)} did not open signed in`)
      pages.push(page)
    }
    const used = pages.slice(0, count)
    const key = count === 1 ? 'oneTab' : `${count}Tabs`
    raw[key] = Object.fromEntries(variants.map((v) => [v, []]))
    await sleep(3000)
    // Variants are interleaved inside each repetition so drift over the run
    // falls on all of them alike.
    for (let rep = 0; rep < reps; rep += 1) {
      for (const variant of variants) {
        console.log(`${key} rep ${rep + 1}/${reps} ${variant}`)
        for (const page of used) {
          await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DIAG_MODE_KEY, VARIANT_MODES[variant]])
        }
        for (const path of paths) {
          raw[key][variant].push(await Promise.all(used.map((page) => loadOnce(profile, page, base, path))))
        }
      }
    }
  }

  const result = {
    suite: 'cross-tab-session latency diagnosis',
    measuredAt: new Date().toISOString(),
    base,
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(base),
    servedFrom: config.distDir ? 'DEVELOPMENT: page and assets from a local build (QA_DIST_DIR) through request interception.' : 'ingress',
    chromium: browser.version(),
    machine: machine(),
    configuration: config.show,
    repetitions: reps,
    variants: Object.fromEntries(variants.map((v) => [v, VARIANT_MODES[v] || '(observation only)'])),
    experiments,
    ...analyse(raw),
    notes,
    signInWaits: run.signInWaits,
  }

  await ctx.close()
  await browser.close()

  writeFileSync(join(config.scratch, 'diagnose-raw.json'), JSON.stringify(raw))
  const out = join(config.scratch, 'results-diagnose.json')
  writeFileSync(out, JSON.stringify(result, null, 2))
  for (const [tabs, byVariant] of Object.entries(result).filter(([k]) => /Tabs?$/.test(k))) {
    for (const [variant, r] of Object.entries(byVariant)) {
      const a = r.all
      console.log(
        `  ${tabs} ${variant}: read p50 ${a.reads.ms.p50} p95 ${a.reads.ms.p95} ms; per request p95 ${a.gates.perRequest.p95} ms; ` +
          `main thread busy ${a.mainThread.busyShareOfLoadPercent}% of the load; nav to last response p50 ${a.page.navigationToLastResponseMs.p50} ms`,
      )
    }
  }
  console.log(`wrote ${out}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
