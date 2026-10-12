// What one round of the stall runs (#1370) is judged to have shown
// (lib/stall-evidence.mjs). No browser, no database. The rules are the
// protocol's (docs/modules/auth/REPLAY_STALL_PROTOCOL.md, "What the judge
// says"), fixed before any round ran.
//
//   node --test frontend/qa/cross-tab-session/stall-evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COVERAGE_FLOOR, OUTCOMES, judgeStallRound, roundFacts, summariseCell } from './lib/stall-evidence.mjs'
import { judgeRound } from './lib/replay-evidence.mjs'

const iso = (ms) => new Date(ms).toISOString()
const T0 = 1_000_000
const HOLD_CELL = { build: 'main', tabs: 2, holdMs: 12000, graceSeconds: 5, cpuWorkers: 0, probe: false }
const PLAIN_CELL = { build: 'main', tabs: 2, holdMs: 0, graceSeconds: 5, cpuWorkers: 0, probe: true }

const ev = (type, at, refreshId, rest = {}) => ({ type, at, refreshId, tabId: 'x', ...rest })
const trace = (tab, events) => ({ tab, flagSet: true, timeOriginAtOpen: 1000, timeOriginAtEnd: 1000, collected: true, events })
const refreshRequest = (tab, sentAt, respondedAt, status, presentedRefresh, requestId) => ({
  tab, path: '/api/auth/refresh', status, issuedAt: sentAt, sentAt, respondedAt, accessFingerprint: null, presentedRefresh, requestId,
})

// A landed round on a fixed build: X refreshes generation 7 under a hold, its
// first commit attempt times out, the second writes. Nobody presents 7 again.
function round(overrides = {}) {
  return {
    attempt: 1,
    sessionId: 'sess-1',
    openedAt: T0,
    endedAt: T0 + 120_000,
    sessionEnded: false,
    tabCount: 2,
    traces: [
      trace('X', [
        ev('refresh-sent', T0 + 10_000, 1, { presentedGeneration: 7 }),
        ev('refresh-answered', T0 + 10_400, 1, { status: 'ok', returnedGeneration: 8, ms: 400 }),
        ev('token-commit', T0 + 15_400, 1, { trigger: 'inline', attempt: 1, triggeredBy: null, outcome: 'timeout', ms: 5000 }),
        ev('token-commit', T0 + 20_400, 1, { trigger: 'inline', attempt: 2, triggeredBy: null, outcome: 'written-both', ms: 5000 }),
        ev('pending-dropped', T0 + 20_400, 1, { reason: 'written' }),
        ev('lease-release', T0 + 20_450, 1, { outcome: 'released', ms: 50 }),
      ]),
      trace('Y', []),
    ],
    sessionRequests: [refreshRequest('X', T0 + 10_100, T0 + 10_400, 200, 'fp7', 'q-1')],
    storedChanges: [
      { t: T0 - 1000, generation: 7, refreshFingerprint: 'fp7' },
      { t: T0 + 20_500, generation: 8, refreshFingerprint: 'fp8' },
    ],
    ingress: [{ requestId: 'q-1', path: '/api/auth/refresh', status: 200, completedAtMs: T0 + 10_350, requestTimeMs: 200 }],
    hold: { requestedMs: 12000, gateCapturedAt: T0 + 9_900, activeAt: T0 + 10_050, continuedAt: T0 + 10_100, releasedAt: T0 + 22_050, observedMs: 12000, refresherTab: 'X' },
    readiness: { pastStartup: 2, eligiblePeers: 1, starting: 0, storageWaiting: 0 },
    peerEvidence: [{ tab: 'Y' }],
    phases: { endedIn: 3, noSupersession: false, noRefreshAfterNudge: true, unfinishedAtCap: false, passiveRefreshSeen: false, nudge: { at: T0 + 90_000, tabs: ['Y'], path: '/profile' } },
    resetChecks: { ok: true, failed: [] },
    resourceLimit: null,
    perTab: [{ tab: 'X', data2xx: 3 }, { tab: 'Y', data2xx: 0 }],
    ...overrides,
  }
}

