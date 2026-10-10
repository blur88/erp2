#!/usr/bin/env node
// Diagnostic, not a case: where the time goes when five tabs of one profile
// open together with a current access token (#1353). In the recorded run on
// 198943047 that round took 8.7 s against a 5 s deadline with no request
// refused or delayed and no 401, so neither throttling nor authentication
// recovery explains it. It judges nothing and changes nothing.
//
// Three ways of observing the same load, in rotation:
//   bare      nothing is added to the tabs and nothing touches them while they
//             load. They are read once, after they have gone quiet, from what
//             the browser records anyway: navigation and resource timing, the
//             paint entries, and the largest contentful paint.
//   in-page   as bare, plus a script installed in each tab before the page's
//             own: a MutationObserver that notes when the "Dashboard" heading
//             first appeared and the last change to the document, and a
//             long-task observer.
//   polled    as in-page, plus W1's own watcher (lib/completion.mjs): every
//             tab's document is read from outside every 250 ms while it loads.
// What the browser records anyway is read in all three, so the cost of each
// layer of observation can be read off the same figures: the last API answer
// and the largest contentful paint.
//
// Run directly against a running stack (no QA configuration needed: the token
// is current either way). Writes <scratch>/completion-diagnosis.json.
//
// What separates one cause of the start-up time from another (#1359). Each is
// one thing changed against the load above, and none of them is a judgement:
//   QA_COMPLETION_STAGGER_MS   the tabs are opened this far apart, not together.
//   QA_COMPLETION_PROFILE_DIR  a profile kept in this directory, as a browser a
//                              person uses has, in place of the harness's usual
//                              context, whose cache is held in memory. Where
//                              the directory is (a disk, a tmpfs) is the
//                              comparison.
//   traced (a variant)         as bare, with the browser's own trace recorded:
//                              per tab, what the main thread ran before the
//                              first data request, in wall and in CPU time.
//   QA_COMPLETION_COLD_FILES=1 with a profile directory: before every load the
//                              profile's files are written out and dropped from
//                              the page cache, so the load reads them from the
//                              device. What the load then read from a device is
//                              in the counters, like everything else.
//   QA_COMPLETION_OUT          the file written, for several runs in one scratch.
//   QA_COMPLETION_LABEL        free text recorded with the run.
// The processors the browser may use are set from outside (docker run
// --cpuset-cpus) and recorded from the cgroup. Every load also records what the
// kernel counted while it ran: the CPU time the container used, and the time
// its tasks were stalled waiting for a processor or for I/O (pressure stall
// information), for the container and for the host.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'
import { watchCompletion } from './lib/completion.mjs'
import { KEEP_SHELL_ANSWERS, shellReference } from './lib/usable.mjs'

const TABS = Number(process.env.QA_COMPLETION_TABS || 5)
const REPETITIONS = Number(process.env.QA_COMPLETION_REPS || 6)
const QUIET_MS = 60000
// Which variants to rotate through; all three unless QA_COMPLETION_VARIANTS names fewer.
const VARIANTS = (process.env.QA_COMPLETION_VARIANTS || 'bare,in-page,polled').split(',').map((v) => v.trim()).filter(Boolean)
const STAGGER_MS = Number(process.env.QA_COMPLETION_STAGGER_MS || 0)
const PROFILE_DIR = process.env.QA_COMPLETION_PROFILE_DIR || null
const COLD_FILES = process.env.QA_COMPLETION_COLD_FILES === '1'
// How often the counters are read while a load runs. Reading them is work in
// the same container; a long interval shows what that work costs the load.
const SAMPLE_MS = Number(process.env.QA_COMPLETION_SAMPLE_MS || 200)
const OUT_NAME = process.env.QA_COMPLETION_OUT || 'completion-diagnosis.json'
const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.execute', 'disabled-by-default-v8.compile', 'loading', 'toplevel']

const readText = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

