// What one attempt of case 16 observed, turned into the evidence
// judgeExpiryCrossing reads. Pure: expiry-evidence.test.mjs runs it on the
// records of a real attempt.
//
// Nothing is chosen in advance. The request L is whichever request of the
// application tab the limiter delayed and the backend answered 401; X and P are
// whichever probes bracket it. The proof only ever names those three, but the
// checks around it are over everything the attempt sent: an unreadable capture
// record, a request no browser context sent, a request missing from the
// capture, traffic from another address, probes that did not run on schedule.
// Any of them makes the attempt inconclusive, whatever the three look like.
import { captureUsable, correlate } from './capture-evidence.mjs'
import { CAPTURE_MARGIN_MS, EXPIRED_MESSAGE, INGRESS_MARGIN_MS, monotonic } from './expiry-crossing.mjs'

/** The message of a rejection body, and nothing else of it. Null when there is none to keep. */
export function messageOfBody(body) {
  if (!body || typeof body !== 'object') return null
  const m = body.message
  if (typeof m === 'string') return m
  if (m && typeof m === 'object' && !Array.isArray(m) && typeof m.text === 'string') return m.text
  return null
}

/** From the tab's first 401 to the tab holding its data, on the browser's clock. Null when either end is unknown. */
export function recoveryOf({ gotoAt, first401At, completedAfterMs }) {
  if (typeof first401At !== 'number' || typeof completedAfterMs !== 'number' || typeof gotoAt !== 'number') return null
  return gotoAt + completedAfterMs - first401At
}

/**
 * Did the probes reach the ingress on the schedule they were sent on? `starts`
 * are their arrival times at the ingress. They must cover most of the window
 * and no two neighbours may be far closer or far further apart than planned:
 * probes that queued behind something arrive in a bunch, and a bunch cannot
 * bracket an expiry.
 */
export function probeSchedule(starts, { everyMs, windowMs }) {
  const t = [...starts].filter((v) => typeof v === 'number').sort((x, y) => x - y)
  if (t.length < 3) return { ok: false, why: `${t.length} probe(s) reached the ingress` }
  const span = t.at(-1) - t[0]
  if (span < windowMs * 0.6) return { ok: false, why: `the probes spanned ${Math.round(span)} ms of a ${windowMs} ms window` }
  const gaps = t.slice(1).map((v, i) => v - t[i])
  const widest = Math.max(...gaps)
  if (widest > everyMs * 4) return { ok: false, why: `two probes were ${Math.round(widest)} ms apart; they were sent every ${everyMs} ms` }
  return { ok: true, why: null, spanMs: Math.round(span), widestGapMs: Math.round(widest) }
}

const hostOf = (endpoint) => (typeof endpoint === 'string' ? endpoint.slice(0, endpoint.lastIndexOf(':')) : null)

/**
 * L, X and P, from what was observed.
 *
 * @param app      the application tab's requests (harness records: qaId, zone,
 *                 path, status, token, message)
 * @param probes   the probes' records, same shape
 * @param ingress  Map qaId -> LogEntry
 * @param capture  from loadCapture
 */
export function selectProof({ app, probes, ingress, capture, storedFingerprint }) {
  const withSources = (e) => (e ? { ...e, ingress: ingress.get(e.qaId) ?? null, capture: capture.requests.get(e.qaId) ?? null } : null)
  const rejected = app.filter((e) => e.zone === 'business' && e.status === 401).map(withSources)
  const delayed = rejected.filter((e) => e.ingress?.limitReq === 'DELAYED')
  const all = probes.map(withSources)
  const expired = all.filter((e) => e.status === 401)
  const valid = all.filter((e) => e.status >= 200 && e.status < 300)

  const xFor = (L) =>
    expired
      .filter((e) => e.message === EXPIRED_MESSAGE && e.token === storedFingerprint && typeof e.capture?.answeredLastMs === 'number')
      .filter((e) => typeof L.capture?.arrivedFirstMs === 'number' && e.capture.answeredLastMs + CAPTURE_MARGIN_MS <= L.capture.arrivedFirstMs)
      .sort((x, y) => y.capture.answeredLastMs - x.capture.answeredLastMs)[0] ?? null
  const pFor = (L) =>
    valid
      .filter((e) => e.token === storedFingerprint && typeof e.ingress?.startMs === 'number')
      .filter((e) => typeof L.ingress?.startMs === 'number' && L.ingress.startMs + INGRESS_MARGIN_MS <= e.ingress.startMs)
      .sort((x, y) => x.ingress.startMs - y.ingress.startMs)[0] ?? null

  // The first delayed 401 that has both its probes; failing that, the first
  // delayed one with whatever it has; failing that, the first 401 at all, so
  // that the judgement can say what was missing rather than that nothing was.
  const byStart = (x, y) => (x.ingress?.startMs ?? Infinity) - (y.ingress?.startMs ?? Infinity)
  const candidates = [...delayed.sort(byStart), ...rejected.filter((e) => !delayed.includes(e)).sort(byStart)]
  let chosen = null
  for (const L of candidates) {
    const X = xFor(L)
    const P = pFor(L)
    if (!chosen) chosen = { L, X, P }
    if (X && P && L.ingress?.limitReq === 'DELAYED') {
      chosen = { L, X, P }
      break
    }
  }
  if (!chosen) chosen = { L: null, X: null, P: null }
  // When the brackets are missing, the nearest probes are still named, so the
  // reason given is about them and not about their absence.
  const latest = (list) => [...list].sort((x, y) => (y.ingress?.startMs ?? 0) - (x.ingress?.startMs ?? 0))[0] ?? null
  return {
    L: chosen.L,
    X: chosen.X ?? latest(expired),
    P: chosen.P ?? latest(valid),
    delayedCandidates: delayed.length,
    rejectedCandidates: rejected.length,
  }
}

