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
// refresh, logout and me; the total and per-tab counts; the busiest
// one-second interval; the peak accumulated demand E; the number of 429s; and
// whether every tab ended usable (round c: on the login page).
//
// "Usable" is the repository owner's definition of 2026-10-06, implemented in
// lib/usable.mjs: without a reload and without signing in again, the tab's
// expected data is on screen and an action works. A rendered shell with
// missing data is NOT usable. Data that failed to load may be recovered
// through the application's own links, a bounded number of times; what each
// tab needed is recorded. A tab that cannot be recovered is not usable, and
// at N = 5 that fails W1.
//
// Blocking: N = 5, rounds (a) and (b): no 429 on refresh, logout or me, and
// every tab usable. Not blocking: everything else. The largest N at which
// both hold in (a) and (b) is the capacity the documentation may state;
// nothing beyond what was measured is claimed. 429s on business endpoints
// (api_limit) are counted and not judged: they are tracked in issue #1353.
import { sleep } from './config.mjs'
import { USER_MENU, exercise, onLoginPage, readStored, showsSignedInUi, summarize } from './harness.mjs'
import { busiestSecond, candidateBurst, peakDemand } from './stats.mjs'
import { MAX_ACTION_TRIES, MAX_RECOVERY_ACTIONS, bringToWorkingState, customerListHasRows, roundUsability } from './usable.mjs'