// `some avg10=… total=<µs>` / `full …`: the stalled time so far, in µs.
const pressure = (path) => {
  const text = readText(path)
  if (text === null) return { some: null, full: null }
  const total = (kind) => {
    const m = new RegExp(`^${kind} .*total=(\\d+)`, 'm').exec(text)
    return m ? Number(m[1]) : null
  }
  return { some: total('some'), full: total('full') }
}

// CPU time so far of every process in the container, by what the process is:
// the browser process, a tab's renderer, the GPU process, the network service,
// and this script. In ms (the kernel counts in 1/100 s here).
const cpuByProcess = () => {
  const by = {}
  try {
    for (const pid of readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
      // Chromium's children rewrite their command line with spaces between the arguments.
      const args = (readText(`/proc/${pid}/cmdline`) || '').split(/[\0 ]/).filter(Boolean)
      const stat = readText(`/proc/${pid}/stat`)
      if (!args.length || !stat) continue
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      const ms = (Number(fields[11]) + Number(fields[12])) * 10
      let kind = 'other'
      if (/chrom/i.test(args[0])) {
        const type = args.find((a) => a.startsWith('--type='))
        const sub = args.find((a) => a.startsWith('--utility-sub-type='))
        kind = !type ? 'browser' : type === '--type=utility' && sub ? sub.split('=')[1].split('.')[0] : type.split('=')[1]
      } else if (/node/.test(args[0])) kind = 'driver'
      by[kind] = (by[kind] || 0) + ms
    }
  } catch { /* what was read so far */ }
  return by
}

// Drops the profile's files from the page cache: written out first, since a
// page not yet written cannot be dropped. Whether it took shows in the bytes the load then reads.
const dropFromPageCache = (directory) => {
  const result = { files: null, bytes: null, error: null }
  try {
    execFileSync('sync')
    execFileSync('find', [directory, '-type', 'f', '-exec', 'dd', 'if={}', 'iflag=nocache', 'count=0', 'status=none', ';'])
    const sizes = execFileSync('find', [directory, '-type', 'f', '-printf', '%s\\n']).toString().split('\n').filter(Boolean).map(Number)
    result.files = sizes.length
    result.bytes = sizes.reduce((a, b) => a + b, 0)
  } catch (err) {
    result.error = String(err)
  }
  return result
}

// What the kernel has counted so far. The cgroup files are the container's
// own; /proc/stat and /proc/pressure are the host's, seen from inside it.
const counters = () => {
  const cpuStat = readText('/sys/fs/cgroup/cpu.stat')
  const usage = cpuStat ? /^usage_usec (\d+)/m.exec(cpuStat) : null
  const stat = readText('/proc/stat')
  const cpu = stat ? stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number) : null
  return {
    at: Date.now(),
    containerCpuUsec: usage ? Number(usage[1]) : null,
    byProcess: cpuByProcess(),
    containerIo: (() => {
      // "8:0 rbytes=… wbytes=… …" per device: what reached a device, not the page cache.
      const text = readText('/sys/fs/cgroup/io.stat')
      if (text === null) return { read: null, written: null }
      const sum = (key) => [...text.matchAll(new RegExp(`${key}=(\\d+)`, 'g'))].reduce((n, m) => n + Number(m[1]), 0)
      return { read: sum('rbytes'), written: sum('wbytes') }
    })(),
    containerCpuStall: pressure('/sys/fs/cgroup/cpu.pressure'),
    containerIoStall: pressure('/sys/fs/cgroup/io.pressure'),
    hostCpuStall: pressure('/proc/pressure/cpu'),
    hostIoStall: pressure('/proc/pressure/io'),
    // Jiffies: user nice system idle iowait irq softirq steal.
    hostJiffies: cpu ? { busy: cpu[0] + cpu[1] + cpu[2] + cpu[5] + cpu[6] + cpu[7], idle: cpu[3], iowait: cpu[4] } : null,
  }
}

