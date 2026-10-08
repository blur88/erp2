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
import { loadCapture, captureUsable, correlate } from '../lib/capture-evidence.mjs'
import { windowBetween } from '../lib/ingress-log.mjs'
import { watchCompletion } from '../lib/completion.mjs'
import { KEEP_SHELL_ANSWERS, REGIONAL_SETTINGS, shellReference } from '../lib/usable.mjs'
import { CALIBRATION, EXPIRED_MESSAGE, MAX_SETUP_ATTEMPTS, monotonic, recoveryDeadline, judgeExpiryCrossing, maxConfiguredDelayMs } from '../lib/expiry-crossing.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = new URL('../../../..', import.meta.url)

// How the case's profile is opened. Every API request carries an identifier
// (tagRequests, which needs intercept), and the answers to the two settings
// routes are kept: the case's first precondition compares the holder tab's
// shell against what the server said, and without keepAnswers there is nothing
// to compare with (the recorded run on 198943047 stopped there).
export const PROFILE_OPTIONS = { intercept: true, tagRequests: true, keepAnswers: KEEP_SHELL_ANSWERS }
const { parseLine } = await import(pathToFileURL(join(REPO_ROOT.pathname, 'nginx/access-log.mjs')).href)

/** /api/auth/me is on session_limit, which does not delay: a probe, not filler. */
const ME = '/api/auth/me'
const FILLERS = 30
const FILLERS_IN_FLIGHT = 6
const PROBE_EVERY_MS = 150
const PROBE_WINDOW_MS = 1200
/** How long before the token expires the fillers start, and the tab navigates. */
const FILLER_LEAD_MS = 1200
const NAVIGATE_LEAD_MS = 300
/** The first business request of a tab arrives this long after its goto (median). */
const FALLBACK_LEAD_MS = 250

const now = () => Date.now()
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
const lineFor = (entries, qaId) => (entries ?? []).find((e) => e.qaId === qaId) ?? null

/** The browser's own record of one request id. */
const entryFor = (profile, qaId) => profile.log.find((e) => e.qaId === qaId) ?? null

/** `me` probes at 150 ms across the window, each with its own id. */
async function probeWindow(holder, token, from, to) {
  const ids = []
  for (let at = from; at <= to; at += PROBE_EVERY_MS) {
    await waitUntil(at)
    const qaId = `probe-${String(ids.length).padStart(3, '0')}`
    ids.push(qaId)
    // Answered 401 near the expiry and 2xx after it: that is the bracket, and it
    // is the backend's own answer rather than a clock read here.
    await pageFetch(holder, { path: ME, qaId, bearer: token })
  }
  return ids
}

/** Filler requests on the business route, to push the limiter's excess up. */
async function fill(holder, token, ids) {
  for (let i = 0; i < ids.length; i += FILLERS_IN_FLIGHT) {
    const batch = ids.slice(i, i + FILLERS_IN_FLIGHT)
    await Promise.all(batch.map((qaId) => pageFetch(holder, { path: REGIONAL_SETTINGS, qaId, bearer: token })))
  }
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
        const finished = await watchCompletion(profile, mark, [tab], shell.reference, {
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
      const fresh = await storedSession(holder)
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
      const attempts = []
      for (let attemptNo = 1; attemptNo <= MAX_SETUP_ATTEMPTS; attemptNo += 1) {
        // Drained buckets, and a token with a full lifetime ahead of it.
        await sleep(drainMs)
        let session = await storedSession(holder)
        if (session.expiresAtMs - now() < deadline.deadlineMs + 5000) {
          await pageFetch(holder, { method: 'POST', path: '/api/auth/refresh', qaId: `renew-${attemptNo}`, body: { refreshToken: session.refreshToken } })
          session = await storedSession(holder)
        }
        const T = session.expiresAtMs
        const segment = `case16-${attemptNo}`
        const startQaId = `${segment}-start`
        const endQaId = `${segment}-end`

        const captured = await captureSegment(config, segment, async () => {
          await pageFetch(holder, { path: '/manifest.json', qaId: startQaId })

          // Fillers first: thirty business requests, six at a time, so that the
          // limiter's excess is above its delay allowance when the tab's own
          // requests arrive. 429s on these are expected and are not a failure.
          const previousAllow429 = ctx.allow429
          ctx.allow429 = true
          const fillerIds = Array.from({ length: FILLERS }, (_, i) => `fill-${String(i).padStart(2, '0')}`)
          const fillerRun = fill(holder, session.accessToken, fillerIds)
          await waitUntil(T - lead - FILLER_LEAD_MS)
          await fillerRun
          ctx.allow429 = previousAllow429

          // Then the tab itself, and the probes that bracket the expiry.
          await waitUntil(T - lead - NAVIGATE_LEAD_MS)
          const tab = await profile.tab('/dashboard', { label: `L-${attemptNo}`, navigate: false })
          const gotoAt = now()
          await tab.goto(`${config.base}/dashboard`, { waitUntil: 'commit' })
          const mark = profile.mark()
          const probes = probeWindow(holder, session.accessToken, T - PROBE_WINDOW_MS, T + PROBE_WINDOW_MS)
          const finished = await watchCompletion(profile, mark, [tab], shell.reference, {
            started: gotoAt,
            giveUpMs: deadline.deadlineMs + 30000,
          })
          await probes
          await pageFetch(holder, { path: '/manifest.json', qaId: endQaId })
          await sleep(2500) // the log flushes every second
          return { finished, gotoAt, mark, tab, probes }
        })

        const inside = captured.failure ?? null
        // Whatever happened, the attempt is recorded before anything is decided.
        const evidence = buildEvidence({ ctx, config, profile, captured, session, deadline, segment, startQaId, endQaId, inside })
        const verdict = inside
          ? { verdict: 'inconclusive', reason: `the attempt did not finish: ${inside.message ?? inside}`, behaviour: 'ok' }
          : judgeExpiryCrossing(evidence)
        attempts.push({ attempt: attemptNo, verdict: verdict.verdict, reason: verdict.reason, behaviour: verdict.behaviour, evidence: evidence.summary })
        // Every attempt so far, not just this one: finalize.mjs reads the
        // segment of each from here.
        ctx.record('attempts', attempts)
        if (verdict.verdict !== 'inconclusive') {
          ctx.check(
            'an access token valid when sent had expired when its delayed request reached the backend, and the tab recovered by itself within the recorded deadline',
            verdict.verdict === 'pass',
            { verdict: verdict.verdict, reason: verdict.reason, attempts },
          )
          return
        }
      }
      ctx.check('an access token valid when sent had expired when its delayed request reached the backend, and the tab recovered by itself within the recorded deadline', false, {
        verdict: 'inconclusive',
        reason: `no attempt showed the crossing in ${attempts.length} tries`,
        attempts,
      })
    },
  },
]

