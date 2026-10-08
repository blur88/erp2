// Workload W1, "restored window": one profile that holds a stored session
// opens N tabs at the same moment.
//
// For N = 5, 10 and 20 it runs three rounds, each from an empty session_limit
// bucket (the drain wait is computed from the rate and burst in nginx.conf):
//   (a) with a current access token;
//   (b) after the access lifetime has run out, so every tab starts expired;
//   (c) the overlapping sign-out: the tabs are opened again and one of them
//       signs out while the others are still loading.
//
// Recorded for each round: the send time and status of every request to
// refresh, logout and me; the total, per-route and per-tab counts; the busiest
// one-second interval; the peak accumulated demand E; the number of 429s; and
// whether every tab ended usable (round c: on the login page, in the document
// it first loaded, and how many tabs were still loading at the sign-out).
//
// W1 signs in as a NON-ADMINISTRATOR (QA_USERNAME_3), by the owner's decision
// of 2026-10-06: "Administrator-only recovery does not satisfy W1 for
// ordinary users." It stops if that user turns out to be an administrator.
//
// "Usable" is the repository owner's definition of 2026-10-06, implemented in
// lib/usable.mjs: without a reload and without signing in again, the tab's
// expected data is on screen (the shell's included) and an action works. A
// rendered shell with missing data is NOT usable. Data that failed to load
// may be recovered through the sidebar links the user's role is shown, a
// bounded number of times; a step that would open any other page is refused.
// What each tab needed is recorded, and so is every piece of data the role
// had no way to get back. A tab that cannot be recovered is not usable, and
// at N = 5 that fails W1. Nothing is retried to make it pass.
//
// Blocking at N = 5, 10 and 20 (lib/w1-judgement.mjs, blockingChecks): in all
// three rounds no 429 on refresh, logout or me; in (a) and (b) every tab
// usable, no in-app recovery action, and the last tab holding its expected
// data within the size's deadline (5 s, 10 s, 15 s from the tab-opening
// trigger); in (a) the token current and in (b) expired when the tabs opened;
// in (c) the logout sent and answered 2xx and every tab on the login page
// without a reload. Not blocking: 429s on business endpoints (api_limit), which
// are counted and reported at every size.
//
// W1 states no capacity. It reports what was observed at each size, and says
// what that does and does not show (W1_SCOPE).
import { accessFor, loadNavigation } from './access.mjs'
import { sleep } from './config.mjs'
import { USER_MENU, documentId, onLoginPage, readStored, showsSignedInUi, summarize } from './harness.mjs'
import {
  BLOCKING_SIZES,
  DEADLINE_MS,
  HOW_ROUNDS_REACH_THE_SESSION_ZONE,
  W1_SCOPE,
  blockingChecks,
  byRoute,
  nonBlockingFindings,
  observed,
  observedLine,
} from './w1-judgement.mjs'
import { watchCompletion } from './completion.mjs'
import { busiestSecond, candidateBurst, peakDemand } from './stats.mjs'
import {
  ACTION,
  COMPANY_SETTINGS,
  DASHBOARD,
  MAX_ACTION_TRIES,
  MAX_RECOVERY_ACTIONS,
  REGIONAL_SETTINGS,
  ROUND_TRIP,
  bringToWorkingState,
  customerListHasRows,
  roundUsability,
  shownMenuTitles,
} from './usable.mjs'

const AGREED_MAXIMUM_BURST = 60 // review, 2026-10-06: tuning up to 60 is agreed, beyond it is not
// A diagnostic about session_limit, read from what W1 measured. It says how
// close that zone came to its configured burst. It is not a capacity figure and
// it authorises nothing: #1353 changes api_limit and leaves session_limit
// exactly as it is, so this note is not a reason to change that zone.

/** The completion figures a round record carries, with the deadline it is judged against. */
function completionFields(finished, n) {
  return {
    completedAfterMs: finished.lastCompletedAfterMs,
    completionPollMs: finished.pollMs,
    deadlineMs: deadline(n),
  }
}

const deadline = (n) => DEADLINE_MS[n]