// The counters' movement between the trigger and `untilMs` after it, from the
// samples taken every SAMPLE_MS: the first sample at or after that moment.
const counted = (samples, started, untilMs, processors) => {
  if (untilMs === null) return null
  const from = samples[0]
  const to = samples.find((s) => s.at >= started + untilMs) ?? samples.at(-1)
  const wallMs = to.at - from.at
  const diff = (a, b) => (a === null || b === null ? null : Math.round((b - a) / 1000))
  const jiffies = from.hostJiffies && to.hostJiffies
    ? { busy: to.hostJiffies.busy - from.hostJiffies.busy, idle: to.hostJiffies.idle - from.hostJiffies.idle, iowait: to.hostJiffies.iowait - from.hostJiffies.iowait }
    : null
  const all = jiffies ? jiffies.busy + jiffies.idle + jiffies.iowait : 0
  const containerCpuMs = diff(from.containerCpuUsec, to.containerCpuUsec)
  return {
    wallMs,
    containerCpuMs,
    // Of the processors the container may use, the share it used.
    // Processes that were there at both ends; a tab's renderer is.
    cpuMsByProcess: Object.fromEntries(Object.keys(to.byProcess).map((k) => [k, to.byProcess[k] - (from.byProcess[k] || 0)])),
    containerReadBytes: from.containerIo.read === null ? null : to.containerIo.read - from.containerIo.read,
    containerWrittenBytes: from.containerIo.written === null ? null : to.containerIo.written - from.containerIo.written,
    containerCpuShare: containerCpuMs === null || !processors || wallMs <= 0 ? null : Math.round((containerCpuMs / (wallMs * processors)) * 100) / 100,
    containerCpuStallSomeMs: diff(from.containerCpuStall.some, to.containerCpuStall.some),
    containerCpuStallFullMs: diff(from.containerCpuStall.full, to.containerCpuStall.full),
    containerIoStallSomeMs: diff(from.containerIoStall.some, to.containerIoStall.some),
    containerIoStallFullMs: diff(from.containerIoStall.full, to.containerIoStall.full),
    hostCpuStallSomeMs: diff(from.hostCpuStall.some, to.hostCpuStall.some),
    hostIoStallSomeMs: diff(from.hostIoStall.some, to.hostIoStall.some),
    hostBusyShare: all > 0 ? Math.round((jiffies.busy / all) * 100) / 100 : null,
    hostIowaitShare: all > 0 ? Math.round((jiffies.iowait / all) * 100) / 100 : null,
  }
}

// The processors the cgroup allows: "0-1,3" is three.
const processorsAllowed = () => {
  const text = readText('/sys/fs/cgroup/cpuset.cpus.effective')
  if (!text || !text.trim()) return { list: null, count: null }
  const count = text.trim().split(',').reduce((n, part) => {
    const [a, b] = part.split('-').map(Number)
    return n + (b === undefined ? 1 : b - a + 1)
  }, 0)
  return { list: text.trim(), count }
}

// The file system a path is on, by the longest mount point that contains it.
const mountOf = (path) => {
  const mounts = readText('/proc/mounts')
  if (!mounts) return null
  let best = null
  for (const line of mounts.split('\n')) {
    const [device, point, type] = line.split(' ')
    if (!point) continue
    if ((path === point || path.startsWith(point.endsWith('/') ? point : `${point}/`)) && (!best || point.length > best.point.length)) best = { device, point, type }
  }
  return best
}

// The browser process's own command line (the one process without --type=).
const browserCommandLine = () => {
  try {
    for (const pid of readdirSync('/proc').filter((n) => /^\d+$/.test(n))) {
      const args = (readText(`/proc/${pid}/cmdline`) || '').split('\0').filter(Boolean)
      if (args.length && /chrom/i.test(args[0]) && !args.some((a) => a.startsWith('--type='))) return args
    }
  } catch { /* recorded as null */ }
  return null
}

const median = (xs) => {
  const v = xs.filter((x) => x !== null && x !== undefined).sort((a, b) => a - b)
  if (!v.length) return null
  return v.length % 2 ? v[(v.length - 1) / 2] : Math.round((v[v.length / 2 - 1] + v[v.length / 2]) / 2)
}

