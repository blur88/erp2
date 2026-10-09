// Case 17: sign-out under INDUCED delay.
//
// What it is: several tabs of one signed-in profile load while filler traffic
// keeps the ingress limiter delaying, and one of the tabs signs out. The
// fillers are sent by this Node process (lib/node-fillers.mjs): bounded,
// identified and rate-controlled, from the same container as the browser and
// so from the same address and into the same limiter bucket as the
// application. That is read from the ingress log of every attempt, not assumed.
// The fillers are the load generator; the application workload the scenario
// makes its claim about is the tabs.
//
// What it shows: what a sign-out does to an application request the ingress is
// holding. What it does NOT show: that a restored window makes the limiter
// delay by itself. In the recorded runs it mostly does not at ten and twenty
// tabs, which is why this is a scenario of its own and W1's natural sign-out
// round only reports whether a delay happened to overlap (amendment of
// 2026-10-09 to the #1353 design).
//
// Pass, at each of 5, 10 and 20 application tabs (lib/induced-signout.mjs):
//   - the harness recorded when the sign-out was initiated, and a data request
//     of the application that was still pending immediately before it;
//   - that same request, by its identifier, has a line in the ingress log
//     saying the limiter was delaying it;
//   - what became of it is recorded: answered, or cancelled by the sign-out
//     (not by the harness closing the tab, a navigation of the tab, or
//     anything else). The application aborts its in-flight requests when it
//     signs out, before it sends the logout; that is valid behaviour;
//   - the logout was sent and answered 2xx, no request to refresh, logout or me
//     was answered 429, every application tab is on the login page in the
//     document it first loaded, and none of them shows stale data of the
//     session.
// Missing evidence or correlation is inconclusive, which fails. A behavioural
// failure fails at once and is never set up again. An attempt that behaved and
// lacked the evidence may be set up again, at most MAX_INDUCED_ATTEMPTS times
// per size, and every attempt is recorded. No application delay observed is a
// missed setup, not an application failure.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sleep } from '../lib/config.mjs'
import { USER_MENU, documentId, onLoginPage, pageFetch } from '../lib/harness.mjs'
import { startNodeFillers, stopAllNodeFillers } from '../lib/node-fillers.mjs'
import { diagnostics, windowBetween } from '../lib/ingress-log.mjs'
import { INDUCED_SIZES, MAX_INDUCED_ATTEMPTS, judgeInducedSignOut, preLogoutWindow } from '../lib/induced-signout.mjs'

const REPO_ROOT = new URL('../../../..', import.meta.url)
const { parseLine } = await import(pathToFileURL(join(REPO_ROOT.pathname, 'nginx/access-log.mjs')).href)

// A route under api_limit. Sent without a token, so the backend answers 401 at
// once and does no work for it; what matters is that the ingress counts it.
const FILLER_ROUTE = '/api/settings/regional'
// How long the fillers run before the tabs are opened, so that the limiter is
// already delaying when the application's first requests arrive.
const FILLER_HEAD_START_MS = 3000

function readIngress(config) {
  if (!config.ingressLog || !existsSync(config.ingressLog)) return null
  return readFileSync(config.ingressLog, 'utf8').split('\n').map(parseLine).filter(Boolean)
}

// The fillers: 40 a second against a zone rate of 20, never more than 12
// outstanding, so the limiter's excess is held above its delay threshold (20)
// and below its burst (40) with room for the application's own six
// connections. Bounded in number and in time whatever else happens.
const FILLERS = { ratePerSecond: 40, maxInFlight: 12, maxTotal: 12000, maxMs: 4 * 60 * 1000 }

/** Whether a signed-out tab still shows something of the session: the user menu, or the dashboard. */
const staleUi = (page) =>
  page
    .evaluate((menu) => {
      const heading = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].some((h) => (h.textContent || '').trim() === 'Dashboard')
      return !!document.querySelector(menu) || heading
    }, USER_MENU)
    .catch(() => null)

