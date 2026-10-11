#!/usr/bin/env node
// One cell of the replay stall runs (#1370): the 20-tab expired-token round of
// W1 under the cell's conditions, round after round. Diagnostic: it judges
// nothing (judge-stall.mjs does) and changes nothing in the application.
//
// docs/modules/auth/REPLAY_STALL_PROTOCOL.md is the protocol. What a round does,
// in the order lib/observation.mjs runRound fixes:
//
//   reset checks, a fresh profile and sign-in, the access token left to expire;
//   the CPU workers (processor cell); the spare reader's sampling of the stored
//   record; the tab pages, created but not navigated; a refresh hold armed on
//   every one of them; navigation; the three observation phases; collection.
//
// In a hold cell the round's first refresh is kept in the browser until another
// tab is an eligible peer (or the barrier runs out) and the store hold is
// confirmed, then let go. The store hold is a spare tab paused inside a
// read-write transaction on erp-session/kv. Both are recorded with their times,
// and the spare reader's own blocked reads are the independent sign that the
// store really was held.
//
//   QA_STALL_CELL, QA_STALL_KIND=calibration|recorded, QA_STALL_ROUNDS,
//   QA_STALL_GATE, QA_STALL_BARRIER_MS, QA_STALL_NUDGE_PATH,
//   and for calibration only QA_STALL_HOLD_MS, QA_STALL_PROBE
//
// Run by stall-cell.sh through run-one.sh. Writes <scratch>/stall-diagnosis.json
// after every round, so a run that dies keeps the rounds it finished.
import { loadavg } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { stallOptions } from './lib/stall-cells.mjs'

let options
try {
  options = stallOptions(process.env)
} catch (err) {
  // Before anything is loaded or opened: a recorded round cannot start under a
  // setting the matrix does not name.
  console.error(`refusing: ${err.message}`)
  process.exit(2)
}

const { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } = await import('./lib/config.mjs')
const { CaseContext, Run, fingerprint, nudge, readStored, withTimeout } = await import('./lib/harness.mjs')
const { machine, servedBuild } = await import('./lib/machine.mjs')
const { nextStep, refreshOperations, runRound } = await import('./lib/observation.mjs')
const { cpuLoadRunning, cpuLoadStart, cpuLoadStop } = await import('./lib/probe.mjs')
const { requestIdFor } = await import('./lib/request-id.mjs')
const { eligiblePeers, probePeer, readiness, startHold, storeIsFree } = await import('./lib/store-hold.mjs')
const { LATENESS_CAP, PROBE_INTERVAL_MS, latenessProbe, readLateness, summariseLateness } = await import('./lib/timer-lateness.mjs')
const { parseLine } = await import('../../../nginx/access-log.mjs')

const REFRESH_PATH = '/api/auth/refresh'
const TICK_MS = 500
const CPU_LEAD_MS = 5000

const snapshot = (stored) => {
  const session = stored?.record?.session ?? null
  return {
    // The session id, not a token: it scopes the round's server rows.
    sessionId: session?.sessionId ?? null,
    generation: session?.generation ?? null,
    accessFingerprint: fingerprint(session?.accessToken ?? null),
    refreshFingerprint: fingerprint(session?.refreshToken ?? null),
    accessTokenExpiresAt: session?.accessTokenExpiresAt ?? null,
    lease: stored?.refreshLease ?? null,
  }
}

// The trace lives in `window`, so it belongs to one document: a page that was
// replaced or reloaded has lost it, and the round says so.
const readTrace = (page, timeout = 5000) =>
  withTimeout(
    page.evaluate(() => {
      const events = window.__erpSessionTrace
      let flagSet = false
      try {
        flagSet = sessionStorage.getItem('erp-session-timing') === '1'
      } catch {
        flagSet = false
      }
      return { flagSet, timeOriginAtEnd: performance.timeOrigin, events: Array.isArray(events) ? events.slice() : [] }
    }),
    timeout,
    'the tab did not hand over its trace',
  ).catch(() => null)

const readTimeOrigin = (page) => page.evaluate(() => performance.timeOrigin).catch(() => null)

// The round's refresh lines from the ingress log: when the ingress finished
// with each request, by the identifier the profile tagged it with.
function ingressRefreshes(config, fromMs) {
  if (!config.ingressLog) return null
  try {
    return readFileSync(config.ingressLog, 'utf8')
      .split('\n')
      .map(parseLine)
      .filter((line) => line && line.uri.replace(/\/$/, '') === REFRESH_PATH && line.endMs >= fromMs && line.qaId)
      .map((line) => ({ requestId: line.qaId, path: REFRESH_PATH, status: line.status, startMs: line.startMs, completedAtMs: line.endMs, requestTimeMs: line.requestMs }))
  } catch {
    return null
  }
}

