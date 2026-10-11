// What one round of the stall runs (#1370) is judged to have shown. Pure: it
// joins the records a round leaves behind and reads nothing.
//
// The rules are the protocol's (docs/modules/auth/REPLAY_STALL_PROTOCOL.md,
// "What the judge says"), fixed before any round ran. Three things are kept
// apart on purpose:
//
//   - the outcome, which says what was observed;
//   - validity, which says whether the round counts toward its cell;
//   - coverage, which says what a valid round can support a statement about.
//
// A server-confirmed replay is a replay whatever the round's validity, and a
// commit timeout is never a replay. The cause reading of a replay is the one
// lib/replay-evidence.mjs already makes; this module does not redo it.
import { completeness, judgeRound, pairRefreshes, roundAudit, serverRowsUsable } from './replay-evidence.mjs'

export const OUTCOMES = ['replay-confirmed', 'undetermined', 'session-ended-no-replay', 'stale-presentation', 'commit-timeout', 'clean']
export const COVERAGE_FLOOR = 8

// Rows that were read but whose interval does not span the round: what they
// hold is real, what they lack proves nothing.
const PARTIAL = new Set(['server-rows-since-after-round-opened', 'server-rows-read-before-round-ended'])

const toMs = (value) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

const tracesOf = (round) => (Array.isArray(round?.traces) ? round.traces : [])

function eventsOf(round) {
  const out = []
  for (const trace of tracesOf(round)) {
    for (const event of Array.isArray(trace?.events) ? trace.events : []) out.push({ ...event, tab: trace.tab })
  }
  return out
}

/** `usable`, `partial` (read, but not spanning the round) or `unreadable`. */
export function serverRowsCoverage(round, serverRows) {
  const usable = serverRowsUsable(round, serverRows)
  if (usable.usable) return { coverage: 'usable', reason: null }
  return { coverage: PARTIAL.has(usable.reason) ? 'partial' : 'unreadable', reason: usable.reason }
}

// When the server saw a request is an interval: it cannot have arrived before
// the browser sent it, nor after the ingress finished with it (or, when no
// ingress line can be tied to it, after the browser had its answer).
function arrivalOf(round, request) {
  const lines = Array.isArray(round?.ingress) ? round.ingress : []
  const line = typeof request.requestId === 'string' ? lines.find((l) => l?.requestId === request.requestId) : undefined
  if (line && typeof line.completedAtMs === 'number') {
    return { earliestMs: request.sentAt, latestMs: Math.max(request.sentAt, line.completedAtMs), source: 'ingress' }
  }
  return { earliestMs: request.sentAt, latestMs: request.respondedAt ?? request.sentAt, source: 'browser-only' }
}

function stalePresentations(round, serverRows, hasReplayRow) {
  const tokens = Array.isArray(serverRows?.refreshTokens) ? serverRows.refreshTokens : []
  const out = []
  const byGeneration = new Map()
  for (const pair of pairRefreshes(round).pairs) {
    const generation = pair.sent.presentedGeneration
    if (!byGeneration.has(generation)) byGeneration.set(generation, [])
    byGeneration.get(generation).push(pair)
  }
  for (const [generation, pairs] of byGeneration) {
    const row = tokens.find((t) => t?.sessionId === round.sessionId && t.generation === generation)
    const supersededAt = toMs(row?.supersededAt)
    if (supersededAt === null) continue
    const graceUntil = toMs(row.graceUntil)
    const withArrival = pairs.map((pair) => ({ pair, arrival: arrivalOf(round, pair.request) }))
    const contains = ({ arrival }) => arrival.earliestMs <= supersededAt && supersededAt <= arrival.latestMs
    // The request that superseded the generation is not a presentation of a
    // superseded one: the earliest-answered accepted request whose interval
    // holds the supersession.
    const superseder = withArrival
      .filter((c) => contains(c) && c.pair.request.status >= 200 && c.pair.request.status < 300)
      .sort((a, b) => (a.pair.request.respondedAt ?? 0) - (b.pair.request.respondedAt ?? 0))[0]
    for (const candidate of withArrival) {
      if (candidate === superseder) continue
      const { pair, arrival } = candidate
      if (arrival.latestMs < supersededAt) continue // presented while still current
      const margin = graceUntil === null ? null : { min: graceUntil - arrival.latestMs, max: graceUntil - arrival.earliestMs }
      let kind = 'boundary-uncertain'
      if (!contains(candidate) && margin !== null) {
        if (margin.min >= 0) kind = 'inside-grace'
        else if (margin.max < 0) kind = hasReplayRow ? 'outside-grace' : 'outside-grace-no-replay-row'
      }
      const accepted = pair.request.status >= 200 && pair.request.status < 300
      out.push({
        tab: pair.tab,
        refreshId: pair.refreshId,
        presentedGeneration: generation,
        status: pair.request.status,
        accepted,
        arrival,
        offsetFromSupersessionMs: { min: arrival.earliestMs - supersededAt, max: arrival.latestMs - supersededAt },
        marginToGraceMs: margin,
        kind,
        flags: kind === 'inside-grace' && !accepted ? ['inside-grace-not-accepted'] : [],
      })
    }
  }
  return out.sort((a, b) => a.arrival.earliestMs - b.arrival.earliestMs)
}

