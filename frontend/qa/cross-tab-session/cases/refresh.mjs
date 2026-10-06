// Cases 7 to 11: refresh from several tabs, across real expiry, and with a tab
// that was paused while it held a superseded token.
//
// Cases 8 to 11 depend on the two QA values `stack.sh qa-up` sets (access
// lifetime 20 s, grace 5 s). They read both from `stack.sh show`; neither
// number is written into a case.
import { sleep } from '../lib/config.mjs'
import { judgeHeldRefresh, judgeSimultaneousRefresh, otherTabPath } from '../lib/judge.mjs'
import {
  answer401Together,
  exercise,
  nudge,
  onLoginPage,
  pageFetch,
  pauseTab,
  readStored,
  refreshes,
  rotation,
  showsSignedInUi,
  summarize,
  withTimeout,
} from '../lib/harness.mjs'
import { pair } from './signout.mjs'

async function sleepUntil(at) {
  const ms = at - Date.now()
  if (ms > 0) await sleep(ms)
  return ms
}

/**
 * The paused-holder scenario shared by cases 9, 10 and 11.
 *
 * Tab A (the holder) is made to refresh: its next data request is answered 401
 * by the script, so it sends POST /auth/refresh with the token of generation
 * G. That request is kept inside the browser and A is paused with the debugger
 * at that point: a tab that froze just as it was about to send. While A stands
 * still, tab B rotates the session (B's own forced 401; B first waits out A's
 * refresh lease, about 20 s). T0 is the moment B's rotation was answered.
 * `rotations` lists further rotations by B as offsets from T0. At T0 +
 * `resumeAt` the held request is let go and A is resumed, so the server sees
 * generation G's token at that moment.
 *
 * The 15 s refresh timeout in A has usually run out by then; whether A reads
 * the answer or reports a timeout is not what the cases judge. They judge what
 * the server decided and where both tabs end up.
 */
async function pausedHolder(ctx, { rotations = [], resumeAt }) {
  const { profile, a, b, stored } = await pair(ctx, { profileOpts: { intercept: true } })
  const sessionId = stored.record.session.sessionId
  const g = stored.record.session.generation
  // Fingerprint of the refresh token tab A holds and will present.
  const heldToken = summarize(stored).session.refresh
  const mark = profile.mark()

  const hold = profile.armHoldRefresh(a)
  profile.armForced401(a)
  await nudge(a, '/inventory/products')
  await withTimeout(hold.captured, 20000, "tab A's refresh request was not seen")
  const pause = await pauseTab(a)

  profile.armForced401(b)
  await exercise(profile, b)
  const first = await rotation(profile, mark, b)
  ctx.require('tab B rotated the session while tab A was paused', !!first, refreshes(profile, mark, b).map((e) => e.status))
  const t0 = first.respondedAt
  const afterFirst = summarize(await readStored(b))
  ctx.require('the stored generation advanced', afterFirst.session?.generation > g, afterFirst)

  for (const offset of rotations) {
    await sleepUntil(t0 + offset)
    const before = summarize(await readStored(b)).session.generation
    const again = profile.mark()
    profile.armForced401(b)
    await exercise(profile, b)
    await rotation(profile, again, b)
    const now = summarize(await readStored(b))
    ctx.require('a further rotation happened', now.session?.generation > before, now)
  }

  const current = await readStored(b)
  const late = await sleepUntil(t0 + resumeAt)
  ctx.require('the rotations finished before the planned resume', late > -500, { lateByMs: -late })
  // The moment the held request was let onto the wire, taken as it is let go.
  const released = await hold.release()
  // The request is on the wire before the tab moves again, so a timeout that
  // fires the instant the tab resumes cannot stop the server from seeing it.
  await sleep(400)
  const resumed = await pause.resume()
  ctx.check('tab A stood still while paused (20 ms counter advanced by at most 3)', resumed.ticksWhilePaused <= 3, resumed)
  ctx.record('pausedMs', resumed.pausedMs)
  ctx.record('heldTokenReleasedMsAfterItsSupersession', released.releasedAt - t0)

  return { profile, a, b, sessionId, generation: g, mark, current, t0, held: released.entry, heldToken }
}

/** One more data request from the tab, compared at once with what is stored. */
async function continuesOnStored(ctx, profile, page, sessionId) {
  const tab = profile.label(page)
  const used = await exercise(profile, page)
  const stored = summarize(await readStored(page))
  ctx.check(`tab ${tab} completes a data request on the stored token`, used.token === stored.session?.access, { used, stored })
  ctx.check(`tab ${tab}: the session is the same one`, stored.session?.sessionId === sessionId, stored)
  ctx.check(`tab ${tab} is signed in`, await showsSignedInUi(page, 2000))
  return { tab, token: used.token, stored: stored.session }
}

