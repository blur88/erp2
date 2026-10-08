#!/usr/bin/env node
// Diagnostic, not a case: where the time goes when five tabs of one profile
// open together with a current access token (#1353). In the recorded run on
// 198943047 that round took 8.7 s against a 5 s deadline with no request
// refused or delayed and no 401, so neither throttling nor authentication
// recovery explains it. It judges nothing and changes nothing.
//
// Two ways of observing the same load, alternated:
//   polled    W1's own watcher (lib/completion.mjs): every tab's document is
//             read from outside every 250 ms while it loads
//   in-page   nothing touches the tabs while they load. A script installed
//             before the page's own records, inside each tab: navigation and
//             document milestones, the first and last API request, when the
//             "Dashboard" heading first appeared, the last change to the
//             document, and the long tasks on the main thread. The tabs are
//             read once, after they have gone quiet.
// The in-page record is taken in both variants, so the polled loads have both
// figures and the two variants can be compared on the same in-page figures.
//
// Run directly against a running stack (no QA configuration needed: the token
// is current either way). Writes <scratch>/completion-diagnosis.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { watchCompletion } from './lib/completion.mjs'
import { KEEP_SHELL_ANSWERS, shellReference } from './lib/usable.mjs'

const TABS = Number(process.env.QA_COMPLETION_TABS || 5)
const REPETITIONS = Number(process.env.QA_COMPLETION_REPS || 5)
const QUIET_MS = 20000

// Installed in every tab before any of the page's own code runs.
const recorder = () => {
  const r = { headingAtMs: null, lastMutationAtMs: null, longTasks: 0, longTaskMs: 0 }
  window.__qaCompletion = r
  const isDashboardHeading = () =>
    [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].some((h) => (h.textContent || '').trim() === 'Dashboard')
  const start = () => {
    new MutationObserver(() => {
      r.lastMutationAtMs = performance.now()
      if (r.headingAtMs === null && isDashboardHeading()) r.headingAtMs = performance.now()
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
  }
  if (document.documentElement) start()
  else document.addEventListener('readystatechange', start, { once: true })
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        r.longTasks += 1
        r.longTaskMs += e.duration
      }
    }).observe({ type: 'longtask', buffered: true })
  } catch {
    r.longTasks = null
  }
}

// Read once from a quiet tab: everything relative to the tab's own navigation start.
const readTab = () => {
  const nav = performance.getEntriesByType('navigation')[0]
  const api = performance.getEntriesByType('resource').filter((e) => new URL(e.name).pathname.startsWith('/api/'))
  const scripts = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js'))
  const r = window.__qaCompletion || {}
  const max = (xs) => (xs.length ? Math.max(...xs) : null)
  const min = (xs) => (xs.length ? Math.min(...xs) : null)
  return {
    timeOrigin: performance.timeOrigin,
    documentResponseEndMs: nav ? nav.responseEnd : null,
    domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
    loadEventMs: nav ? nav.loadEventEnd : null,
    lastScriptEndMs: max(scripts.map((e) => e.responseEnd)),
    apiRequests: api.length,
    firstApiStartMs: min(api.map((e) => e.startTime)),
    lastApiEndMs: max(api.map((e) => e.responseEnd)),
    apiDurationMs: { max: max(api.map((e) => e.duration)), total: api.reduce((s, e) => s + e.duration, 0) },
    headingAtMs: r.headingAtMs ?? null,
    lastMutationAtMs: r.lastMutationAtMs ?? null,
    longTasks: r.longTasks ?? null,
    longTaskMs: r.longTaskMs ?? null,
    hasCouldNotLoad: document.body ? /Could not load/.test(document.body.innerText || '') : null,
  }
}

const loadavg = () => {
  try {
    return readFileSync('/proc/loadavg', 'utf8').trim()
  } catch {
    return null
  }
}