function rows(overrides = {}) {
  return {
    ok: true,
    since: iso(T0 - 5000),
    readAt: iso(T0 + 130_000),
    audit: [],
    refreshTokens: [
      { sessionId: 'sess-1', generation: 7, issuedAt: iso(T0 - 60_000), supersededAt: iso(T0 + 10_300), graceUntil: iso(T0 + 15_300) },
      { sessionId: 'sess-1', generation: 8, issuedAt: iso(T0 + 10_300), supersededAt: null, graceUntil: null },
    ],
    sessions: [{ id: 'sess-1', generation: 8, revokedAt: null, revokeReason: null }],
    ...overrides,
  }
}

const replayRow = (at = T0 + 40_000) => ({ id: 'a-1', createdAt: iso(at), sessionId: 'sess-1', action: 'SESSION_REPLAY_REVOKED', presentedGeneration: 7, currentGeneration: 8 })

// Y presents generation 7 again, at `sentAt`, and is answered `status`.
function withStale(sentAt, respondedAt, status, { ingressAt } = {}) {
  const r = round()
  r.traces[1] = trace('Y', [
    ev('refresh-sent', sentAt - 50, 1, { presentedGeneration: 7 }),
    ev('refresh-answered', respondedAt + 10, 1, { status: status === 200 ? 'ok' : 'rejected', returnedGeneration: status === 200 ? 8 : null, ms: respondedAt - sentAt }),
    ev('lease-release', respondedAt + 20, 1, { outcome: 'released', ms: 5 }),
  ])
  r.sessionRequests.push(refreshRequest('Y', sentAt, respondedAt, status, 'fp7', 'q-2'))
  if (ingressAt !== undefined) r.ingress.push({ requestId: 'q-2', path: '/api/auth/refresh', status, completedAtMs: ingressAt, requestTimeMs: 10 })
  return r
}

// --- outcome order ---------------------------------------------------------------

test('the outcomes, in the order they are decided', () => {
  assert.deepEqual(OUTCOMES, ['replay-confirmed', 'undetermined', 'session-ended-no-replay', 'stale-presentation', 'commit-timeout', 'clean'])
})

test('a replay row in rows that do not cover the whole round is still replay-confirmed', () => {
  const partial = rows({ audit: [replayRow()], readAt: iso(T0 + 60_000) })
  const judged = judgeStallRound(round({ sessionEnded: true }), partial, HOLD_CELL)
  assert.equal(judged.outcome, 'replay-confirmed')
  assert.equal(judged.cause, 'suspected')
  assert.equal(judged.validity.valid, false)
  assert.ok(judged.validity.reasons.includes('server-rows-partial'))
})

for (const [name, serverRows] of [['null', null], ['not ok', { ok: false }], ['malformed', { ok: true, audit: {} }]]) {
  test(`server rows that are ${name} are undetermined and unreadable`, () => {
    const judged = judgeStallRound(round(), serverRows, HOLD_CELL)
    assert.equal(judged.outcome, 'undetermined')
    assert.ok(judged.validity.reasons.includes('server-rows-unreadable'))
  })
}

test('partial rows with no replay row are undetermined, never clean', () => {
  const judged = judgeStallRound(round(), rows({ readAt: iso(T0 + 60_000) }), HOLD_CELL)
  assert.equal(judged.outcome, 'undetermined')
  assert.deepEqual(judged.validity.reasons.filter((r) => r.startsWith('server-rows')), ['server-rows-partial'])
})

test('a replay row for the session is replay-confirmed, with the earlier reading as its sub-verdict', () => {
  const r = round({ sessionEnded: true })
  const serverRows = rows({ audit: [replayRow()] })
  const judged = judgeStallRound(r, serverRows, HOLD_CELL)
  assert.equal(judged.outcome, 'replay-confirmed')
  assert.equal(judged.subVerdict, judgeRound(r, serverRows).verdict)
  // No request matches the row here, so the cause is not established.
  assert.equal(judged.subVerdict, 'supporting-unconfirmed')
  assert.equal(judged.cause, 'suspected')
})

test('a replay in a round that did not land and has an incomplete trace is still a replay', () => {
  const r = round({ sessionEnded: true, tabCount: 3 })
  r.hold.activeAt = T0 + 11_000 // after the answer
  const judged = judgeStallRound(r, rows({ audit: [replayRow()] }), HOLD_CELL)
  assert.equal(judged.outcome, 'replay-confirmed')
  assert.equal(judged.cause, 'suspected')
  assert.equal(judged.validity.valid, false)
  assert.ok(judged.validity.reasons.includes('injection-missed'))
  assert.ok(judged.validity.reasons.includes('trace-incomplete'))
})

