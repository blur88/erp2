// The inference of case 16, as pure functions (lib/expiry-crossing.mjs): the
// calibration arithmetic, the clock checks, and the judgement of whether an
// access token was valid when its request was sent and expired when that
// request reached the backend.
//
//   node --test frontend/qa/cross-tab-session/expiry-crossing.test.mjs
//
// Nothing here reads a clock or a file. What the case claims is worth exactly
// what these functions can decide, and every "cannot tell" below is a real
// outcome that fails the run rather than a pass with a footnote.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CALIBRATION,
  CAPTURE_MARGIN_MS,
  EXPIRED_MESSAGE,
  INGRESS_MARGIN_MS,
  MAX_SETUP_ATTEMPTS,
  maxConfiguredDelayMs,
  recoveryDeadline,
  monotonic,
  judgeExpiryCrossing,
} from './lib/expiry-crossing.mjs'

const api = { ratePerSecond: 20, burst: 40, delay: 20 }

test('the constants are the ones the plan fixes', () => {
  assert.deepEqual(CALIBRATION, { samples: 10, factor: 2, maxDeadlineMs: 10000 })
  assert.equal(MAX_SETUP_ATTEMPTS, 5)
  assert.equal(INGRESS_MARGIN_MS, 5)
  assert.equal(CAPTURE_MARGIN_MS, 1)
  assert.equal(EXPIRED_MESSAGE, 'Invalid or expired token')
})

test('the maximum configured delay is (burst - delay) / rate, in milliseconds', () => {
  assert.equal(maxConfiguredDelayMs(api), 1000)
  assert.equal(maxConfiguredDelayMs({ ratePerSecond: 20, burst: 40, delay: 0 }), 2000)
})

test('ten good samples of at most 800 ms give 2600 ms', () => {
  const deadline = recoveryDeadline(new Array(10).fill(800), api)
  assert.equal(deadline.deadlineMs, 2600)
  assert.equal(deadline.accepted, true)
  assert.equal(deadline.samples, 10)
  assert.match(deadline.formula, /factor/)
})

test('nine samples are refused, and the count is named', () => {
  const deadline = recoveryDeadline(new Array(9).fill(800), api)
  assert.equal(deadline.accepted, false)
  assert.match(deadline.why, /9/)
})

test('a bad sample is never dropped to reach ten', () => {
  for (const bad of [null, NaN, Infinity, -1, { ms: 800, failed: true }]) {
    // Ten samples, one of them bad: the count is right and the sample is not.
    const samples = new Array(10).fill(800)
    samples[4] = bad
    const deadline = recoveryDeadline(samples, api)
    assert.equal(deadline.accepted, false, `sample ${JSON.stringify(bad)} was accepted`)
    assert.match(deadline.why, /5|bad|failed|null|NaN|Infinity|-1/)
  }
})

test('a deadline beyond the maximum is refused, not clamped', () => {
  const deadline = recoveryDeadline(new Array(10).fill(5000), api)
  assert.equal(deadline.deadlineMs, 11000)
  assert.equal(deadline.accepted, false)
  assert.match(deadline.why, /10000|11\d\d\d/)
})

test('monotonic times are ok; a frame earlier than its predecessor is not', () => {
  assert.deepEqual(monotonic([1, 2, 3], [10, 11, 12]).ok, true)
  const back = monotonic([3, 2, 1], [10, 11, 12])
  assert.equal(back.ok, false)
  assert.match(back.why, /frame|backward/i)
})

test('monotonic says what it cannot show', () => {
  // A clock that jumped forward leaves no trace here.
  assert.equal(monotonic([1, 1000, 1001], [10, 11, 12]).ok, true)
})

// --- the judgement ---------------------------------------------------------

const captureRecord = (over = {}) => ({
  qaId: 'L-1',
  tokenFingerprint: 'aaaaaaaaaaaa',
  arrivedFirstMs: 5_000.0,
  arrivedLastMs: 5_000.4,
  status: 401,
  ...over,
})