const proofEntry = (e) =>
  e
    ? {
        qaId: e.qaId,
        path: e.path ?? null,
        status: e.status ?? null,
        message: e.message ?? null,
        browserTokenFingerprint: e.token ?? null,
        capture: e.capture,
        ingress: e.ingress ? { startMs: e.ingress.startMs, status: e.ingress.status, limitReq: e.ingress.limitReq } : null,
      }
    : null

/**
 * The evidence for judgeExpiryCrossing, from everything one attempt observed.
 *
 * `completion` is what the attempt measured on the browser's clock:
 * { gotoAt, first401At, completedAfterMs, recoveryActions }.
 */
export function buildExpiryEvidence({ app, probes, fillers, ingress, capture, storedFingerprint, deadline, api, completion, sessionRoute429, probePlan }) {
  const entries = ingress ?? []
  const byId = new Map(entries.filter((e) => e.qaId).map((e) => [e.qaId, e]))
  const proof = selectProof({ app, probes, ingress: byId, capture, storedFingerprint })

  // Behaviour: what the tab did, whatever the evidence looks like.
  const recoveryMs = recoveryOf(completion)
  const tabComplete = typeof completion.completedAfterMs === 'number'
  const behaviour = {
    tabComplete,
    recoveryMs,
    // Unknown (null) when the tab met no 401: there was no recovery to time.
    completeWithinDeadline: !tabComplete ? null : recoveryMs === null || deadline?.accepted !== true ? null : recoveryMs <= deadline.deadlineMs,
    recoveryActions: completion.recoveryActions ?? 0,
    sessionRoute429: sessionRoute429 ?? 0,
  }

  // Everything the attempt sent, by identifier, in whichever context sent it.
  const sent = [...app, ...probes, ...fillers].filter((e) => e.qaId)
  const sentIds = new Set(sent.map((e) => e.qaId))
  // The whole segment, not a time range of it: the segment was started and
  // stopped around the attempt, and cutting it by the ingress's window would
  // compare the capture's clock with the ingress's.
  const captured = [...capture.requests.values()]
  const unexplained = captured.filter((r) => !sentIds.has(r.qaId)).map((r) => `${r.qaId} ${r.method} ${r.uri}`)
  // A request the ingress forwarded (it has an upstream time) must be in the capture.
  const forwarded = entries.filter((e) => e.qaId && sentIds.has(e.qaId) && e.upstream?.kind !== 'none')
  const missingFromCapture = forwarded.filter((e) => !capture.requests.has(e.qaId)).length

  // One address, so one bucket: the limiter is keyed on it.
  const kinds = { app: 'app-', probes: 'probe-', fillers: 'fill-' }
  const addresses = {}
  for (const [kind, prefix] of Object.entries(kinds)) {
    addresses[kind] = [...new Set(entries.filter((e) => e.qaId && e.qaId.startsWith(prefix)).map((e) => e.remoteAddr))]
  }
  const distinct = new Set(Object.values(addresses).flat())
  const sources = new Set(captured.map((r) => hostOf(r.src)).filter(Boolean))
  const sameBucket =
    distinct.size === 1 && Object.values(addresses).every((list) => list.length === 1)
      ? { ok: true, why: null, address: [...distinct][0] }
      : { ok: false, why: `the application, the probes and the fillers reached the ingress from ${JSON.stringify(addresses)}: not one address, so not shown to be one limiter bucket` }

  const usable = ingress === null ? { usable: false, why: 'no ingress log' } : captureUsable(capture, 0, Number.MAX_SAFE_INTEGER)
  const selected = [proof.L, proof.X, proof.P].filter(Boolean)
  const correlated = correlate(selected, entries.filter((e) => selected.some((s) => s.qaId === e.qaId)), {
    requests: new Map(selected.filter((s) => capture.requests.has(s.qaId)).map((s) => [s.qaId, capture.requests.get(s.qaId)])),
    duplicates: capture.duplicates ?? [],
  })

  const L = proofEntry(proof.L)
  if (L) {
    // The backend had accepted this very token before it refused it: a 2xx for
    // the same fingerprint that had left the backend by the time L was answered.
    const answered = proof.L.capture?.answeredFirstMs
    L.earlierAcceptedSameToken = [...probes, ...app, ...fillers].some((e) => {
      const c = capture.requests.get(e.qaId)
      return e.token === storedFingerprint && e.status >= 200 && e.status < 300 && typeof c?.answeredLastMs === 'number' && typeof answered === 'number' && c.answeredLastMs <= answered
    })
    L.limitReq = proof.L.ingress?.limitReq ?? null
  }

  return {
    api,
    deadline,
    behaviour,
    pipeline: {
      ingressAvailable: ingress !== null,
      captureFinalised: capture.health !== null,
      captureUsable: usable.usable,
      captureUsableWhy: usable.why,
      correlateProblems: correlated.problems,
      monotonic: monotonic(captured.flatMap((r) => r.frames ?? []), entries),
      sameBucket,
      captureSources: [...sources],
      probesOnSchedule: probeSchedule(probes.map((e) => byId.get(e.qaId)?.startMs), probePlan),
      unexplained,
      missingFromCapture,
    },
    stored: { accessTokenFingerprint: storedFingerprint },
    L,
    X: proofEntry(proof.X),
    P: proofEntry(proof.P),
    candidates: { delayed: proof.delayedCandidates, rejected: proof.rejectedCandidates },
  }
}
