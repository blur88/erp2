// Case 16: an access token that was valid when the request was sent and had
// expired when the request reached the backend, because the ingress delayed it
// in between.
//
// The limiter delays excess /api requests rather than refusing them, so a
// request sent just before its access token expires can reach the backend after
// it has. That is the path the application must survive without a user action,
// and it is the one thing W1's rounds cannot show: W1 starts every tab either
// with a current token or with one already expired, never with one that expires
// while the ingress is holding its request.
//
// The inference, and what each part rests on:
//   1. L carried a known token: the fingerprint of the stored access token, the
//      fingerprint in the browser's record of L, and the fingerprint in the
//      capture's record of L are the same. "Before the first refresh" is not
//      evidence of anything.
//   2. L's 401 was an expiry: the backend's own message is exactly
//      "Invalid or expired token", which rules out every other rejection the
//      strategy makes, and the same fingerprint was accepted with a 2xx earlier
//      in the attempt, which rules out a malformed or wrongly signed token.
//   3. L had expired when it arrived at the backend, not merely when
//      authentication ran: a request X with the same fingerprint, answered
//      "Invalid or expired token", had its response completely leave the backend
//      before the first byte of L arrived.
//
// and the two orderings, each inside one clock and never across two:
//   valid at send   P, same fingerprint, answered 2xx, reached the ingress after
//                   L did: L left the browser before the ingress read its first
//                   bytes, and the backend judged P valid after the ingress read
//                   P's.
//   expired at      X's response had completely left the backend before L's
//   arrival        first byte arrived.
//
// The expiry instant is never read from a clock: it is bracketed by the
// backend's own two answers. What the case does not show, and does not claim:
// that no clock stepped during the attempt. The backward-movement check can
// reveal a clock that moved backwards and nothing more; its absence is a stated
// prerequisite of the run, recorded with the attempt.
//
// A window that was missed may be tried again, at most MAX_SETUP_ATTEMPTS times
// and only when the behaviour passed. A behavioural failure is never retried.
// Missing evidence is inconclusive, and inconclusive fails the case.
import { sleep } from '../lib/config.mjs'
import { fingerprint, pageFetch, readStored, summarize } from '../lib/harness.mjs'
import { captureSegment } from '../lib/probe.mjs'
import { captureUsable } from '../lib/capture-evidence.mjs'
import { buildExpiryEvidence } from '../lib/expiry-evidence.mjs'
import { windowBetween } from '../lib/ingress-log.mjs'
import { watchCompletion } from '../lib/completion.mjs'
import { KEEP_SHELL_ANSWERS, REGIONAL_SETTINGS, referenceOf, shellReference } from '../lib/usable.mjs'
import { CALIBRATION, EXPIRED_MESSAGE, MAX_SETUP_ATTEMPTS, lifetimeEnough, nextNavigateLead, recoveryDeadline, judgeExpiryCrossing, maxConfiguredDelayMs } from '../lib/expiry-crossing.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = new URL('../../../..', import.meta.url)

// How the case's profile is opened. Every API request carries an identifier
// (tagRequests, which needs intercept), and the answers to the two settings
// routes are kept: the case's first precondition compares the holder tab's
// shell against what the server said, and without keepAnswers there is nothing
// to compare with (the recorded run on 198943047 stopped there).
export const PROFILE_OPTIONS = { intercept: true, tagRequests: true, keepRejections: true, keepAnswers: KEEP_SHELL_ANSWERS }
// The fillers and the probes each run in a browser context of their own: a
// context has its own pool of six connections per origin, so neither queues
// behind the other or behind the application tab. They leave the same machine,
// and the limiter is keyed on the address, so they are meant to land in the
// application's bucket; that is checked from the ingress log of every attempt
// (one address for all three), not assumed.
export const SIDE_OPTIONS = { intercept: true, tagRequests: true, keepRejections: true }
const { parseLine } = await import(pathToFileURL(join(REPO_ROOT.pathname, 'nginx/access-log.mjs')).href)