/** Evidence of one attempt that passes, with the pieces named so each can be broken. */
const passing = (over = {}) => ({
  api,
  deadline: { deadlineMs: 2600, accepted: true, why: null, samples: 10 },
  behaviour: { completeWithinDeadline: true, recoveryActions: 0, tabComplete: true, sessionRoute429: 0 },
  pipeline: {
    ingressAvailable: true,
    captureUsable: true,
    captureFinalised: true,
    correlateProblems: [],
    monotonic: { ok: true, why: null },
  },
  stored: { accessTokenFingerprint: 'aaaaaaaaaaaa' },
  L: {
    qaId: 'L-1',
    limitReq: 'DELAYED',
    status: 401,
    message: EXPIRED_MESSAGE,
    browserTokenFingerprint: 'aaaaaaaaaaaa',
    capture: captureRecord(),
    ingress: { startMs: 4_000, status: 401, limitReq: 'DELAYED' },
    earlierAcceptedSameToken: true,
  },
  X: {
    qaId: 'X-1',
    status: 401,
    message: EXPIRED_MESSAGE,
    browserTokenFingerprint: 'aaaaaaaaaaaa',
    capture: captureRecord({ qaId: 'X-1', arrivedFirstMs: 4_000.0, arrivedLastMs: 4_000.2, answeredFirstMs: 4_500.0, answeredLastMs: 4_500.2 }),
  },
  P: {
    qaId: 'P-1',
    status: 200,
    browserTokenFingerprint: 'aaaaaaaaaaaa',
    ingress: { startMs: 4_020, status: 200 },
  },
  ...over,
})

test('the baseline evidence passes, with the behaviour ok', () => {
  const verdict = judgeExpiryCrossing(passing())
  assert.equal(verdict.verdict, 'pass')
  assert.equal(verdict.behaviour, 'ok')
})

test('a behavioural failure is a fail even with the evidence complete', () => {
  for (const [patch, expected] of [
    [{ behaviour: { completeWithinDeadline: false, recoveryActions: 0, tabComplete: true, sessionRoute429: 0 } }, 'fail'],
    [{ behaviour: { completeWithinDeadline: true, recoveryActions: 1, tabComplete: true, sessionRoute429: 0 } }, 'fail'],
    [{ behaviour: { completeWithinDeadline: true, recoveryActions: 0, tabComplete: false, sessionRoute429: 0 } }, 'fail'],
    [{ behaviour: { completeWithinDeadline: true, recoveryActions: 0, tabComplete: true, sessionRoute429: 1 } }, 'fail'],
  ]) {
    const verdict = judgeExpiryCrossing(passing(patch))
    assert.equal(verdict.verdict, expected)
    assert.equal(verdict.behaviour, 'failed')
  }
})

test('evidence about L that is missing or weak is inconclusive, not a fail', () => {
  const cases = [
    [{ L: null }, /L/],
    [{ L: { ...passing().L, limitReq: 'PASSED' } }, /L/],
    [{ L: { ...passing().L, status: 200 } }, /L/],
    [{ L: { ...passing().L, browserTokenFingerprint: 'bbbbbbbbbbbb' } }, /fingerprint|token/i],
    [{ L: { ...passing().L, capture: captureRecord({ tokenFingerprint: 'cccccccccccc' }) } }, /fingerprint|token/i],
    [{ L: { ...passing().L, earlierAcceptedSameToken: false } }, /2xx|accepted/i],
    [{ L: { ...passing().L, capture: null } }, /capture/i],
    [{ L: { ...passing().L, ingress: null } }, /ingress/i],
  ]
  for (const [patch, reason] of cases) {
    const verdict = judgeExpiryCrossing(passing(patch))
    assert.equal(verdict.verdict, 'inconclusive', JSON.stringify(patch).slice(0, 80))
    assert.equal(verdict.behaviour, 'ok')
    assert.match(verdict.reason, reason)
  }
})

test('a 401 with another message is not an expiry', () => {
  for (const message of ['Session revoked', 'User not found', 'Account is locked', 'Account is inactive']) {
    const verdict = judgeExpiryCrossing(passing({ X: { ...passing().X, message } }))
    assert.equal(verdict.verdict, 'inconclusive')
    assert.match(verdict.reason, new RegExp(message.split(' ')[0]))
  }
})

test('evidence about X that is missing or weak is inconclusive', () => {
  const cases = [
    [{ X: null }, /X/],
    [{ X: { ...passing().X, status: 200 } }, /X/],
    [{ X: { ...passing().X, browserTokenFingerprint: 'bbbbbbbbbbbb' } }, /fingerprint|token/i],
    [{ X: { ...passing().X, capture: captureRecord({ qaId: 'X-1', tokenFingerprint: 'cccccccccccc' }) } }, /fingerprint|token/i],
  ]
  for (const [patch, reason] of cases) {
    const verdict = judgeExpiryCrossing(passing(patch))
    assert.equal(verdict.verdict, 'inconclusive')
    assert.match(verdict.reason, reason)
  }
})

