// What one recorded replay round is judged to have shown. Pure: it joins the
// three records a round leaves behind and returns one verdict. It reads nothing.
//
//   - the trace each tab collected (window.__erpSessionTrace), which says what
//     the refresh path did in that document;
//   - the request record the harness wrote, which says what went to the server;
//   - the server rows read afterwards from the host, which say whether the
//     session was revoked as replay.
//
// The rules are the spec's "Runs" section, fixed before any round was run. They
// are deliberately unwilling: a missing, failed or uncovered set of server rows
// is `undetermined` and never `no-replay`, and an ambiguous join is never
// resolved by choosing the likeliest candidate.

export const TRACE_CAP = 5000
export const AUDIT_MATCH_TOLERANCE_MS = 1000

const REFRESH_PATH = '/api/auth/refresh'

// The chain, in the order it is looked for. `found` is what judgeRound reports
// under `supports`; what is not in it is what it reports under `missing`.
const LINKS = [
  'link:answer',
  'link:timeout',
  'link:timeout-before-presentation',
  'link:no-write-in-interval',
  'link:stale-read',
  'link:stale-presentation',
  'link:audit',
]

// ISO 8601 UTC sorts lexicographically, but the harness writes epoch
// milliseconds and the database writes timestamps, so both are accepted.
const toMs = (value) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const tracesOf = (attempt) => (Array.isArray(attempt?.traces) ? attempt.traces : [])
const eventsOf = (trace, type) => trace.events.filter((e) => e.type === type)

const refreshRequests = (attempt) =>
  (Array.isArray(attempt?.sessionRequests) ? attempt.sessionRequests : []).filter(
    (r) => r?.path === REFRESH_PATH && typeof r.sentAt === 'number',
  )

/** Every event of the round, with the harness tab its trace was read from. */
function allEvents(attempt) {
  const out = []
  for (const trace of tracesOf(attempt)) {
    for (const event of trace.events) out.push({ ...event, tab: trace.tab })
  }
  return out
}

// The generation whose refresh-token fingerprint the harness saw in the stored
// record is the generation a request presenting that fingerprint sent.
function generationOfFingerprint(attempt, fingerprint) {
  if (typeof fingerprint !== 'string') return null
  const changes = Array.isArray(attempt?.storedChanges) ? attempt.storedChanges : []
  for (const change of changes) {
    if (change?.refreshFingerprint === fingerprint) return change.generation ?? null
  }
  return null
}

/**
 * A tab has at most one refresh in flight, so the n-th `refresh-sent` of a tab is
 * the n-th POST /auth/refresh the harness recorded for that page. The pairing is
 * checked two ways and a pairing that fails either is not a pairing.
 */
export function pairRefreshes(attempt) {
  const pairs = []
  const unpairedRequests = []
  const unpairedSends = []
  const requests = refreshRequests(attempt)
  const tracedTabs = new Set()

  for (const trace of tracesOf(attempt)) {
    if (tracedTabs.has(trace.tab)) continue
    tracedTabs.add(trace.tab)
    const sends = eventsOf(trace, 'refresh-sent')
    const own = requests.filter((r) => r.tab === trace.tab)
    const count = Math.max(sends.length, own.length)
    for (let i = 0; i < count; i += 1) {
      const sent = sends[i] ?? null
      const request = own[i] ?? null
      if (!sent || !request) {
        ;(sent ? unpairedSends : unpairedRequests).push({ tab: trace.tab, index: i, sent, request })
        continue
      }
      const answered = eventsOf(trace, 'refresh-answered').find((a) => a.refreshId === sent.refreshId) ?? null
      pairs.push({
        tab: trace.tab,
        refreshId: sent.refreshId,
        request,
        sent,
        answered,
        crossChecks: {
          time: answered !== null && request.sentAt >= sent.at && request.sentAt <= answered.at,
          generation: generationOfFingerprint(attempt, request.presentedRefresh) === sent.presentedGeneration,
        },
      })
    }
  }

  for (const request of requests) {
    if (!tracedTabs.has(request.tab)) unpairedRequests.push({ tab: request.tab, index: null, sent: null, request })
  }

  return { pairs, unpairedRequests, unpairedSends }
}

