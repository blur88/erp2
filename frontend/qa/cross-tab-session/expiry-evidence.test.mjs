// Case 16's attempt-to-judgement wiring, as pure functions (lib/expiry-evidence.mjs):
// what an attempt observed goes in, the evidence judgeExpiryCrossing reads comes
// out, and the verdict is taken from that. Run on the records of a real attempt.
//
//   node --test frontend/qa/cross-tab-session/expiry-evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadCapture } from './lib/capture-evidence.mjs'
import { EXPIRED_MESSAGE, judgeExpiryCrossing } from './lib/expiry-crossing.mjs'
import { buildExpiryEvidence, messageOfBody, probeSchedule, recoveryOf, selectProof } from './lib/expiry-evidence.mjs'

// --- the real attempt --------------------------------------------------------------
//
// Attempt 1 of the partial run on 7a632336b. The tab's requests were NOT delayed
// (they arrived after the fillers had finished), all 17 probes were answered
// 401 within half a second of each other, and one request from the ingress had
// no identifier. Nothing in it is a behavioural failure: the tab met its 401,
// refreshed, and had its data.

const fixture = JSON.parse(readFileSync(new URL('./fixtures/case16-attempt-7a632336b.json', import.meta.url), 'utf8'))
const STORED = '1a3bf47c2583' // the stored access token's fingerprint in that attempt

const captureOf = (records) => loadCapture(records.map((r) => JSON.stringify(r)))
const ingressById = (entries) => new Map(entries.filter((e) => e.qaId).map((e) => [e.qaId, e]))

// The browser's records as the harness keeps them, derived here from the
// ingress lines (the run did not persist them): id, status, token fingerprint,
// zone, and the message of a 401.
const browserFrom = (ingress, capture, prefix, extra = {}) => [
  // A request the context sent inside the capture segment but before the
  // attempt's first marker (the holder tab's health poll): the harness has a
  // record of it, so the derived records do too.
  ...[...capture.requests.values()]
    .filter((r) => r.qaId && r.qaId.startsWith(prefix) && !ingress.some((e) => e.qaId === r.qaId))
    .map((r) => ({ qaId: r.qaId, method: r.method, path: r.uri.split('?')[0], zone: r.uri.startsWith('/api/health') ? 'health' : 'business', status: r.status, token: r.tokenFingerprint, message: null })),
  ...ingress
    .filter((e) => e.qaId.startsWith(prefix))
    .map((e) => ({
      qaId: e.qaId,
      method: e.method,
      path: e.uri.split('?')[0],
      zone: /^\/api\/auth\/(refresh|logout|me)\/?$/.test(e.uri.split('?')[0]) ? 'session' : e.uri.startsWith('/api/health') ? 'health' : 'business',
      status: e.status,
      token: capture.requests.get(e.qaId)?.tokenFingerprint ?? null,
      message: e.status === 401 ? EXPIRED_MESSAGE : null,
      ...extra,
    })),
]

const DEADLINE = { deadlineMs: 4040, accepted: true, why: null }
const API = { ratePerSecond: 20, burst: 40, delay: 20 }

/** Everything an attempt hands over, from the real records, with the completion it measured. */
const realAttempt = (over = {}) => {
  const capture = captureOf(fixture.capture)
  return {
    app: browserFrom(fixture.ingress, capture, 'app-'),
    probes: browserFrom(fixture.ingress, capture, 'probe-'),
    fillers: browserFrom(fixture.ingress, capture, 'fill-'),
    ingress: fixture.ingress,
    capture,
    window: fixture.window,
    storedFingerprint: STORED,
    deadline: DEADLINE,
    api: API,
    // What the attempt measured on the browser's clock.
    completion: { gotoAt: 1000, first401At: 18340, completedAfterMs: 18900, recoveryActions: 0 },
    sessionRoute429: 0,
    probePlan: { everyMs: 150, windowMs: 2400 },
    ...over,
  }
}

test('the real attempt is inconclusive, not failed: nothing in it was a behavioural failure', () => {
  const evidence = buildExpiryEvidence(realAttempt())
  const verdict = judgeExpiryCrossing(evidence)
  assert.equal(verdict.behaviour, 'ok')
  assert.equal(verdict.verdict, 'inconclusive')
})

test('the real attempt: recovery is measured from the tab\'s first 401, and was well inside the deadline', () => {
  const evidence = buildExpiryEvidence(realAttempt())
  assert.equal(evidence.behaviour.recoveryMs, 1560) // gotoAt 1000 + 18900 - 18340
  assert.equal(evidence.behaviour.tabComplete, true)
  assert.equal(evidence.behaviour.completeWithinDeadline, true)
})