function injectionOf(round, events) {
  const hold = round?.hold ?? null
  if (!hold) return { hold: null, activeBeforeAnswer: null, landed: null, refreshId: null }
  // The refresh the hold was aimed at: the refresher tab's first.
  const sent = events.filter((e) => e.type === 'refresh-sent' && e.tab === hold.refresherTab).sort((a, b) => a.at - b.at)[0]
  const answered = sent ? events.find((e) => e.type === 'refresh-answered' && e.tab === sent.tab && e.refreshId === sent.refreshId) : undefined
  const first = sent ? events.find((e) => e.type === 'token-commit' && e.tab === sent.tab && e.refreshId === sent.refreshId && e.attempt === 1) : undefined
  const activeBeforeAnswer = typeof hold.activeAt === 'number' && answered !== undefined && hold.activeAt < answered.at
  // A refresh that left a tab before the holds were armed went unseen: the
  // hold was not aimed at the round's first refresh after all.
  const uncapturedRefresh = Array.isArray(round.uncapturedRefresh) ? round.uncapturedRefresh : []
  return {
    hold,
    activeBeforeAnswer,
    uncapturedRefresh,
    landed: activeBeforeAnswer && first?.outcome === 'timeout' && uncapturedRefresh.length === 0,
    refreshId: sent?.refreshId ?? null,
  }
}

function laterRefreshOf(phases) {
  const nudge = phases?.nudge ?? null
  let passive = 'not-reached'
  if (phases?.passiveRefreshSeen === true) passive = 'refresh-observed'
  else if (typeof phases?.endedIn === 'number' && phases.endedIn >= 2) passive = 'no-opportunity-observed'
  return {
    passive,
    nudged: nudge !== null,
    nudgedTabs: nudge?.tabs ?? [],
    afterNudge: nudge === null ? null : phases.noRefreshAfterNudge === true ? 'no-refresh-after-nudge' : 'refresh-observed',
  }
}

/** Everything a round is recorded to have shown, each fact on its own. */
export function roundFacts(round, serverRows) {
  const events = eventsOf(round)
  const replayRows = roundAudit(round, serverRows)
  const injection = injectionOf(round, events)
  const refresher = round?.hold?.refresherTab
  const commitAttempts = events
    .filter((e) => e.type === 'token-commit' && (injection.refreshId === null || (e.tab === refresher && e.refreshId === injection.refreshId)))
    .sort((a, b) => a.at - b.at)
    .map((e) => ({ tab: e.tab, refreshId: e.refreshId, attempt: e.attempt, trigger: e.trigger, outcome: e.outcome, ms: e.ms, at: e.at }))
  const session = (Array.isArray(serverRows?.sessions) ? serverRows.sessions : []).find((s) => s?.id === round?.sessionId)
  const phases = round?.phases ?? null
  return {
    injection,
    readiness: round?.readiness ?? null,
    peerEvidence: round?.peerEvidence ?? null,
    commitAttempts,
    commitTimeouts: events.filter((e) => e.type === 'token-commit' && e.outcome === 'timeout').length,
    laterRefresh: laterRefreshOf(phases),
    stalePresentations: stalePresentations(round, serverRows, replayRows.length > 0),
    replay: replayRows,
    // null when the round ended before the stored record was read at its end.
    sessionAlive: round?.sessionEnded === true ? false : round?.sessionEnded === false ? true : null,
    revokeReason: session?.revokeReason ?? null,
    tabsWithData: (Array.isArray(round?.perTab) ? round.perTab : []).filter((t) => t?.data2xx > 0).length,
    observation: {
      endedIn: phases?.endedIn ?? null,
      noSupersession: phases?.noSupersession === true,
      noRefreshAfterNudge: phases?.noRefreshAfterNudge === true,
      unfinishedAtCap: phases?.unfinishedAtCap === true,
      operationsOpenAtEnd: phases?.operationsOpenAtEnd ?? 0,
    },
  }
}

