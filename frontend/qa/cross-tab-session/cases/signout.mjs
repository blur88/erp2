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
 * How often a signed-in tab polls the health endpoints
 * (`setInterval(checkHealth, 30000)` in SystemStatus.tsx; suite-wiring.test.mjs
 * fails if the two drift apart).
 */
export const STATUS_POLL_MS = 30000

/**
 * Signed-in tabs poll the health endpoints through the request gate every
 * 30 s. A poll that falls due after a sign-out tells the tab about it: the
 * gate reads the stored record first, finds the session ended, ends the tab
 * and does not send the poll. Cases that need a tab to stay unaware for a few
 * seconds start right after a poll.
 *
 * Returns when that poll was issued (the script's clock), or null if none was
 * seen. The next one is due STATUS_POLL_MS later.
 */
export async function afterNextPoll(profile, page) {
  const mark = profile.mark()
  const deadline = Date.now() + STATUS_POLL_MS + 5000
  while (Date.now() < deadline) {
    const polled = profile.since(mark, page).find((e) => e.zone === 'health' && e.status !== null)
    if (polled) {
      await sleep(500)
      return polled.issuedAt
    }
    await sleep(200)
  }
  return null
}

/**
 * Runs in tab B before the application: records when a message arrives on the
 * session channel. The application's own listener is untouched; this one is
 * added first, to the same channel object. `window.__qaSessionChannel` stays
 * null in a tab that has no BroadcastChannel.
 */
export const recordSessionChannel = {
  fn: (name) => {
    window.__qaSessionChannel = null
    const Native = window.BroadcastChannel
    if (typeof Native !== 'function') return
    const seen = { opened: 0, received: [] }
    window.__qaSessionChannel = seen
    window.BroadcastChannel = class extends Native {
      constructor(channelName) {
        super(channelName)
        if (channelName !== name) return
        seen.opened += 1
        super.addEventListener('message', () => seen.received.push(Date.now()))
      }
    }
  },
  arg: 'erp-session',
}

/**
 * The two lines that tie tab B's redirect to the BroadcastChannel message.
 *
 * A tab learns of a sign-out elsewhere in one of three ways: the channel
 * message, a request of its own (the gate's read before it), or a resume event
 * (case 15). "Sent no request" does not tell the first two apart, because the
 * gate's read ends the tab before the request is sent (#1379, run B1). So:
 *
 *   - the message is observed arriving in B, after the sign-out began and
 *     before B's redirect;
 *   - B's next status poll was not yet due when B was redirected, so no gate
 *     read of B's own fell in between.
 *
 * Returns nothing; both are checks.
 */
async function toldByTheChannel(ctx, b, { polledAt, signOutAt, redirect }) {
  const channel = await b.evaluate(() => window.__qaSessionChannel)
  const until = redirect.at ?? Date.now()
  const inWindow = channel ? channel.received.filter((t) => t >= signOutAt && t <= until) : []
  ctx.check(
    'a session-channel message reached tab B after the sign-out began and before its redirect',
    redirect.at !== null && inWindow.length > 0,
    {
      channelInTabB: channel !== null,
      channelsOpened: channel?.opened ?? 0,
      receivedMsAfterSignOut: channel ? channel.received.map((t) => t - signOutAt) : null,
      redirectMsAfterSignOut: redirect.at === null ? null : redirect.at - signOutAt,
    },
  )
  const nextPollDueAt = polledAt + STATUS_POLL_MS
  ctx.check("tab B's next status poll was not yet due when it was redirected", redirect.at !== null && redirect.at < nextPollDueAt - POLL_MARGIN_MS, {
    lastPollMsBeforeSignOut: signOutAt - polledAt,
    nextPollDueMsAfterSignOut: nextPollDueAt - signOutAt,
    redirectMsAfterSignOut: redirect.at === null ? null : redirect.at - signOutAt,
    marginMs: POLL_MARGIN_MS,
  })
}

// The poll's timer runs in the tab; the script sees the request it issues. The
// margin covers the difference between the two.
const POLL_MARGIN_MS = 2000

/**
 * Notes when the tab's main frame arrives at /login. Cases 1, 3 and 15 use it
 * to bound "before the tab learned of the sign-out".
 */
function watchRedirect(page) {
  const seen = { at: null }
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && new URL(frame.url()).pathname === '/login' && seen.at === null) seen.at = Date.now()
  })
  return seen
}

