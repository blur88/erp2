// Cases 7 to 11: refresh from several tabs, across real expiry, and with a tab
// that was paused while it held a superseded token.
//
// Cases 8 to 11 depend on the two QA values `stack.sh qa-up` sets (access
// lifetime 20 s, grace 5 s). They read both from `stack.sh show`; neither
// number is written into a case.
import { sleep } from '../lib/config.mjs'
import {
  exercise,
  nudge,
  onLoginPage,
  pageFetch,
  pauseTab,
  readStored,
  showsSignedInUi,
  summarize,
  withTimeout,
} from '../lib/harness.mjs'
import { pair } from './signout.mjs'

const refreshes = (profile, mark, page) =>
  profile.since(mark, page).filter((e) => e.path.replace(/\/$/, '') === '/api/auth/refresh')

/**
 * Waits for a rotation answered 200 to `page` (or to any tab) after `mark`.
 * A tab's first successful data request can be one that went out before its
 * refresh, so "the request succeeded" does not yet mean "it has rotated".
 */
async function rotation(profile, mark, page, timeout = 45000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const done = refreshes(profile, mark, page).find((e) => e.status === 200)
    if (done) return done
    if (Date.now() > deadline) return null
    await sleep(100)
  }
}

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
  await hold.release()
  // The request is on the wire before the tab moves again, so a timeout that
  // fires the instant the tab resumes cannot stop the server from seeing it.
  await sleep(400)
  const resumed = await pause.resume()
  ctx.check('tab A stood still while paused (20 ms counter advanced by at most 3)', resumed.ticksWhilePaused <= 3, resumed)
  ctx.record('pausedMs', resumed.pausedMs)
  ctx.record('heldTokenReleasedMsAfterItsSupersession', Date.now() - 400 - t0)

  return { profile, a, b, sessionId, generation: g, mark, current, t0 }
}

/** One more data request from the tab, compared at once with what is stored. */
async function continuesOnStored(ctx, profile, page, sessionId) {
  const tab = profile.label(page)
  const used = await exercise(profile, page)
  const stored = summarize(await readStored(page))
  ctx.check(`tab ${tab} completes a data request on the stored token`, used.token === stored.session?.access, { used, stored })
  ctx.check(`tab ${tab}: the session is the same one`, stored.session?.sessionId === sessionId, stored)
  ctx.check(`tab ${tab} is signed in`, await showsSignedInUi(page, 2000))
  return stored
}

