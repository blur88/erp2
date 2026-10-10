#!/usr/bin/env node
// Diagnostic, not a case: the 20-tab expired-token round of W1, instrumented to
// show where a refresh token is presented late (the replay revocation of the
// recorded run on 198943047). It judges nothing and changes nothing in the
// application.
//
// Recorded per attempt, all on the browser container's clock unless said:
//   - every request to refresh, logout and me: tab, status, when it was issued,
//     sent and answered, the fingerprint of the access token it carried and of
//     the refresh token a refresh presented;
//   - the stored record as a tab of the same profile reads it, every 200 ms:
//     generation, the fingerprints of both tokens, the access expiry, the
//     refresh lease (owner and expiry), and how long the read itself took;
//   - per tab: its first request, its first 2xx data answer, how many 401s it
//     got, and what its console and page errors said;
//   - the trace of the refresh path from each tab's own document
//     (window.__erpSessionTrace), read at the end of the attempt, with the
//     document's time origin at both ends and whether the timing flag was set.
//
// Run by run-one.sh against the QA stack. Writes <scratch>/replay-diagnosis.json.
// The server's own rows for the round are read afterwards by
// replay-server-rows.sh, and judge-replay.mjs joins the two.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launchOptions, loadConfig, loadPlaywright, loadZones, sleep } from './lib/config.mjs'
import { CaseContext, Run, fingerprint, readStored } from './lib/harness.mjs'
import { machine, servedBuild } from './lib/machine.mjs'

const TABS = Number(process.env.QA_REPLAY_TABS || 20)
const ATTEMPTS = Number(process.env.QA_REPLAY_ATTEMPTS || 3)
const WATCH_MS = 60000

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
// replaced or reloaded during the attempt has lost it, and the attempt says so
// rather than reporting an empty trace as a complete one.
const readTrace = (page) =>
  page
    .evaluate(() => {
      const events = window.__erpSessionTrace
      let flagSet = false
      try {
        flagSet = sessionStorage.getItem('erp-session-timing') === '1'
      } catch {
        flagSet = false
      }
      return {
        flagSet,
        timeOriginAtEnd: performance.timeOrigin,
        events: Array.isArray(events) ? events.slice() : [],
      }
    })
    .catch(() => null)

const readTimeOrigin = (page) =>
  page
    .evaluate(() => performance.timeOrigin)
    .catch(() => null)