function measure(profile, mark, zone) {
  const entries = profile
    .since(mark)
    .filter((e) => e.zone === 'session')
    .map((e) => ({ t: (e.sentAt ?? e.issuedAt) / 1000, tab: e.tab, method: e.method, path: e.path, status: e.status ?? e.failed ?? null }))
    .sort((x, y) => x.t - y.t)
  const times = entries.map((e) => e.t)
  const perTab = {}
  for (const e of entries) perTab[e.tab] = (perTab[e.tab] ?? 0) + 1
  const peak = peakDemand(times, zone.ratePerSecond)
  return {
    requests: entries,
    total: entries.length,
    byRoute: byRoute(entries),
    perTab,
    busiestSecond: busiestSecond(times),
    peakDemandE: Math.round(peak * 1000) / 1000,
    admittedInFullByTheLimit: peak <= zone.burst + 1,
    count429: entries.filter((e) => e.status === 429).length,
    // Outside W1's definition, recorded because it is what a person would
    // see: data requests of the tabs' own loading answered 429 by api_limit,
    // and requests that failed without an answer.
    dataRequests: profile.since(mark).filter((e) => e.zone === 'business').length,
    dataRequests429: profile.since(mark).filter((e) => e.zone === 'business' && e.status === 429).length,
    dataRequestsFailed: profile.since(mark).filter((e) => e.zone === 'business' && e.failed).map((e) => e.failed),
  }
}

async function openTabs(profile, n, round) {
  const pages = []
  for (let i = 0; i < n; i += 1) {
    pages.push(await profile.tab('/dashboard', { label: `${round}-${i + 1}`, navigate: false }))
  }
  const url = `${profile.ctx.config.base}/dashboard`
  const started = Date.now()
  await Promise.all(pages.map((page) => page.goto(url, { waitUntil: 'commit' })))
  return { pages, started }
}

/**
 * The round has played out: no API request from any tab is pending and none
 * was sent for three seconds. Data requests count too, so that the usability
 * check afterwards does not run into the tail of the tabs' own loading.
 */
async function quiet(profile, mark, maxMs = 90000) {
  const deadline = Date.now() + maxMs
  for (;;) {
    const api = profile.since(mark).filter((e) => e.zone === 'session' || e.zone === 'business')
    const pending = api.some((e) => e.status === null && !e.failed)
    const lastAt = api.reduce((m, e) => Math.max(m, e.respondedAt ?? e.issuedAt), 0)
    if (!pending && Date.now() - lastAt > 3000) return
    if (Date.now() > deadline) return
    await sleep(250)
  }
}

/** The tab has loaded: the signed-in application is on screen. */
const loaded = (page) => showsSignedInUi(page, 60000)

/**
 * Every tab of the round, one after the other, through lib/usable.mjs.
 * `usable` in each record is the pass condition. Requests to refresh, logout
 * and me that the checks themselves cause are counted separately from the
 * round's own, and a 429 among them counts against the round as well.
 */
async function endStates(profile, mark, pages, api, shell) {
  const checksFrom = profile.mark()
  const started = Date.now()
  const states = []
  for (const page of pages) states.push(await bringToWorkingState(profile, mark, page, api, shell))
  const during = profile.since(checksFrom)
  return {
    ...roundUsability(states),
    usabilityCheckSeconds: Math.round((Date.now() - started) / 1000),
    sessionRequestsDuringUsabilityCheck: during.filter((e) => e.zone === 'session').length,
    sessionRequests429DuringUsabilityCheck: during.filter((e) => e.zone === 'session' && e.status === 429).length,
    dataRequests429DuringUsabilityCheck: during.filter((e) => e.zone === 'business' && e.status === 429).length,
    tabs: states,
  }
}

