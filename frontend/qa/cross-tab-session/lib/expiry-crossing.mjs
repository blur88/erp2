// The inference case 16 makes, as pure functions.
//
// One request `L` of the application tab is claimed to have carried an access
// token that was still valid when the browser sent it, was delayed by the
// limiter, and had expired by the time it reached the backend. Three pieces of
// evidence, and each ordering is taken within one clock:
//
//   valid at send          a request `P` with the same token fingerprint was
//                          answered 2xx and reached the ingress after `L` did.
//                          Two causal steps, no clock comparison: `L` left the
//                          browser before the ingress read its first bytes, and
//                          the backend judged `P` valid after the ingress read
//                          `P`'s.
//   expired at arrival     a request `X` with the same fingerprint was answered
//                          `Invalid or expired token`, and its response had
//                          completely left the backend before the first byte of
//                          `L` arrived.
//   delayed in between     `L`'s ingress line reads lreq=DELAYED.
//
// The expiry instant is never read from a clock: it is bracketed by the
// backend's own answers, which is why both `X` and `P` must exist. Nothing here
// compares two clocks or measures an offset between them.
//
// What this cannot show, and does not claim: that no clock stepped during the
// attempt. `monotonic` can reveal a clock that moved backwards and nothing
// more; the absence of a clock discontinuity is a stated prerequisite of the
// controlled run, recorded with the attempt.

export const CALIBRATION = { samples: 10, factor: 2, maxDeadlineMs: 10000 }
export const MAX_SETUP_ATTEMPTS = 5
// Ingress: $msec and $request_time are both written to the millisecond, so a
// derived start time is out by up to 1 ms and a difference of two by up to 2 ms.
// The margin is larger than that and is not a bound on clock error.
export const INGRESS_MARGIN_MS = 5
// Capture: frame timestamps come from the kernel at microsecond resolution or
// better. This margin guards granularity only.
export const CAPTURE_MARGIN_MS = 1
// The exact string the backend answers an expired or unverifiable access token
// with. Any other rejection (revoked session, missing user, locked account) has
// its own message, and a 401 alone is not evidence of an expiry.
export const EXPIRED_MESSAGE = 'Invalid or expired token'

/** (burst - delay) / rate, in milliseconds: the most the limiter can hold a request. */
export function maxConfiguredDelayMs(api) {
  for (const key of ['burst', 'delay', 'ratePerSecond']) {
    if (typeof api?.[key] !== 'number' || !Number.isFinite(api[key])) {
      throw new Error(`the api_limit read from nginx.conf has no ${key}: the longest configured hold cannot be derived`)
    }
  }
  return (1000 * (api.burst - api.delay)) / api.ratePerSecond
}

/**
 * How long before the expiry the tab is navigated in the next attempt, from
 * what the last one observed. When the tab's request reached the ingress after
 * the last probe the backend still accepted, the tab was sent too late to show
 * the token was valid when the request left; the next attempt sends it earlier
 * by that much and a margin. A setup correction, bounded by the attempts and by
 * `maxMs`. It changes nothing about what counts as evidence.
 */
export function nextNavigateLead({ currentMs, lIngressStartMs, pIngressStartMs, maxMs }) {
  if (typeof lIngressStartMs !== 'number' || typeof pIngressStartMs !== 'number') return currentMs
  const late = lIngressStartMs - pIngressStartMs
  if (late <= 0) return currentMs
  return Math.min(maxMs, currentMs + late + 150)
}

/** How much of a token's lifetime an attempt needs ahead of it when it starts. */
export const lifetimeNeededMs = ({ leadMs, fillerLeadMs, marginMs }) => leadMs + fillerLeadMs + marginMs

/** Whether a token expiring at `expiresAtMs` can still start an attempt at `nowMs`. */
export function lifetimeEnough({ expiresAtMs, nowMs, leadMs, fillerLeadMs, marginMs }) {
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs)) return false
  return expiresAtMs - nowMs >= lifetimeNeededMs({ leadMs, fillerLeadMs, marginMs })
}

/**
 * The recovery deadline, from the unthrottled refresh-and-resend times measured
 * in the same run.
 *
 * A sample that is not a number, or that is marked failed, is not dropped to
 * reach the count: the calibration then says what is wrong with it, and the case
 * does not run. The deadline is not clamped either - a figure above the maximum
 * means the run is slower than the case is willing to call recovery.
 */