/** /api/auth/me is on session_limit, which does not delay: a probe, not filler. */
const ME = '/api/auth/me'
// How many filler requests, and how long before the tab is due they start.
// Measured in the capture feasibility run on d313d0e45: requests queued through
// one profile reach the ingress at about 28 a second against a zone rate of 20,
// so the limiter's excess needs about 2.4 s and some 70 requests to pass its
// delay threshold, and stays above it only while the queue keeps coming. The
// plan's first figures (30 fillers, six at a time, 1.2 s ahead) cannot raise
// the excess that far.
const FILLERS = 160
const PROBE_EVERY_MS = 150
const PROBE_WINDOW_MS = 1200
/** How long before the token expires the fillers start, and the tab navigates. */
const FILLER_LEAD_MS = 3500
const NAVIGATE_LEAD_MS = 300
/** The first business request of a tab arrives this long after its goto (median). */
const FALLBACK_LEAD_MS = 250

const now = () => Date.now()
// Time kept in hand, beyond the lead and the filler lead, when an attempt starts.
const LIFETIME_MARGIN_MS = 3000

/**
 * A current access token in the profile's stored session, obtained the way the
 * application obtains one: a tab of the profile is opened, meets its 401,
 * refreshes and stores the result. (A refresh sent from here with a raw request
 * would rotate the refresh token on the server and store nothing, leaving the
 * profile holding a superseded one.) Returns the stored session afterwards.
 */
async function renewThroughTheApplication(ctx, profile, holder, label) {
  const { config } = ctx
  const from = profile.mark()
  const temp = await profile.tab('/dashboard', { label })
  let answered = false
  for (const deadline = now() + 45000; !answered && now() < deadline; ) {
    answered = profile.since(from, temp).some((e) => e.zone === 'business' && e.status >= 200 && e.status < 300)
    if (!answered) await sleep(100)
  }
  await temp.close()
  ctx.require(`a tab opened from the stored session got a data request answered 2xx (${label})`, answered)
  return storedSession(holder)
}
const waitUntil = async (at) => {
  const ms = at - now()
  if (ms > 0) await sleep(ms)
}

/** The stored session's token and its expiry, in milliseconds on this clock. */
async function storedSession(page) {
  const stored = await readStored(page)
  const session = stored?.record?.session ?? null
  if (!session) throw new Error('the profile holds no stored session')
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAtMs: session.accessTokenExpiresAt * 1000,
    fingerprint: fingerprint(session.accessToken),
  }
}

/** Read the captured ingress log, parsed by the reader the repository uses. */
function readIngress(config) {
  if (!config.ingressLog || !existsSync(config.ingressLog)) return null
  return readFileSync(config.ingressLog, 'utf8').split('\n').map(parseLine).filter(Boolean)
}

/** The first entry the ingress log has for one request id, or null. */

/** The browser's own record of one request id. */

/** `me` probes at 150 ms across the window, each with its own id. */
async function probeWindow(holder, token, from, to, attemptNo) {
  const ids = []
  const sends = []
  for (let at = from; at <= to; at += PROBE_EVERY_MS) {
    await waitUntil(at)
    const qaId = `probe-${attemptNo}-${String(ids.length).padStart(3, '0')}`
    ids.push(qaId)
    // Sent on schedule and not awaited one by one: a slow answer must not push
    // the next probe back. Answered 2xx before the expiry and 401 after it:
    // that is the bracket, and it is the backend's own answer.
    sends.push(pageFetch(holder, { path: ME, qaId, bearer: token }))
  }
  await Promise.all(sends)
  return ids
}

/** Filler requests on the business route, to push the limiter's excess up. */
// Queued all at once: the profile's own connection limit decides how many are
// in flight, and nothing waits between them (awaited batches leave gaps in
// which the excess drains).
async function fill(holder, token, ids) {
  await Promise.all(ids.map((qaId) => pageFetch(holder, { path: REGIONAL_SETTINGS, qaId, bearer: token })))
}