/** The backend's message from a refused response, as the body carries it. */
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

/**
 * The evidence one attempt rests on, from the three sources: the browser's own
 * log, the ingress log, and the capture. Anything any of them cannot supply is
 * null here, and a null is what makes the judgement inconclusive.
 */
function buildEvidence({ ctx, config, profile, captured, session, deadline, segment, startQaId, endQaId, inside }) {
  const ingressEntries = readIngress(config)
  const window = ingressEntries === null ? null : windowBetween(ingressEntries, startQaId, endQaId)
  const capture = captured.health ? captured : loadCapture([])

  // The application tab's own request, and the two probes.
  const appEntries = profile.log.filter((e) => e.qaId && String(e.qaId).startsWith('app-'))
  const Lentry = appEntries.find((e) => String(e.path) === '/api/dashboard/stats') ?? null
  const probes = profile.log.filter((e) => e.qaId && String(e.qaId).startsWith('probe-'))
  const Xentry = probes.filter((e) => e.status === 401).at(-1) ?? null
  const Pentry = probes.filter((e) => e.status >= 200 && e.status < 300).at(-1) ?? null

  const { matched, problems } = correlate(appEntries, window ? window.entries : [], capture)
  const from = window ? window.entries[0]?.startMs ?? 0 : 0
  const to = window ? window.entries.at(-1)?.startMs ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
  const usable = captureUsable(capture, from, to)
  const clockFrames = [...capture.requests.values()].flatMap((r) => r.frames ?? []).map((n) => n)
  const clock = monotonic(clockFrames, window ? window.entries : [])

  const one = (qaId) => {
    if (!qaId) return null
    const browser = entryFor(profile, qaId)
    const ingress = lineFor(ingressEntries, qaId)
    const capturedRecord = capture.requests.get(qaId) ?? null
    return {
      qaId,
      status: browser ? browser.status : null,
      message: messageOf(browser ?? {}),
      browserTokenFingerprint: browser ? browser.token : null,
      capture: capturedRecord,
      ingress,
    }
  }

  const L = Lentry ? one(Lentry.qaId) : null
  const X = Xentry ? one(Xentry.qaId) : null
  const P = Pentry ? one(Pentry.qaId) : null
  const earlierAccepted = !!P && P.status >= 200 && P.status < 300

  const evidence = {
    api: ctx.zones.api,
    deadline,
    behaviour: {
      // The tab completed inside the deadline and no user action was needed. The
      // measurement is the harness's, and a tab that never completed is a
      // failure of behaviour rather than missing evidence.
      completeWithinDeadline: inside ? false : (inside?.finished?.lastCompletedAfterMs ?? null) !== null,
      tabComplete: inside ? false : (inside?.finished?.lastCompletedAfterMs ?? null) !== null,
      recoveryActions: 0,
      sessionRoute429: 0,
    },
    pipeline: {
      ingressAvailable: ingressEntries !== null,
      captureFinalised: capture.health !== null,
      captureUsable: usable.usable,
      correlateProblems: problems,
      monotonic: clock,
    },
    stored: { accessTokenFingerprint: session.fingerprint },
    L: L
      ? {
          qaId: L.qaId,
          status: L.status,
          message: L.message,
          limitReq: L.ingress ? L.ingress.limitReq : null,
          browserTokenFingerprint: L.browserTokenFingerprint,
          capture: L.capture,
          ingress: L.ingress ? { startMs: L.ingress.startMs, status: L.ingress.status, limitReq: L.ingress.limitReq } : null,
          earlierAcceptedSameToken: earlierAccepted,
        }
      : null,
    X: X ? { ...X } : null,
    P: P ? { ...P } : null,
  }
  if (inside?.finished) {
    evidence.behaviour.recoveryActions = inside.recoveryActions ?? 0
  }
  evidence.summary = {
    segment,
    matched: matched.length,
    problems: problems.length,
    usable: usable.usable,
    usableWhy: usable.why,
    health: capture.health,
    L: L ? { qaId: L.qaId, status: L.status, limitReq: L.ingress?.limitReq ?? null } : null,
    X: X ? { qaId: X.qaId, status: X.status, message: X.message } : null,
    P: P ? { qaId: P.qaId, status: P.status } : null,
  }
  return evidence
}