async function expectBothContinue(ctx, { profile, a, b, sessionId, generation }) {
  await continuesOnStored(ctx, profile, a, sessionId)
  const stored = { session: (await continuesOnStored(ctx, profile, b, sessionId)).stored }
  ctx.check('the stored generation is past the one tab A held', stored.session?.generation > generation, stored)
}

async function expectRevoked(ctx, { a, b, current }) {
  // Both tabs are used once more, as a person would; a tab learns of a
  // revocation from its next request if it has not been told already.
  await nudge(a, '/sales/customers')
  await nudge(b, '/sales/customers')
  ctx.check('tab A shows the login page', await onLoginPage(a, 45000))
  ctx.check('tab B shows the login page', await onLoginPage(b, 45000))
  const stored = summarize(await readStored(a))
  ctx.check('the stored record is signed-out', stored.session === null, stored)
  const me = await pageFetch(a, { path: '/api/auth/me', bearer: current.record.session.accessToken })
  ctx.check('the server rejects the access token that was current (session revoked)', me.status === 401, { status: me.status })
}

/**
 * What the server did with the held refresh, judged (lib/judge.mjs,
 * judgeHeldRefresh). `expect` is 'inside' when the case let the token go
 * inside its grace and 'after' when it let it go later. Pass, all of:
 *   - the request was sent and the server answered it;
 *   - it presented the token tab A held, the superseded one;
 *   - inside: it was let go less than the configured grace after that token
 *     was superseded, and it was answered 200;
 *   - after: it was let go more than the grace after, and it was answered 401.
 * The grace is the stack's (`stack.sh show`), never a number written here.
 */
async function heldAnswer(ctx, { held, heldToken, t0 }, expect) {
  // The answer is waited for, up to 10 s; a request with no answer by then is
  // judged as it is, without one.
  for (const deadline = Date.now() + 10000; held && held.status === null && !held.failed && Date.now() < deadline; ) await sleep(100)
  ctx.record('heldRefreshStatus', held?.status ?? held?.failed ?? 'no answer seen by the tab')
  ctx.record('heldRefreshPresented', held?.presented ?? null)
  for (const l of judgeHeldRefresh({ held, expected: heldToken, supersededAt: t0, graceMs: ctx.config.graceSeconds * 1000, expect })) {
    ctx.check(l.label, l.ok, l.detail)
  }
}

/** Waits until the request the script answered 401 was sent again by its tab and answered 2xx; null on timeout. */
async function sentAgain(profile, page, item, timeout = 45000) {
  const first = item.entry
  for (const deadline = Date.now() + timeout; ; ) {
    const again = profile
      .since(first.seq, page)
      .find((e) => e.method === first.method && e.path === first.path && e.search === first.search && e.status !== null && e.status >= 200 && e.status < 300)
    if (again) return again
    if (Date.now() > deadline) return null
    await sleep(100)
  }
}