test('a session that ended with no replay row is session-ended-no-replay, with the revoke reason', () => {
  const serverRows = rows({ sessions: [{ id: 'sess-1', generation: 8, revokedAt: iso(T0 + 50_000), revokeReason: 'logout' }] })
  const judged = judgeStallRound(round({ sessionEnded: true }), serverRows, HOLD_CELL)
  assert.equal(judged.outcome, 'session-ended-no-replay')
  assert.equal(judged.facts.revokeReason, 'logout')
  assert.equal(judgeStallRound(round({ sessionEnded: true }), rows(), HOLD_CELL).facts.revokeReason, null)
})

test('a commit timeout and nothing worse is commit-timeout', () => {
  assert.equal(judgeStallRound(round(), rows(), HOLD_CELL).outcome, 'commit-timeout')
})

test('nothing observed and a live session is clean', () => {
  const r = round({ hold: null })
  r.traces[0].events = r.traces[0].events.filter((e) => !(e.type === 'token-commit' && e.outcome === 'timeout'))
  const judged = judgeStallRound(r, rows(), PLAIN_CELL)
  assert.equal(judged.outcome, 'clean')
  assert.equal(judged.validity.valid, true)
})

test('a replay-confirmed round still lists its commit timeouts and stale presentations', () => {
  const r = withStale(T0 + 30_000, T0 + 30_200, 401, { ingressAt: T0 + 30_150 })
  r.sessionEnded = true
  const judged = judgeStallRound(r, rows({ audit: [replayRow(T0 + 30_100)] }), HOLD_CELL)
  assert.equal(judged.outcome, 'replay-confirmed')
  assert.equal(judged.facts.commitAttempts.filter((a) => a.outcome === 'timeout').length, 1)
  assert.equal(judged.facts.stalePresentations.length, 1)
  assert.equal(judged.facts.stalePresentations[0].kind, 'outside-grace')
})

// --- stale presentations: arrival is an interval -----------------------------------

test('a presentation wholly inside the grace, answered 200, is inside-grace and accepted', () => {
  const judged = judgeStallRound(withStale(T0 + 12_000, T0 + 12_400, 200, { ingressAt: T0 + 12_300 }), rows(), HOLD_CELL)
  assert.equal(judged.outcome, 'stale-presentation')
  const [stale] = judged.facts.stalePresentations
  assert.equal(stale.tab, 'Y')
  assert.equal(stale.kind, 'inside-grace')
  assert.equal(stale.accepted, true)
  assert.deepEqual(stale.arrival, { earliestMs: T0 + 12_000, latestMs: T0 + 12_300, source: 'ingress' })
  assert.deepEqual(stale.offsetFromSupersessionMs, { min: 1700, max: 2000 })
  assert.deepEqual(stale.marginToGraceMs, { min: 3000, max: 3300 })
  assert.deepEqual(stale.flags, [])
})

test('without a correlated ingress line the interval ends at the browser\'s receipt, and says so', () => {
  const [stale] = judgeStallRound(withStale(T0 + 12_000, T0 + 12_400, 200), rows(), HOLD_CELL).facts.stalePresentations
  assert.deepEqual(stale.arrival, { earliestMs: T0 + 12_000, latestMs: T0 + 12_400, source: 'browser-only' })
})

test('a presentation wholly outside the grace with no replay row is kept and flagged', () => {
  const judged = judgeStallRound(withStale(T0 + 30_000, T0 + 30_200, 200, { ingressAt: T0 + 30_150 }), rows(), HOLD_CELL)
  assert.equal(judged.outcome, 'stale-presentation')
  assert.equal(judged.facts.stalePresentations[0].kind, 'outside-grace-no-replay-row')
  assert.ok(judged.facts.stalePresentations[0].marginToGraceMs.max < 0)
})

test('an interval that straddles the end of the grace is boundary-uncertain', () => {
  const [stale] = judgeStallRound(withStale(T0 + 15_000, T0 + 15_600, 200), rows(), HOLD_CELL).facts.stalePresentations
  assert.equal(stale.kind, 'boundary-uncertain')
  assert.deepEqual(stale.marginToGraceMs, { min: -300, max: 300 })
})

test('a second request whose interval contains the supersession itself is boundary-uncertain, and the superseding one is not stale', () => {
  const judged = judgeStallRound(withStale(T0 + 10_200, T0 + 10_500, 200), rows(), HOLD_CELL)
  assert.deepEqual(judged.facts.stalePresentations.map((s) => [s.tab, s.kind]), [['Y', 'boundary-uncertain']])
})