export function recoveryDeadline(samplesMs, api) {
  const wanted = CALIBRATION.samples
  const formula = `factor × max(samples) + maxConfiguredDelayMs (${CALIBRATION.factor} × max + ${maxConfiguredDelayMs(api)} ms)`
  if (!Array.isArray(samplesMs) || samplesMs.length !== wanted) {
    const got = Array.isArray(samplesMs) ? samplesMs.length : 0
    return { deadlineMs: null, formula, samples: got, accepted: false, why: `${got} sample(s), ${wanted} are needed` }
  }
  const bad = []
  let max = 0
  samplesMs.forEach((sample, i) => {
    const ms = typeof sample === 'object' && sample !== null ? sample.ms : sample
    if (sample && typeof sample === 'object' && sample.failed) {
      bad.push(`sample ${i + 1} was a failed sample`)
      return
    }
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
      bad.push(`sample ${i + 1} is ${String(ms)}`)
      return
    }
    max = Math.max(max, ms)
  })
  if (bad.length > 0) {
    return { deadlineMs: null, formula, samples: wanted, accepted: false, why: `${bad.length} unusable sample(s): ${bad.join('; ')}` }
  }
  const deadlineMs = CALIBRATION.factor * max + maxConfiguredDelayMs(api)
  if (deadlineMs > CALIBRATION.maxDeadlineMs) {
    return {
      deadlineMs,
      formula,
      samples: wanted,
      accepted: false,
      why: `the computed deadline ${deadlineMs} ms is beyond the maximum ${CALIBRATION.maxDeadlineMs} ms`,
    }
  }
  return { deadlineMs, formula, samples: wanted, accepted: true, why: null }
}

/**
 * Whether the clocks moved backwards inside the attempt.
 *
 * Capture frame times must not decrease in frame order, and ingress end times
 * must not decrease in log order by more than the log's own interleaving, which
 * writes lines as requests complete. This can reveal a clock that moved
 * backwards; it cannot show that no clock stepped: a forward step, or a backward
 * one smaller than the gaps between records, passes it.
 */
export function monotonic(captureFrames, ingressEntries) {
  for (let i = 1; i < captureFrames.length; i += 1) {
    if (captureFrames[i] < captureFrames[i - 1]) {
      return { ok: false, why: `capture frame ${i + 1} is earlier than the frame before it: the clock moved backwards` }
    }
  }
  // Lines are written as requests complete, so concurrent requests may appear in
  // either order; a step back larger than the window between two lines is not
  // interleaving.
  const ends = (ingressEntries ?? []).map((e) => e.endMs).filter((t) => typeof t === 'number')
  const spread = ends.length > 1 ? Math.max(...ends) - Math.min(...ends) : 0
  for (let i = 1; i < ends.length; i += 1) {
    if (ends[i] < ends[i - 1] - spread) {
      return { ok: false, why: `ingress line ${i + 1} ended before the line before it by more than the run's own spread: the clock moved backwards` }
    }
  }
  return { ok: true, why: null }
}

const behaviourFailure = (evidence) => {
  const b = evidence.behaviour ?? {}
  if (b.completeWithinDeadline === false) return 'the tab completed after the recovery deadline'
  if (b.tabComplete === false) return 'the tab never completed'
  if ((b.recoveryActions ?? 0) > 0) return `${b.recoveryActions} in-app recovery action(s) were needed`
  if ((b.sessionRoute429 ?? 0) > 0) return `${b.sessionRoute429} request(s) to refresh, logout or me were answered 429`
  return null
}

const sameFingerprint = (a, b) => typeof a === 'string' && a === b

/**
 * @returns {{ verdict: 'pass' | 'fail' | 'inconclusive', reason: string,
 *   behaviour: 'ok' | 'failed' }}
 *
 * Precedence, and it is not negotiable: a behavioural failure is a fail however
 * little evidence there is, because the tab did not recover by itself whatever
 * the timings say. Complete evidence never rescues it, and a good outcome never
 * rescues missing evidence.
 */
