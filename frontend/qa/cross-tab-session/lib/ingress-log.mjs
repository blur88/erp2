// Pure: what W1 reads out of the ingress access log for a round, and what it
// reads out of it for the sign-out.
//
// The log is the only record of what each limiter decided about each request. A
// 429 on its own says nothing about which limiter produced it, so every count
// here is taken from that limiter's own field, and a 429 that names neither is
// counted apart rather than given to one of them.
//
// Nothing in this module reads a clock or a file: the entries are already
// parsed (nginx/access-log.mjs), and every ordering is taken within the
// ingress's own clock.

// --- the round's window ---------------------------------------------------

/**
 * The lines between two markers the harness sent, for the address they came
 * from.
 *
 * The markers are the round's own requests, `/manifest.json` under `location /`,
 * which the api_limit zone does not meter: they cost no limiter budget and
 * cannot be refused, so their absence means they were never sent rather than
 * that they were throttled.
 */
export function windowBetween(entries, startQaId, endQaId) {
  const start = entries.find((e) => e.qaId === startQaId)
  const end = entries.find((e) => e.qaId === endQaId)
  if (!start || !end) return null
  const from = start.startMs
  const to = end.startMs
  return {
    clientAddr: start.remoteAddr,
    // The markers themselves are the frame, not the round's traffic: they sit
    // on /manifest.json, are not metered, and would only add two lines that
    // carry no limiter verdict.
    entries: entries.filter(
      (e) => e.remoteAddr === start.remoteAddr && e.startMs >= from && e.startMs <= to && e.qaId !== startQaId && e.qaId !== endQaId,
    ),
  }
}

// --- what the round measured ----------------------------------------------

function quantile(sorted, q) {
  if (sorted.length === 0) return null
  const at = (sorted.length - 1) * q
  const low = Math.floor(at)
  const high = Math.ceil(at)
  if (low === high) return sorted[low]
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low)
}

function timings(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  }
}

/**
 * The round's figures, per limiter.
 *
 * `approxNonUpstreamMs` is `$request_time` minus `$upstream_response_time`. The
 * name is deliberate: it is not the time a limiter held a request. It also
 * contains request processing and the time spent sending the response to the
 * client, and it cannot be attributed to any limiter. A request that never
 * reached an upstream has no such figure at all, and is counted as unavailable
 * rather than as a zero.
 */
export function diagnostics(entries) {
  const rejectedBy = { limit_req: 0, limit_conn: 0, unattributed: 0 }
  let status401Total = 0
  let status401OnDelayed = 0
  let delayed = 0
  let upstreamNone = 0
  let upstreamMultiple = 0
  const upstreamValues = []
  const nonUpstreamValues = []
  let nonUpstreamUnavailable = 0

  for (const e of entries) {
    if (e.status === 429) {
      // A 429 naming neither limiter was refused by something this log cannot
      // name, and is never given to one of them.
      if (e.limitReq === 'REJECTED') rejectedBy.limit_req += 1
      else if (e.limitConn === 'REJECTED') rejectedBy.limit_conn += 1
      else rejectedBy.unattributed += 1
    }
    if (e.status === 401) {
      status401Total += 1
      if (e.limitReq === 'DELAYED') status401OnDelayed += 1
    }
    if (e.limitReq === 'DELAYED') delayed += 1
    if (e.upstream.kind === 'none') upstreamNone += 1
    else if (e.upstream.kind === 'multiple') upstreamMultiple += 1
    if (e.upstream.kind !== 'none' && typeof e.upstream.ms === 'number') upstreamValues.push(e.upstream.ms)
    if (e.nonUpstreamMs === null || typeof e.nonUpstreamMs !== 'number') nonUpstreamUnavailable += 1
    else nonUpstreamValues.push(e.nonUpstreamMs)
  }

  return {
    lines: entries.length,
    rejectedBy,
    status401: { total: status401Total, onDelayed: status401OnDelayed },
    delayed,
    upstreamMs: { ...timings(upstreamValues), none: upstreamNone, multiple: upstreamMultiple },
    approxNonUpstreamMs: { ...timings(nonUpstreamValues), unavailable: nonUpstreamUnavailable },
  }
}

// --- the sign-out ---------------------------------------------------------

/**
 * Whether a request the limiter was still holding was outstanding when the
 * sign-out's logout went out.
 *
 * All three times are the ingress's own clock: the delayed line's start and
 * end and the logout's start. A line is outstanding when it began before the
 * logout and had not ended by the time the logout began.
 */
export function signOutOverlap(entries) {
  const logout = entries.find((e) => e.method === 'POST' && e.uri.replace(/\/$/, '') === '/api/auth/logout')
  if (!logout) return { verdict: 'no-logout', delayedOutstanding: 0, logoutStartMs: null }
  const outstanding = entries.filter(
    (e) => e.limitReq === 'DELAYED' && e.startMs < logout.startMs && e.endMs > logout.startMs,
  )
  return {
    verdict: outstanding.length > 0 ? 'overlap' : 'no-overlap',
    delayedOutstanding: outstanding.length,
    logoutStartMs: logout.startMs,
  }
}

/**
 * What one sign-out attempt was.
 *
 * `behaviour-failed` when any of the round's own gates failed: a 429 on a
 * session route, a logout not answered 2xx, a tab not on the login page or on
 * it in another document. A behavioural failure is never retried.
 *
 * Otherwise the attempt is `overlap` or `setup-missed`, and only the latter may
 * be set up again. Without an ingress log there is no overlap to show, so such
 * an attempt is setup-missed: which is how a run without the log comes to fail
 * rather than to pass by having nothing to measure.
 */
export function signOutAttemptOutcome(round) {
  const behaviourFailed =
    (round.count429 ?? 0) > 0 ||
    (round.sessionRequests429DuringUsabilityCheck ?? 0) > 0 ||
    !(round.requests ?? []).some((e) => e.path.replace(/\/$/, '') === '/api/auth/logout' && e.status >= 200 && e.status < 300) ||
    round.everyTabOnLoginPage !== true ||
    (round.tabs ?? []).some((t) => t.onLoginPage !== true || t.sameDocument !== true) ||
    (Array.isArray(round.tabs) && round.tabs.length !== round.n)
  if (behaviourFailed) return 'behaviour-failed'
  return round.overlap === 'overlap' ? 'overlap' : 'setup-missed'
}