/** Whether the round's trace can establish a cause at all. */
export function completeness(attempt) {
  const failed = new Set()
  const traces = tracesOf(attempt)
  if (!Array.isArray(attempt?.traces)) failed.add('tab-not-collected')

  for (const trace of traces) {
    // The trace lives in `window`: a page that was replaced has lost it.
    if (trace.collected !== true) {
      failed.add('tab-not-collected')
      continue
    }
    if (trace.timeOriginAtEnd == null || trace.timeOriginAtEnd !== trace.timeOriginAtOpen) {
      failed.add('tab-reloaded')
    }
    if (trace.flagSet !== true) failed.add('flag-unset')
    if (Array.isArray(trace.events) && trace.events.length >= TRACE_CAP) failed.add('buffer-at-cap')
  }

  const { pairs, unpairedRequests, unpairedSends } = pairRefreshes(attempt)
  if (unpairedRequests.length > 0) failed.add('unpaired-request')
  if (unpairedSends.length > 0) failed.add('unpaired-send')
  if (pairs.some((p) => !p.crossChecks.time)) failed.add('time-cross-check')
  if (pairs.some((p) => !p.crossChecks.generation)) failed.add('generation-cross-check')

  return { complete: failed.size === 0, failed: [...failed] }
}

/**
 * Whether the server rows can be read as this round's. A failed or missing
 * query, or one whose interval does not cover the round, says nothing about the
 * round and is never a `no-replay`.
 */
export function serverRowsUsable(attempt, serverRows) {
  if (serverRows === null || typeof serverRows !== 'object') return { usable: false, reason: 'server-rows-missing' }
  if (serverRows.ok !== true) return { usable: false, reason: 'server-rows-not-ok' }
  if (typeof attempt?.sessionId !== 'string' || attempt.sessionId === '') {
    return { usable: false, reason: 'round-session-id-missing' }
  }
  const since = toMs(serverRows.since)
  const readAt = toMs(serverRows.readAt)
  if (since === null || readAt === null) return { usable: false, reason: 'server-rows-interval-unreadable' }
  if (since > toMs(attempt.openedAt)) return { usable: false, reason: 'server-rows-since-after-round-opened' }
  if (readAt < toMs(attempt.endedAt)) return { usable: false, reason: 'server-rows-read-before-round-ended' }
  return { usable: true, reason: null }
}

/** The replay rows of the round's own session, inside the round's own interval. */
export function roundAudit(attempt, serverRows) {
  if (!serverRows || !Array.isArray(serverRows.audit)) return []
  const from = toMs(attempt?.openedAt) - AUDIT_MATCH_TOLERANCE_MS
  const to = toMs(attempt?.endedAt) + AUDIT_MATCH_TOLERANCE_MS
  return serverRows.audit.filter((row) => {
    const at = toMs(row?.createdAt)
    return row?.sessionId === attempt?.sessionId && at !== null && at >= from && at <= to
  })
}

/**
 * The round's replay rows, joined to the request that caused each. A request
 * fits a row when it is a refresh answered 401 whose paired trace presented the
 * row's generation, and the row's time falls inside the request's window. More
 * than one request fitting a row, or one request fitting more than one row, is
 * ambiguous and yields no match.
 */
export function matchAudit(attempt, serverRows) {
  const rows = roundAudit(attempt, serverRows)
  const { pairs } = pairRefreshes(attempt)
  const rejected = pairs.filter((p) => p.request.status === 401 && p.answered?.status === 'rejected')

  const fits = (pair, row) => {
    const at = toMs(row?.createdAt)
    const from = toMs(pair.request.sentAt) - AUDIT_MATCH_TOLERANCE_MS
    const to = toMs(pair.request.respondedAt) + AUDIT_MATCH_TOLERANCE_MS
    return pair.sent.presentedGeneration === row?.presentedGeneration && at !== null && at >= from && at <= to
  }

  const requestsPerRow = new Map()
  const rowsPerRequest = new Map()
  for (const row of rows) {
    for (const pair of rejected) {
      if (!fits(pair, row)) continue
      if (!requestsPerRow.has(row.id)) requestsPerRow.set(row.id, [])
      requestsPerRow.get(row.id).push(pair)
      if (!rowsPerRequest.has(pair)) rowsPerRequest.set(pair, [])
      rowsPerRequest.get(pair).push(row.id)
    }
  }

  const matches = []
  const ambiguous = []
  const unmatched = []
  for (const row of rows) {
    const candidates = requestsPerRow.get(row.id) ?? []
    if (candidates.length === 0) {
      unmatched.push(row.id)
      continue
    }
    if (candidates.length > 1 || (rowsPerRequest.get(candidates[0]) ?? []).length > 1) {
      ambiguous.push(row.id)
      continue
    }
    matches.push({ auditId: row.id, request: candidates[0].request })
  }
  return { matches, ambiguous, unmatched }
}

/**
 * One round, one verdict. The order the five are decided in is fixed:
 * undetermined, no-replay, hypothesis-1-observed, replay-other-path,
 * supporting-unconfirmed.
 */