const AGREED_MAXIMUM_BURST = 60 // review, 2026-10-06: tuning up to 60 is agreed, beyond it is not

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
async function endStates(profile, mark, pages, api) {
  const checksFrom = profile.mark()
  const started = Date.now()
  const states = []
  for (const page of pages) states.push(await bringToWorkingState(profile, mark, page, api))
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

/** One line per round, printed as soon as the round is done. */
function report(r) {
  console.log(
    `    N=${r.n} (${r.round}): ${r.total} session requests, busiest second ${r.busiestSecond}, E ${r.peakDemandE}, ` +
      `429s ${r.count429} (data requests 429: ${r.dataRequests429}/${r.dataRequests}), ` +
      (r.round === 'c'
        ? `on login ${r.tabsOnLoginPage}/${r.n}`
        : `usable ${r.tabsUsable}/${r.n}: data complete on first load ${r.tabsCompleteOnFirstLoad}, needed recovery ${r.tabsNeedingRecovery} ` +
          `(most actions for one tab ${r.maxRecoveryActions}; through the administrator-only Company page ${r.tabsNeedingCompanySettingsVisit}), ` +
          `not recoverable ${r.tabsNotRecoverable.length}`),
  )
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
        'On /dashboard: the "Dashboard" heading is rendered, no "Could not load:" warning is shown, and no data request the tab made (panels and shell alike, by method, path and query) is left failed.',
      recovery: `Only through the sidebar's own links, never a reload, a URL load or a sign-in; at most ${MAX_RECOVERY_ACTIONS} actions per tab, paced so that api_limit (${api.rateText}, burst ${api.burst}) has room for a page of requests.`,
      action: `Sidebar: Sales > Customers. A fresh request for the list answered 2xx and its rows on screen; at most ${MAX_ACTION_TRIES} tries.`,
      notJudged: 'The status indicator\'s polls of /api/health (every 30 s, self-repairing); 429s among them are counted per tab.',
    })
    ctx.record('sizes', sizes)
    // Recorded now, by reference: an error in a later size must not take the
    // rounds already measured with it.
    const rounds = []
    ctx.record('rounds', rounds)

    for (const n of sizes) {
      const profile = await ctx.profile()
      const signIn = await profile.tab('/login', { label: 'sign-in', navigate: false })
      await ctx.signIn(signIn, config.userA)
      // The profile now holds a stored session. The signed-in tab is replaced
      // by a static document of the same origin: it can read the record, and
      // it runs no application code, so nothing polls or refreshes between
      // rounds.
      // Precondition of the action every tab is asked to perform, checked
      // while this tab is the only one: the customer list has rows.
      if (n === sizes[0]) {
        const customers = await customerListHasRows(signIn)
        ctx.require('the customer list shows at least one row for this user (the action check opens it)', customers >= 1, { rows: customers })
      }
      const holder = signIn
      await holder.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
      const renew = async () => {
        const temp = await profile.tab('/dashboard', { label: 'renew' })
        // A precondition, not a judged tab: it only has to show that the
        // stored session still opens the application and answers a request.
        // exercise() throws if it does not, which stops W1 here.
        const ok = await loaded(temp)
        if (ok) await exercise(profile, temp)
        await temp.close()
        ctx.require('a tab opened from the stored session shows the application', ok)
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
      await Promise.all(opened.pages.map(loaded))
      await quiet(profile, mark)
      // Measured first: the usability check below sends requests of its own.
      let measured = measure(profile, mark, zone)
      let states = await endStates(profile, mark, opened.pages, api)
      rounds.push({
        n,
        round: 'a',
        description: 'current access token',
        accessTokenRemainingMsAtStart: remainingA,
        ...measured,
        ...states,
      })
      report(rounds.at(-1))
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
      await Promise.all(opened.pages.map(loaded))
      await quiet(profile, mark)
      measured = measure(profile, mark, zone)
      states = await endStates(profile, mark, opened.pages, api)
      rounds.push({
        n,
        round: 'b',
        description: 'every tab starts with an expired access token',
        accessTokenExpiredAtStart: expiredAtStart,
        ...measured,
        ...states,
      })
      report(rounds.at(-1))
      await closeAll(opened.pages)

      // ---- (c) one tab signs out while the others are loading ------------
      await sleep(drainMs)
      mark = profile.mark()
      opened = await openTabs(profile, n, `N${n}c`)
      const first = await Promise.any(
        opened.pages.map((page) => page.locator(USER_MENU).first().waitFor({ state: 'visible', timeout: 60000 }).then(() => page)),
      )
      const shown = await Promise.all(opened.pages.map((page) => page.locator(USER_MENU).count()))
      await ctx.signOut(first)
      const ended = await Promise.all(opened.pages.map((page) => onLoginPage(page, 60000)))
      await quiet(profile, mark)
      rounds.push({
        n,
        round: 'c',
        description: 'one tab signs out while the others are still loading',
        tabsStillLoadingAtSignOut: shown.filter((count) => count === 0).length,
        ...measure(profile, mark, zone),
        tabsOnLoginPage: ended.filter(Boolean).length,
        everyTabOnLoginPage: ended.every(Boolean),
        tabs: opened.pages.map((page, i) => ({ tab: profile.label(page), onLoginPage: ended[i], at: new URL(page.url()).pathname })),
      })
      report(rounds.at(-1))
      await ctx.close()
    }

    // ---- judgement --------------------------------------------------------
    const of = (n, round) => rounds.find((r) => r.n === n && r.round === round)
    // 429s on refresh, logout or me: the round's own and those the usability
    // checks caused.
    const session429 = (r) => r.count429 + (r.sessionRequests429DuringUsabilityCheck ?? 0)
    // A size holds when, in both (a) and (b), no session endpoint answered 429
    // and every tab was usable.
    const holds = (n) => ['a', 'b'].every((round) => of(n, round) && session429(of(n, round)) === 0 && of(n, round).everyTabUsable === true)
    const capacity = sizes.filter(holds).reduce((max, n) => Math.max(max, n), 0)
    const judgement = {
      capacityTabs: capacity,
      capacityMeans:
        'the largest N at which, in rounds (a) and (b), no request to refresh, logout or me was answered 429 (session_limit) and every tab was usable by the definition of 2026-10-06 (recorded.usableMeans). 429s on business endpoints (api_limit) are counted and not judged; they are tracked in issue #1353.',
      nonBlockingFindings: [],
    }
    for (const r of rounds) {
      const blocking = r.n === 5 && r.round !== 'c'
      if (!blocking) {
        if (session429(r) > 0) judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): ${session429(r)} request(s) to refresh, logout or me answered 429`)
      }
      if (r.dataRequests429 > 0) {
        judgement.nonBlockingFindings.push(
          `N=${r.n} (${r.round}): ${r.dataRequests429} of ${r.dataRequests} data requests of the tabs' own loading were answered 429 (api_limit, not session_limit; tracked in issue #1353)`,
        )
      }
      if (r.dataRequestsFailed.length > 0) {
        judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): ${r.dataRequestsFailed.length} data request(s) failed without an answer: ${[...new Set(r.dataRequestsFailed)].join(', ')}`)
      }
      if (r.round !== 'c') {
        // Recorded for every size, blocking or not: what recovery took.
        if (r.tabsNeedingRecovery > 0) {
          judgement.nonBlockingFindings.push(
            `N=${r.n} (${r.round}): ${r.tabsNeedingRecovery} of ${r.n} tabs first showed missing data and needed recovery through the sidebar ` +
              `(${r.recoveryActionsTotal} action(s) in all, at most ${r.maxRecoveryActions} for one tab, slowest ${r.slowestRecoveryMs} ms)`,
          )
        }
        if (r.tabsNeedingCompanySettingsVisit > 0) {
          judgement.nonBlockingFindings.push(
            `N=${r.n} (${r.round}): ${r.tabsNeedingCompanySettingsVisit} tab(s) got the sidebar's company data back only by opening Settings > Company, which only an administrator can open; for any other user that data would stay missing until a reload`,
          )
        }
        if (r.tabsNeedingActionRetry > 0) judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): the action had to be tried more than once in ${r.tabsNeedingActionRetry} tab(s)`)
      }
      if (!blocking) {
        if (r.round === 'c' ? !r.everyTabOnLoginPage : !r.everyTabUsable) {
          judgement.nonBlockingFindings.push(
            r.round === 'c'
              ? `N=${r.n} (c): not every tab reached the login page`
              : `N=${r.n} (${r.round}): ${r.tabsNotRecoverable.length} of ${r.n} tabs were NOT usable: ${r.tabsNotRecoverable.map((t) => `${t.tab}: ${t.whyNot}`).join(' || ')}`,
          )
        }
      }
    }
    const ten = rounds.filter((r) => r.n === 10)
    if (ten.some((r) => r.count429 > 0)) {
      const e = Math.max(...ten.map((r) => r.peakDemandE))
      const candidate = candidateBurst(e)
      judgement.sizing = {
        largestPeakDemandAtN10: e,
        candidateBurst: candidate,
        withinAgreedMaximum: candidate <= AGREED_MAXIMUM_BURST,
        note:
          candidate <= AGREED_MAXIMUM_BURST
            ? 'set the burst, re-run the rate-limit checks twice, commit, and repeat the whole run'
            : 'stop: the candidate exceeds 60; bring the counts and E to the repository owner',
      }
    }
    ctx.record('judgement', judgement)

    if (!sizes.includes(5)) {
      ctx.check('N = 5 was run (the blocking size)', false, { sizes })
      return
    }
    for (const round of ['a', 'b']) {
      const r = of(5, round)
      // Pass: no request to refresh, logout or me was answered 429, in the
      // round itself or while its tabs were checked.
      ctx.check(`N = 5 (${round}): no 429 on refresh, logout or me`, session429(r) === 0, {
        count429: r.count429,
        duringUsabilityCheck: r.sessionRequests429DuringUsabilityCheck,
      })
      // Pass: every tab has its data on screen and an action working, without
      // a reload or a new sign-in (lib/usable.mjs, verdict()).
      ctx.check(`N = 5 (${round}): every tab usable (data present and an action working, no reload, no new sign-in)`, r.everyTabUsable === true, {
        usable: r.tabsUsable,
        completeOnFirstLoad: r.tabsCompleteOnFirstLoad,
        neededRecovery: r.tabsNeedingRecovery,
        notRecoverable: r.tabsNotRecoverable,
      })
    }
    ctx.check('N = 5 (b): every tab did start with an expired access token', of(5, 'b').accessTokenExpiredAtStart === true)
  },
}
