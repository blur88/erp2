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
// whether every tab ended usable without a reload (round c: on the login
// page). "Usable" is judged after the round has played out: the tab shows the
// signed-in application and, used once more, completes a data request.
//
// Blocking: N = 5, rounds (a) and (b), no 429 and every tab usable.
// Not blocking: everything else. The largest N with no 429 in both (a) and
// (b) is the capacity the documentation may state; nothing beyond what was
// measured is claimed.
import { sleep } from './config.mjs'
import { USER_MENU, exercise, onLoginPage, readStored, showsSignedInUi, summarize } from './harness.mjs'
import { busiestSecond, candidateBurst, peakDemand } from './stats.mjs'

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
 * What became of one tab. `usable` is the pass condition: the signed-in
 * application is shown and, used once more without a reload, the tab completes
 * a data request. The statuses of the requests of its own load are recorded
 * beside it, because a tab can be usable although its first screen shows
 * errors.
 */
async function endState(profile, mark, page) {
  const state = { tab: profile.label(page), signedInUi: await showsSignedInUi(page, 1000), usable: false }
  const own = profile.since(mark, page).filter((e) => e.zone === 'business')
  const statuses = {}
  for (const e of own) statuses[e.status ?? e.failed ?? 'pending'] = (statuses[e.status ?? e.failed ?? 'pending'] ?? 0) + 1
  state.loadRequestStatuses = statuses
  if (state.signedInUi) {
    try {
      await exercise(profile, page)
      state.usable = true
    } catch (err) {
      state.whyNot = err.message // recorded as the tab's end state; `usable` stays false
    }
  } else {
    state.whyNot = `the signed-in application is not shown (at ${new URL(page.url()).pathname})`
  }
  return state
}

async function endStates(profile, mark, pages) {
  const states = []
  for (const page of pages) states.push(await endState(profile, mark, page))
  return states
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
    ctx.record('limit', { rate: zone.rateText, burst: zone.burst, drainWaitSeconds: drainMs / 1000 })
    ctx.record('sizes', sizes)
    const rounds = []

    for (const n of sizes) {
      const profile = await ctx.profile()
      const signIn = await profile.tab('/login', { label: 'sign-in', navigate: false })
      await ctx.signIn(signIn, config.userA)
      // The profile now holds a stored session. The signed-in tab is replaced
      // by a static document of the same origin: it can read the record, and
      // it runs no application code, so nothing polls or refreshes between
      // rounds.
      const holder = signIn
      await holder.goto(`${config.base}/manifest.json`, { waitUntil: 'load' })
      const renew = async () => {
        const mark = profile.mark()
        const temp = await profile.tab('/dashboard', { label: 'renew' })
        const ok = (await loaded(temp)) && (await endState(profile, mark, temp)).usable
        await temp.close()
        ctx.require('a tab opened from the stored session becomes usable', ok)
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
      let states = await endStates(profile, mark, opened.pages)
      rounds.push({
        n,
        round: 'a',
        description: 'current access token',
        accessTokenRemainingMsAtStart: remainingA,
        ...measured,
        tabsUsable: states.filter((t) => t.usable).length,
        everyTabUsable: states.every((t) => t.usable),
        tabs: states,
      })
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
      states = await endStates(profile, mark, opened.pages)
      rounds.push({
        n,
        round: 'b',
        description: 'every tab starts with an expired access token',
        accessTokenExpiredAtStart: expiredAtStart,
        ...measured,
        tabsUsable: states.filter((t) => t.usable).length,
        everyTabUsable: states.every((t) => t.usable),
        tabs: states,
      })
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
      await ctx.close()
    }

    for (const r of rounds) {
      console.log(
        `    N=${r.n} (${r.round}): ${r.total} session requests, busiest second ${r.busiestSecond}, E ${r.peakDemandE}, ` +
          `429s ${r.count429} (data requests 429: ${r.dataRequests429}/${r.dataRequests}), ${r.round === 'c' ? `on login ${r.tabsOnLoginPage}` : `usable ${r.tabsUsable}`}/${r.n}`,
      )
    }

    // ---- judgement --------------------------------------------------------
    const of = (n, round) => rounds.find((r) => r.n === n && r.round === round)
    const clean = (n) => ['a', 'b'].every((round) => of(n, round)?.count429 === 0)
    const capacity = sizes.filter(clean).reduce((max, n) => Math.max(max, n), 0)
    const judgement = {
      capacityTabs: capacity,
      capacityMeans: 'the largest N with no 429 from session_limit (refresh, logout, me) in rounds (a) and (b); api_limit is a separate limit, see the findings',
      nonBlockingFindings: [],
    }
    for (const r of rounds) {
      const blocking = r.n === 5 && r.round !== 'c'
      if (!blocking) {
        if (r.count429 > 0) judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): ${r.count429} request(s) answered 429`)
      }
      if (r.dataRequests429 > 0) {
        judgement.nonBlockingFindings.push(
          `N=${r.n} (${r.round}): ${r.dataRequests429} of ${r.dataRequests} data requests of the tabs' own loading were answered 429 (api_limit, not session_limit)`,
        )
      }
      if (r.dataRequestsFailed.length > 0) {
        judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): ${r.dataRequestsFailed.length} data request(s) failed without an answer: ${[...new Set(r.dataRequestsFailed)].join(', ')}`)
      }
      if (!blocking) {
        if (r.round === 'c' ? !r.everyTabOnLoginPage : !r.everyTabUsable) {
          judgement.nonBlockingFindings.push(`N=${r.n} (${r.round}): not every tab reached its expected end state`)
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
    ctx.record('rounds', rounds)
    ctx.record('judgement', judgement)

    if (!sizes.includes(5)) {
      ctx.check('N = 5 was run (the blocking size)', false, { sizes })
      return
    }
    for (const round of ['a', 'b']) {
      const r = of(5, round)
      ctx.check(`N = 5 (${round}): no 429`, r.count429 === 0, { count429: r.count429 })
      ctx.check(`N = 5 (${round}): every tab usable without a reload`, r.everyTabUsable, { usable: r.tabsUsable })
    }
    ctx.check('N = 5 (b): every tab did start with an expired access token', of(5, 'b').accessTokenExpiredAtStart === true)
  },
}