test('acceptance is read from the answer: inside the grace and refused is flagged, not accepted', () => {
  const [stale] = judgeStallRound(withStale(T0 + 12_000, T0 + 12_400, 401, { ingressAt: T0 + 12_300 }), rows(), HOLD_CELL).facts.stalePresentations
  assert.equal(stale.kind, 'inside-grace')
  assert.equal(stale.accepted, false)
  assert.deepEqual(stale.flags, ['inside-grace-not-accepted'])
})

// --- landing ---------------------------------------------------------------------

test('landed: the hold was active before the answer and the first attempt timed out; both attempts are listed', () => {
  const facts = roundFacts(round(), rows())
  assert.equal(facts.injection.landed, true)
  assert.equal(facts.injection.activeBeforeAnswer, true)
  assert.deepEqual(facts.commitAttempts.map((a) => [a.attempt, a.trigger, a.outcome, a.ms]), [[1, 'inline', 'timeout', 5000], [2, 'inline', 'written-both', 5000]])
})

test('a hold that became active after the answer has not landed', () => {
  const r = round()
  r.hold.activeAt = T0 + 10_500
  assert.equal(roundFacts(r, rows()).injection.landed, false)
})

test('a first attempt that wrote has not landed', () => {
  const r = round()
  r.traces[0].events[2].outcome = 'written-both'
  assert.equal(roundFacts(r, rows()).injection.landed, false)
})

// --- validity ----------------------------------------------------------------------

for (const [reason, mutate] of [
  ['trace-incomplete', (r) => { r.tabCount = 3 }],
  ['reset-failed', (r) => { r.resetChecks = { ok: false, failed: ['store-not-free'] } }],
  ['resource-limit', (r) => { r.resourceLimit = 'page crashed: t17' }],
  ['unfinished-at-cap', (r) => { r.phases.unfinishedAtCap = true }],
  ['injection-missed', (r) => { r.hold.activeAt = T0 + 10_500 }],
]) {
  test(`${reason} makes a round not valid for its condition, and keeps its outcome`, () => {
    const r = round()
    mutate(r)
    const judged = judgeStallRound(r, rows(), HOLD_CELL)
    assert.equal(judged.validity.valid, false)
    assert.deepEqual(judged.validity.reasons, [reason])
    assert.equal(judged.outcome, 'commit-timeout')
    assert.equal(judged.coverage, null)
  })
}

test('a cell without a hold never gets injection-missed', () => {
  const judged = judgeStallRound(round({ hold: null }), rows(), PLAIN_CELL)
  assert.equal(judged.validity.valid, true)
  assert.equal(judged.coverage, null)
})

// --- coverage ----------------------------------------------------------------------

test('a valid landed round with an eligible peer is replay-coverage; with none, timeout-path-only', () => {
  assert.equal(judgeStallRound(round(), rows(), HOLD_CELL).coverage, 'replay-coverage')
  const alone = round({ readiness: { pastStartup: 1, eligiblePeers: 0, starting: 1, storageWaiting: 0 } })
  assert.equal(judgeStallRound(alone, rows(), HOLD_CELL).coverage, 'timeout-path-only')
})

// --- the later refresh -------------------------------------------------------------

test('no refresh in the passive phase reads no-opportunity-observed, and the nudge is reported with its tabs', () => {
  assert.deepEqual(roundFacts(round(), rows()).laterRefresh, {
    passive: 'no-opportunity-observed', nudged: true, nudgedTabs: ['Y'], afterNudge: 'no-refresh-after-nudge',
  })
})

test('a refresh in the passive phase means no nudge', () => {
  const r = round()
  r.phases = { ...r.phases, endedIn: 2, passiveRefreshSeen: true, noRefreshAfterNudge: false, nudge: null }
  assert.deepEqual(roundFacts(r, rows()).laterRefresh, { passive: 'refresh-observed', nudged: false, nudgedTabs: [], afterNudge: null })
})

test('a round that ended before the passive phase says so', () => {
  const r = round()
  r.phases = { ...r.phases, endedIn: 1, nudge: null, noRefreshAfterNudge: false }
  assert.equal(roundFacts(r, rows()).laterRefresh.passive, 'not-reached')
})

// --- the cell ------------------------------------------------------------------------

