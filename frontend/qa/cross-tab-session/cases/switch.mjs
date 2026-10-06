// Cases 5 and 6: a different session replaces the one a tab holds.
import { sleep } from '../lib/config.mjs'
import {
  documentId,
  exercise,
  onLoginPage,
  readStored,
  showsSignedInUi,
  summarize,
} from '../lib/harness.mjs'
import { pair } from './signout.mjs'

const bodyText = (page) => page.evaluate(() => document.body.innerText)

export default [
  {
    id: 5,
    name: 'User switch',
    // Passes when: user Y signs in from a tab of the profile in which user X is
    // signed in elsewhere; X's tab ends locally (login page, same document, no
    // trace of X on screen); Y's tab keeps working (a data request succeeds
    // with the stored token); the stored record is Y's; and Y's tab shows Y's
    // name and nowhere X's.
    async run(ctx) {
      const { userA: x, userB: y } = ctx.config
      const profile = await ctx.profile()
      // Y's tab is opened first, signed out, and left on the login form: a
      // signed-out tab must not adopt X's session when X signs in.
      const tabY = await profile.tab('/login', { label: 'Y' })
      ctx.require("Y's tab shows the login form", await onLoginPage(tabY))
      const tabX = await profile.tab('/login', { label: 'X', navigate: false })
      await ctx.signIn(tabX, x)
      const xStored = summarize(await readStored(tabX))
      ctx.require("X's session is stored", xStored.session?.username === x.usernameOrEmail, xStored)
      await sleep(1500)
      ctx.check("the signed-out tab did not adopt X's session", await onLoginPage(tabY, 500))

      const xDoc = await documentId(tabX)
      const mark = profile.mark()
      await ctx.signIn(tabY, y, { navigate: false })

      ctx.check("X's tab shows the login page", await onLoginPage(tabX))
      ctx.check("X's tab was not reloaded", (await documentId(tabX)) === xDoc)
      ctx.check("X's tab shows nothing of X", !(await bodyText(tabX)).includes(x.usernameOrEmail))

      const used = await exercise(profile, tabY)
      const stored = summarize(await readStored(tabY))
      ctx.check("the stored session is Y's", stored.session?.username === y.usernameOrEmail, stored)
      ctx.check('the stored session is not the one X had', stored.session?.sessionId !== xStored.session.sessionId)
      ctx.check("Y's request succeeded with the stored token", used.token === stored.session?.access, { used, stored })
      ctx.check("Y's tab is still signed in", await showsSignedInUi(tabY, 2000))
      const text = await bodyText(tabY)
      ctx.check("Y's tab shows Y's name", text.includes(y.usernameOrEmail))
      ctx.check("Y's tab shows nothing of X", !text.includes(x.usernameOrEmail))
      const xDelivered = profile
        .since(mark, tabX)
        .filter((e) => e.zone === 'business' && e.status >= 200 && e.status < 300)
      ctx.record('businessResponsesToXTabAfterTheSwitch', xDelivered.length)
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

      profile.armForced401(a)
      const used = await exercise(profile, a)
      const third = summarize(await readStored(a))
      ctx.check("tab A's request succeeded after the forced 401", used.status >= 200 && used.status < 300, used)
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