// From the browser's trace: for every tab's main thread, what ran between the
// tab's navigation and its first data request. `wallMs` is how long the tasks
// took on the clock and `cpuMs` how long the thread was actually running in
// them; the difference is time a task had begun and the thread was not running
// (waiting for a processor, or blocked). `idleMs` is the rest of the window:
// the thread had nothing to run. `byName` is not exclusive: an event inside
// another is counted in both.
function readTrace(buffer) {
  const events = JSON.parse(buffer.toString('utf8')).traceEvents || []
  const mains = new Map()
  for (const e of events) {
    if (e.ph === 'M' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain') mains.set(`${e.pid}:${e.tid}`, { pid: e.pid, tid: e.tid })
  }
  const isData = (url) => {
    try {
      const path = new URL(url).pathname
      return path.startsWith('/api/') && !path.startsWith('/api/health')
    } catch {
      return false
    }
  }
  const byThread = new Map()
  for (const e of events) {
    const key = `${e.pid}:${e.tid}`
    if (!mains.has(key)) continue
    if (!byThread.has(key)) byThread.set(key, [])
    byThread.get(key).push(e)
  }
  const tabs = []
  for (const [key, list] of byThread) {
    const sends = list.filter((e) => e.name === 'ResourceSendRequest')
    const first = sends.filter((e) => /\/dashboard$/.test(e.args?.data?.url || '')).map((e) => e.ts)
    const data = sends.filter((e) => isData(e.args?.data?.url || '')).map((e) => e.ts)
    if (!first.length || !data.length) continue // not a tab of the load (the sign-in tab)
    const from = Math.min(...first)
    const until = Math.min(...data)
    const inside = list.filter((e) => e.ph === 'X' && e.ts >= from && e.ts < until)
    // An event still running at the first data request counts up to it.
    const clip = (e, field) => Math.min(e[field] ?? 0, until - e.ts)
    const tasks = inside.filter((e) => e.name === 'RunTask')
    const wall = tasks.reduce((s, e) => s + clip(e, 'dur'), 0)
    const cpu = tasks.reduce((s, e) => s + clip(e, 'tdur'), 0)
    const names = new Map()
    for (const e of inside) {
      if (e.name === 'RunTask') continue
      const n = names.get(e.name) || { wall: 0, cpu: 0, count: 0 }
      n.wall += clip(e, 'dur')
      n.cpu += clip(e, 'tdur')
      n.count += 1
      names.set(e.name, n)
    }
    tabs.push({
      thread: key,
      windowMs: Math.round((until - from) / 1000),
      tasks: { count: tasks.length, wallMs: Math.round(wall / 1000), cpuMs: Math.round(cpu / 1000), notRunningMs: Math.round((wall - cpu) / 1000) },
      idleMs: Math.round((until - from - wall) / 1000),
      byName: [...names.entries()]
        .map(([name, n]) => ({ name, count: n.count, wallMs: Math.round(n.wall / 1000), cpuMs: Math.round(n.cpu / 1000) }))
        .sort((a, b) => b.wallMs - a.wallMs)
        .slice(0, 14),
    })
  }
  return { events: events.length, tabs }
}

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

// Read once from a quiet tab: everything relative to the tab's own navigation
// start. The paint figures come from the browser's own buffered entries, so
// they are there whether or not anything was installed in the tab.
const readTab = async () => {
  const buffered = (type) =>
    new Promise((resolve) => {
      try {
        const seen = []
        const observer = new PerformanceObserver((list) => seen.push(...list.getEntries()))
        observer.observe({ type, buffered: true })
        setTimeout(() => {
          seen.push(...observer.takeRecords())
          observer.disconnect()
          resolve(seen)
        }, 0)
      } catch {
        resolve(null)
      }
    })
  const lcpEntries = await buffered('largest-contentful-paint')
  const longEntries = await buffered('longtask')
  const paint = performance.getEntriesByType('paint')
  const nav = performance.getEntriesByType('navigation')[0]
  // The load's own data requests. The status indicator's poll of /api/health
  // repeats every 30 s for as long as the tab is open and is not part of it.
  const api = performance
    .getEntriesByType('resource')
    .filter((e) => new URL(e.name).pathname.startsWith('/api/') && !new URL(e.name).pathname.startsWith('/api/health'))
  const scripts = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'script' || e.name.endsWith('.js'))
  const r = window.__qaCompletion || {}
  const max = (xs) => (xs.length ? Math.max(...xs) : null)
  const min = (xs) => (xs.length ? Math.min(...xs) : null)
  return {
    timeOrigin: performance.timeOrigin,
    documentResponseEndMs: nav ? nav.responseEnd : null,
    // Reported by the browser for the document: 0 transferred is the cache.
    documentTransferBytes: nav ? nav.transferSize : null,
    domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
    loadEventMs: nav ? nav.loadEventEnd : null,
    lastScriptEndMs: max(scripts.map((e) => e.responseEnd)),
    apiRequests: api.length,
    firstApiStartMs: min(api.map((e) => e.startTime)),
    lastApiEndMs: max(api.map((e) => e.responseEnd)),
    apiDurationMs: { max: max(api.map((e) => e.duration)), total: api.reduce((s, e) => s + e.duration, 0) },
    headingAtMs: r.headingAtMs ?? null,
    lastMutationAtMs: r.lastMutationAtMs ?? null,
    firstContentfulPaintMs: paint.find((e) => e.name === 'first-contentful-paint')?.startTime ?? null,
    largestContentfulPaintMs: lcpEntries && lcpEntries.length ? Math.max(...lcpEntries.map((e) => e.startTime)) : null,
    // From the browser's buffer, which holds a limited number of entries.
    longTasks: longEntries ? longEntries.length : null,
    longTaskMs: longEntries ? longEntries.reduce((s, e) => s + e.duration, 0) : null,
    hasCouldNotLoad: document.body ? /Could not load/.test(document.body.innerText || '') : null,
    // What happens before the first data request: the scripts the page loads
    // (whether from the network or the cache, and how big), and the long tasks
    // on the main thread with when each ran.
    scripts: scripts.map((e) => ({
      name: new URL(e.name).pathname.split('/').pop(),
      startMs: Math.round(e.startTime),
      endMs: Math.round(e.responseEnd),
      transferBytes: e.transferSize,
      decodedBytes: e.decodedBodySize,
    })),
    longTaskList: longEntries ? longEntries.map((e) => ({ startMs: Math.round(e.startTime), ms: Math.round(e.duration) })) : null,
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
  // With a profile directory there is one context and it is the profile; the
  // harness asks the browser for a context and is handed that one.
  let browser
  if (PROFILE_DIR) {
    mkdirSync(PROFILE_DIR, { recursive: true })
    const context = await chromium.launchPersistentContext(PROFILE_DIR, { ...launchOptions(config), viewport: { width: 1366, height: 800 } })
    browser = {
      newContext: async () => context,
      version: () => context.browser()?.version() ?? null,
      close: async () => { try { await context.close() } catch { /* already closed by the harness */ } },
    }
  } else {
    browser = await chromium.launch(launchOptions(config))
  }
  if (VARIANTS.includes('traced') && PROFILE_DIR) throw new Error('the traced variant needs the browser object, which a profile directory does not give')
  const processors = processorsAllowed()
  const tmp = process.env.TMPDIR || '/tmp'
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'completion-diagnosis')
  ctx.allow429 = true
  const out = {
    what: 'diagnostic: current-token tabs of one profile opened together, observed up to three ways. Judges nothing.',
    variants: VARIANTS,
    startedAt: new Date().toISOString(),
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    chromium: browser.version(),
    machine: machine(),
    configuration: config.show,
    tabs: TABS,
    label: process.env.QA_COMPLETION_LABEL || null,
    staggerMs: STAGGER_MS,
    coldFiles: COLD_FILES,
    sampleMs: SAMPLE_MS,
    processors,
    profile: PROFILE_DIR
      ? { kind: 'kept in a directory', directory: PROFILE_DIR, mount: mountOf(PROFILE_DIR) }
      : { kind: 'the harness context (cache in memory)', directory: null, mount: null },
    temporaryFiles: { directory: tmp, mount: mountOf(tmp) },
    sharedMemory: mountOf('/dev/shm'),
    browserCommandLine: browserCommandLine(),
    loadavgAtStart: loadavg(),
    loads: [],
  }
  try {
    const profile = await ctx.profile({ keepAnswers: KEEP_SHELL_ANSWERS })
    const signIn = await profile.tab('/login', { label: 'sign-in', navigate: false })
    await ctx.signIn(signIn, config.userC)
    const reference = await shellReference(profile)
    await signIn.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })

    const variants = []
    for (let i = 0; i < REPETITIONS; i += 1) variants.push(...VARIANTS)
    for (const [index, variant] of variants.entries()) {
      // An empty api_limit bucket, and nothing left running from the load before.
      await sleep(zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst) * 1000)
      const mark = profile.mark()
      const pages = []
      for (let i = 0; i < TABS; i += 1) {
        const page = await profile.tab('/dashboard', { label: `l${index + 1}-${i + 1}`, navigate: false })
        // Per tab, so that a bare load has nothing installed in it at all.
        if (variant !== 'bare' && variant !== 'traced') await page.addInitScript(recorder)
        pages.push(page)
      }
      const droppedFromPageCache = COLD_FILES && PROFILE_DIR ? dropFromPageCache(PROFILE_DIR) : null
      const loadBefore = loadavg()
      if (variant === 'traced') await browser.startTracing(null, { categories: TRACE_CATEGORIES })
      const samples = [counters()]
      const sampler = setInterval(() => samples.push(counters()), SAMPLE_MS)
      const started = Date.now()
      // As W1 does it: the navigations are committed, then the watcher starts.
      if (STAGGER_MS > 0) {
        for (const [i, page] of pages.entries()) {
          if (i > 0) await sleep(Math.max(0, started + i * STAGGER_MS - Date.now()))
          await page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })
        }
      } else {
        await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })))
      }
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
      clearInterval(sampler)
      samples.push(counters())
      let trace = null
      if (variant === 'traced') {
        try {
          trace = readTrace(await browser.stopTracing())
        } catch (err) {
          trace = { error: String(err) }
        }
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
          firstContentfulPaintMs: abs(t.firstContentfulPaintMs),
          largestContentfulPaintMs: abs(t.largestContentfulPaintMs),
          apiRequests: t.apiRequests,
          apiDurationMaxMs: t.apiDurationMs.max === null ? null : Math.round(t.apiDurationMs.max),
          longTasks: t.longTasks,
          longTaskMs: t.longTaskMs === null ? null : Math.round(t.longTaskMs),
          hasCouldNotLoad: t.hasCouldNotLoad,
          documentTransferBytes: t.documentTransferBytes,
          // Relative to this tab's own navigation start.
          own: {
            lastApiEndMs: t.lastApiEndMs === null ? null : Math.round(t.lastApiEndMs),
            largestContentfulPaintMs: t.largestContentfulPaintMs === null ? null : Math.round(t.largestContentfulPaintMs),
            scriptBytesFromNetwork: t.scripts.reduce((sum, x) => sum + (x.transferBytes || 0), 0),
            domContentLoadedMs: t.domContentLoadedMs === null ? null : Math.round(t.domContentLoadedMs),
            lastScriptEndMs: t.lastScriptEndMs === null ? null : Math.round(t.lastScriptEndMs),
            firstApiStartMs: t.firstApiStartMs === null ? null : Math.round(t.firstApiStartMs),
            longTaskMsBeforeFirstApi: t.longTaskList && t.firstApiStartMs !== null ? t.longTaskList.filter((x) => x.startMs < t.firstApiStartMs).reduce((sum, x) => sum + Math.min(x.ms, t.firstApiStartMs - x.startMs), 0) : null,
            scripts: t.scripts,
            longTaskList: t.longTaskList,
          },
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
        droppedFromPageCache,
        // All in ms after the common trigger; "last" is the latest tab's figure.
        last: {
          navigationStart: last('navigationStartMs'),
          domContentLoaded: last('domContentLoadedMs'),
          firstApiStart: last('firstApiStartMs'),
          lastApiEnd: last('lastApiEndMs'),
          heading: last('headingAtMs'),
          lastMutation: last('lastMutationAtMs'),
          firstContentfulPaint: last('firstContentfulPaintMs'),
          largestContentfulPaint: last('largestContentfulPaintMs'),
        },
        // Data arrived and rendered, seen from inside the tabs: the heading is
        // there and the last API answer has been received, in every tab.
        // Each tab from its own navigation start, which is what a staggered
        // load can be compared by: the median tab and the slowest.
        own: Object.fromEntries(
          ['domContentLoadedMs', 'lastScriptEndMs', 'firstApiStartMs', 'lastApiEndMs', 'largestContentfulPaintMs', 'longTaskMsBeforeFirstApi'].map((key) => {
            const xs = tabs.map((t) => t.own[key])
            return [key, { median: median(xs), max: xs.some((x) => x === null) ? null : Math.max(...xs) }]
          }),
        ),
        scriptBytesFromNetwork: tabs.reduce((sum, t) => sum + t.own.scriptBytesFromNetwork, 0),
        // What the kernel counted from the trigger to the last tab's first data
        // request, and to the last data answer.
        countedToFirstApi: counted(samples, started, last('firstApiStartMs'), processors.count),
        countedToLastApi: counted(samples, started, last('lastApiEndMs'), processors.count),
        trace,
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
      const c = l.countedToFirstApi
      console.log(`load ${l.load} ${variant}: first API ${l.last.firstApiStart}, last API ${l.last.lastApiEnd}, LCP ${l.last.largestContentfulPaint}, heading ${l.last.heading}, polled ${l.polledCompleteMs}, long tasks ${l.longTaskMsTotal} ms, loadavg ${loadBefore}`)
      if (c) console.log(`  to first API: container CPU ${c.containerCpuMs} ms (${c.containerCpuShare} of ${processors.count}), stalled for CPU ${c.containerCpuStallSomeMs} ms, for I/O ${c.containerIoStallSomeMs} ms, host iowait ${c.hostIowaitShare}`)
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
  // Medians over the loads of each variant; the loads themselves are above.
  out.medians = Object.fromEntries(
    VARIANTS.map((variant) => {
      const loads = out.loads.filter((l) => l.variant === variant)
      const m = (pick) => median(loads.map(pick))
      return [variant, {
        loads: loads.length,
        lastFirstApiStartMs: m((l) => l.last.firstApiStart),
        lastApiEndMs: m((l) => l.last.lastApiEnd),
        lastLargestContentfulPaintMs: m((l) => l.last.largestContentfulPaint),
        ownFirstApiStartMedianMs: m((l) => l.own.firstApiStartMs.median),
        ownFirstApiStartMaxMs: m((l) => l.own.firstApiStartMs.max),
        ownLastScriptEndMaxMs: m((l) => l.own.lastScriptEndMs.max),
        ownLargestContentfulPaintMaxMs: m((l) => l.own.largestContentfulPaintMs.max),
        containerCpuMsToFirstApi: m((l) => l.countedToFirstApi?.containerCpuMs ?? null),
        cpuStallSomeMsToFirstApi: m((l) => l.countedToFirstApi?.containerCpuStallSomeMs ?? null),
        ioStallSomeMsToFirstApi: m((l) => l.countedToFirstApi?.containerIoStallSomeMs ?? null),
        readBytesToFirstApi: m((l) => l.countedToFirstApi?.containerReadBytes ?? null),
      }]
    }),
  )
  writeFileSync(join(config.scratch, OUT_NAME), JSON.stringify(out, null, 2))
  console.log(`wrote ${OUT_NAME}`)
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