async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'completion-diagnosis')
  ctx.allow429 = true
  const out = {
    what: 'diagnostic: five current-token tabs, observed two ways. Judges nothing.',
    startedAt: new Date().toISOString(),
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    chromium: browser.version(),
    machine: machine(),
    configuration: config.show,
    tabs: TABS,
    loadavgAtStart: loadavg(),
    loads: [],
  }
  try {
    const profile = await ctx.profile({ keepAnswers: KEEP_SHELL_ANSWERS })
    await profile.context.addInitScript(recorder)
    const signIn = await profile.tab('/login', { label: 'sign-in', navigate: false })
    await ctx.signIn(signIn, config.userC)
    const reference = await shellReference(profile)
    await signIn.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })

    const variants = []
    for (let i = 0; i < REPETITIONS; i += 1) variants.push('in-page', 'polled')
    for (const [index, variant] of variants.entries()) {
      // An empty api_limit bucket, and nothing left running from the load before.
      await sleep(zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst) * 1000)
      const mark = profile.mark()
      const pages = []
      for (let i = 0; i < TABS; i += 1) pages.push(await profile.tab('/dashboard', { label: `l${index + 1}-${i + 1}`, navigate: false }))
      const loadBefore = loadavg()
      const started = Date.now()
      // As W1 does it: the navigations are committed, then the watcher starts.
      await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })))
      let polled = null
      if (variant === 'polled') {
        polled = await watchCompletion(profile, mark, pages, { companyName: reference.companyName, regional: reference.regional }, { started, giveUpMs: 45000 })
      }
      // Quiet: no API request pending and none sent for three seconds, at most QUIET_MS.
      for (const deadline = Date.now() + QUIET_MS; Date.now() < deadline; ) {
        const api = profile.since(mark).filter((e) => e.zone === 'business' || e.zone === 'session')
        const pending = api.some((e) => e.status === null && !e.failed)
        const last = api.reduce((m, e) => Math.max(m, e.respondedAt ?? e.issuedAt), 0)
        if (api.length > 0 && !pending && Date.now() - last > 3000) break
        await sleep(250)
      }
      const tabs = []
      for (const page of pages) {
        const t = await page.evaluate(readTab)
        const offset = t.timeOrigin - started // the tab's navigation start, after the common trigger
        const abs = (v) => (v === null ? null : Math.round(offset + v))
        tabs.push({
          tab: profile.label(page),
          navigationStartMs: Math.round(offset),
          documentResponseEndMs: abs(t.documentResponseEndMs),
          domContentLoadedMs: abs(t.domContentLoadedMs),
          lastScriptEndMs: abs(t.lastScriptEndMs),
          firstApiStartMs: abs(t.firstApiStartMs),
          lastApiEndMs: abs(t.lastApiEndMs),
          headingAtMs: abs(t.headingAtMs),
          lastMutationAtMs: abs(t.lastMutationAtMs),
          apiRequests: t.apiRequests,
          apiDurationMaxMs: t.apiDurationMs.max === null ? null : Math.round(t.apiDurationMs.max),
          longTasks: t.longTasks,
          longTaskMs: t.longTaskMs === null ? null : Math.round(t.longTaskMs),
          hasCouldNotLoad: t.hasCouldNotLoad,
        })
      }
      const log = profile.since(mark).filter((e) => e.zone === 'business')
      const last = (key) => {
        const xs = tabs.map((t) => t[key]).filter((v) => v !== null)
        return xs.length === tabs.length ? Math.max(...xs) : null
      }
      out.loads.push({
        load: index + 1,
        variant,
        loadavgBefore: loadBefore,
        // All in ms after the common trigger; "last" is the latest tab's figure.
        last: {
          navigationStart: last('navigationStartMs'),
          domContentLoaded: last('domContentLoadedMs'),
          firstApiStart: last('firstApiStartMs'),
          lastApiEnd: last('lastApiEndMs'),
          heading: last('headingAtMs'),
          lastMutation: last('lastMutationAtMs'),
        },
        // Data arrived and rendered, seen from inside the tabs: the heading is
        // there and the last API answer has been received, in every tab.
        inPageCompleteMs: last('headingAtMs') === null || last('lastApiEndMs') === null ? null : Math.max(last('headingAtMs'), last('lastApiEndMs')),
        polledCompleteMs: polled ? polled.lastCompletedAfterMs : null,
        polledPerTab: polled ? polled.perTab : null,
        dataRequests: log.length,
        data429: log.filter((e) => e.status === 429).length,
        data401: log.filter((e) => e.status === 401).length,
        longTaskMsTotal: tabs.reduce((s, t) => s + (t.longTaskMs ?? 0), 0),
        tabs,
      })
      const l = out.loads.at(-1)
      console.log(`load ${l.load} ${variant}: in-page complete ${l.inPageCompleteMs} ms, polled ${l.polledCompleteMs}, first API ${l.last.firstApiStart}, last API ${l.last.lastApiEnd}, heading ${l.last.heading}, long tasks ${l.longTaskMsTotal} ms, loadavg ${loadBefore}`)
      for (const page of pages) await page.close()
    }
  } catch (err) {
    out.error = err && err.stack ? err.stack : String(err)
    console.log(out.error)
  } finally {
    try { await ctx.close() } catch { /* nothing recorded depends on it */ }
    await browser.close()
  }
  out.loadavgAtEnd = loadavg()
  out.finishedAt = new Date().toISOString()
  writeFileSync(join(config.scratch, 'completion-diagnosis.json'), JSON.stringify(out, null, 2))
  console.log('wrote completion-diagnosis.json')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