async function oneRound({ ctx, config, zones, number, previousSessionEnded }) {
  const { settings, mechanism } = options
  const holdCell = settings.holdMs > 0
  const record = {
    attempt: number,
    hostLoad: { oneMinute: loadavg()[0], at: Date.now() },
    tabCount: settings.tabs,
    sessionId: null,
    hold: null,
    readiness: null,
    peerEvidence: null,
    phases: null,
    resourceLimit: null,
    cpuLoad: null,
    lateness: null,
    ingress: null,
  }
  let profile = null
  let reader = null
  let blocker = null
  let pages = []
  let before = null
  let mark = 0
  let opened = null
  let sampling = false
  let sampler = null
  const samples = []
  let holdHandle = null
  let holdRelease = null
  let cpuStarted = false
  let sessionEnded = false
  let openedOrigins = []
  const captures = []

  const limit = (what) => {
    if (record.resourceLimit === null) record.resourceLimit = what
  }

  // A captured refresh goes to the server as it was, with the identifier a
  // tagged request would have been given, so it can be found in the ingress log.
  const letGo = async (item) => {
    const request = item.route.request()
    const qaId = requestIdFor(request.headers(), item.entry ? item.entry.seq : 0)
    if (item.entry) {
      item.entry.qaId = qaId
      item.entry.releasedAt = Date.now()
    }
    await item.route.continue({ headers: { ...request.headers(), 'x-qa-request-id': qaId } })
  }

  // The round's first refresh: wait for an eligible peer, hold the store, let
  // the request go, release the hold when it is due.
  const onFirstRefresh = async (page, item) => {
    const refresherTab = profile.label(page)
    const hold = { requestedMs: settings.holdMs, refresherTab, gate: mechanism.gate, gateCapturedAt: item.capturedAt, activeAt: null, continuedAt: null, releasedAt: null, observedMs: null, error: null }
    record.hold = hold
    const others = pages.filter((p) => p !== page)
    const tabs = pages.map((p) => profile.label(p))
    let probes = []
    try {
      const deadline = item.capturedAt + (mechanism.gate ? mechanism.barrierMs : 0)
      for (;;) {
        probes = await Promise.all(others.map((p) => probePeer(p, profile.label(p))))
        const at = Date.now()
        const peers = eligiblePeers(probes, samples, { refresherTab, before, at })
        if (peers.length > 0 || at >= deadline) {
          record.readiness = { ...readiness(probes, samples, tabs, { refresherTab, before, at }), at, barrierWaitedMs: at - item.capturedAt }
          record.peerEvidence = peers
          break
        }
        await sleep(100)
      }
      if (mechanism.gate) {
        holdHandle = await startHold(blocker, settings.holdMs)
        hold.activeAt = holdHandle.activeAt
        await letGo(item)
        hold.continuedAt = Date.now()
      } else {
        await letGo(item)
        hold.continuedAt = Date.now()
        holdHandle = await startHold(blocker, settings.holdMs)
        hold.activeAt = holdHandle.activeAt
      }
      holdRelease = holdHandle.whenDue.then(() => releaseHold())
    } catch (err) {
      hold.error = String(err?.message ?? err).slice(0, 300)
      if (hold.continuedAt === null) {
        await letGo(item).catch(() => null)
        hold.continuedAt = Date.now()
      }
    }
  }

  const releaseHold = async () => {
    if (!holdHandle) return
    const released = await holdHandle.release()
    if (record.hold && record.hold.releasedAt === null) Object.assign(record.hold, released)
  }

  const result = await runRound({
    async resetChecks() {
      const failed = []
      if (await cpuLoadRunning(config)) {
        failed.push('cpu-load-running')
        await cpuLoadStop(config).catch(() => null)
      }
      if (ctx.profiles.length > 0) failed.push('previous-profile-open')
      if (previousSessionEnded === false) failed.push('previous-session-not-ended')
      // A fresh profile and a fresh sign-in for every round.
      profile = await ctx.profile({ timing: true, intercept: true, tagRequests: true })
      reader = await profile.tab('/login', { label: 'reader', navigate: false })
      await ctx.signIn(reader, config.userC)
      await reader.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
      const free = await storeIsFree(reader)
      if (!free.free) failed.push('store-not-free')
      const drainMs = zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst) * 1000
      await sleep(drainMs)
      return { ok: failed.length === 0, failed, storeReadMs: free.readMs, limiterDrainMs: drainMs }
    },

    async openProfile() {
      blocker = await profile.tab('/login', { label: 'blocker', navigate: false })
      await blocker.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
      before = snapshot(await readStored(reader))
      record.sessionId = before.sessionId
      record.before = before
      if (before.generation === null) throw new Error('the round has no session to open tabs with')
      const untilExpired = before.accessTokenExpiresAt * 1000 + 2000 - Date.now()
      if (untilExpired > 0) await sleep(untilExpired)
    },

    async startCpuLoad() {
      if (settings.cpuWorkers === 0) return
      const startedAt = await cpuLoadStart(config, settings.cpuWorkers)
      cpuStarted = true
      record.cpuLoad = { workers: settings.cpuWorkers, startedAt, stoppedAt: null }
      await sleep(CPU_LEAD_MS)
    },

    async startSampler() {
      sampling = true
      sampler = (async () => {
        while (sampling) {
          const started = Date.now()
          try {
            samples.push({ t: started, ...snapshot(await readStored(reader)), readMs: Date.now() - started })
          } catch (err) {
            samples.push({ t: started, error: String(err.message).slice(0, 120), readMs: Date.now() - started })
          }
          await sleep(200)
        }
      })()
      // One sample at least before anything navigates: the peer rule reads them.
      while (samples.length === 0) await sleep(50)
    },

    async createPages() {
      const init = settings.probe ? { fn: latenessProbe, arg: { intervalMs: PROBE_INTERVAL_MS, cap: LATENESS_CAP } } : undefined
      for (let i = 0; i < settings.tabs; i += 1) {
        const page = await profile.tab('/dashboard', { label: `t${i + 1}`, navigate: false, init })
        page.on('crash', () => limit(`page crashed: ${profile.label(page)}`))
        pages.push(page)
      }
    },

    async armHolds() {
      if (!holdCell) return
      for (const page of pages) {
        const hold = profile.armHoldRefresh(page)
        hold.captured.then(async () => {
          const item = hold.items[0]
          hold.released = true
          const first = captures.length === 0
          captures.push({ tab: profile.label(page), capturedAt: item.capturedAt })
          if (first) await onFirstRefresh(page, item)
          else await letGo(item).catch(() => null)
        })
      }
    },

    async navigate() {
      mark = profile.mark()
      opened = Date.now()
      record.openedAt = opened
      await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' }).catch(() => null)))
      openedOrigins = await Promise.all(pages.map((page) => readTimeOrigin(page)))
    },

    async observe() {
      const state = {
        openedAt: opened, holdExpected: holdCell, holdReleasedAt: null, firstSupersededAt: null, graceMs: settings.graceSeconds * 1000,
        sessionEnded: false, refreshOps: [], phase2StartedAt: null, noSupersession: false, nudgeAt: null,
      }
      const completed = new Map() // log entry -> completeAt
      let nudgeRecord = null
      for (;;) {
        await sleep(TICK_MS)
        if (!ctx.run.browser.isConnected()) {
          limit('the browser closed')
          throw new Error('the browser closed during the round')
        }
        const log = profile.since(mark)
        const refreshes = log.filter((e) => e.path.replace(/\/$/, '') === REFRESH_PATH)
        const last = samples.at(-1)
        state.sessionEnded = last !== undefined && last.error === undefined && last.generation === null
        state.holdReleasedAt = record.hold?.releasedAt ?? null
        // A hold that could not be started will never be released: the round
        // has not landed, and it is not kept waiting for a release.
        if (holdCell && record.hold?.error && state.holdReleasedAt === null) state.holdReleasedAt = Date.now()
        const firstOk = refreshes.find((e) => e.status === 200)
        if (state.firstSupersededAt === null && firstOk) state.firstSupersededAt = firstOk.respondedAt

        // Whether each refresh's operation is complete is read from its own
        // tab's trace, and only while it is not: the n-th refresh the harness
        // recorded for a tab is the n-th the tab's trace shows.
        for (const page of pages) {
          const own = refreshes.filter((e) => e.page === page)
          if (own.every((e) => completed.has(e))) continue
          const read = await readTrace(page, 2000)
          if (!read) continue
          const ops = refreshOperations([{ tab: profile.label(page), events: read.events }])
          own.forEach((entry, index) => {
            const at = ops[index]?.completeAt ?? null
            if (at !== null) completed.set(entry, at)
          })
        }
        state.refreshOps = refreshes.map((e) => ({ sentAt: e.issuedAt, completeAt: completed.get(e) ?? null }))

        const step = nextStep(state, Date.now())
        if (step.action === 'enter-passive') {
          state.phase2StartedAt = Date.now()
          state.noSupersession = step.flags.noSupersession
        } else if (step.action === 'nudge') {
          const probes = await Promise.all(pages.map((p) => probePeer(p, profile.label(p))))
          const targets = pages.filter((p, i) => probes[i].alive && probes[i].onSignedInRoute && !probes[i].storageWaiting)
          state.nudgeAt = Date.now()
          await Promise.all(targets.map((p) => nudge(p, mechanism.nudgePath).catch(() => null)))
          nudgeRecord = { at: state.nudgeAt, path: mechanism.nudgePath, tabs: targets.map((p) => profile.label(p)) }
        } else if (step.action === 'end') {
          record.phases = {
            endedIn: step.phase,
            phase2StartedAt: state.phase2StartedAt,
            firstSupersededAtBrowser: state.firstSupersededAt,
            noSupersession: state.noSupersession,
            noRefreshAfterNudge: step.flags.noRefreshAfterNudge,
            unfinishedAtCap: step.flags.unfinishedAtCap,
            passiveRefreshSeen: step.flags.passiveRefreshSeen,
            nudge: nudgeRecord,
          }
          break
        }
      }
    },

    async collect() {
      await releaseHold().catch(() => null)
      const traces = await Promise.all(
        pages.map(async (page, index) => {
          const read = await readTrace(page)
          return {
            tab: profile.label(page),
            flagSet: read?.flagSet ?? false,
            timeOriginAtOpen: openedOrigins[index] ?? null,
            timeOriginAtEnd: read?.timeOriginAtEnd ?? null,
            collected: read !== null,
            events: read?.events ?? [],
          }
        }),
      )
      record.traces = traces
      if (settings.probe) {
        const late = await Promise.all(pages.map((page) => readLateness(page, profile.label(page))))
        const held = record.hold?.activeAt && record.hold?.releasedAt ? { from: record.hold.activeAt, to: record.hold.releasedAt } : null
        record.lateness = {
          intervalMs: PROBE_INTERVAL_MS,
          tabsRead: late.filter(Boolean).length,
          whole: summariseLateness(late),
          duringHold: held ? summariseLateness(late, held) : null,
          beforeHold: held ? summariseLateness(late, { from: opened, to: held.from }) : null,
          // Every firing more than 50 ms late, per tab; the on-time ones are counted above.
          late: late.filter(Boolean).map((t) => ({ tab: t.tab, capped: t.capped, samples: t.samples.filter((s) => s.late > 50) })),
        }
      }
      // The ingress writes its log at most a second behind.
      await sleep(1500)
      record.ingress = ingressRefreshes(config, opened - 1000)
      const ended = Date.now()
      record.endedAt = ended

      const log = profile.since(mark)
      record.sessionRequests = log
        .filter((e) => e.zone === 'session')
        .map((e) => ({
          tab: e.tab, path: e.path, status: e.status ?? e.failed ?? null,
          issuedAt: e.issuedAt, heldAt: e.heldAt ?? null, releasedAt: e.releasedAt ?? null, sentAt: e.sentAt, respondedAt: e.respondedAt ?? null,
          accessFingerprint: e.token ?? null, presentedRefresh: e.presented ?? null, requestId: e.qaId ?? null,
        }))
      record.perTab = pages.map((page) => {
        const own = log.filter((e) => e.page === page)
        const data = own.filter((e) => e.zone === 'business')
        const ok = data.filter((e) => e.status >= 200 && e.status < 300)
        return {
          tab: profile.label(page),
          firstRequestAt: own.length ? Math.min(...own.map((e) => e.issuedAt)) : null,
          first2xxDataAt: ok.length ? Math.min(...ok.map((e) => e.respondedAt ?? e.issuedAt)) : null,
          data401: data.filter((e) => e.status === 401).length,
          data2xx: ok.length,
          at: (() => { try { return new URL(page.url()).pathname } catch { return null } })(),
          errors: (profile.errors.get(page) ?? []).slice(0, 12),
        }
      })
      record.captures = captures
      // The stored record's changes only: one line per change of generation or lease.
      const changes = []
      let previous = ''
      for (const s of samples) {
        const key = JSON.stringify([s.generation, s.refreshFingerprint, s.accessFingerprint, s.lease, s.error ?? null])
        if (key !== previous) changes.push(s)
        previous = key
      }
      record.storedChanges = changes
      const reads = samples.map((s) => s.readMs)
      record.storedReadMs = { n: reads.length, max: Math.max(0, ...reads), over1s: reads.filter((ms) => ms > 1000).length, over5s: reads.filter((ms) => ms > 5000).length }
      const after = snapshot(await readStored(reader))
      record.after = after
      sessionEnded = after.generation === null
      record.sessionEnded = sessionEnded
      record.dataAnswers = {
        total: log.filter((e) => e.zone === 'business').length,
        status401: log.filter((e) => e.zone === 'business' && e.status === 401).length,
        status2xx: log.filter((e) => e.zone === 'business' && e.status >= 200 && e.status < 300).length,
      }
    },

    releaseHold,

    async stopSampler() {
      sampling = false
      if (sampler) await withTimeout(sampler, 30000, 'the sampler did not stop')
    },

    async stopCpuLoad() {
      if (!cpuStarted) return
      const stoppedAt = await cpuLoadStop(config)
      if (record.cpuLoad) record.cpuLoad.stoppedAt = stoppedAt
    },

    async closeTabs() {
      if (holdRelease) await holdRelease.catch(() => null)
      for (const page of pages) await page.close().catch(() => null)
      // The round's session is ended the way a user ends one, so the next round
      // starts with none of this user's sessions left alive.
      record.sessionEndedAtClose = sessionEnded
      if (!sessionEnded && reader && before?.generation !== null && before !== null) {
        try {
          await reader.goto(`${config.base}/dashboard`, { waitUntil: 'domcontentloaded' })
          await ctx.signOut(reader)
          await reader.waitForURL((u) => new URL(u).pathname === '/login', { timeout: 30000 })
          record.sessionEndedAtClose = true
        } catch (err) {
          record.sessionEndedAtClose = false
          record.signOutError = String(err?.message ?? err).slice(0, 200)
        }
      }
      await ctx.close()
    },
  })

  record.resetChecks = result.resetChecks
  record.error = result.error
  record.cleanupErrors = result.cleanupErrors
  // A round that did not get as far as collecting says what it has.
  record.openedAt ??= opened ?? Date.now()
  record.endedAt ??= Date.now()
  record.sessionEnded ??= sessionEnded
  record.traces ??= []
  record.sessionRequests ??= []
  record.storedChanges ??= []
  if (result.error && record.resourceLimit === null && /Target page, context or browser has been closed|browser closed|crash/i.test(result.error)) {
    record.resourceLimit = result.error.split('\n')[0].slice(0, 200)
  }
  return record
}