test('the real attempt: the unidentified /uploads/ request makes the capture unusable, and that is what is reported', () => {
  const evidence = buildExpiryEvidence(realAttempt())
  assert.equal(evidence.pipeline.captureUsable, false)
  assert.match(judgeExpiryCrossing(evidence).reason, /capture is not usable/)
})

test('the real attempt: the probes were bunched, not on schedule', () => {
  const evidence = buildExpiryEvidence(realAttempt())
  assert.equal(evidence.pipeline.probesOnSchedule.ok, false)
})

test('the real attempt: no request of the tab was delayed, so there is no candidate L that was', () => {
  const a = realAttempt()
  const proof = selectProof({ app: a.app, probes: a.probes, ingress: ingressById(a.ingress), capture: a.capture, storedFingerprint: STORED })
  assert.equal(proof.delayedCandidates, 0)
})

// --- an attempt in which the crossing happened ---------------------------------------
//
// Built from the real records by changing only what the crossing needs: the
// tab's 401 was delayed by the limiter, a probe was answered 2xx after that
// request reached the ingress, another was answered "expired" before it reached
// the backend, the probes were on schedule, and the stray /uploads/ request is
// gone.

const crossing = (change = () => {}) => {
  const ingress = fixture.ingress.map((e) => ({ ...e, upstream: { ...e.upstream } }))
  const records = fixture.capture.filter((r) => r.kind !== 'invalid' && !(r.kind === 'request' && r.qaId === null)).map((r) => ({ ...r }))
  const health = records.find((r) => r.kind === 'health')
  health.invalid = 0
  // The tab's first data request: the 401.
  const l = ingress.find((e) => e.qaId.startsWith('app-') && e.status === 401)
  l.limitReq = 'DELAYED'
  const lCapture = records.find((r) => r.qaId === l.qaId)
  // Probes: spread 150 ms apart across the expiry, 2xx before it and 401 after.
  const probes = ingress.filter((e) => e.qaId.startsWith('probe-')).sort((x, y) => x.qaId.localeCompare(y.qaId))
  probes.forEach((p, i) => {
    const startMs = l.startMs - 800 + i * 150
    p.startMs = startMs
    p.endMs = startMs + 5
    p.status = i < 8 ? 200 : 401 // the expiry falls after the eighth
    const c = records.find((r) => r.qaId === p.qaId)
    c.status = p.status
    c.arrivedFirstMs = c.arrivedLastMs = startMs + 1
    c.answeredFirstMs = c.answeredLastMs = startMs + 4
  })
  // L reached the ingress before probe 7 (2xx) did, and reached the backend after probe 8's 401 had left.
  l.startMs = probes[6].startMs - 20
  lCapture.arrivedFirstMs = lCapture.arrivedLastMs = records.find((r) => r.qaId === probes[8].qaId).answeredLastMs + 50
  lCapture.answeredFirstMs = lCapture.answeredLastMs = lCapture.arrivedFirstMs + 4
  l.endMs = l.startMs + 600
  const attempt = {
    ...realAttempt(),
    ingress,
    capture: captureOf(records),
  }
  attempt.app = browserFrom(ingress, attempt.capture, 'app-')
  attempt.probes = browserFrom(ingress, attempt.capture, 'probe-')
  attempt.fillers = browserFrom(ingress, attempt.capture, 'fill-')
  change(attempt, { l, probes, records })
  return attempt
}

const verdictOf = (attempt) => judgeExpiryCrossing(buildExpiryEvidence(attempt))

test('the crossing, with every piece of evidence present, passes', () => {
  const v = verdictOf(crossing())
  assert.deepEqual([v.verdict, v.behaviour], ['pass', 'ok'], v.reason)
})

test('the candidates are chosen from what was observed: L is the tab\'s delayed 401, whatever its path', () => {
  const a = crossing()
  const proof = selectProof({ app: a.app, probes: a.probes, ingress: ingressById(a.ingress), capture: a.capture, storedFingerprint: STORED })
  assert.equal(proof.L.path, '/api/settings/regional')
  assert.equal(proof.X.status, 401)
  assert.equal(proof.P.status, 200)
})

// --- an observed recovery failure is a fail -----------------------------------------

test('the tab holding its data after the deadline is a fail, with the evidence complete', () => {
  const v = verdictOf(crossing((a) => (a.completion = { ...a.completion, completedAfterMs: 18340 - 1000 + 4041 })))
  assert.deepEqual([v.verdict, v.behaviour], ['fail', 'failed'])
  assert.match(v.reason, /after the recovery deadline/)
})