export default [
  {
    id: 16,
    name: 'A token that expires while the ingress delays the request',
    // Passes only when all of these hold:
    //   calibration   ten unthrottled recoveries measured in this run, from an
    //                 already-expired token, and a recovery deadline computed
    //                 from them: factor x the slowest plus the limiter's maximum
    //                 configured delay, within the maximum the case accepts
    //   preconditions a known-expired token is answered exactly
    //                 "Invalid or expired token"; a current token is answered
    //                 2xx; a trial capture segment starts, stops and finalises
    //                 with a health record and no dropped packet
    //   the crossing   L carried the stored token, was delayed by the limiter,
    //                 was answered 401 with the backend's own expiry message,
    //                 and had expired by the time it reached the backend
    //                 (X, the same token, answered expired, already gone) while
    //                 the same token was still accepted afterwards (P, 2xx)
    //   the recovery   the tab ends with its expected data, with no user action,
    //                 within the recorded deadline
    // A missed window may be retried up to MAX_SETUP_ATTEMPTS times, and only
    // when the behaviour passed; a behavioural failure ends the case at once.
    async run(ctx) {
      const { config, zones } = ctx
      const api = zones.api
      if (!api) throw new Error('api_limit could not be read from nginx/nginx.conf, so its maximum delay is unknown')

      // ---- the deadline this case will judge against ------------------------
      // Recorded before any sample is taken, so the figure cannot be chosen
      // after seeing them.
      ctx.record('calibration', { ...CALIBRATION, formula: 'factor × max(samples) + maxConfiguredDelayMs', maxConfiguredDelayMs: maxConfiguredDelayMs(api) })

      // The same drain the verifier uses, so a sample is never taken from a
      // bucket that the previous one left full.
      const drainMs = Math.max(
        zones.drainWaitSeconds(api.ratePerSecond, api.burst) * 1000,
        zones.drainWaitSeconds(zones.session.ratePerSecond, zones.session.burst) * 1000,
      )

      const profile = await ctx.profile(PROFILE_OPTIONS)
      const holder = await profile.tab('/login', { label: 'holder' })
      await ctx.signIn(holder, config.userC)
      const shell = await shellReference(profile)
      ctx.require('the holder tab received the settings the tabs are judged against', shell.companyAnswered === true && shell.regional !== null, {
        companyAnswered: shell.companyAnswered,
        regional: shell.regional !== null,
      })

      // ---- ten samples, each from an already-expired token -----------------
      const samples = []
      const leads = []
      for (let i = 0; i < CALIBRATION.samples; i += 1) {
        await sleep(drainMs)
        // A token that has already expired: the round starts at the backend's
        // own 401, with no limiter delay in the way, which is what the deadline
        // is meant to bound.
        let session = await storedSession(holder)
        if (session.expiresAtMs > now()) {
          await sleep(session.expiresAtMs - now() + 2000)
          session = await storedSession(holder)
        }
        const tab = await profile.tab('/dashboard', { label: `cal-${i + 1}`, navigate: false })
        const mark = profile.mark()
        const gotoAt = now()
        await tab.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })
        // The lead: from the navigation to the tab's first business request.
        const firstBusiness = await waitForFirstBusiness(profile, mark, gotoAt)
        const leadMs = firstBusiness === null ? FALLBACK_LEAD_MS : firstBusiness - gotoAt
        leads.push(leadMs)
        // The first 401 answered to this tab, on the browser's clock.
        const first401 = await waitForFirstStatus(profile, mark, tab, 401, 30000)
        const recoveryActionsBefore = 0
        const finished = await watchCompletion(profile, mark, [tab], referenceOf(shell), {
          started: gotoAt,
          giveUpMs: Math.max(20000, config.accessSeconds * 1000 + 10000),
        })
        const completed = finished.lastCompletedAfterMs
        const recoveryActions = recoveryActionsFor(profile, mark, tab)
        // A tab that never completed, or that a user action had to rescue, says
        // nothing about the recovery time: the sample is failed, and a failed
        // sample is never dropped to reach ten.
        const failed = first401 === null || completed === null || recoveryActions > recoveryActionsBefore
        samples.push(
          failed
            ? { ms: null, failed: true, why: first401 === null ? 'no 401 was answered to the tab' : completed === null ? 'the tab never completed' : 'a recovery action was needed' }
            : completed - (first401.at - gotoAt),
        )
        ctx.record('calibrationSample', { index: i + 1, leadMs, first401AtMs: first401 === null ? null : first401.at - gotoAt, completedAfterMs: completed, recoveryActions, failed: failed })
        await tab.close()
      }

      const deadline = recoveryDeadline(samples, api)
      ctx.record('recoveryDeadline', deadline)
      const lead = median(leads)
      if (!deadline.accepted) {
        ctx.check('an access token valid when sent had expired when its delayed request reached the backend, and the tab recovered by itself within the recorded deadline', false, {
          verdict: 'inconclusive',
          reason: `the recovery deadline was not established: ${deadline.why}`,
          attempts: [],
        })
        return
      }

      // ---- preconditions ----------------------------------------------------
      // A known-expired token, answered by the backend itself, is what the
      // judgement will compare L's 401 against.
      await sleep(drainMs)
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.not-a-real-token.signature'
      const expiredProbe = await pageFetch(holder, { path: ME, qaId: 'pre-expired', bearer: expiredToken })
      ctx.require(
        `a token known to be unusable is answered 401 with exactly "${EXPIRED_MESSAGE}"`,
        expiredProbe.status === 401 && messageOf(expiredProbe) === EXPIRED_MESSAGE,
        { status: expiredProbe.status, message: messageOf(expiredProbe) },
      )
      // The drain wait above is longer than the QA access lifetime, so the
      // stored token has expired by now: a current one is obtained first.
      const fresh = await renewThroughTheApplication(ctx, profile, holder, 'renew-pre')
      const currentProbe = await pageFetch(holder, { path: ME, qaId: 'pre-current', bearer: fresh.accessToken })
      ctx.require('a current access token is answered 2xx', currentProbe.status >= 200 && currentProbe.status < 300, { status: currentProbe.status })

      // The capture has to work at all before any attempt is trusted with it.
      const trial = await captureSegment(config, 'trial16', async () => {
        await pageFetch(holder, { path: ME, qaId: 'trial-1', bearer: fresh.accessToken })
      })
      const trialUsable = captureUsable(trial, 0, Number.MAX_SAFE_INTEGER)
      ctx.require('a capture segment starts, stops and finalises with a health record and no dropped packet', trialUsable.usable === true, {
        why: trialUsable.why,
        health: trial.health,
        stopError: trial.stopError,
      })
      if (!trialUsable.usable) return

      // ---- the attempts -----------------------------------------------------
      // Two more browser contexts, each with connections of its own.
      const fillProfile = await ctx.profile(SIDE_OPTIONS)
      const fillPage = await fillProfile.tab('/manifest.json', { label: 'fillers' })
      const probeProfile = await ctx.profile(SIDE_OPTIONS)
      const probePage = await probeProfile.tab('/manifest.json', { label: 'probes' })

      const attempts = []
      // How long before the expiry the tab is navigated. Corrected between
      // attempts from what the last one observed (nextNavigateLead).
      let navigateLead = NAVIGATE_LEAD_MS
      const settle = (verdict) => {
        ctx.check(
          'an access token valid when sent had expired when its delayed request reached the backend, and the tab recovered by itself within the recorded deadline',
          verdict.verdict === 'pass',
          { verdict: verdict.verdict, reason: verdict.reason, attempts },
        )
      }
      for (let attemptNo = 1; attemptNo <= MAX_SETUP_ATTEMPTS; attemptNo += 1) {
        // Drained buckets, and a token with a full lifetime ahead of it.
        await sleep(drainMs)
        const session = await renewThroughTheApplication(ctx, profile, holder, `renew-${attemptNo}`)
        const T = session.expiresAtMs
        // Scheduled backwards from the expiry: a token already too close to it
        // cannot start the attempt. That is a missed setup, not a behaviour.
        if (!lifetimeEnough({ expiresAtMs: T, nowMs: now(), leadMs: lead, fillerLeadMs: FILLER_LEAD_MS, marginMs: LIFETIME_MARGIN_MS })) {
          attempts.push({
            attempt: attemptNo,
            verdict: 'inconclusive',
            reason: `the renewed token had ${T - now()} ms left, less than the attempt needs (lead ${lead} ms)`,
            behaviour: 'ok',
            evidence: null,
          })
          ctx.record('attempts', attempts)
          continue
        }
        const segment = `case16-${attemptNo}`
        const startQaId = `${segment}-start`
        const endQaId = `${segment}-end`
        const marks = { app: profile.mark(), fill: fillProfile.mark(), probe: probeProfile.mark() }

        const captured = await captureSegment(config, segment, async () => {
          await pageFetch(holder, { path: '/manifest.json', qaId: startQaId })

          // The probes run on their own schedule, in their own context, from
          // before the fillers start to after the expiry.
          const probes = probeWindow(probePage, session.accessToken, T - PROBE_WINDOW_MS, T + PROBE_WINDOW_MS, attemptNo)

          // The fillers, FILLER_LEAD_MS before the tab is due: a continuous
          // queue, in their own context, so that the limiter's excess is above
          // its delay threshold when the tab's own requests arrive. 429s on
          // them are expected and are not a failure.
          await waitUntil(T - lead - FILLER_LEAD_MS)
          const fillerIds = Array.from({ length: FILLERS }, (_, i) => `fill-${attemptNo}-${String(i).padStart(3, '0')}`)
          const fillerRun = fill(fillPage, session.accessToken, fillerIds)

          // Then the tab itself.
          await waitUntil(T - lead - navigateLead)
          const tab = await profile.tab('/dashboard', { label: `L-${attemptNo}`, navigate: false })
          const mark = profile.mark()
          const gotoAt = now()
          await tab.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })
          const finished = await watchCompletion(profile, mark, [tab], referenceOf(shell), {
            started: gotoAt,
            giveUpMs: deadline.deadlineMs + 30000,
          })
          // The tab's first 401 on a data request, on the browser's clock:
          // recovery is timed from it.
          const first401 = profile
            .since(mark, tab)
            .filter((e) => e.zone === 'business' && e.status === 401)
            .map((e) => e.respondedAt ?? e.issuedAt)
            .sort((x, y) => x - y)[0] ?? null
          await probes
          await fillerRun
          await pageFetch(holder, { path: '/manifest.json', qaId: endQaId })
          await sleep(2500) // the log flushes every second
          return { gotoAt, first401At: first401, completedAfterMs: finished.lastCompletedAfterMs, mark, tab }
        })

        // Whatever happened, the attempt is recorded before anything is decided.
        const measured = captured.result
        const evidence = measured ? await evidenceOf({ ctx, config, captured, measured, session, deadline, marks, profiles: { app: profile, fill: fillProfile, probe: probeProfile }, startQaId, endQaId }) : null
        const verdict = !measured
          ? { verdict: 'inconclusive', reason: `the attempt did not finish: ${captured.failure?.message ?? captured.failure ?? 'no result'}`, behaviour: 'ok' }
          : judgeExpiryCrossing(evidence)
        attempts.push({
          attempt: attemptNo,
          verdict: verdict.verdict,
          reason: verdict.reason,
          behaviour: verdict.behaviour,
          navigateLeadMs: navigateLead,
          evidence: evidence ? summaryOf(evidence, captured, segment) : null,
        })
        if (evidence) {
          navigateLead = nextNavigateLead({
            currentMs: navigateLead,
            lIngressStartMs: evidence.L?.ingress?.startMs ?? null,
            pIngressStartMs: evidence.P?.ingress?.startMs ?? null,
            maxMs: FILLER_LEAD_MS - 800,
          })
        }
        // Every attempt so far, not just this one: finalize.mjs reads the
        // segment of each from here.
        ctx.record('attempts', attempts)
        if (measured?.tab) await measured.tab.close().catch(() => undefined)
        // A pass ends the case. So does a fail: a behavioural failure is never
        // set up again. Only an attempt that behaved and lacked its evidence is.
        if (verdict.verdict !== 'inconclusive') {
          settle(verdict)
          return
        }
      }
      settle({ verdict: 'inconclusive', reason: `no attempt showed the crossing in ${attempts.length} tries` })
    },
  },
]

