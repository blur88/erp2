// Case 17: sign-out under INDUCED delay.
//
// What it is: several tabs of one signed-in profile load while filler traffic
// from another browser context keeps the ingress limiter delaying, and one of
// the tabs signs out. The fillers leave the same machine, so the same address,
// so the same limiter bucket as the application; that is read from the ingress
// log of every attempt and not assumed.
//
// What it shows: what a sign-out does to an application request the ingress is
// holding. What it does NOT show: that a restored window makes the limiter
// delay by itself. In the recorded runs it mostly does not at ten and twenty
// tabs, which is why this is a scenario of its own and W1's natural sign-out
// round only reports whether a delay happened to overlap (amendment of
// 2026-10-09 to the #1353 design).
//
// Pass, at each of 5, 10 and 20 application tabs (lib/induced-signout.mjs):
//   - the ingress log shows a request OF THE APPLICATION that the limiter was
//     delaying and that was outstanding when the logout reached the ingress;
//   - the logout was sent and answered 2xx, and no request to refresh, logout
//     or me was answered 429;
//   - every application tab is on the login page, in the document it first
//     loaded.
// Missing evidence is inconclusive, which fails. A behavioural failure fails at
// once and is never set up again. An attempt that behaved and found no
// application request outstanding may be set up again, at most
// MAX_INDUCED_ATTEMPTS times per size, and every attempt is recorded.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { sleep } from '../lib/config.mjs'
import { USER_MENU, documentId, onLoginPage, pageFetch } from '../lib/harness.mjs'
import { diagnostics, windowBetween } from '../lib/ingress-log.mjs'
import { INDUCED_SIZES, MAX_INDUCED_ATTEMPTS, appOverlap, judgeInducedSignOut } from '../lib/induced-signout.mjs'

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

/** Six filler requests kept in flight, each with its own identifier, until stopped. */
const startFillers = (page, path, prefix) =>
  page.evaluate(
    ({ path, prefix }) => {
      const f = { stop: false, sent: 0, statuses: {} }
      window.__qaFill = f
      const worker = async () => {
        while (!f.stop) {
          const id = `${prefix}-${String((f.sent += 1)).padStart(5, '0')}`
          try {
            const response = await fetch(path, { headers: { 'x-qa-request-id': id } })
            f.statuses[response.status] = (f.statuses[response.status] ?? 0) + 1
            await response.text()
          } catch {
            f.statuses.failed = (f.statuses.failed ?? 0) + 1
          }
        }
      }
      f.done = Promise.all(Array.from({ length: 6 }, worker))
    },
    { path, prefix },
  )