/** One line per round, printed as soon as the round is done: what was observed, and for (a) and (b) how the data arrived. */
function report(r, burst) {
  console.log(`    ${observedLine(observed(r, burst))}`)
  if (r.round === 'c') return
  console.log(
    `      company data on the first request ${r.tabsCompanyOnFirstRequest}, after the session's renewal ${r.tabsCompanyAfterSessionRenewalOnly}, by the application's retry after a 429 ${r.tabsCompanyByAutomaticRetry}` +
      `${r.companyAutomaticRetryWaitMs ? ` (wait ${r.companyAutomaticRetryWaitMs.shortest} to ${r.companyAutomaticRetryWaitMs.longest} ms)` : ''}, retries used up ${r.tabsCompanyRetryExhausted}; ` +
      `regional request refused ${r.tabsRegionalRequestRefused} (formats wrong in ${r.tabsRegionalNotInEffect}); ` +
      `needed manual recovery ${r.tabsNeedingRecovery}; not usable ${r.tabsNotRecoverable.length}` +
      `${Object.keys(r.dataNotRecoverableByRole).length > 0 ? `; NOT recoverable by this role: ${lostData(r)}` : ''}`,
  )
}

/** "company data (…) in 2 tab(s); …" for a round, or '' when nothing was lost. */
const lostData = (r) =>
  Object.entries(r.dataNotRecoverableByRole)
    .map(([data, tabs]) => `${data} in ${tabs.length} tab(s)`)
    .join('; ')

/** The body of an answer whose envelope the application also strips (store/api/normalizers.ts, normalizeSingle). */
const single = (body) => (body && typeof body === 'object' && 'data' in body && body.data != null && !Array.isArray(body.data) ? body.data : body)

/**
 * What the server said the shell's data is, from the answers this profile
 * received (harness: keepAnswers). Waits for both answers; an answer that did
 * not come or could not be read is reported as such, and W1 treats it as a
 * failed precondition.
 */
async function shellReference(profile, maxMs = 20000) {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline && !(profile.answers.has(COMPANY_SETTINGS) && profile.answers.has(REGIONAL_SETTINGS))) await sleep(100)
  const company = profile.answers.get(COMPANY_SETTINGS)
  const regional = profile.answers.get(REGIONAL_SETTINGS)
  const companyAnswered = Boolean(company && !company.unreadable)
  return {
    companyAnswered,
    companyName: companyAnswered ? single(company.body)?.name || null : null,
    regional: regional && !regional.unreadable ? single(regional.body) : null,
  }
}

async function closeAll(pages) {
  for (const page of pages) await page.close()
}