async function expectBothContinue(ctx, { profile, a, b, sessionId, generation }) {
  await continuesOnStored(ctx, profile, a, sessionId)
  const stored = await continuesOnStored(ctx, profile, b, sessionId)
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

function heldAnswer(ctx, { profile, a, mark }) {
  const held = refreshes(profile, mark, a)[0]
  ctx.record('heldRefreshStatus', held?.status ?? held?.failed ?? 'no answer seen by the tab')
}

export default [
  {
    id: 7,
    name: 'Simultaneous refresh',
    // Passes when: both tabs' next data request is answered 401 at the same
    // moment, both get a data request through afterwards, the generation has
    // advanced, and a further data request from each tab succeeds on the
    // stored token of the same session with the tab still signed in. (A 429
    // on the refresh route fails any case.)
    async run(ctx) {
      const { profile, a, b, stored } = await pair(ctx, { profileOpts: { intercept: true } })
      const before = summarize(stored)
      const mark = profile.mark()
      profile.armForced401(a)
      profile.armForced401(b)
      await Promise.all([exercise(profile, a), exercise(profile, b)])
      ctx.check('a rotation was answered 200', !!(await rotation(profile, mark, null)))
      const forced = profile.since(mark).filter((e) => e.forced401)
      ctx.check('both tabs received the forced 401', forced.some((e) => e.page === a) && forced.some((e) => e.page === b), forced.map((e) => e.tab))
      const after = summarize(await readStored(a))
      ctx.check('the generation advanced', after.session?.generation > before.session.generation, { before: before.session.generation, after: after.session?.generation })
      // "Continue" is judged on a further request from each tab: the requests
      // above include ones sent before the refresh, on the old token.
      await continuesOnStored(ctx, profile, a, before.session.sessionId)
      await continuesOnStored(ctx, profile, b, before.session.sessionId)
      ctx.record('refreshRequests', refreshes(profile, mark).map((e) => [e.tab, e.status]))
      ctx.record('generations', { before: before.session.generation, after: after.session?.generation })
    },
  },
  {
    id: 8,
    name: 'Use past real expiry',
    // Passes when: over three and a half access-token lifetimes, two tabs used
    // in turn every quarter lifetime each complete every data request, the
    // session stays the same one, its generation advances at least three
    // times, and both tabs are still signed in.
    async run(ctx) {
      const lifetime = ctx.config.accessSeconds
      ctx.require('the access lifetime is the short QA one', lifetime <= 60, { accessSeconds: lifetime })
      const { profile, a, b, stored } = await pair(ctx)
      const before = summarize(stored)
      const mark = profile.mark()
      const end = Date.now() + lifetime * 3500
      const step = (lifetime * 1000) / 4
      let uses = 0
      for (let i = 0; Date.now() < end; i += 1) {
        const started = Date.now()
        await exercise(profile, i % 2 === 0 ? a : b)
        uses += 1
        await sleepUntil(started + step)
      }
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
    // Passes when: tab A's superseded token reaches the server inside its
    // grace (3 s after supersession, or grace - 2 s if the grace is shorter
    // than 5 s), and afterwards both tabs complete a data request on the
    // current generation of the same session and are signed in.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace leaves room to resume inside it', grace >= 4, { graceSeconds: grace })
      const s = await pausedHolder(ctx, { resumeAt: Math.min(3, grace - 2) * 1000 })
      await sleep(1000)
      heldAnswer(ctx, s)
      await expectBothContinue(ctx, s)
    },
  },
  {
    id: 10,
    name: 'Holder paused, resumed after grace',
    // Passes when: tab A's superseded token reaches the server 3 s after its
    // grace ran out, and afterwards both tabs show the login page, the stored
    // record is signed-out, and the server rejects the access token that was
    // current. If case 9 passes and this one fails, check the grace value
    // first.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace is short enough to wait out', grace <= 90, { graceSeconds: grace })
      const s = await pausedHolder(ctx, { resumeAt: (grace + 3) * 1000 })
      await sleep(1000)
      heldAnswer(ctx, s)
      await expectRevoked(ctx, s)
    },
  },
  {
    id: 11,
    name: 'Holder paused, resumed after further rotations',
    // Passes when the outcome follows the deadline of the token tab A holds,
    // not the age of the latest rotation:
    //   (a) B rotates twice in quick succession and A's token arrives inside
    //       its own grace: both tabs continue on the current generation;
    //   (b) B rotates, rotates again one second before A's token's deadline,
    //       and A's token arrives 2.5 s after that deadline, when the second
    //       rotation is still well inside ITS grace: the session is revoked
    //       and both tabs sign out.
    async run(ctx) {
      const grace = ctx.config.graceSeconds
      ctx.require('the grace is between 4 s and 90 s', grace >= 4 && grace <= 90, { graceSeconds: grace })

      ctx.scope = '(a) '
      const inside = await pausedHolder(ctx, { rotations: [500], resumeAt: Math.min(3, grace - 2) * 1000 })
      await sleep(1000)
      heldAnswer(ctx, inside)
      await expectBothContinue(ctx, inside)
      const insideGeneration = summarize(await readStored(inside.a)).session?.generation
      ctx.check('two rotations had happened', insideGeneration >= inside.generation + 2, { insideGeneration })
      await ctx.close()

      ctx.scope = '(b) '
      const past = await pausedHolder(ctx, { rotations: [(grace - 1) * 1000], resumeAt: (grace + 2.5) * 1000 })
      await sleep(1000)
      heldAnswer(ctx, past)
      await expectRevoked(ctx, past)
    },
  },
]