const judgedRounds = (n, make) => Array.from({ length: n }, (_, i) => judgeStallRound(make(i), rows(), HOLD_CELL))
const missed = () => { const r = round(); r.hold.activeAt = T0 + 10_500; return r }
const noPeer = () => round({ readiness: { pastStartup: 1, eligiblePeers: 0, starting: 1, storageWaiting: 0 } })

test('ten landed rounds without an eligible peer are timeout coverage and no replay coverage', () => {
  const summary = summariseCell(judgedRounds(10, noPeer), HOLD_CELL)
  assert.equal(COVERAGE_FLOOR, 8)
  assert.equal(summary.rounds, 10)
  assert.equal(summary.timeoutCoverage, 10)
  assert.equal(summary.replayCoverage, 0)
  assert.equal(summary.replayCoverageFloorMet, false)
  assert.equal(summary.coverageComplete, false)
})

test('eight replay-coverage rounds and two misses meet the floor', () => {
  const summary = summariseCell(judgedRounds(10, (i) => (i < 8 ? round() : missed())), HOLD_CELL)
  assert.equal(summary.replayCoverage, 8)
  assert.equal(summary.valid, 8)
  assert.equal(summary.landed, 8)
  assert.equal(summary.invalidReasons['injection-missed'], 2)
  assert.equal(summary.replayCoverageFloorMet, true)
  assert.equal(summary.coverageComplete, true)
  assert.deepEqual(summary.outcomes, { 'commit-timeout': 10 })
})

test('a cell without a hold needs eight valid rounds', () => {
  const make = (i) => judgeStallRound(round({ hold: null, resourceLimit: i < 3 ? 'browser closed' : null }), rows(), PLAIN_CELL)
  const summary = summariseCell(Array.from({ length: 10 }, (_, i) => make(i)), PLAIN_CELL)
  assert.equal(summary.valid, 7)
  assert.equal(summary.replayCoverageFloorMet, null)
  assert.equal(summary.coverageComplete, false)
})

test('a replay in an invalid round is reported apart from the counts', () => {
  const bad = missed()
  bad.sessionEnded = true
  const judged = [judgeStallRound(bad, rows({ audit: [replayRow()] }), HOLD_CELL), ...judgedRounds(9, round)]
  const summary = summariseCell(judged, HOLD_CELL)
  assert.deepEqual(summary.replaysOutsideCounts, [1])
  assert.equal(summary.replayCoverage, 9)
})

// --- judge-stall.mjs: the command over the module ----------------------------------
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function judgeCli(diagnosis, serverRows) {
  const dir = mkdtempSync(join(tmpdir(), 'judge-stall-'))
  const diagnosisPath = join(dir, 'stall-diagnosis.json')
  writeFileSync(diagnosisPath, JSON.stringify(diagnosis))
  const args = [fileURLToPath(new URL('./judge-stall.mjs', import.meta.url)), diagnosisPath]
  if (serverRows !== undefined) {
    writeFileSync(join(dir, 'server-rows.json'), typeof serverRows === 'string' ? serverRows : JSON.stringify(serverRows))
    args.push(join(dir, 'server-rows.json'))
  }
  const run = spawnSync(process.execPath, args, { encoding: 'utf8' })
  let verdicts = null
  try { verdicts = JSON.parse(readFileSync(join(dir, 'stall-verdicts.json'), 'utf8')) } catch { verdicts = null }
  return { run, verdicts }
}

const diagnosisOf = (rounds) => ({ kind: 'recorded', cell: 'H12', settings: HOLD_CELL, mechanism: { gate: true }, commit: 'abc', servedBuild: 'abc', rounds })

test('judge-stall.mjs prints one line per round and the cell, and writes the verdicts beside the diagnosis', () => {
  const { run, verdicts } = judgeCli(diagnosisOf([round(), { ...missed(), attempt: 2 }]), rows())
  assert.equal(run.status, 0, run.stderr)
  assert.match(run.stdout, /round 1: commit-timeout; valid; replay-coverage/)
  assert.match(run.stdout, /round 2: commit-timeout; not valid \(injection-missed\)/)
  assert.match(run.stdout, /cell H12 \(recorded\): 2 rounds; valid 1; landed 1; replay coverage 1 of 8 needed: NOT met; timeout coverage 1/)
  assert.equal(verdicts.cell, 'H12')
  assert.equal(verdicts.kind, 'recorded')
  assert.equal(verdicts.serverRowsRead, true)
  assert.equal(verdicts.rounds.length, 2)
  assert.equal(verdicts.summary.replayCoverageFloorMet, false)
})