export default {
  id: 'W1',
  name: 'Restored window',
  async run(ctx) {
    ctx.allow429 = true // W1 exists to count them
    const { config, zones } = ctx
    const zone = zones.session
    const drainMs = zones.drainWaitSeconds(zone.ratePerSecond, zone.burst) * 1000
    const lifetime = config.accessSeconds
    ctx.require('the access lifetime is the short QA one (round b waits it out)', lifetime <= 60, { accessSeconds: lifetime })
    const sizes = (process.env.QA_W1_NS || '5,10,20').split(',').map((s) => Number(s.trim()))
    const api = zones.api
    ctx.require('rate and burst of api_limit can be read from nginx/nginx.conf (recovery is paced by them)', api !== null)
    ctx.record('limit', { rate: zone.rateText, burst: zone.burst, drainWaitSeconds: drainMs / 1000 })
    ctx.record('usableMeans', {
      decidedOn: '2026-10-06',
      definition:
        'The tab reaches a working state without reloading or signing in again, with its expected data available and actions working. Not every initial request has to succeed. A rendered shell with missing data is not usable.',
      expectedData:
        'On /dashboard: the "Dashboard" heading is rendered, no "Could not load:" warning is shown, and no data request the tab made (by method, path and query) is left failed, the regional-settings request excepted (see shell).',
      shell:
        'The shell is part of the expected data. Company data: the latest GET /api/settings/company of the tab is 2xx and the sidebar shows the server\'s company name. Regional settings: judged by effect, not by the request: the formats the tab applies (localStorage, which the application fills from the answer and every formatter reads) equal the server\'s; a tab whose own request was refused is counted separately.',
      user: 'A non-administrator. Recovery through a page only an administrator can open does not count: such a step is refused and fails the tab.',
      recovery: `Only through the sidebar links the user's role is shown (read from frontend/src/config/navigation.tsx), never a reload, a URL load or a sign-in: ${ROUND_TRIP.parent} > ${ROUND_TRIP.child}, then ${DASHBOARD.parent}. At most ${MAX_RECOVERY_ACTIONS} actions per tab, paced so that api_limit (${api.rateText}, burst ${api.burst}) has room for a page of requests. When only shell data is missing, one round trip is made and then no more: no page change asks for it again.`,
      automaticRetry:
        'The application itself repeats GET /api/settings/company after a 429 (and no other request). That is not a recovery action; per tab it is recorded whether the company data came on the first request or by that retry, how long the retry took, and whether the retries were used up.',
      action: `Sidebar: ${ACTION.parent} > ${ACTION.child}. A fresh request for the list answered 2xx and its rows on screen; at most ${MAX_ACTION_TRIES} tries.`,
      notJudged: 'The status indicator\'s polls of /api/health (every 30 s, self-repairing); 429s among them are counted per tab.',
    })
    ctx.record('sizes', sizes)
    // Recorded now, by reference: an error in a later size must not take the
    // rounds already measured with it.
    const rounds = []
    ctx.record('rounds', rounds)
    const navigation = loadNavigation()
    let shell = null

    for (const n of sizes) {
      const profile = await ctx.profile({ keepAnswers: /^\/api\/settings\/(company|regional)$/ })
      const signIn = await profile.tab('/login', { label: 'sign-in', navigate: false })
      await ctx.signIn(signIn, config.userC)
      // The profile now holds a stored session. The signed-in tab is replaced
      // by a static document of the same origin: it can read the record, and
      // it runs no application code, so nothing polls or refreshes between
      // rounds.
      // Precondition of the action every tab is asked to perform, checked
      // while this tab is the only one: the customer list has rows.
      if (n === sizes[0]) {
        // Who W1 runs as, from the session the sign-in stored.
        const role = summarize(await readStored(signIn)).session?.role ?? null
        ctx.require('the stored session names the role of the W1 user', typeof role === 'string' && role.length > 0, { role })
        ctx.require('the W1 user (QA_USERNAME_3) is not an administrator', role !== 'admin', { role })
        const access = accessFor(navigation, role)
        for (const link of [DASHBOARD, ROUND_TRIP, ACTION]) {
          ctx.require(`the role ${role} is shown the sidebar link "${[link.parent, link.child].filter(Boolean).join(' > ')}" that W1 follows`, access.link(link.parent, link.child) !== null)
        }
        // The set a step is refused against must be the set the application
        // applies: the titles the sidebar shows this user, every section
        // opened, are exactly the ones read from navigation.tsx for the role.
        const shown = (await shownMenuTitles(signIn, access)).sort()
        const derived = [...access.titles].sort()
        ctx.require('the sidebar shows this user exactly the menu read from navigation.tsx for the role', JSON.stringify(shown) === JSON.stringify(derived), { shown, derived })
        const customers = await customerListHasRows(signIn, access)
        ctx.require('the customer list shows at least one row for this user (the action check opens it)', customers >= 1, { rows: customers })
        // What the server says the shell's data is; this tab loaded alone.
        const reference = await shellReference(profile)
        ctx.require('the sign-in tab received the company settings (the reference for the sidebar)', reference.companyAnswered === true)
        ctx.require('the sign-in tab received the regional settings (the reference for the formats)', reference.regional !== null && typeof reference.regional === 'object')
        shell = { access, reference: { companyName: reference.companyName, regional: reference.regional } }
        ctx.record('user', {
          role,
          administrator: false,
          pagesTheRoleCanOpen: access.paths,
          pagesClosedToTheRole: access.closed,
          accessRulesFrom: access.source,
          menuShownMatchesTheRules: true,
        })
        ctx.record('shellReference', {
          companyHasAName: Boolean(reference.companyName),
          regional: Object.fromEntries(['dateFormat', 'timeFormat', 'numberFormat', 'currency', 'timezone', 'startOfWeek'].map((k) => [k, reference.regional[k] ?? null])),
        })
      }
      const holder = signIn
      await holder.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
      const renew = async () => {
        const from = profile.mark()
        const temp = await profile.tab('/dashboard', { label: 'renew' })
        // A precondition, not a judged tab: it only has to show that the
        // stored session still opens the application and that the dashboard
        // it loads gets a data request answered. It stays on the dashboard,
        // a page every role can open.
        const ok = await loaded(temp)
        let answered = false
        for (const deadline = Date.now() + 45000; ok && !answered && Date.now() < deadline; ) {
          answered = profile.since(from, temp).some((e) => e.zone === 'business' && e.status >= 200 && e.status < 300)
          if (!answered) await sleep(100)
        }
        await temp.close()
        ctx.require('a tab opened from the stored session shows the application', ok)
        ctx.require('a data request of that tab was answered 2xx', answered)
      }

      // ---- (a) current access token --------------------------------------
      await sleep(drainMs)
      // The drain wait is longer than the QA lifetime, so the token is renewed
      // here (one tab, one refresh); that has drained again before the tabs
      // open.
      await renew()
      let stored = summarize(await readStored(holder))
      if (stored.session.accessTokenExpiresAt * 1000 - Date.now() < lifetime * 750) {
        await sleep(Math.max(0, stored.session.accessTokenExpiresAt * 1000 - Date.now()) + 1500)
        await renew()
        stored = summarize(await readStored(holder))
      }
      await sleep(3000)
      let mark = profile.mark()
      const remainingA = stored.session.accessTokenExpiresAt * 1000 - Date.now()
      let opened = await openTabs(profile, n, `N${n}a`)
      // When each tab first held its expected data, on the clock that started
      // at the tab-opening trigger, and judged against this size's deadline. The
      // window runs past the deadline so a tab that misses it is measured, not
      // cut off.
      const watchedA = watchCompletion(profile, mark, opened.pages, shell.reference, {
        started: opened.started,
        giveUpMs: deadline(n) + 30000,
      })
      // Awaited with the loading and the quiet wait: the round's own requests
      // are all in by then, and the usability check below sends requests of its
      // own, which would otherwise be sampled as the round's completion.
      const [, , completionA] = await Promise.all([Promise.all(opened.pages.map(loaded)), quiet(profile, mark), watchedA])
      let measured = measure(profile, mark, zone)
      // endStates is what establishes that an action works, and it counts the
      // recovery actions, so it runs after the round's own loading.
      let states = await endStates(profile, mark, opened.pages, api, shell)
      rounds.push({
        n,
        round: 'a',
        description: 'current access token',
        accessTokenRemainingMsAtStart: remainingA,
        ...completionFields(completionA, n),
        ...measured,
        ...states,
      })
      report(rounds.at(-1), zone.burst)
      await closeAll(opened.pages)

      // ---- (b) expired access token --------------------------------------
      await sleep(drainMs)
      stored = summarize(await readStored(holder))
      const untilExpired = stored.session.accessTokenExpiresAt * 1000 + 2000 - Date.now()
      if (untilExpired > 0) await sleep(untilExpired)
      stored = summarize(await readStored(holder))
      const expiredAtStart = stored.session.accessTokenExpiresAt * 1000 < Date.now()
      mark = profile.mark()
      opened = await openTabs(profile, n, `N${n}b`)
      const watchedB = watchCompletion(profile, mark, opened.pages, shell.reference, {
        started: opened.started,
        giveUpMs: deadline(n) + 30000,
      })
      const [, , completionB] = await Promise.all([Promise.all(opened.pages.map(loaded)), quiet(profile, mark), watchedB])
      measured = measure(profile, mark, zone)
      states = await endStates(profile, mark, opened.pages, api, shell)
      rounds.push({
        n,
        round: 'b',
        description: 'every tab starts with an expired access token',
        accessTokenExpiredAtStart: expiredAtStart,
        ...completionFields(completionB, n),
        ...measured,
        ...states,
      })
      report(rounds.at(-1), zone.burst)
      await closeAll(opened.pages)

      // ---- (c) one tab signs out while the others are loading ------------
      await sleep(drainMs)
      mark = profile.mark()
      opened = await openTabs(profile, n, `N${n}c`)
      // Which document each tab loaded: a tab that reaches the login page by
      // being reloaded has another one afterwards.
      const documents = await Promise.all(opened.pages.map(documentId))
      const first = await Promise.any(
        opened.pages.map((page) => page.locator(USER_MENU).first().waitFor({ state: 'visible', timeout: 60000 }).then(() => page)),
      )
      const shown = await Promise.all(opened.pages.map((page) => page.locator(USER_MENU).count()))
      await ctx.signOut(first)
      const ended = await Promise.all(opened.pages.map((page) => onLoginPage(page, 60000)))
      await quiet(profile, mark)
      const same = await Promise.all(opened.pages.map(async (page, i) => (await documentId(page)) === documents[i]))
      rounds.push({
        n,
        round: 'c',
        description: 'one tab signs out while the others are still loading',
        tabsStillLoadingAtSignOut: shown.filter((count) => count === 0).length,
        ...measure(profile, mark, zone),
        // On the login page AND still the document the tab first loaded.
        tabsOnLoginPage: ended.filter((on, i) => on && same[i]).length,
        everyTabOnLoginPage: ended.every((on, i) => on && same[i]),
        tabs: opened.pages.map((page, i) => ({ tab: profile.label(page), onLoginPage: ended[i], sameDocument: same[i], at: new URL(page.url()).pathname })),
      })
      report(rounds.at(-1), zone.burst)
      await ctx.close()
    }

    // ---- what was observed, and the judgement -------------------------------
    const noted = nonBlockingFindings(rounds, shell.access.role)
    const judgement = {
      // No capacity is stated. This is what W1 shows and what it does not.
      scope: W1_SCOPE,
      howEachRoundReachesTheSessionZone: HOW_ROUNDS_REACH_THE_SESSION_ZONE,
      blocking:
        `At N = ${BLOCKING_SIZES.join(', ')}: no 429 on refresh, logout or me in rounds (a), (b) and (c); in (a) and (b) every tab usable, ` +
        'no in-app recovery action, and the last tab holding its expected data within the size\'s deadline ' +
        `(${DEADLINE_MS[5] / 1000} s, ${DEADLINE_MS[10] / 1000} s, ${DEADLINE_MS[20] / 1000} s from the common tab-opening trigger); ` +
        'in (a) the access token current and in (b) expired when the tabs opened; in (c) the logout sent and answered 2xx and every tab ' +
        'on the login page without a reload. Not blocking: 429s on business endpoints, counted at every size.',
      observed: rounds.map((r) => observed(r, zone.burst)),
      // Every piece of data some tab's user could not get back, at any size.
      dataNotRecoverableByRole: noted.dataNotRecoverableByRole,
      nonBlockingFindings: noted.findings,
    }
    const ten = rounds.filter((r) => r.n === 10)
    if (ten.some((r) => r.count429 > 0)) {
      const e = Math.max(...ten.map((r) => r.peakDemandE))
      const candidate = candidateBurst(e)
      judgement.sizing = {
        largestPeakDemandAtN10: e,
        candidateBurst: candidate,
        withinAgreedMaximum: candidate <= AGREED_MAXIMUM_BURST,
        // A diagnostic about session_limit and nothing else. #1353 changes
        // api_limit; it does not authorise changing session_limit, and this
        // note must not be read as a recommendation to do so.
        note:
          (candidate <= AGREED_MAXIMUM_BURST
            ? 'set the burst, re-run the rate-limit checks twice, commit, and repeat the whole run'
            : 'stop: the candidate exceeds 60; bring the counts and E to the repository owner') +
          ' Diagnostic only: a reading of what the tabs did to session_limit, not a capacity figure, ' +
          'and #1353 does not authorise changing that zone.',
      }
    }
    ctx.record('judgement', judgement)

    for (const c of blockingChecks(rounds, sizes)) ctx.check(c.label, c.ok, c.detail)
  },
}
