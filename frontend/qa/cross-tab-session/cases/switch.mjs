// Cases 5 and 6: a different session replaces the one a tab holds.
import { sleep } from '../lib/config.mjs'
import { judgeSwitchedTab } from '../lib/judge.mjs'
import {
  documentId,
  exercise,
  nudge,
  onLoginPage,
  readStored,
  rotation,
  showsSignedInUi,
  summarize,
} from '../lib/harness.mjs'
import { pair } from './signout.mjs'

const bodyText = (page) => page.evaluate(() => document.body.innerText)

// The list user X loads and user Y is later shown in the same tab. Both QA
// users of the cases can open it (README, "What it needs").
const LIST_PAGE = '/sales/customers'
const LIST_REQUEST = '/api/customers'

const LIST_HEADING = 'Customers'

// Data rows of the list on screen, by the rule W1 uses (lib/usable.mjs): a
// row with several cells and no skeleton. The loading state and the empty
// message count as none. null when the tab is not showing the list page (its
// address and heading): rows of another page are not rows of the list, and a
// count that could not be taken is never read as zero.
const dataRows = (page) =>
  page.evaluate(
    ([path, heading]) => {
      const onList = location.pathname === path && [...document.querySelectorAll('h5')].some((h) => (h.textContent ?? '').trim() === heading)
      if (!onList) return null
      return [...document.querySelectorAll('tbody tr')].filter((r) => r.querySelectorAll('td').length > 1 && !r.querySelector('.MuiSkeleton-root')).length
    },
    [LIST_PAGE, LIST_HEADING],
  )

async function rowsShown(page, timeout) {
  for (const deadline = Date.now() + timeout; ; ) {
    const rows = await dataRows(page)
    if (rows > 0 || Date.now() > deadline) return rows
    await sleep(100)
  }
}

/** The answered sign-in the profile saw after `mark`, with the tokens it handed out. */
async function signInAnswer(profile, mark, page) {
  const entry = profile.since(mark, page).find((e) => e.path === '/api/auth/login' && e.method === 'POST' && e.status === 200)
  if (!entry) throw new Error('no answered sign-in was seen in the request log')
  await entry.issuedRead
  return entry
}