async function main() {
  const config = loadConfig()
  const zones = await loadZones()
  const { chromium } = loadPlaywright()
  const browser = await chromium.launch(launchOptions(config))
  const run = new Run({ config, zones, browser })
  const ctx = new CaseContext(run, 'replay-diagnosis')
  ctx.allow429 = true
  const out = {
    what: 'diagnostic: the 20-tab expired-token round, instrumented. Judges nothing.',
    startedAt: new Date().toISOString(),
    commit: process.env.QA_COMMIT || null,
    servedBuild: await servedBuild(config.base),
    chromium: browser.version(),
    machine: machine(),
    configurationDuring: config.show,
    tabs: TABS,
    attempts: [],
  }
  try {
    // `timing: true` sets the flag the runtime's trace is opt-in behind; without
    // it the flag is unset in the page and the trace is empty.
    const profile = await ctx.profile({ timing: true })
    const holder = await profile.tab('/login', { label: 'holder', navigate: false })
    await ctx.signIn(holder, config.userC)
    await holder.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      const before = snapshot(await readStored(holder))
      if (before.generation === null) break // the session is gone: nothing to open tabs with
      const untilExpired = before.accessTokenExpiresAt * 1000 + 2000 - Date.now()
      if (untilExpired > 0) await sleep(untilExpired)
      await sleep(zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst) * 1000)

      const mark = profile.mark()
      const samples = []
      let sampling = true
      const sampler = (async () => {
        while (sampling) {
          const started = Date.now()
          try {
            samples.push({ t: started, ...snapshot(await readStored(holder)), readMs: Date.now() - started })
          } catch (err) {
            samples.push({ t: started, error: String(err.message).slice(0, 120), readMs: Date.now() - started })
          }
          await sleep(200)
        }
      })()

      const pages = []
      for (let i = 0; i < TABS; i += 1) pages.push(await profile.tab('/dashboard', { label: `t${i + 1}`, navigate: false }))
      const opened = Date.now()
      await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' }).catch(() => null)))
      const openedOrigins = await Promise.all(pages.map((page) => readTimeOrigin(page)))

      // Until the session has ended, or nothing has been sent for five seconds
      // after at least one data request was answered 2xx, or the time is up.
      for (;;) {
        await sleep(500)
        const log = profile.since(mark)
        const last = log.reduce((m, e) => Math.max(m, e.respondedAt ?? e.issuedAt), 0)
        const answered = log.some((e) => e.zone === 'business' && e.status >= 200 && e.status < 300)
        const gone = samples.length > 0 && samples.at(-1).generation === null
        if (gone || (answered && Date.now() - last > 5000) || Date.now() - opened > WATCH_MS) break
      }
      sampling = false
      await sampler

      // The trace, out of each tab's own document, before the page is closed.
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
      const ended = Date.now()

      const log = profile.since(mark)
      const sessionRequests = log
        .filter((e) => e.zone === 'session')
        .map((e) => ({
          tab: e.tab, path: e.path, status: e.status ?? e.failed ?? null,
          issuedAt: e.issuedAt, sentAt: e.sentAt, respondedAt: e.respondedAt ?? null,
          accessFingerprint: e.token ?? null, presentedRefresh: e.presented ?? null,
        }))
      const perTab = pages.map((page) => {
        const own = log.filter((e) => e.page === page)
        const data = own.filter((e) => e.zone === 'business')
        const ok = data.filter((e) => e.status >= 200 && e.status < 300)
        return {
          tab: profile.label(page),
          firstRequestAt: own.length ? Math.min(...own.map((e) => e.issuedAt)) : null,
          first2xxDataAt: ok.length ? Math.min(...ok.map((e) => e.respondedAt ?? e.issuedAt)) : null,
          data401: data.filter((e) => e.status === 401).length,
          data2xx: ok.length,
          tokensUsed: [...new Set(data.map((e) => e.token).filter(Boolean))],
          at: (() => { try { return new URL(page.url()).pathname } catch { return null } })(),
          errors: (profile.errors.get(page) ?? []).slice(0, 12),
        }
      })
      // The stored record's changes only: one line per change of generation or lease.
      const changes = []
      let previous = ''
      for (const s of samples) {
        const key = JSON.stringify([s.generation, s.refreshFingerprint, s.accessFingerprint, s.lease, s.error ?? null])
        if (key !== previous) changes.push(s)
        previous = key
      }
      const after = snapshot(await readStored(holder))
      out.attempts.push({
        attempt, openedAt: opened, endedAt: ended,
        sessionId: before.sessionId,
        // The roster the round's traces are checked against.
        tabCount: TABS,
        before, after,
        sessionEnded: after.generation === null,
        sessionRequests, perTab,
        traces,
        storedChanges: changes,
        storedReadMs: { n: samples.length, max: Math.max(0, ...samples.map((s) => s.readMs)), over1s: samples.filter((s) => s.readMs > 1000).length },
        dataAnswers: {
          total: log.filter((e) => e.zone === 'business').length,
          status401: log.filter((e) => e.zone === 'business' && e.status === 401).length,
          status2xx: log.filter((e) => e.zone === 'business' && e.status >= 200 && e.status < 300).length,
        },
      })
      console.log(`attempt ${attempt}: session requests ${sessionRequests.map((r) => `${r.tab} ${r.path.split('/').pop()} ${r.status}`).join(', ')}; session ended ${after.generation === null}`)
      for (const page of pages) await page.close().catch(() => null)
      if (after.generation === null) break
    }
  } catch (err) {
    out.error = err && err.stack ? err.stack : String(err)
  } finally {
    try { await ctx.close() } catch { /* nothing recorded depends on it */ }
    await browser.close()
  }
  out.finishedAt = new Date().toISOString()
  writeFileSync(join(config.scratch, 'replay-diagnosis.json'), JSON.stringify(out, null, 2))
  console.log('wrote replay-diagnosis.json')
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
