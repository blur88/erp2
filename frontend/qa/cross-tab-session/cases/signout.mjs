// Cases 1 to 4 and 15: what a sign-out in one tab does to the others.
import { sleep } from '../lib/config.mjs'
import {
  documentId,
  draftKeys,
  draftsGone,
  nudge,
  onLoginPage,
  readStored,
  seedDraft,
  showsSignedInUi,
  summarize,
} from '../lib/harness.mjs'

/** One profile, tab A signed in through the form, tab B opened beside it. */
export async function pair(ctx, { user, profileOpts = {}, bOpts = {} } = {}) {
  const profile = await ctx.profile(profileOpts)
  const a = await profile.tab('/login', { label: 'A', navigate: false })
  await ctx.signIn(a, user ?? ctx.config.userA)
  const b = await profile.tab('/dashboard', { label: 'B', ...bOpts })
  ctx.require('tab B opened signed in from the stored session', await showsSignedInUi(b))
  const stored = await readStored(a)
  ctx.require('a session is stored', !!stored.record?.session)
  return { profile, a, b, stored }
}

/**
 * Signed-in tabs poll the health endpoints through the request gate every
 * 30 s, and a poll would tell a tab about a sign-out by itself. Cases that
 * need a tab to stay unaware for a few seconds start right after a poll.
 */
export async function afterNextPoll(profile, page) {
  const mark = profile.mark()
  const deadline = Date.now() + 35000
  while (Date.now() < deadline) {
    const polled = profile.since(mark, page).find((e) => e.zone === 'health' && e.status !== null)
    if (polled) {
      await sleep(500)
      return true
    }
    await sleep(200)
  }
  return false
}