export default [
  {
    id: 5,
    name: 'User switch',
    // Part 1, the switch. Passes when: user Y signs in from a signed-out tab
    // of the profile in which user X is signed in in two other tabs; both of
    // X's tabs end locally (login page, same document, no trace of X on
    // screen); Y's tab keeps working (a data request succeeds with the stored
    // token); the stored record is Y's; and Y's tab shows Y's name and
    // nowhere X's.
    //
    // Part 2, "no cached X data appears". One of X's tabs had loaded the
    // customer list and shown its rows. Y then signs in IN THAT TAB, in the
    // same document, and opens the same list while the script keeps the
    // tab's data requests unanswered. Passes when (lib/judge.mjs,
    // judgeSwitchedTab):
    //   - opening the list sent a fresh request for it, issued after Y's
    //     sign-in under Y's token;
    //   - while that request was unanswered the tab showed no row: with
    //     nothing answered to Y yet, a row could only be one X had loaded;
    //   - once it was answered the rows are shown;
    //   - no data request of the tab since X's session ended in it carried a
    //     token of X's, and every one answered was issued after Y's sign-in
    //     under Y's token.
    // X's data is identified by PROVENANCE (which request produced what is on
    // screen, and under whose token), not by content: the two QA users of the
    // cases may see the same customers.
    async run(ctx) {
      const { userA: x, userB: y } = ctx.config
      const profile = await ctx.profile({ intercept: true })
      // Y's tab is opened first, signed out, and left on the login form: a
      // signed-out tab must not adopt X's session when X signs in.
      const tabY = await profile.tab('/login', { label: 'Y' })
      ctx.require("Y's tab shows the login form", await onLoginPage(tabY))
      const start = profile.mark()
      const tabX = await profile.tab('/login', { label: 'X', navigate: false })
      await ctx.signIn(tabX, x)
      const xStored = summarize(await readStored(tabX))
      ctx.require("X's session is stored", xStored.session?.username === x.usernameOrEmail, xStored)
      await sleep(1500)
      ctx.check("the signed-out tab did not adopt X's session", await onLoginPage(tabY, 500))

      // X loads data in this tab: the customer list, with rows on screen.
      const beforeList = profile.mark()
      await nudge(tabX, LIST_PAGE)
      const xRows = await rowsShown(tabX, 20000)
      const xList = profile.since(beforeList, tabX).find((e) => e.path === LIST_REQUEST && e.status >= 200 && e.status < 300)
      ctx.record('listXLoaded', { page: LIST_PAGE, request: `GET ${LIST_REQUEST}`, rows: xRows })
      ctx.require("X's tab loaded the customer list and shows its rows", xRows >= 1 && !!xList, { rows: xRows, request: xList ? [xList.path, xList.status] : null })
      ctx.require("the list was loaded under X's token", xList.token === xStored.session.access, { token: xList.token, stored: xStored.session.access })
      // X's other tab.
      const tabX2 = await profile.tab('/dashboard', { label: 'X2' })
      ctx.require("X's other tab opened signed in", await showsSignedInUi(tabX2))

      const xDoc = await documentId(tabX)
      const x2Doc = await documentId(tabX2)
      const mark = profile.mark()
      await ctx.signIn(tabY, y, { navigate: false })
      // Every access token handed out before this sign-in was X's.
      await Promise.all(profile.since(start).map((e) => e.issuedRead))
      const handedOut = profile.since(start).filter((e) => e.seq <= mark && e.issued?.access)
      const xTokens = [...new Set([xStored.session.access, ...handedOut.map((e) => e.issued.access)])]

      ctx.check("X's tab shows the login page", await onLoginPage(tabX))
      ctx.check("X's tab was not reloaded", (await documentId(tabX)) === xDoc)
      ctx.check("X's tab shows nothing of X", !(await bodyText(tabX)).includes(x.usernameOrEmail))
      ctx.check("X's other tab shows the login page", await onLoginPage(tabX2))
      ctx.check("X's other tab was not reloaded", (await documentId(tabX2)) === x2Doc)

      const used = await exercise(profile, tabY)
      const stored = summarize(await readStored(tabY))
      ctx.check("the stored session is Y's", stored.session?.username === y.usernameOrEmail, stored)
      ctx.check('the stored session is not the one X had', stored.session?.sessionId !== xStored.session.sessionId)
      ctx.check("Y's request succeeded with the stored token", used.token === stored.session?.access, { used, stored })
      ctx.check("Y's tab is still signed in", await showsSignedInUi(tabY, 2000))
      const text = await bodyText(tabY)
      ctx.check("Y's tab shows Y's name", text.includes(y.usernameOrEmail))
      ctx.check("Y's tab shows nothing of X", !text.includes(x.usernameOrEmail))

      // ---- part 2: Y signs in in the tab that held X's data ----------------
      ctx.require("X's tab is still the document that had loaded X's list", (await documentId(tabX)) === xDoc)
      const second = profile.mark()
      await ctx.signIn(tabX, y, { navigate: false })
      const answered = await signInAnswer(profile, second, tabX)
      ctx.check('the tab Y signed in in was not reloaded', (await documentId(tabX)) === xDoc)
      const hold = profile.armHold(tabX, (r) => r.zone === 'business', { many: true })
      await nudge(tabX, LIST_PAGE)
      // The fresh request for the list, if the tab sends one: waited for 10 s.
      let listItem = null
      for (const deadline = Date.now() + 10000; !listItem && Date.now() < deadline; ) {
        listItem = hold.items.find((i) => i.path === LIST_REQUEST) ?? null
        if (!listItem) await sleep(100)
      }
      // Whatever the tab draws without an answer has had time to appear.
      await sleep(1500)
      const rowsWhileHeld = await dataRows(tabX)
      ctx.record('heldWhileTheListWasRead', hold.items.map((i) => `${i.method} ${i.path}`))
      await hold.continueAll()
      const rowsAfter = await rowsShown(tabX, 20000)
      const yStored = summarize(await readStored(tabX))
      ctx.check("the stored session is Y's after the sign-in in X's tab", yStored.session?.username === y.usernameOrEmail, yStored)
      const since = profile.since(second)
      await Promise.all(since.map((e) => e.issuedRead))
      const yTokens = [...new Set(since.filter((e) => e.issued?.access).map((e) => e.issued.access))]
      const requests = profile
        .since(mark, tabX)
        .filter((e) => e.zone === 'business')
        .map((e) => ({ path: e.path, token: e.token, issuedAt: e.issuedAt, status: e.status }))
      ctx.record('xDataIdentifiedBy', 'provenance: which request produced what the tab shows and under whose token, not the content of the rows')
      ctx.record('rows', { whenXLoadedTheList: xRows, whileYsRequestWasUnanswered: rowsWhileHeld, onceItWasAnswered: rowsAfter })
      ctx.record('tokens', { x: xTokens, y: yTokens, listRequest: listItem?.entry?.token ?? null })
      ctx.record('businessRequestsOfXTabAfterTheSwitch', requests.length)
      for (const l of judgeSwitchedTab({
        xTokens,
        yTokens,
        signedInAt: answered.respondedAt,
        list: listItem ? { captured: true, token: listItem.entry?.token ?? null, issuedAt: listItem.entry?.issuedAt ?? null } : { captured: false },
        rowsWhileHeld,
        rowsAfter,
        requests,
      })) {
        ctx.check(l.label, l.ok, l.detail)
      }
    },
  },
  {
    id: 6,
    name: 'Same-user sign-out and sign-in',
    // Passes when: after tab A signs out and signs in again as the same user,
    // tab B (signed out by A's sign-out) stays on the login form and sends
    // nothing carrying a token; and the new session survives a refresh: a
    // forced 401 in A is followed by a rotation to generation 2 of the same
    // new session, A's request succeeds, and B still has not adopted it.
    async run(ctx) {
      const { profile, a, b, stored: first } = await pair(ctx, { profileOpts: { intercept: true } })
      const s1 = first.record.session.sessionId
      await ctx.signOut(a)
      ctx.require('tab A reached the login page', await onLoginPage(a))
      ctx.check('tab B shows the login form after the sign-out', await onLoginPage(b))
      ctx.require('tab B ended its session locally', !(await showsSignedInUi(b, 300)))
      const bDoc = await documentId(b)
      const mark = profile.mark()

      await ctx.signIn(a, ctx.config.userA, { navigate: false })
      const second = summarize(await readStored(a))
      ctx.check('a new session is stored', !!second.session && second.session.sessionId !== s1, second)
      await sleep(2000)
      ctx.check('tab B did not adopt the new session', !(await showsSignedInUi(b, 500)))

      const beforeRefresh = profile.mark()
      profile.armForced401(a)
      await exercise(profile, a)
      ctx.check('the forced 401 was followed by a rotation answered 200', !!(await rotation(profile, beforeRefresh, a)))
      const used = await exercise(profile, a)
      const third = summarize(await readStored(a))
      ctx.check("tab A's next request succeeds on the stored token", used.token === third.session?.access, { used, third })
      ctx.check('the session is still the new one', third.session?.sessionId === second.session?.sessionId, third)
      ctx.check(
        'the refresh advanced it by one generation',
        third.session?.generation === (second.session?.generation ?? NaN) + 1,
        { before: second.session?.generation, after: third.session?.generation },
      )
      ctx.check('tab A is still signed in', await showsSignedInUi(a, 2000))
      await sleep(1500)
      ctx.check('tab B has still not adopted it after the refresh', !(await showsSignedInUi(b, 500)))
      ctx.check('tab B shows the login form', await onLoginPage(b, 500))
      ctx.check('tab B was not reloaded', (await documentId(b)) === bDoc)
      const withToken = profile.since(mark, b).filter((e) => e.token !== null)
      ctx.check(
        'tab B sent no request carrying a token',
        withToken.length === 0,
        withToken.map((e) => [e.method, e.path, e.status]),
      )
    },
  },
]