async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  if (config.graceSeconds !== options.settings.graceSeconds) {
    throw new Error(`the stack's grace is ${config.graceSeconds} s; cell ${options.cell} runs at ${options.settings.graceSeconds} s`)
  }
  const { chromium } = loadPlaywright()
  let browser = await chromium.launch(launchOptions(config))
  const out = {
    what: 'one cell of the replay stall runs (#1370). Judges nothing.',
    kind: options.kind,
    cell: options.cell,
    settings: options.settings,
    mechanism: options.mechanism,
    startedAt: new Date().toISOString(),
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    chromium: browser.version(),
    machine: machine(),
    configurationDuring: config.show,
    rounds: [],
  }
  const write = () => writeFileSync(join(config.scratch, 'stall-diagnosis.json'), JSON.stringify(out, null, 2))
  let previousSessionEnded = null
  try {
    for (let number = 1; number <= options.rounds; number += 1) {
      // A browser that died takes its round with it, not the cell.
      if (!browser.isConnected()) browser = await chromium.launch(launchOptions(config))
      const run = new Run({ config, zones, browser })
      const ctx = new CaseContext(run, `stall-${options.cell}-${number}`)
      ctx.allow429 = true
      const record = await oneRound({ ctx, config, zones, number, previousSessionEnded })
      previousSessionEnded = record.sessionEndedAtClose ?? null
      out.rounds.push(record)
      write()
      console.log(
        `round ${number}: ended in phase ${record.phases?.endedIn ?? '?'}; hold ${record.hold ? `${record.hold.observedMs ?? '?'} ms` : 'none'}; ` +
          `eligible peers ${record.readiness?.eligiblePeers ?? '-'}; session ended ${record.sessionEnded}` +
          `${record.resourceLimit ? `; resource limit: ${record.resourceLimit}` : ''}${record.error ? `; error: ${record.error.split('\n')[0]}` : ''}`,
      )
    }
  } catch (err) {
    out.error = err && err.stack ? err.stack : String(err)
  } finally {
    await browser.close().catch(() => null)
  }
  out.finishedAt = new Date().toISOString()
  write()
  console.log('wrote stall-diagnosis.json')
  process.exit(out.error ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