export default [
  {
    id: 1,
    name: 'Two-tab sign-out',
    // Passes when: after tab A signs out through the sidebar menu, tab B of the
    // same profile shows the login page, and B is still the document it was
    // (nothing reloaded or navigated it).
    async run(ctx) {
      const { a, b } = await pair(ctx)
      const doc = await documentId(b)
      await ctx.signOut(a)
      ctx.check('tab A shows the login page', await onLoginPage(a))
      ctx.check('tab B shows the login page', await onLoginPage(b))
      ctx.check('tab B no longer shows the signed-in application', !(await showsSignedInUi(b, 300)))
      ctx.check('tab B was not reloaded', (await documentId(b)) === doc)
      const after = summarize(await readStored(a))
      ctx.check('the stored record is signed-out', after.session === null, after)
    },
  },
  {
    id: 2,
    name: 'Stale write-back',
    // Passes when: tab B, which could not hear of the sign-out (no
    // BroadcastChannel), changes its own store afterwards, and the shared
    // record is still signed-out with the revision the sign-out left, no
    // slices are stored, and no credential is in localStorage.
    async run(ctx) {
      const { profile, a, b } = await pair(ctx, { bOpts: { noBroadcast: true } })
      await afterNextPoll(profile, b)
      ctx.require('tab B still shows the signed-in application', await showsSignedInUi(b, 2000))
      await ctx.signOut(a)
      ctx.require('tab A reached the login page', await onLoginPage(a))
      const afterSignOut = summarize(await readStored(a))
      ctx.require('the sign-out was published', afterSignOut.session === null, afterSignOut)

      // B acts: moving inside the application dispatches to its store and sends
      // B through the request gate.
      await nudge(b, '/inventory/products')
      const reacted = (await onLoginPage(b, 8000)) || !(await showsSignedInUi(b, 200))
      ctx.check('tab B changed its own state after the sign-out', reacted)

      let last = null
      for (let i = 0; i < 6; i += 1) {
        await sleep(500)
        last = summarize(await readStored(a))
        if (last.session !== null || last.revision !== afterSignOut.revision || last.slicesSessionId !== null) break
      }
      ctx.check('the stored record stayed signed-out', last.session === null, last)
      ctx.check('the revision is the one the sign-out left', last.revision === afterSignOut.revision, {
        afterSignOut: afterSignOut.revision,
        now: last.revision,
      })
      ctx.check('no slices are stored for an ended session', last.slicesSessionId === null, last)
      const legacy = await b.evaluate(() => {
        const hits = []
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i)
          if (/token/i.test(localStorage.getItem(key) ?? '')) hits.push(key)
        }
        return hits
      })
      ctx.check('localStorage holds no token', legacy.length === 0, legacy)
    },
  },
  {
    id: 3,
    name: 'Drafts',
    // Passes when: a bank-reconciliation draft seeded in tab B's sessionStorage
    // is there before tab A signs out and gone afterwards, without B being
    // reloaded.
    async run(ctx) {
      const { a, b, stored } = await pair(ctx)
      const key = await seedDraft(b, stored.record.session.user.id)
      const doc = await documentId(b)
      ctx.require('the draft is in tab B before the sign-out', (await draftKeys(b)).includes(key))
      await ctx.signOut(a)
      ctx.check("tab B's draft is gone", await draftsGone(b), await draftKeys(b))
      ctx.check('tab B was not reloaded', (await documentId(b)) === doc)
    },
  },
  {
    id: 4,
    name: 'Reload and session restore',
    // Passes when: (i) a reload of signed-in tab B keeps both the tab's session
    // and its draft (the control: tab and draft exist and are restored); then,
    // after tab A signed out while B could not hear of it, (ii) reloading B
    // gives the login page with no draft; and (iii) a tab that starts with a
    // draft already in its sessionStorage, as a browser-restored tab does,
    // also ends on the login page with no draft.
    async run(ctx) {
      const { profile, a, b, stored } = await pair(ctx, { bOpts: { noBroadcast: true } })
      const userId = stored.record.session.user.id
      const key = await seedDraft(b, userId)

      await b.reload({ waitUntil: 'domcontentloaded' })
      ctx.check('control: the reloaded tab is signed in', await showsSignedInUi(b))
      ctx.check('control: the draft survived the reload', (await draftKeys(b)).includes(key))

      await afterNextPoll(profile, b)
      await ctx.signOut(a)
      ctx.require('tab A reached the login page', await onLoginPage(a))
      ctx.require('the draft is still in tab B when it is reloaded', (await draftKeys(b)).includes(key))

      await b.reload({ waitUntil: 'domcontentloaded' })
      ctx.check('the reloaded tab shows the login page', await onLoginPage(b))
      ctx.check('the reloaded tab has no draft', await draftsGone(b), await draftKeys(b))

      // A restored tab: sessionStorage is already populated when the page starts.
      const restoredKey = `erp:bank-reconciliation-draft:${userId}:create:qa-restored`
      const c = await profile.tab('/dashboard', {
        label: 'C',
        init: {
          fn: (k) => {
            if (sessionStorage.getItem('qa-restored-once') === null) {
              sessionStorage.setItem('qa-restored-once', '1')
              sessionStorage.setItem(k, JSON.stringify({ v: 1, lockVersion: null, form: {}, picker: {}, savedAt: 'restored' }))
              window.__qaDraftAtStart = sessionStorage.getItem(k) !== null
            }
          },
          arg: restoredKey,
        },
      })
      ctx.check('restored tab: the draft was in place when the page started', (await c.evaluate(() => window.__qaDraftAtStart)) === true)
      ctx.check('restored tab: shows the login page', await onLoginPage(c))
      ctx.check('restored tab: has no draft', await draftsGone(c), await draftKeys(c))
    },
  },
  {
    id: 15,
    name: 'Resume without a channel message',
    // Passes when, for `visibilitychange` and again for `pageshow` in a fresh
    // pair: tab B (opened with BroadcastChannel removed) is still unaware after
    // tab A signed out; the event is dispatched in B with no navigation and no
    // click; B then shows the login page, its draft is gone, and B sent no
    // request between A's sign-out and its own redirect.
    // The events are synthetic: this proves the listener and the real storage
    // adapter together, not the browser's own freezing or back/forward cache.
    async run(ctx) {
      for (const eventName of ['visibilitychange', 'pageshow']) {
        const { profile, a, b, stored } = await pair(ctx, { bOpts: { noBroadcast: true } })
        ctx.require(`${eventName}: BroadcastChannel is absent in tab B`, await b.evaluate(() => typeof BroadcastChannel === 'undefined'))
        const key = await seedDraft(b, stored.record.session.user.id)
        const doc = await documentId(b)
        let redirectedAt = null
        b.on('framenavigated', (frame) => {
          if (frame === b.mainFrame() && new URL(frame.url()).pathname === '/login' && redirectedAt === null) {
            redirectedAt = Date.now()
          }
        })

        await afterNextPoll(profile, b)
        await b.bringToFront()
        ctx.require(`${eventName}: tab B is visible`, (await b.evaluate(() => document.visibilityState)) === 'visible')
        const mark = profile.mark()
        await ctx.signOut(a)
        ctx.require(`${eventName}: tab A reached the login page`, await onLoginPage(a))
        await sleep(500)
        ctx.require(
          `${eventName}: tab B had not learned of the sign-out before the event`,
          (await showsSignedInUi(b, 500)) && (await draftKeys(b)).includes(key),
        )

        if (eventName === 'visibilitychange') {
          await b.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
        } else {
          await b.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
        }

        ctx.check(`${eventName}: tab B shows the login page`, await onLoginPage(b))
        ctx.check(`${eventName}: tab B's draft is gone`, await draftsGone(b), await draftKeys(b))
        ctx.check(`${eventName}: tab B was not reloaded`, (await documentId(b)) === doc)
        const until = redirectedAt ?? Date.now()
        const sent = profile.since(mark, b).filter((e) => e.issuedAt <= until)
        ctx.check(
          `${eventName}: tab B sent no request between the sign-out and its redirect`,
          sent.length === 0,
          sent.map((e) => [e.method, e.path, e.status]),
        )
        ctx.record(`${eventName}.redirected`, redirectedAt !== null)
        await ctx.close()
      }
    },
  },
]