export function judgeRound(attempt, serverRows) {
  const usable = serverRowsUsable(attempt, serverRows)
  if (!usable.usable) {
    return { verdict: 'undetermined', missing: [usable.reason], supports: [], chain: null }
  }

  const rows = roundAudit(attempt, serverRows)
  if (rows.length === 0) {
    return attempt?.sessionEnded === true
      ? { verdict: 'undetermined', missing: ['session-ended-without-audit-row'], supports: [], chain: null }
      : { verdict: 'no-replay', missing: [], supports: [], chain: null }
  }

  const { matches, ambiguous } = matchAudit(attempt, serverRows)
  const unique = matches.length === 1 && ambiguous.length === 0

  const events = allEvents(attempt)
  const timeouts = events.filter((e) => e.type === 'token-commit' && e.outcome === 'timeout')
  const found = new Set()

  // The chain is anchored on the unique match: its request's tab is the one that
  // presented the stale generation, and the row's presentedGeneration is G.
  const match = unique ? matches[0] : null
  const pair = match ? pairRefreshes(attempt).pairs.find((p) => p.request === match.request) : null
  const row = match ? rows.find((r) => r.id === match.auditId) : null
  const G = row?.presentedGeneration ?? null
  const Y = pair?.tab ?? null
  const tP = pair?.sent?.at ?? null

  const answer = G === null ? undefined : events.find(
    (e) => e.type === 'refresh-answered' && e.status === 'ok' && e.returnedGeneration === G + 1,
  )
  if (answer) found.add('link:answer')
  const tA = answer?.at ?? null

  const timeout = answer ? events.find(
    (e) => e.type === 'token-commit' && e.outcome === 'timeout' && e.refreshId === answer.refreshId && e.tab === answer.tab,
  ) : undefined
  if (timeout) found.add('link:timeout')
  const tT = timeout?.at ?? null

  if (tA !== null && tT !== null && tP !== null && tA < tT && tT < tP) found.add('link:timeout-before-presentation')

  let noWrite = false
  if (tA !== null && tP !== null) {
    const wrote = events.some(
      (e) =>
        e.type === 'token-commit' &&
        e.outcome === 'written-both' &&
        e.at > tA &&
        e.at < tP,
    )
    const recorded = (Array.isArray(attempt?.storedChanges) ? attempt.storedChanges : []).some(
      (c) => c?.generation === G + 1 && toMs(c.t) !== null && toMs(c.t) > tA && toMs(c.t) < tP,
    )
    noWrite = !wrote && !recorded
  }
  if (noWrite) found.add('link:no-write-in-interval')

  if (tA !== null && tP !== null) {
    const staleRead = events.some(
      (e) => e.type === 'settled-read' && e.tab === Y && e.storedGeneration === G && e.at > tA && e.at < tP,
    )
    if (staleRead) found.add('link:stale-read')
  }

  if (pair && Y !== null) found.add('link:stale-presentation')

  if (row && G !== null && row.currentGeneration === G + 1 && Y !== null) found.add('link:audit')

  const complete = completeness(attempt)
  const chain = unique && row && pair
    ? {
        tab: Y,
        presentedGeneration: G,
        currentGeneration: row?.currentGeneration ?? null,
        answer: answer ?? null,
        timeout: timeout ?? null,
        presentation: pair.sent,
        request: pair.request,
        auditId: match.auditId,
        links: [...found],
      }
    : null

  if (unique && complete.complete && found.size === LINKS.length) {
    return { verdict: 'hypothesis-1-observed', missing: [], supports: [], chain }
  }

  // `replay-other-path` is for a replay the trace accounts for without any
  // timed-out commit anywhere in the round. A commit that timed out *after* the
  // stale presentation is not that: the trace saw a dropped response but cannot
  // show it caused this replay, which is what `supporting-unconfirmed` is for —
  // and it is the round whose `supports` most needs to say `commit-timeout`.
  if (unique && complete.complete && timeouts.length === 0) {
    return { verdict: 'replay-other-path', missing: [], supports: [], chain }
  }

  const missing = [...complete.failed]
  if (!unique) missing.push('ambiguous-audit-match')
  for (const link of LINKS) if (!found.has(link)) missing.push(link)

  // Support for hypothesis 1 is the timed-out commit and the links it carries:
  // with no timeout in the round there is nothing here that points at it.
  const supports = timeouts.length === 0 ? [] : ['commit-timeout', ...LINKS.filter((l) => found.has(l))]

  return { verdict: 'supporting-unconfirmed', missing, supports, chain }
}