test('exactly on the deadline is inside it', () => {
  assert.equal(verdictOf(crossing((a) => (a.completion = { ...a.completion, completedAfterMs: 18340 - 1000 + 4040 }))).verdict, 'pass')
})

test('a tab that never held its data is a fail', () => {
  const v = verdictOf(crossing((a) => (a.completion = { ...a.completion, completedAfterMs: null })))
  assert.deepEqual([v.verdict, v.behaviour], ['fail', 'failed'])
  assert.match(v.reason, /never completed/)
})

test('one recovery action is a fail', () => {
  assert.equal(verdictOf(crossing((a) => (a.completion = { ...a.completion, recoveryActions: 1 }))).verdict, 'fail')
})

test('a 429 on a session route is a fail', () => {
  assert.equal(verdictOf(crossing((a) => (a.sessionRoute429 = 1))).verdict, 'fail')
})

test('a recovery failure is a fail even when the evidence is incomplete', () => {
  const v = verdictOf(crossing((a) => {
    a.completion = { ...a.completion, completedAfterMs: null }
    a.probes = []
  }))
  assert.equal(v.verdict, 'fail')
})

// --- missing evidence is inconclusive, never a pass and never a fail ------------------

const inconclusive = (name, change, pattern) =>
  test(`missing evidence, inconclusive: ${name}`, () => {
    const v = verdictOf(crossing(change))
    assert.deepEqual([v.verdict, v.behaviour], ['inconclusive', 'ok'], v.reason)
    if (pattern) assert.match(v.reason, pattern)
  })

inconclusive('the tab met no 401 at all (no recovery to measure, no L)', (a) => {
  a.completion = { ...a.completion, first401At: null }
  a.app = a.app.map((e) => ({ ...e, status: e.status === 401 ? 200 : e.status }))
})
inconclusive('the tab\'s 401 was not delayed', (a, { l }) => (l.limitReq = 'PASSED'), /not delayed/)
inconclusive('L was answered with another message than the expiry one', (a, { l }) => {
  a.app = a.app.map((e) => (e.qaId === l.qaId ? { ...e, message: 'Session has been revoked or expired' } : e))
}, /not ".*expired token"|is not/)
inconclusive('L carried another token', (a, { l }) => {
  a.app = a.app.map((e) => (e.qaId === l.qaId ? { ...e, token: 'ffffffffffff' } : e))
})
inconclusive('L is not in the capture', (a, { l, records }) => {
  a.capture = captureOf(records.filter((r) => r.qaId !== l.qaId))
})
inconclusive('no probe was answered 2xx after L reached the ingress', (a, { l, probes }) => {
  // L reached the ingress only after the last probe the backend still accepted.
  l.startMs = Math.max(...probes.filter((p) => p.status === 200).map((p) => p.startMs)) + 60
}, /P/)
inconclusive('no probe had been answered expired before L reached the backend', (a, { l, records }) => {
  const c = records.find((r) => r.qaId === l.qaId)
  c.arrivedFirstMs = c.arrivedLastMs = 0
  a.capture = captureOf(records)
}, /X/)
inconclusive('X was answered 401 with another message', (a) => {
  a.probes = a.probes.map((e) => (e.status === 401 ? { ...e, message: 'User not found' } : e))
})
inconclusive('the probes were bunched together instead of on schedule', (a, { probes }) => {
  probes.forEach((p, i) => (p.startMs = probes[0].startMs + i * 5))
}, /schedule/)
inconclusive('the fillers reached the ingress from another address', (a) => {
  a.ingress = a.ingress.map((e) => (e.qaId.startsWith('fill-') ? { ...e, remoteAddr: '172.18.0.99' } : e))
}, /address|bucket/)
inconclusive('a request reached the backend that no browser context sent', (a, { records }) => {
  a.capture = captureOf([...records, { ...records.find((r) => r.kind === 'request'), qaId: 'stranger-1' }])
}, /unexplained|no browser/)
inconclusive('an unreadable record inside the window', (a, { records }) => {
  a.capture = captureOf([...records, { kind: 'invalid', reason: 'missing-qa-id', stream: 1, fromMs: fixture.window.startMs + 10, toMs: fixture.window.startMs + 10, detail: 'GET /uploads/x.png' }])
}, /capture is not usable/)
inconclusive('the capture was not finalised', (a, { records }) => {
  a.capture = captureOf(records.filter((r) => r.kind !== 'health'))
})
inconclusive('the ingress log is missing', (a) => (a.ingress = null))
inconclusive('the deadline was not established', (a) => (a.deadline = { deadlineMs: null, accepted: false, why: '9 sample(s), 10 are needed' }))