export default [
  {
    id: 17,
    name: 'Sign-out under induced delay',
    async run(ctx) {
      const { config, zones } = ctx
      ctx.allow429 = true // the fillers, and business requests they crowd out, are expected to meet the limiter
      ctx.record('scenario', {
        kind: 'induced delay',
        claim: 'What a sign-out does to an application request the ingress is holding. Not that a restored window produces that delay by itself.',
        sizes: INDUCED_SIZES,
        maxAttemptsPerSize: MAX_INDUCED_ATTEMPTS,
        fillers: { route: FILLER_ROUTE, sentBy: 'this Node process (lib/node-fillers.mjs)', authenticated: false, headStartMs: FILLER_HEAD_START_MS, ...FILLERS },
      })
      const drainMs =
        Math.max(
          zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst),
          zones.drainWaitSeconds(zones.session.ratePerSecond, zones.session.burst),
        ) * 1000

      const profile = await ctx.profile({ intercept: true, tagRequests: true })
      const holder = await profile.tab('/login', { label: 'holder', navigate: false })
      const attempts = []
      ctx.record('attempts', attempts)

      try {
        for (const n of INDUCED_SIZES) {
          let verdict = null
          for (let attempt = 1; attempt <= MAX_INDUCED_ATTEMPTS; attempt += 1) {
            // A stored session to open the tabs with; the attempt before signed it out.
            await ctx.signIn(holder, config.userC)
            await holder.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
            await sleep(drainMs)

            const tag = `mark-17-${n}-${attempt}`
            const mark = profile.mark()
            await pageFetch(holder, { path: '/manifest.json', qaId: `${tag}-in` })
            const fillers = startNodeFillers({ base: config.base, path: FILLER_ROUTE, prefix: `fill-${n}-${attempt}`, ...FILLERS })
            let filled = null
            const pages = []
            let documents = []
            let signOutAt = null
            let error = null
            let ended = []
            try {
              await sleep(FILLER_HEAD_START_MS)
              for (let i = 0; i < n; i += 1) pages.push(await profile.tab('/dashboard', { label: `i${n}-${attempt}-${i + 1}`, navigate: false }))
              await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })))
              documents = await Promise.all(pages.map(documentId))
              ended = pages.map(() => false)
              try {
                const first = await Promise.any(
                  pages.map((page) => page.locator(USER_MENU).first().waitFor({ state: 'visible', timeout: 120000 }).then(() => page)),
                )
                await first.locator(USER_MENU).first().click({ timeout: 10000 })
                const item = first.getByRole('menuitem', { name: 'Logout' })
                await item.waitFor({ state: 'visible', timeout: 10000 })
                // The sign-out is initiated here. What was pending immediately
                // before it is read from the harness's records by this instant.
                signOutAt = Date.now()
                await item.click({ timeout: 10000 })
                ended = await Promise.all(pages.map((page) => onLoginPage(page, 90000)))
              } catch (err) {
                // No tab came up signed in, or the sign-out could not be clicked: a
                // behaviour of the application under this load, recorded as such.
                error = String(err && err.message ? err.message : err).split('\n')[0]
              }
            } finally {
              // Stopped on every way out of the attempt.
              filled = await fillers.stop()
            }
            await sleep(2000) // time for anything late to reach a signed-out tab
            const stale = await Promise.all(pages.map(staleUi))
            await pageFetch(holder, { path: '/manifest.json', qaId: `${tag}-out` })
            await sleep(2500) // the ingress writes its log once a second

            const same = await Promise.all(pages.map(async (page, i) => (await documentId(page).catch(() => null)) === documents[i]))
            // From here on a cancellation is the harness's own doing.
            const cleanupAt = Date.now()
            const log = profile.since(mark)
            const logoutEntry = log.find((e) => e.path.replace(/\/$/, '') === '/api/auth/logout')
            const entries = readIngress(config)
            const window = entries === null ? null : windowBetween(entries, `${tag}-in`, `${tag}-out`)
            const lines = window === null ? [] : window.entries
            const observed = {
              n,
              attempt,
              signOutAt,
              logoutAnsweredAt: logoutEntry?.respondedAt ?? null,
              cleanupAt,
              app: log
                .filter((e) => e.qaId)
                .map((e) => ({
                  qaId: e.qaId, tab: e.tab, zone: e.zone, method: e.method, path: e.path,
                  issuedAt: e.issuedAt, respondedAt: e.respondedAt ?? null, failedAt: e.failedAt ?? null, failed: e.failed ?? null, status: e.status ?? null,
                })),
              ingress: window === null ? null : lines,
              tabs: pages.map((page, i) => ({ tab: profile.label(page), onLoginPage: ended[i] === true, sameDocument: same[i] === true, staleUi: stale[i] === true })),
              logoutStatuses: log.filter((e) => e.path.replace(/\/$/, '') === '/api/auth/logout').map((e) => e.status ?? e.failed ?? null),
              sessionRoute429: log.filter((e) => e.zone === 'session' && e.status === 429).length,
            }
            verdict = error && observed.logoutStatuses.length === 0
              // The limiter was meant to be delaying; that no tab got as far as a
              // sign-out under it is the scenario not coming about, and is set
              // up again like any other missed setup.
              ? { verdict: 'inconclusive', behaviour: 'ok', reason: `no sign-out could be made: ${error}`, retry: true }
              : judgeInducedSignOut(observed)

            const count = (prefix, pred) => lines.filter((e) => e.qaId && e.qaId.startsWith(prefix) && pred(e)).length
            attempts.push({
              n,
              attempt,
              verdict: verdict.verdict,
              behaviour: verdict.behaviour,
              reason: verdict.reason,
              error,
              signOutAt,
              logoutAnsweredAt: observed.logoutAnsweredAt,
              cleanupAt,
              // Every request pending at the sign-out, with whether the ingress
              // delayed it and what became of it; and the ones that are the evidence.
              pending: verdict.pending ?? null,
              evidence: verdict.evidence ?? null,
              tabs: observed.tabs,
              logoutStatuses: observed.logoutStatuses,
              sessionRoute429: observed.sessionRoute429,
              fillers: {
                ...filled,
                atIngress: count('fill-', () => true),
                delayed: count('fill-', (e) => e.limitReq === 'DELAYED'),
                refused: count('fill-', (e) => e.status === 429),
              },
              application: {
                requests: count('app-', () => true),
                delayed: count('app-', (e) => e.limitReq === 'DELAYED'),
                refused: count('app-', (e) => e.status === 429),
              },
              addresses: [...new Set(lines.filter((e) => e.qaId && /^(app|fill)-/.test(e.qaId)).map((e) => e.remoteAddr))],
              // Corroboration only; decides nothing.
              preLogoutWindow: window === null ? null : preLogoutWindow(lines),
              ingress: window === null ? { unavailable: entries === null ? 'no ingress log' : 'the attempt\'s markers were not in the ingress log' } : diagnostics(lines),
            })
            console.log(`    N=${n} attempt ${attempt}: ${verdict.verdict} - ${verdict.reason}`)
            for (const page of pages) await page.close().catch(() => undefined)
            if (!(verdict.verdict === 'inconclusive' && verdict.retry === true)) break
          }
          ctx.check(
            `N = ${n}: a data request of the application was pending and delayed by the limiter when a tab signed out (induced delay); the logout was answered 2xx and every tab reached the login page without a reload and without stale data`,
            verdict !== null && verdict.verdict === 'pass',
            { verdict: verdict?.verdict ?? null, reason: verdict?.reason ?? null, attempts: attempts.filter((a) => a.n === n).map((a) => ({ attempt: a.attempt, verdict: a.verdict, reason: a.reason })) },
          )
        }
      } finally {
        // Whatever ended the case, no generator outlives it.
        await stopAllNodeFillers()
      }
    },
  },
]