function messageOf(response) {
  const body = response.json
  if (!body) return null
  if (typeof body.message === 'string') return body.message
  if (Array.isArray(body.message)) return body.message.join('; ')
  return null
}

const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted.length === 0 ? FALLBACK_LEAD_MS : sorted[Math.floor(sorted.length / 2)]
}

/** When the tab's first business request was issued, or null. */
async function waitForFirstBusiness(profile, mark, since, maxMs = 10000) {
  const deadline = now() + maxMs
  while (now() < deadline) {
    const entry = profile.since(mark).find((e) => e.zone === 'business')
    if (entry) return entry.issuedAt
    await sleep(25)
  }
  return null
}

/** The first request to `page` answered with `status`, with its answer's time. */
async function waitForFirstStatus(profile, mark, page, status, maxMs) {
  const deadline = now() + maxMs
  while (now() < deadline) {
    const entry = profile.since(mark, page).find((e) => e.status === status)
    if (entry) return { at: entry.respondedAt ?? entry.issuedAt, entry }
    await sleep(25)
  }
  return null
}

/** How many times a tab had to be navigated to become usable, as the suite counts it. */
function recoveryActionsFor(profile, mark, page) {
  // The usability module counts a recovery as a navigation through the sidebar.
  // A tab that loaded on its own has none, and this reads the same thing: a
  // request for the dashboard that was not the first one from this tab.
  const mine = profile.since(mark, page).filter((e) => e.zone === 'business' && e.path === '/api/dashboard/stats')
  return Math.max(0, mine.length - 1)
}