test('X must have left the backend before L arrived, by more than the margin', () => {
  const later = judgeExpiryCrossing(
    passing({ X: { ...passing().X, capture: captureRecord({ qaId: 'X-1', answeredLastMs: 5_000.5, answeredFirstMs: 5_000.1 }) } }),
  )
  assert.equal(later.verdict, 'inconclusive')
  const almost = judgeExpiryCrossing(
    passing({ X: { ...passing().X, capture: captureRecord({ qaId: 'X-1', answeredFirstMs: 4_000.0, answeredLastMs: 5_000.4 }) } }),
  )
  assert.equal(almost.verdict, 'inconclusive', 'the conservative comparison must decide, not the first frame')
  const clear = judgeExpiryCrossing(
    passing({ X: { ...passing().X, capture: captureRecord({ qaId: 'X-1', answeredFirstMs: 4_000.0, answeredLastMs: 4_999.0 }) } }),
  )
  assert.equal(clear.verdict, 'pass')
})

test('evidence about P that is missing or weak is inconclusive', () => {
  const cases = [
    [{ P: null }, /P/],
    [{ P: { ...passing().P, status: 401 } }, /P/],
    [{ P: { ...passing().P, browserTokenFingerprint: 'bbbbbbbbbbbb' } }, /fingerprint|token/i],
    [{ P: { ...passing().P, ingress: { startMs: 3_990, status: 200 } } }, /P/],
    [{ P: { ...passing().P, ingress: { startMs: 4_003, status: 200 } } }, /P|margin/i],
  ]
  for (const [patch, reason] of cases) {
    const verdict = judgeExpiryCrossing(passing(patch))
    assert.equal(verdict.verdict, 'inconclusive')
    assert.match(verdict.reason, reason)
  }
})

test('the pipeline gates are inconclusive when the evidence is missing or unusable', () => {
  const cases = [
    [{ pipeline: { ...passing().pipeline, ingressAvailable: false } }, /ingress/i],
    [{ pipeline: { ...passing().pipeline, captureUsable: false } }, /capture/i],
    [{ pipeline: { ...passing().pipeline, captureFinalised: false } }, /health|finalis|capture/i],
    [{ pipeline: { ...passing().pipeline, correlateProblems: [{ qaId: 'L-1' }] } }, /correlate|L-1/],
    [{ pipeline: { ...passing().pipeline, monotonic: { ok: false, why: 'a frame went backwards' } } }, /monotonic|backwards|clock/i],
    [{ deadline: { deadlineMs: 0, accepted: false, why: 'nine samples', samples: 9 } }, /nine|deadline/i],
  ]
  for (const [patch, reason] of cases) {
    const verdict = judgeExpiryCrossing(passing(patch))
    assert.equal(verdict.verdict, 'inconclusive')
    assert.equal(verdict.behaviour, 'ok')
    assert.match(verdict.reason, reason)
  }
})

test('precedence: a behavioural failure is a fail however little evidence there is', () => {
  const verdict = judgeExpiryCrossing(
    passing({ behaviour: { completeWithinDeadline: false, recoveryActions: 2, tabComplete: false, sessionRoute429: 1 }, X: null, P: null, L: null }),
  )
  assert.equal(verdict.verdict, 'fail')
  assert.equal(verdict.behaviour, 'failed')
})

test('a good outcome never rescues missing evidence, and evidence never rescues a behaviour failure', () => {
  // Complete evidence, behaviour fine: pass.
  assert.equal(judgeExpiryCrossing(passing()).verdict, 'pass')
  // Everything but the X ordering: inconclusive.
  assert.equal(judgeExpiryCrossing(passing({ X: { ...passing().X, message: 'Session revoked' } })).verdict, 'inconclusive')
  // Everything but one behaviour: fail.
  assert.equal(judgeExpiryCrossing(passing({ behaviour: { ...passing().behaviour, recoveryActions: 1 } })).verdict, 'fail')
})

// --- the lifetime an attempt needs ahead of it ------------------------------------
//
// An attempt schedules its fillers and its navigation backwards from the
// token's expiry. A token already too close to expiry cannot be scheduled at
// all, and one that has expired is not "current" for the probes either (the
// partial run on b03a4a96d stopped on exactly that: the stored token was read
// after a drain wait longer than its lifetime).