test('judge-stall.mjs with no rows file, or one that is not JSON, judges every round undetermined', () => {
  for (const serverRows of [undefined, 'not json']) {
    const { run, verdicts } = judgeCli(diagnosisOf([round()]), serverRows)
    assert.equal(run.status, 0, run.stderr)
    assert.equal(verdicts.serverRowsRead, false)
    assert.equal(verdicts.rounds[0].outcome, 'undetermined')
  }
})

test('judge-stall.mjs puts a replay first in what it prints', () => {
  const bad = { ...round({ sessionEnded: true }) }
  const { run } = judgeCli(diagnosisOf([bad]), rows({ audit: [replayRow()] }))
  assert.match(run.stdout.split('\n')[0], /^REPLAY CONFIRMED in round\(s\) 1/)
})

// --- found by the whole-branch review, before any round ran -----------------------

test('a round that died before its own records were read is undetermined, never clean', () => {
  const dead = round({ sessionEnded: null, traces: [], sessionRequests: [], hold: null, error: 'Error: the browser closed during the round' })
  const judged = judgeStallRound(dead, rows(), PLAIN_CELL)
  assert.equal(judged.outcome, 'undetermined')
  assert.equal(judged.facts.sessionAlive, null)
  assert.equal(judged.validity.valid, false)
  assert.ok(judged.validity.reasons.includes('round-not-collected'))
})

test('a refresh that reached the wire before the hold could be armed means the round has not landed', () => {
  const r = round({ uncapturedRefresh: [{ tab: 'Y', issuedAt: T0 + 5_000 }] })
  const judged = judgeStallRound(r, rows(), HOLD_CELL)
  assert.equal(judged.facts.injection.landed, false)
  assert.deepEqual(judged.facts.injection.uncapturedRefresh, [{ tab: 'Y', issuedAt: T0 + 5_000 }])
  assert.ok(judged.validity.reasons.includes('injection-missed'))
})

test('the outcomes of valid rounds are counted apart from all rounds', () => {
  const summary = summariseCell(judgedRounds(10, (i) => (i < 8 ? round() : missed())), HOLD_CELL)
  assert.deepEqual(summary.validOutcomes, { 'commit-timeout': 8 })
})

test('operations left open when the round ended are a recorded fact', () => {
  const r = round()
  r.phases.operationsOpenAtEnd = 1
  assert.equal(roundFacts(r, rows()).observation.operationsOpenAtEnd, 1)
})

// --- found by the smoke round (2026-10-12), before calibration ---------------------
// The server writes supersededAt and graceUntil to the whole second, so each is
// known only to within a second. The smoke round's superseding request arrived
// 250 ms after the second its supersession was written as, and was listed as a
// stale presentation of the generation it had itself superseded.

test('the request that superseded the generation is not stale when the server rounded its time down', () => {
  const r = round()
  r.ingress[0].completedAtMs = T0 + 10_650 // arrived after 10_300, which stands for [10_300, 11_300)
  r.sessionRequests[0].sentAt = T0 + 10_500
  r.sessionRequests[0].respondedAt = T0 + 10_700
  r.traces[0].events[0].at = T0 + 10_450
  r.traces[0].events[1].at = T0 + 10_750
  assert.deepEqual(judgeStallRound(r, rows(), HOLD_CELL).facts.stalePresentations, [])
})

test('a presentation within a second of the end of the grace is boundary-uncertain, either side', () => {
  // graceUntil is written as T0+15_300 and stands for any instant in [15_300, 16_300).
  for (const sentAt of [T0 + 15_400, T0 + 16_100]) {
    const [stale] = judgeStallRound(withStale(sentAt, sentAt + 100, 200), rows(), HOLD_CELL).facts.stalePresentations
    assert.equal(stale.kind, 'boundary-uncertain', `sent at +${sentAt - T0}`)
  }
  const [inside] = judgeStallRound(withStale(T0 + 15_000, T0 + 15_200, 200), rows(), HOLD_CELL).facts.stalePresentations
  assert.equal(inside.kind, 'inside-grace')
  const [outside] = judgeStallRound(withStale(T0 + 16_300, T0 + 16_400, 200), rows(), HOLD_CELL).facts.stalePresentations
  assert.equal(outside.kind, 'outside-grace-no-replay-row')
})