/**
 * Pass: tab B issued no request of any kind between `mark` (taken just before
 * tab A's sign-out) and its own arrival at /login. If the redirect was never
 * seen the window runs to now, so a tab that only sent something still fails.
 *
 * What this line establishes is that a tab whose session ended sends nothing
 * on the way out. It does NOT establish how the tab learned of the sign-out:
 * a request that would have told it is stopped by the gate's read before it
 * is sent, so the line passes then too (#1379).
 */
function sentNothingBeforeRedirect(ctx, profile, mark, b, redirect, prefix = '') {
  const until = redirect.at ?? Date.now()
  const sent = profile.since(mark, b).filter((e) => e.issuedAt <= until)
  ctx.check(`${prefix}tab B sent no request between the sign-out and its redirect`, sent.length === 0, sent.map((e) => [e.method, e.path, e.status]))
  ctx.record(`${prefix}redirectSeen`, redirect.at !== null)
}

export default [
  {
    id: 1,
    name: 'Two-tab sign-out',
    // Passes when: after tab A signs out through the sidebar menu, tab B of the
    // same profile shows the login page within 5 s, B is still the document it
    // was (nothing reloaded or navigated it), a session-channel message
    // REACHED B between the sign-out and its redirect, B's next status poll
    // was NOT YET DUE when it was redirected, and B sent no request in
    // between.
    //
    // What a pass proves: the BroadcastChannel message was delivered to B, and
    // B left before anything of its own could have told it (its poll is the
    // only thing a signed-in, idle, visible tab does by itself, and it was not
    // due). The case still starts right after one of B's polls so that this
    // holds; it is now checked instead of assumed.
    //
    // What a pass does not prove: that the message alone would have been
    // enough in a tab that is frozen, hidden or throttled (case 15 covers the
    // resume events with the channel removed); delivery between browser
    // profiles or windows of different processes; and anything about a
    // sign-out whose publication is delayed (case 17).
    async run(ctx) {
      const { profile, a, b } = await pair(ctx, { bOpts: { init: recordSessionChannel } })
      const doc = await documentId(b)
      const redirect = watchRedirect(b)
      const polledAt = await afterNextPoll(profile, b)
      ctx.require('a status poll of tab B was seen (the case starts right after one)', polledAt !== null)
      const mark = profile.mark()
      const signOutAt = Date.now()
      await ctx.signOut(a)
      ctx.check('tab A shows the login page', await onLoginPage(a))
      ctx.check('tab B shows the login page within 5 s', await onLoginPage(b, 5000))
      await toldByTheChannel(ctx, b, { polledAt, signOutAt, redirect })
      sentNothingBeforeRedirect(ctx, profile, mark, b, redirect)
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
    // is there before tab A signs out and gone within 5 s afterwards, without
    // B being reloaded; and, as in case 1, a session-channel message REACHED B
    // between the sign-out and its redirect, B's next status poll was NOT YET
    // DUE when it was redirected, and B sent no request in between.
    //
    // What a pass proves: the draft was cleared in a tab that was told by the
    // BroadcastChannel message. What it does not prove is the same as in
    // case 1; the draft's removal on the other paths is cases 4 and 15.
    async run(ctx) {
      const { profile, a, b, stored } = await pair(ctx, { bOpts: { init: recordSessionChannel } })
      const key = await seedDraft(b, stored.record.session.user.id)
      const doc = await documentId(b)
      const redirect = watchRedirect(b)
      const polledAt = await afterNextPoll(profile, b)
      ctx.require('a status poll of tab B was seen (the case starts right after one)', polledAt !== null)
      ctx.require('the draft is in tab B before the sign-out', (await draftKeys(b)).includes(key))
      const mark = profile.mark()
      const signOutAt = Date.now()
      await ctx.signOut(a)
      ctx.check("tab B's draft is gone within 5 s", await draftsGone(b, 5000), await draftKeys(b))
      ctx.check('tab B shows the login page', await onLoginPage(b, 5000))
      await toldByTheChannel(ctx, b, { polledAt, signOutAt, redirect })
      sentNothingBeforeRedirect(ctx, profile, mark, b, redirect)
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
        const redirect = watchRedirect(b)

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
        sentNothingBeforeRedirect(ctx, profile, mark, b, redirect, `${eventName}: `)
        await ctx.close()
      }
    },
  },
]