test('the lifetime an attempt needs is its lead, the filler lead and a margin', async () => {
  const { lifetimeNeededMs } = await import('./lib/expiry-crossing.mjs')
  assert.equal(lifetimeNeededMs({ leadMs: 2000, fillerLeadMs: 1200, marginMs: 3000 }), 6200)
})

test('a token with less than that ahead of it cannot start an attempt', async () => {
  const { lifetimeEnough } = await import('./lib/expiry-crossing.mjs')
  const needs = { leadMs: 2000, fillerLeadMs: 1200, marginMs: 3000 }
  assert.equal(lifetimeEnough({ expiresAtMs: 106200, nowMs: 100000, ...needs }), true)
  assert.equal(lifetimeEnough({ expiresAtMs: 106199, nowMs: 100000, ...needs }), false)
  assert.equal(lifetimeEnough({ expiresAtMs: 99000, nowMs: 100000, ...needs }), false) // already expired
})

test('an unknown expiry is not enough', async () => {
  const { lifetimeEnough } = await import('./lib/expiry-crossing.mjs')
  assert.equal(lifetimeEnough({ expiresAtMs: NaN, nowMs: 1, leadMs: 1, fillerLeadMs: 1, marginMs: 1 }), false)
  assert.equal(lifetimeEnough({ expiresAtMs: undefined, nowMs: 1, leadMs: 1, fillerLeadMs: 1, marginMs: 1 }), false)
})

// --- added with the rebuild of the case (2026-10-09) -------------------------------

test('L answered 401 with another message is not shown to be an expiry', () => {
  for (const message of ['Session has been revoked or expired', 'User not found', null]) {
    const verdict = judgeExpiryCrossing(passing({ L: { ...passing().L, message } }))
    assert.deepEqual([verdict.verdict, verdict.behaviour], ['inconclusive', 'ok'], String(message))
  }
})

test('checks over everything the attempt sent: each makes the attempt inconclusive', () => {
  const withPipeline = (extra) => judgeExpiryCrossing(passing({ pipeline: { ...passing().pipeline, ...extra } }))
  assert.equal(withPipeline({ unexplained: ['x GET /api/y'] }).verdict, 'inconclusive')
  assert.equal(withPipeline({ missingFromCapture: 1 }).verdict, 'inconclusive')
  assert.equal(withPipeline({ sameBucket: { ok: false, why: 'two addresses' } }).verdict, 'inconclusive')
  assert.equal(withPipeline({ probesOnSchedule: { ok: false, why: 'bunched' } }).verdict, 'inconclusive')
  assert.equal(withPipeline({ unexplained: [], missingFromCapture: 0, sameBucket: { ok: true }, probesOnSchedule: { ok: true } }).verdict, 'pass')
})

// --- setting the next attempt up from what the last one observed -------------------
//
// In the validation run on 721b7107f all five attempts had everything except
// P: the tab's request reached the ingress 88 to 682 ms after the last probe
// the backend still accepted. That is the tab being sent too late, which is a
// matter of setup, and a bounded number of attempts may correct it.

import { nextNavigateLead } from './lib/expiry-crossing.mjs'

test('a tab whose request arrived after the last accepted probe is sent that much earlier, plus a margin', () => {
  // L reached the ingress 214 ms after P did (attempt 1 of that run).
  assert.equal(nextNavigateLead({ currentMs: 300, lIngressStartMs: 12086, pIngressStartMs: 11872, maxMs: 2700 }), 300 + 214 + 150)
})

test('the correction is capped: the tab is never sent before the fillers have started', () => {
  assert.equal(nextNavigateLead({ currentMs: 2400, lIngressStartMs: 12686, pIngressStartMs: 11872, maxMs: 2700 }), 2700)
})

test('without both observations the lead is left as it was', () => {
  assert.equal(nextNavigateLead({ currentMs: 300, lIngressStartMs: null, pIngressStartMs: 11872, maxMs: 2700 }), 300)
  assert.equal(nextNavigateLead({ currentMs: 300, lIngressStartMs: 12086, pIngressStartMs: undefined, maxMs: 2700 }), 300)
})

test('a tab that was already early enough is not moved', () => {
  assert.equal(nextNavigateLead({ currentMs: 900, lIngressStartMs: 11000, pIngressStartMs: 11872, maxMs: 2700 }), 900)
})