/** One round: its outcome, its validity for the cell, and what it covers. */
export function judgeStallRound(round, serverRows, cell) {
  const facts = roundFacts(round, serverRows)
  const rows = serverRowsCoverage(round, serverRows)
  const holdCell = cell.holdMs > 0

  const reasons = []
  if (rows.coverage === 'unreadable') reasons.push('server-rows-unreadable')
  if (rows.coverage === 'partial') reasons.push('server-rows-partial')
  if (facts.sessionAlive === null) reasons.push('round-not-collected')
  if (!completeness(round).complete) reasons.push('trace-incomplete')
  if (round?.resetChecks?.ok === false) reasons.push('reset-failed')
  if (round?.resourceLimit) reasons.push('resource-limit')
  if (facts.observation.unfinishedAtCap) reasons.push('unfinished-at-cap')
  if (holdCell && facts.injection.landed !== true) reasons.push('injection-missed')
  const validity = { valid: reasons.length === 0, reasons }

  let outcome
  let subVerdict = null
  let cause = null
  let missing = []
  let supports = []
  if (facts.replay.length > 0) {
    outcome = 'replay-confirmed'
    // The cause reading needs rows that span the round; a replay found in
    // partial rows is confirmed and its cause is not read at all.
    const reading = rows.coverage === 'usable'
      ? judgeRound(round, serverRows)
      : { verdict: 'supporting-unconfirmed', missing: [rows.reason], supports: [] }
    subVerdict = reading.verdict
    missing = reading.missing
    supports = reading.supports
    const established = subVerdict === 'hypothesis-1-observed' || subVerdict === 'replay-other-path'
    cause = established && validity.valid ? 'demonstrated' : 'suspected'
  } else if (rows.coverage !== 'usable' || facts.sessionAlive === null) {
    // No replay row was found, and either the server rows do not span the
    // round or the round died before its own records were read.
    outcome = 'undetermined'
  } else if (!facts.sessionAlive) {
    outcome = 'session-ended-no-replay'
  } else if (facts.stalePresentations.length > 0) {
    outcome = 'stale-presentation'
  } else if (facts.commitTimeouts > 0) {
    outcome = 'commit-timeout'
  } else {
    outcome = 'clean'
  }

  let coverage = null
  if (holdCell && validity.valid) coverage = (facts.readiness?.eligiblePeers ?? 0) >= 1 ? 'replay-coverage' : 'timeout-path-only'

  return { attempt: round?.attempt ?? null, outcome, subVerdict, cause, missing, supports, facts, validity, coverage, serverRows: rows }
}

/** A cell's ten rounds, counted the way the protocol reports them. */
export function summariseCell(judgedRounds, cell) {
  const holdCell = cell.holdMs > 0
  const outcomes = {}
  const invalidReasons = {}
  for (const round of judgedRounds) {
    outcomes[round.outcome] = (outcomes[round.outcome] ?? 0) + 1
    for (const reason of round.validity.reasons) invalidReasons[reason] = (invalidReasons[reason] ?? 0) + 1
  }
  const valid = judgedRounds.filter((r) => r.validity.valid).length
  const validOutcomes = {}
  for (const round of judgedRounds.filter((r) => r.validity.valid)) validOutcomes[round.outcome] = (validOutcomes[round.outcome] ?? 0) + 1
  const replayCoverage = judgedRounds.filter((r) => r.coverage === 'replay-coverage').length
  const timeoutCoverage = judgedRounds.filter((r) => r.coverage !== null).length
  const replayCoverageFloorMet = holdCell ? replayCoverage >= COVERAGE_FLOOR : null
  return {
    rounds: judgedRounds.length,
    outcomes,
    validOutcomes,
    valid,
    invalidReasons,
    landed: holdCell ? judgedRounds.filter((r) => r.facts.injection.landed === true).length : null,
    replayCoverage: holdCell ? replayCoverage : null,
    timeoutCoverage: holdCell ? timeoutCoverage : null,
    replayCoverageFloorMet,
    coverageComplete: holdCell ? replayCoverageFloorMet : valid >= COVERAGE_FLOOR,
    // A replay is reported whatever its round's validity; these are the ones
    // the counts above do not include.
    replaysOutsideCounts: judgedRounds.filter((r) => r.outcome === 'replay-confirmed' && !r.validity.valid).map((r) => r.attempt),
  }
}