/** The harness records of one context since a mark, in the shape the evidence code reads, with every 401's message read. */
async function recordsOf(profile, mark, page = undefined) {
  const entries = profile.since(mark, page).filter((e) => e.qaId)
  await Promise.all(entries.map((e) => e.messageRead).filter(Boolean))
  return entries.map((e) => ({
    qaId: e.qaId,
    method: e.method,
    path: e.path,
    zone: e.zone,
    status: e.status ?? null,
    token: e.token ?? null,
    message: e.message ?? null,
    issuedAt: e.issuedAt,
    respondedAt: e.respondedAt ?? null,
  }))
}

/** Everything the attempt observed, handed to lib/expiry-evidence.mjs. */
async function evidenceOf({ ctx, config, captured, measured, session, deadline, marks, profiles, startQaId, endQaId }) {
  const ingressEntries = readIngress(config)
  const window = ingressEntries === null ? null : windowBetween(ingressEntries, startQaId, endQaId)
  const app = await recordsOf(profiles.app, marks.app)
  return buildExpiryEvidence({
    app,
    probes: await recordsOf(profiles.probe, marks.probe),
    fillers: await recordsOf(profiles.fill, marks.fill),
    ingress: window === null ? null : window.entries,
    capture: captured,
    storedFingerprint: session.fingerprint,
    deadline,
    api: ctx.zones.api,
    completion: { gotoAt: measured.gotoAt, first401At: measured.first401At, completedAfterMs: measured.completedAfterMs, recoveryActions: 0 },
    sessionRoute429: app.filter((e) => e.zone === 'session' && e.status === 429).length,
    probePlan: { everyMs: PROBE_EVERY_MS, windowMs: 2 * PROBE_WINDOW_MS },
  })
}

/** What is kept of an attempt's evidence in the results: enough to read the verdict from. */
function summaryOf(evidence, captured, segment) {
  const short = (e) => (e ? { qaId: e.qaId, path: e.path, status: e.status, message: e.message, limitReq: e.ingress?.limitReq ?? null, ingressStartMs: e.ingress?.startMs ?? null, arrivedFirstMs: e.capture?.arrivedFirstMs ?? null, answeredLastMs: e.capture?.answeredLastMs ?? null } : null)
  return {
    segment,
    behaviour: evidence.behaviour,
    pipeline: { ...evidence.pipeline, unexplained: evidence.pipeline.unexplained.slice(0, 10) },
    candidates: evidence.candidates,
    health: captured.health,
    stopError: captured.stopError,
    L: short(evidence.L),
    X: short(evidence.X),
    P: short(evidence.P),
  }
}