test('narrower correlation hides nothing: a filler missing from the capture is still reported', () => {
  const a = crossing((x, { records }) => {
    const filler = records.find((r) => r.kind === 'request' && r.qaId && r.qaId.startsWith('fill-'))
    x.capture = captureOf(records.filter((r) => r !== filler))
  })
  const evidence = buildExpiryEvidence(a)
  assert.ok(evidence.pipeline.missingFromCapture >= 1)
  assert.equal(judgeExpiryCrossing(evidence).verdict, 'inconclusive')
})

// --- the small pieces ----------------------------------------------------------------

test('recovery: from the first 401 to the data, on one clock; unknown when either end is', () => {
  assert.equal(recoveryOf({ gotoAt: 1000, first401At: 3000, completedAfterMs: 4500 }), 2500)
  assert.equal(recoveryOf({ gotoAt: 1000, first401At: null, completedAfterMs: 4500 }), null)
  assert.equal(recoveryOf({ gotoAt: 1000, first401At: 3000, completedAfterMs: null }), null)
})

test('the probe schedule: evenly spread is on schedule, bunched or cut short is not', () => {
  const even = Array.from({ length: 17 }, (_, i) => 1000 + i * 150)
  assert.equal(probeSchedule(even, { everyMs: 150, windowMs: 2400 }).ok, true)
  assert.equal(probeSchedule(even.map((t, i) => 1000 + i * 30), { everyMs: 150, windowMs: 2400 }).ok, false)
  assert.equal(probeSchedule([...even.slice(0, 8), ...even.slice(8).map((t) => t + 900)], { everyMs: 150, windowMs: 2400 }).ok, false)
  assert.equal(probeSchedule([], { everyMs: 150, windowMs: 2400 }).ok, false)
})

test('only the message of a rejection is kept, and only when it is a string', () => {
  assert.equal(messageOfBody({ statusCode: 401, message: 'Invalid or expired token', error: 'Unauthorized' }), 'Invalid or expired token')
  assert.equal(messageOfBody({ message: { text: 'conflict', id: 7 } }), 'conflict')
  assert.equal(messageOfBody({ message: ['a', 'b'] }), null)
  assert.equal(messageOfBody({ accessToken: 'eyJhbGciOi', refreshToken: 'x' }), null)
  assert.equal(messageOfBody(null), null)
  assert.equal(messageOfBody('text'), null)
})

// --- found by the forced failure "probes never sent" (m16-s1, 1c093959f) -----------
//
// The attempt was inconclusive, rightly, but for a reason that was not true: it
// said the three kinds of request did not share one address, because the
// probes' list of addresses was empty. No probe arriving is not a probe arriving
// from somewhere else.

test('no probe at the ingress is reported as that, not as a second address', () => {
  // Never sent: in no browser record, no ingress line and no capture record.
  const a = crossing((x, { records }) => {
    x.probes = []
    x.ingress = x.ingress.filter((e) => !e.qaId.startsWith('probe-'))
    x.capture = captureOf(records.filter((r) => !(r.kind === 'request' && r.qaId && r.qaId.startsWith('probe-'))))
  })
  const evidence = buildExpiryEvidence(a)
  assert.equal(evidence.pipeline.sameBucket.ok, false)
  assert.match(evidence.pipeline.sameBucket.why, /no probe request reached the ingress/)
  assert.doesNotMatch(evidence.pipeline.sameBucket.why, /not one address/)
  const v = judgeExpiryCrossing(evidence)
  assert.deepEqual([v.verdict, v.behaviour], ['inconclusive', 'ok'])
  assert.match(v.reason, /no probe request reached the ingress/)
})

test('no filler at the ingress is reported as that too', () => {
  const a = crossing((x) => {
    x.fillers = []
    x.ingress = x.ingress.filter((e) => !e.qaId.startsWith('fill-'))
  })
  assert.match(buildExpiryEvidence(a).pipeline.sameBucket.why, /no filler request reached the ingress/)
})

test('two addresses are still reported as two addresses', () => {
  const a = crossing((x) => {
    x.ingress = x.ingress.map((e) => (e.qaId.startsWith('probe-') ? { ...e, remoteAddr: '172.18.0.77' } : e))
  })
  assert.match(buildExpiryEvidence(a).pipeline.sameBucket.why, /not one address/)
})