export default [
  {
    id: 7,
    name: 'Simultaneous refresh',
    // One data request of each tab is kept unanswered by the script; when both
    // are held, both are answered 401 in the same turn. So neither tab's
    // request can have been sent after the other tab's rotation.
    //
    // Passes when (lib/judge.mjs, judgeSimultaneousRefresh):
    //   - both held requests carried the access token of the starting
    //     generation;
    //   - no refresh was sent before a 401 was delivered, and both 401s were
    //     delivered before the first refresh was answered;
    //   - exactly ONE rotation happened: every refresh presented the starting
    //     refresh token and was answered 200 with the next generation (one
    //     refresh: the other tab adopted; two, one per tab: the other tab
    //     recovered inside the grace), and the stored generation is the
    //     starting one plus one;
    //   - the request each tab was refused is sent again and answered;
    //   - a further data request from each tab succeeds on the stored token
    //     of the same session, both on that one generation and the same
    //     refresh token, with the tab still signed in.
    // A second rotation fails the case. (A 429 on the refresh route fails any
    // case.) The times, token fingerprints and statuses are recorded as
    // `timeline` whether the case passes or not.
    async run(ctx) {
      const { profile, a, b, stored } = await pair(ctx, { profileOpts: { intercept: true } })
      const before = summarize(stored).session
      const zero = Date.now()
      const mark = profile.mark()
      const data = (r) => r.zone === 'business'
      const holds = [profile.armHold(a, data), profile.armHold(b, data)]
      await Promise.all([nudge(a, '/inventory/products'), nudge(b, '/inventory/products')])
      await withTimeout(Promise.all(holds.map((h) => h.captured)), 20000, 'a data request of each tab was not seen')
      const items = holds.map((h) => h.items[0])

      // Preconditions of the delivery: nothing has rotated yet, and the
      // starting access token has time left, so no tab is about to be refused
      // by the server for its own reasons.
      const atDelivery = summarize(await readStored(a)).session
      const remainingMs = before.accessTokenExpiresAt * 1000 - Date.now()
      ctx.require('the session is still at its starting generation when the 401s are delivered', atDelivery?.generation === before.generation && atDelivery?.refresh === before.refresh, atDelivery)
      ctx.require('the starting access token has more than 3 s left when the 401s are delivered', remainingMs > 3000, { remainingMs })

      await answer401Together(holds)
      for (const deadline = Date.now() + 5000; items.some((i) => i.entry.status === null) && Date.now() < deadline; ) await sleep(20)
      ctx.require('both tabs received the 401 the script answered', items.every((i) => i.entry.status === 401), items.map((i) => [i.entry.tab, i.entry.status]))

      const again = [await sentAgain(profile, a, items[0]), await sentAgain(profile, b, items[1])]
      // "Continue" is judged on a further request from each tab as well: the
      // requests above include ones sent before the refresh, on the old token.
      const continued = [
        await continuesOnStored(ctx, profile, a, before.sessionId),
        await continuesOnStored(ctx, profile, b, before.sessionId),
      ]
      // A tab that would rotate again after adopting does so on a request of
      // its own; the two above are such requests, and two seconds more are
      // watched before the refreshes are counted.
      await sleep(2000)
      const sent = refreshes(profile, mark)
      await Promise.all(sent.map((e) => e.issuedRead))
      const after = summarize(await readStored(a)).session
      const at = (ms) => (typeof ms === 'number' ? ms - zero : null)
      const held = items.map((i) => ({ tab: i.entry.tab, token: i.entry.token, issuedAt: i.entry.issuedAt, deliveredAt: i.entry.respondedAt ?? null }))

      // Kept whatever the verdict: this is what tells one rotation from two.
      ctx.record('timeline', {
        zero: new Date(zero).toISOString(),
        unit: 'ms after zero, on the script\'s clock',
        starting: { generation: before.generation, accessToken: before.access, refreshToken: before.refresh, accessTokenMsLeftAtDelivery: remainingMs },
        forced401: items.map((i) => ({
          tab: i.entry.tab,
          request: `${i.entry.method} ${i.entry.path}`,
          accessToken: i.entry.token,
          issuedAt: at(i.entry.issuedAt),
          heldAt: at(i.capturedAt),
          answered401At: at(i.releasedAt),
          seenAnsweredAt: at(i.entry.respondedAt),
        })),
        refreshes: sent.map((e) => ({
          tab: e.tab,
          issuedAt: at(e.issuedAt),
          answeredAt: at(e.respondedAt),
          presentedRefreshToken: e.presented ?? null,
          status: e.status ?? e.failed ?? null,
          issuedGeneration: e.issued?.generation ?? null,
          issuedAccessToken: e.issued?.access ?? null,
          issuedRefreshToken: e.issued?.refresh ?? null,
        })),
        refusedRequestSentAgain: again.map((e, i) => ({ tab: items[i].entry.tab, issuedAt: at(e?.issuedAt), status: e?.status ?? null, accessToken: e?.token ?? null })),
        storedAtTheEnd: { generation: after?.generation ?? null, accessToken: after?.access ?? null, refreshToken: after?.refresh ?? null },
        otherTab: otherTabPath(held, sent),
      })
      ctx.record('refreshRequests', sent.map((e) => [e.tab, e.status]))
      ctx.record('generations', { before: before.generation, after: after?.generation })

      const judged = judgeSimultaneousRefresh({
        before: { generation: before.generation, access: before.access, refresh: before.refresh },
        held,
        refreshes: sent,
        after: { generation: after?.generation ?? null, refresh: after?.refresh ?? null },
        continued,
      })
      for (const l of judged) ctx.check(l.label, l.ok, l.detail)
      // Pass: the very request each tab was refused went out again and was answered 2xx.
      ctx.check("tab A's refused request was sent again and answered", again[0] !== null)
      ctx.check("tab B's refused request was sent again and answered", again[1] !== null)
    },
  },
  {
    id: 8,
    name: 'Use past real expiry',
    // Passes when: two tabs used in turn every quarter lifetime each complete
    // every data request for at least three and a half access-token lifetimes
    // and until the session has rotated three times, the session stays the
    // same one, and both tabs are still signed in.
    //
    // A refresh happens only at the first use after an expiry, so one cycle
    // lasts between one lifetime and a lifetime plus a step. Three and a half
    // lifetimes therefore hold two or three rotations depending on where the
    // uses fall against the expiries (a recorded run at 2ef0e4a12 saw two and
    // failed a fixed-length version of this case with every use succeeding).
    // The uses go on until the third rotation is seen; six lifetimes are more
    // than three longest cycles, so running out of them is a real failure.
    async run(ctx) {
      const lifetime = ctx.config.accessSeconds
      ctx.require('the access lifetime is the short QA one', lifetime <= 60, { accessSeconds: lifetime })
      const { profile, a, b, stored } = await pair(ctx)
      const before = summarize(stored)
      const mark = profile.mark()
      const startedAt = Date.now()
      const atLeast = startedAt + lifetime * 3500
      const atMost = startedAt + lifetime * 6000
      const step = (lifetime * 1000) / 4
      const rotations = async () => (summarize(await readStored(a)).session?.generation ?? 0) - before.session.generation
      let uses = 0
      for (let i = 0; Date.now() < atMost; i += 1) {
        if (Date.now() >= atLeast && (await rotations()) >= 3) break
        const started = Date.now()
        await exercise(profile, i % 2 === 0 ? a : b)
        uses += 1
        await sleepUntil(started + step)
      }
      ctx.record('lifetimesUsed', Math.round(((Date.now() - startedAt) / (lifetime * 1000)) * 100) / 100)
      const after = summarize(await readStored(a))
      ctx.record('uses', uses)
      ctx.record('refreshRequests', refreshes(profile, mark).map((e) => [e.tab, e.status]))
      ctx.record('generations', { before: before.session.generation, after: after.session?.generation })
      ctx.check('every use succeeded', uses >= 12, { uses })
      ctx.check('the session is the same one', after.session?.sessionId === before.session.sessionId, after)
      ctx.check('the generation advanced at least three times', after.session?.generation >= before.session.generation + 3, after)
      ctx.check('tab A is signed in', await showsSignedInUi(a, 2000))
      ctx.check('tab B is signed in', await showsSignedInUi(b, 2000))
    },
  },
  {
    id: 9,
    name: 'Holder paused, resumed inside grace',
    // Passes when: tab A's held refresh, presenting the superseded token, is
    // let go inside that token's grace (3 s after supersession, or grace - 2 s
    // if the grace is shorter than 5 s; compared with the configured grace),
    // reaches the server and is answered 200 (heldAnswer); and afterwards both
    // tabs complete a data request on the current generation of the same
    // session and are signed in.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace leaves room to resume inside it', grace >= 4, { graceSeconds: grace })
      const s = await pausedHolder(ctx, { resumeAt: Math.min(3, grace - 2) * 1000 })
      await heldAnswer(ctx, s, 'inside')
      await expectBothContinue(ctx, s)
    },
  },
  {
    id: 10,
    name: 'Holder paused, resumed after grace',
    // Passes when: tab A's held refresh, presenting the superseded token, is
    // let go 3 s after that token's grace ran out (compared with the
    // configured grace), reaches the server and is answered 401 (heldAnswer);
    // and afterwards both tabs show the login page, the stored record is
    // signed-out, and the server rejects the access token that was current. If case 9 passes and this one fails, check the grace value
    // first.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace is short enough to wait out', grace <= 90, { graceSeconds: grace })
      const s = await pausedHolder(ctx, { resumeAt: (grace + 3) * 1000 })
      await heldAnswer(ctx, s, 'after')
      await expectRevoked(ctx, s)
    },
  },
  {
    id: 11,
    name: 'Holder paused, resumed after further rotations',
    // Passes when the outcome follows the deadline of the token tab A holds,
    // not the age of the latest rotation:
    //   (a) B rotates twice in quick succession and A's token arrives inside
    //       its own grace: the held refresh is answered 200 (heldAnswer,
    //       'inside') and both tabs continue on the current generation;
    //   (b) B rotates, rotates again one second before A's token's deadline,
    //       and A's token arrives 2.5 s after that deadline, when the second
    //       rotation is still well inside ITS grace: the held refresh is
    //       answered 401 (heldAnswer, 'after'), the session is revoked and
    //       both tabs sign out.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace is between 4 s and 90 s', grace >= 4 && grace <= 90, { graceSeconds: grace })

      ctx.scope = '(a) '
      const inside = await pausedHolder(ctx, { rotations: [500], resumeAt: Math.min(3, grace - 2) * 1000 })
      await heldAnswer(ctx, inside, 'inside')
      await expectBothContinue(ctx, inside)
      const insideGeneration = summarize(await readStored(inside.a)).session?.generation
      ctx.check('two rotations had happened', insideGeneration >= inside.generation + 2, { insideGeneration })
      await ctx.close()

      ctx.scope = '(b) '
      const past = await pausedHolder(ctx, { rotations: [(grace - 1) * 1000], resumeAt: (grace + 2.5) * 1000 })
      await heldAnswer(ctx, past, 'after')
      await expectRevoked(ctx, past)
    },
  },
]