// A replay on the fixed build is not the dropped response of #1358: the smoke
// round's response was still held pending when another tab presented the old
// token. And it came after the harness's nudge. Both are facts of the round.

test('a replay says which phase it came in, and whether a tab had nudged it', () => {
  const r = withStale(T0 + 95_000, T0 + 95_200, 401, { ingressAt: T0 + 95_150 })
  r.sessionEnded = true
  // The fixed build: both inline attempts timed out and the response is held.
  r.traces[0].events[3].outcome = 'timeout'
  r.traces[0].events.splice(4, 2, ev('lease-release', T0 + 20_400, 1, { outcome: 'skipped-pending', ms: 0 }))
  r.phases = { ...r.phases, phase2StartedAt: T0 + 25_000, nudge: { at: T0 + 90_000, tabs: ['Y'], path: '/inventory/products' } }
  const provoked = judgeStallRound(r, rows({ audit: [replayRow(T0 + 95_100)] }), HOLD_CELL)
  assert.deepEqual(provoked.facts.replayContext, { phase: 'after-nudge', provoked: true, presentingTabNudged: true, refreshedResponse: 'held-pending' })
  const passiveRow = judgeStallRound(r, rows({ audit: [replayRow(T0 + 40_000)] }), HOLD_CELL)
  assert.equal(passiveRow.facts.replayContext.phase, 'passive')
  assert.equal(passiveRow.facts.replayContext.provoked, false)
  const early = judgeStallRound(r, rows({ audit: [replayRow(T0 + 20_000)] }), HOLD_CELL)
  assert.equal(early.facts.replayContext.phase, 'through-grace')
})

test('what had become of the refreshed response when the replay came: held pending, dropped, or written', () => {
  const at = T0 + 40_000
  const make = (mutate) => {
    const r = round({ sessionEnded: true })
    mutate(r.traces[0].events)
    return judgeStallRound(r, rows({ audit: [replayRow(at)] }), HOLD_CELL).facts.replayContext.refreshedResponse
  }
  // The control: one attempt, timed out, nothing kept.
  assert.equal(make((events) => { events.splice(3, 2); events[3] = ev('lease-release', T0 + 15_450, 1, { outcome: 'failed', ms: 5000 }) }), 'dropped')
  // The fixed build: both inline attempts timed out and the entry is still held.
  assert.equal(make((events) => { events[3].outcome = 'timeout'; events.splice(4, 2, ev('lease-release', T0 + 20_400, 1, { outcome: 'skipped-pending', ms: 0 })) }), 'held-pending')
  // Written before the replay: the replay is not about this response at all.
  assert.equal(make(() => {}), 'written')
  assert.equal(judgeStallRound(round(), rows(), HOLD_CELL).facts.replayContext, null)
})

// Found by re-judging the smoke round in place: the judge overwrote the
// verdicts stall-cell.sh had filed beside the diagnosis.
test('judge-stall.mjs does not overwrite verdicts that are already there; --out names another file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'judge-stall-'))
  const diagnosisPath = join(dir, 'stall-diagnosis.json')
  const rowsPath = join(dir, 'server-rows.json')
  writeFileSync(diagnosisPath, JSON.stringify(diagnosisOf([round()])))
  writeFileSync(rowsPath, JSON.stringify(rows()))
  const script = fileURLToPath(new URL('./judge-stall.mjs', import.meta.url))
  writeFileSync(join(dir, 'stall-verdicts.json'), 'the filed verdicts')
  const again = spawnSync(process.execPath, [script, diagnosisPath, rowsPath], { encoding: 'utf8' })
  assert.equal(again.status, 2)
  assert.match(again.stderr, /already exists/)
  assert.equal(readFileSync(join(dir, 'stall-verdicts.json'), 'utf8'), 'the filed verdicts')
  const elsewhere = spawnSync(process.execPath, [script, diagnosisPath, rowsPath, '--out', join(dir, 'rejudged.json')], { encoding: 'utf8' })
  assert.equal(elsewhere.status, 0, elsewhere.stderr)
  assert.equal(JSON.parse(readFileSync(join(dir, 'rejudged.json'), 'utf8')).rounds.length, 1)
  assert.equal(readFileSync(join(dir, 'stall-verdicts.json'), 'utf8'), 'the filed verdicts')
})