const stopFillers = (page) =>
  page.evaluate(async () => {
    const f = window.__qaFill
    f.stop = true
    await f.done
    return { sent: f.sent, statuses: f.statuses }
  })

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
        fillers: { route: FILLER_ROUTE, inFlight: 6, authenticated: false, headStartMs: FILLER_HEAD_START_MS },
      })
      const drainMs =
        Math.max(
          zones.drainWaitSeconds(zones.api.ratePerSecond, zones.api.burst),
          zones.drainWaitSeconds(zones.session.ratePerSecond, zones.session.burst),
        ) * 1000

      const profile = await ctx.profile({ intercept: true, tagRequests: true })
      const holder = await profile.tab('/login', { label: 'holder', navigate: false })
      // The fillers' own context: its own connections, and nothing intercepted
      // (their identifier is set by the request itself).
      const fillProfile = await ctx.profile({})
      const fillPage = await fillProfile.tab('/manifest.json', { label: 'fillers' })

      const attempts = []
      ctx.record('attempts', attempts)

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
          await startFillers(fillPage, FILLER_ROUTE, `fill-${n}-${attempt}`)
          await sleep(FILLER_HEAD_START_MS)

          const pages = []
          for (let i = 0; i < n; i += 1) pages.push(await profile.tab('/dashboard', { label: `i${n}-${attempt}-${i + 1}`, navigate: false }))
          await Promise.all(pages.map((page) => page.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })))
          const documents = await Promise.all(pages.map(documentId))

          let error = null
          let ended = pages.map(() => false)
          try {
            const first = await Promise.any(
              pages.map((page) => page.locator(USER_MENU).first().waitFor({ state: 'visible', timeout: 120000 }).then(() => page)),
            )
            await ctx.signOut(first)
            ended = await Promise.all(pages.map((page) => onLoginPage(page, 90000)))
          } catch (err) {
            // No tab came up signed in, or the sign-out could not be clicked: a
            // behaviour of the application under this load, recorded as such.
            error = String(err && err.message ? err.message : err).split('\n')[0]
          }
          const filled = await stopFillers(fillPage)
          await sleep(1500)
          await pageFetch(holder, { path: '/manifest.json', qaId: `${tag}-out` })
          await sleep(2500) // the ingress writes its log once a second

          const same = await Promise.all(pages.map(async (page, i) => (await documentId(page).catch(() => null)) === documents[i]))
          const log = profile.since(mark)
          const entries = readIngress(config)
          const window = entries === null ? null : windowBetween(entries, `${tag}-in`, `${tag}-out`)
          const observed = {
            n,
            attempt,
            ingress: window === null ? null : window.entries,
            tabs: pages.map((page, i) => ({ tab: profile.label(page), onLoginPage: ended[i] === true, sameDocument: same[i] === true })),
            logoutStatuses: log.filter((e) => e.path.replace(/\/$/, '') === '/api/auth/logout').map((e) => e.status ?? e.failed ?? null),
            sessionRoute429: log.filter((e) => e.zone === 'session' && e.status === 429).length,
          }
          verdict = error && observed.logoutStatuses.length === 0
            ? { verdict: 'fail', behaviour: 'failed', reason: `no sign-out happened: ${error}`, retry: false }
            : judgeInducedSignOut(observed)

          const lines = window === null ? [] : window.entries
          const overlap = window === null ? null : appOverlap(lines)
          attempts.push({
            n,
            attempt,
            verdict: verdict.verdict,
            behaviour: verdict.behaviour,
            reason: verdict.reason,
            error,
            overlap,
            tabs: observed.tabs,
            logoutStatuses: observed.logoutStatuses,
            sessionRoute429: observed.sessionRoute429,
            fillers: {
              ...filled,
              atIngress: lines.filter((e) => e.qaId && e.qaId.startsWith('fill-')).length,
              delayed: lines.filter((e) => e.qaId && e.qaId.startsWith('fill-') && e.limitReq === 'DELAYED').length,
              refused: lines.filter((e) => e.qaId && e.qaId.startsWith('fill-') && e.status === 429).length,
            },
            application: {
              requests: lines.filter((e) => e.qaId && e.qaId.startsWith('app-')).length,
              delayed: lines.filter((e) => e.qaId && e.qaId.startsWith('app-') && e.limitReq === 'DELAYED').length,
              refused: lines.filter((e) => e.qaId && e.qaId.startsWith('app-') && e.status === 429).length,
            },
            addresses: [...new Set(lines.filter((e) => e.qaId && /^(app|fill)-/.test(e.qaId)).map((e) => e.remoteAddr))],
            ingress: window === null ? { unavailable: entries === null ? 'no ingress log' : 'the attempt\'s markers were not in the ingress log' } : diagnostics(lines),
          })
          console.log(`    N=${n} attempt ${attempt}: ${verdict.verdict} - ${verdict.reason}`)
          for (const page of pages) await page.close().catch(() => undefined)
          if (!(verdict.verdict === 'inconclusive' && verdict.retry === true)) break
        }
        ctx.check(
          `N = ${n}: one tab signed out while the ingress was delaying a request of the application (induced delay); the logout was answered 2xx and every tab reached the login page without a reload`,
          verdict !== null && verdict.verdict === 'pass',
          { verdict: verdict?.verdict ?? null, reason: verdict?.reason ?? null, attempts: attempts.filter((a) => a.n === n).map((a) => ({ attempt: a.attempt, verdict: a.verdict, reason: a.reason })) },
        )
      }
    },
  },
]
