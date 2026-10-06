// Cases 12 and 13: a blocked store, and no store at all.
import { sleep } from '../lib/config.mjs'
import {
  LOGIN_FIELD,
  becomes,
  exercise,
  nudge,
  onLoginPage,
  pauseMidTransaction,
  readStored,
  showsSignedInUi,
  summarize,
} from '../lib/harness.mjs'

const TIMEOUT_MS = 5000 // the adapter's transaction timeout; the case checks it by observation
const timings = (page) => page.evaluate(() => (window.__erpSessionTimings ?? []).map((t) => ({ op: t.op, ms: Math.round(t.ms) })))
const clearTimings = (page) =>
  page.evaluate(() => {
    window.__erpSessionTimings = []
  })
const timedOut = (entries, op) => entries.filter((t) => t.op === op && t.ms >= TIMEOUT_MS - 500 && t.ms <= TIMEOUT_MS + 2000)
const blockerOutcome = (page) => becomes(page, () => window.__qaBlockerOutcome === 'complete', null, 5000)

const UNAVAILABLE = 'Session storage unavailable'
const showsUnavailable = (page, timeout = 15000) =>
  becomes(page, (text) => document.body.innerText.includes(text), UNAVAILABLE, timeout)

async function failClosed(ctx, profile, page, where) {
  ctx.check(`${where}: the fail-closed message is shown`, await showsUnavailable(page))
  ctx.check(`${where}: no login form is shown`, (await page.locator(LOGIN_FIELD).count()) === 0)
  ctx.check(`${where}: the signed-in application is not shown`, !(await showsSignedInUi(page, 300)))
  await sleep(3000)
  const sent = profile
    .since(0, page)
    .filter((e) => e.token !== null || e.zone === 'business' || e.zone === 'session' || e.path === '/api/auth/login')
  ctx.check(
    `${where}: no authenticated request was sent`,
    sent.length === 0,
    sent.map((e) => [e.method, e.path, e.status]),
  )
}

export default [
  {
    id: 12,
    name: 'Tab paused mid-transaction',
    // Tab A is paused by the debugger inside a read-write transaction on the
    // session store, so every other transaction queues behind it.
    // Passes when, in two rounds with A blocking for 7 s each:
    //   (read)  tab C is moved to a data page: its gate read ends after about
    //           5 s although the blocker is still held (so it timed out, it
    //           did not get through), C sent no data request while blocked,
    //           and after A is released the record is unchanged, C is still
    //           signed in and its next data request succeeds;
    //   (write) tab B signs out through the menu: its publication write ends
    //           after about 5 s the same way, and 3 s after A is released the
    //           record still holds the same revision and session: the
    //           timed-out write did not commit once the store was free.
    // The timing entries come from the application's own recorder, switched
    // on for this profile (`erp-session-timing`).
    async run(ctx) {
      const profile = await ctx.profile({ timing: true })
      const a = await profile.tab('/login', { label: 'A', navigate: false })
      await ctx.signIn(a, ctx.config.userA)
      const b = await profile.tab('/dashboard', { label: 'B' })
      const c = await profile.tab('/dashboard', { label: 'C' })
      ctx.require('tabs B and C opened signed in', (await showsSignedInUi(b)) && (await showsSignedInUi(c)))
      await sleep(2000)
      const before = summarize(await readStored(a))

      // --- round 1: a gate read behind the blocker -------------------------
      ctx.scope = '(read) '
      await clearTimings(c)
      let pause = await pauseMidTransaction(a)
      let mark = profile.mark()
      await nudge(c, '/inventory/products')
      await sleep(TIMEOUT_MS + 2000)
      const readEntries = await timings(c)
      const sentWhileBlocked = profile.since(mark, c).filter((e) => e.zone === 'business')
      let resumed = await pause.resume()
      ctx.check('tab A stood still while paused (20 ms counter advanced by at most 3)', resumed.ticksWhilePaused <= 3, resumed)
      ctx.require("the blocking transaction completed after release", await blockerOutcome(a))
      ctx.check("tab C's gate read ended at the timeout while the store was blocked", timedOut(readEntries, 'read').length > 0, readEntries)
      ctx.check('tab C sent no data request while blocked', sentWhileBlocked.length === 0, sentWhileBlocked.map((e) => [e.path, e.status]))
      await sleep(1000)
      const afterRead = summarize(await readStored(a))
      ctx.check('the record is unchanged after release', JSON.stringify(afterRead) === JSON.stringify(before), { before, afterRead })
      ctx.check('tab C is still signed in', await showsSignedInUi(c, 2000))
      const used = await exercise(profile, c)
      ctx.check("tab C's next data request succeeds", used.status >= 200 && used.status < 300, used)

      // --- round 2: a write behind the blocker ------------------------------
      ctx.scope = '(write) '
      const beforeWrite = summarize(await readStored(a))
      await clearTimings(b)
      await a.evaluate(() => {
        window.__qaBlockerOutcome = undefined
      })
      pause = await pauseMidTransaction(a)
      mark = profile.mark()
      await ctx.signOut(b)
      await sleep(TIMEOUT_MS + 2000)
      const writeEntries = await timings(b)
      resumed = await pause.resume()
      ctx.check('tab A stood still while paused (20 ms counter advanced by at most 3)', resumed.ticksWhilePaused <= 3, resumed)
      ctx.require('the blocking transaction completed after release', await blockerOutcome(a))
      ctx.check("tab B's publication write ended at the timeout while the store was blocked", timedOut(writeEntries, 'transact').length > 0, writeEntries)
      await sleep(3000)
      const afterWrite = summarize(await readStored(a))
      ctx.check('nothing was committed after release: same revision', afterWrite.revision === beforeWrite.revision, { beforeWrite, afterWrite })
      ctx.check('nothing was committed after release: same session', afterWrite.session?.sessionId === beforeWrite.session?.sessionId, afterWrite)
      ctx.record('tabBOnLoginPage', await onLoginPage(b, 2000))
      ctx.record('logoutRequests', profile.since(mark, b).filter((e) => e.path.includes('/auth/logout')).map((e) => e.status))
    },
  },
  {
    id: 13,
    name: 'IndexedDB unavailable',
    // Passes when: in a profile whose pages have no `indexedDB`, both /login
    // and a protected page show the fail-closed message in place of the login
    // form and send no authenticated request; and the same holds for a tab
    // that loses IndexedDB in a profile where a session IS stored.
    async run(ctx) {
      const bare = await ctx.profile({ noIndexedDb: true })
      const login = await bare.tab('/login', { label: 'login' })
      ctx.require('indexedDB is absent in the page', await login.evaluate(() => window.indexedDB === undefined))
      await failClosed(ctx, bare, login, 'no IndexedDB, /login')
      const protectedPage = await bare.tab('/dashboard', { label: 'dashboard' })
      await failClosed(ctx, bare, protectedPage, 'no IndexedDB, /dashboard')

      const profile = await ctx.profile()
      const a = await profile.tab('/login', { label: 'A', navigate: false })
      await ctx.signIn(a, ctx.config.userA)
      ctx.require('a session is stored', !!(await readStored(a)).record?.session)
      const blind = await profile.tab('/dashboard', {
        label: 'blind',
        init: {
          fn: () => {
            Object.defineProperty(window, 'indexedDB', { value: undefined })
          },
        },
      })
      ctx.require('indexedDB is absent in that tab', await blind.evaluate(() => window.indexedDB === undefined))
      await failClosed(ctx, profile, blind, 'stored session, tab without IndexedDB')
    },
  },
]