export function judgeExpiryCrossing(evidence) {
  const failed = behaviourFailure(evidence)
  if (failed !== null) return { verdict: 'fail', reason: failed, behaviour: 'failed' }

  // The pipeline, first: without it there is no evidence to judge at all.
  const pipeline = evidence.pipeline ?? {}
  if (pipeline.ingressAvailable === false) {
    return { verdict: 'inconclusive', reason: 'the ingress log is not available, so no request can be placed on its clock', behaviour: 'ok' }
  }
  if (pipeline.captureFinalised === false) {
    return { verdict: 'inconclusive', reason: 'the capture segment was not finalised: it has no health record, so it cannot be judged', behaviour: 'ok' }
  }
  if (pipeline.captureUsable === false) {
    return { verdict: 'inconclusive', reason: 'the capture is not usable for this window (captureUsable said so)', behaviour: 'ok' }
  }
  const problems = pipeline.correlateProblems ?? []
  for (const id of ['L', 'P', 'X']) {
    const hit = problems.find((p) => p.qaId === evidence[id]?.qaId)
    if (hit) {
      return {
        verdict: 'inconclusive',
        reason: `correlate could not match ${id} (${hit.qaId}) across the three sources: missing from ${(hit.missingFrom ?? []).join(', ') || 'none'}, duplicated in ${(hit.duplicateIn ?? []).join(', ') || 'none'}`,
        behaviour: 'ok',
      }
    }
  }
  // Checks over everything the attempt sent, not only the three requests the
  // proof names: correlating fewer requests must not hide missing evidence.
  if ((pipeline.unexplained ?? []).length > 0) {
    return { verdict: 'inconclusive', reason: `${pipeline.unexplained.length} unexplained request(s) reached the backend that no browser context of the attempt sent (${pipeline.unexplained.slice(0, 3).join('; ')})`, behaviour: 'ok' }
  }
  if ((pipeline.missingFromCapture ?? 0) > 0) {
    return { verdict: 'inconclusive', reason: `${pipeline.missingFromCapture} request(s) the ingress forwarded are not in the capture`, behaviour: 'ok' }
  }
  if (pipeline.sameBucket?.ok === false) {
    return { verdict: 'inconclusive', reason: pipeline.sameBucket.why, behaviour: 'ok' }
  }
  if (pipeline.probesOnSchedule?.ok === false) {
    return { verdict: 'inconclusive', reason: `the probes did not run on schedule: ${pipeline.probesOnSchedule.why}`, behaviour: 'ok' }
  }
  if (pipeline.monotonic?.ok === false) {
    return { verdict: 'inconclusive', reason: `the clocks moved backwards: ${pipeline.monotonic.why}`, behaviour: 'ok' }
  }
  if (evidence.deadline?.accepted !== true) {
    return { verdict: 'inconclusive', reason: `the recovery deadline was not established: ${evidence.deadline?.why ?? 'no calibration'}`, behaviour: 'ok' }
  }

  // The three fingerprints of the same token: the browser's record of the stored
  // token, the browser's record of the request, and the capture's.
  const stored = evidence.stored?.accessTokenFingerprint ?? null
  const L = evidence.L
  if (!L) return { verdict: 'inconclusive', reason: 'no request L was recorded for this attempt', behaviour: 'ok' }
  if (L.limitReq !== 'DELAYED') {
    return { verdict: 'inconclusive', reason: `L was not delayed by the limiter (its ingress line reads ${L.limitReq ?? 'nothing'})`, behaviour: 'ok' }
  }
  if (L.status !== 401) {
    return { verdict: 'inconclusive', reason: `L was answered ${L.status}, not 401`, behaviour: 'ok' }
  }
  // Status alone is not an expiry: the message must be the one the guard gives
  // for a token it will not accept, not one of the strategy's own rejections.
  if (L.message !== EXPIRED_MESSAGE) {
    return { verdict: 'inconclusive', reason: `L was answered "${L.message}", which is not "${EXPIRED_MESSAGE}": the 401 is not shown to be an expiry`, behaviour: 'ok' }
  }
  if (L.browserTokenFingerprint !== stored) {
    return { verdict: 'inconclusive', reason: "L's token is not the stored access token's fingerprint", behaviour: 'ok' }
  }
  if (!L.capture) return { verdict: 'inconclusive', reason: 'L is not in the capture: its arrival at the backend was not measured', behaviour: 'ok' }
  if (L.capture.tokenFingerprint !== stored) {
    return { verdict: 'inconclusive', reason: "the capture's fingerprint for L is not the stored token's", behaviour: 'ok' }
  }
  if (!L.ingress) return { verdict: 'inconclusive', reason: 'L is not in the ingress log: its send was not measured', behaviour: 'ok' }
  if (L.earlierAcceptedSameToken !== true) {
    return {
      verdict: 'inconclusive',
      reason: 'the backend had not accepted this token with a 2xx earlier in the attempt, so its rejection is not shown to be an expiry rather than a bad token',
      behaviour: 'ok',
    }
  }

  // X: the same token, judged expired, with its answer already gone before L
  // arrived. The conservative ends are X's last response frame and L's first
  // request frame.
  const X = evidence.X
  if (!X) return { verdict: 'inconclusive', reason: 'no request X was recorded: the token was not shown to be expired before L arrived', behaviour: 'ok' }
  if (X.status !== 401) return { verdict: 'inconclusive', reason: `X was answered ${X.status}, not 401`, behaviour: 'ok' }
  if (X.message !== EXPIRED_MESSAGE) {
    return { verdict: 'inconclusive', reason: `X was answered "${X.message}", which is not "${EXPIRED_MESSAGE}": the 401 is not shown to be an expiry`, behaviour: 'ok' }
  }
  if (X.browserTokenFingerprint !== stored) {
    return { verdict: 'inconclusive', reason: "X carries another token, so its answer says nothing about L's", behaviour: 'ok' }
  }
  if (!X.capture) return { verdict: 'inconclusive', reason: 'X is not in the capture', behaviour: 'ok' }
  if (X.capture.tokenFingerprint !== stored) {
    return { verdict: 'inconclusive', reason: "the capture's fingerprint for X is not the stored token's", behaviour: 'ok' }
  }
  if (typeof X.capture.answeredLastMs !== 'number') {
    return { verdict: 'inconclusive', reason: "X's response leaving the backend was not measured", behaviour: 'ok' }
  }
  const XBefore = X.capture.answeredLastMs + CAPTURE_MARGIN_MS
  if (XBefore > L.capture.arrivedFirstMs) {
    return {
      verdict: 'inconclusive',
      reason: `X's response had not completely left the backend (${X.capture.answeredLastMs} ms) when L's first byte arrived (${L.capture.arrivedFirstMs} ms)`,
      behaviour: 'ok',
    }
  }

  // P: the same token, judged valid, sent after L reached the ingress.
  const P = evidence.P
  if (!P) return { verdict: 'inconclusive', reason: 'no request P was recorded: the token was not shown to be valid after L was sent', behaviour: 'ok' }
  if (P.status !== 200) return { verdict: 'inconclusive', reason: `P was answered ${P.status}, not 2xx`, behaviour: 'ok' }
  if (P.browserTokenFingerprint !== stored) {
    return { verdict: 'inconclusive', reason: 'P carries another token, so its 2xx says nothing about L\'s', behaviour: 'ok' }
  }
  if (!P.ingress) return { verdict: 'inconclusive', reason: 'P is not in the ingress log', behaviour: 'ok' }
  if (L.ingress.startMs + INGRESS_MARGIN_MS > P.ingress.startMs) {
    return {
      verdict: 'inconclusive',
      reason: `P reached the ingress (${P.ingress.startMs} ms) too soon after L did (${L.ingress.startMs} ms) to show the token was still valid when L was sent`,
      behaviour: 'ok',
    }
  }

  return {
    verdict: 'pass',
    reason:
      `L carried the stored token (${stored}), was delayed by the limiter, was answered 401 at ` +
      `${Math.round(L.ingress.startMs)}..${Math.round(L.capture.arrivedLastMs)} ms (ingress and capture clocks), and the backend had ` +
      `already judged that token expired (X, ${X.capture.answeredLastMs} ms) and still judged it valid afterwards (P, ${Math.round(P.ingress.startMs)} ms)`,
    behaviour: 'ok',
  }
}
