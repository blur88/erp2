// What a recorded replay round is judged to have shown (lib/replay-evidence.mjs).
// No browser, no database: the three records a round leaves behind — the trace
// each tab collected, the request record the harness wrote, and the server rows
// read afterwards — joined into one verdict.
//
//   node --test frontend/qa/cross-tab-session/replay-evidence.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judgeRound, completeness, TRACE_CAP } from './lib/replay-evidence.mjs'

const iso = (ms) => new Date(ms).toISOString()

// One complete hypothesis-1 round: tab X's 200 returns generation 8, its commit
// times out, and tab Y presents the superseded generation 7 and is answered 401.
function round(overrides = {}) {
  const base = {
    attempt: 1,
    sessionId: 'sess-qa-1',
    openedAt: 1_000_000,
    endedAt: 1_060_000,
    sessionEnded: false,
    tabCount: 2,
    filler: { type: 'settled-read', storedGeneration: 999, memoryGeneration: 999, result: 'proceed', ms: 0 },
    traces: [
      {
        tab: 'X',
        flagSet: true,
        timeOriginAtOpen: 1000,
        timeOriginAtEnd: 1000,
        collected: true,
        events: [
          { type: 'settled-read', storedGeneration: 7, memoryGeneration: 7, result: 'proceed', ms: 5, tabId: 'rt-x', at: 1_005_000, refreshId: 1 },
          { type: 'lease-acquire', acquired: true, expiresAt: 1_025_000, ms: 3, tabId: 'rt-x', at: 1_005_100, refreshId: 1 },
          { type: 'settled-read', storedGeneration: 7, memoryGeneration: 7, result: 'proceed', ms: 4, tabId: 'rt-x', at: 1_005_200, refreshId: 1 },
          { type: 'refresh-sent', presentedGeneration: 7, tabId: 'rt-x', at: 1_010_000, refreshId: 1 },
          { type: 'refresh-answered', status: 'ok', returnedGeneration: 8, ms: 400, tabId: 'rt-x', at: 1_010_400, refreshId: 1 },
          { type: 'token-commit', trigger: 'inline', attempt: 1, triggeredBy: null, outcome: 'timeout', ms: 5000, tabId: 'rt-x', at: 1_010_500, refreshId: 1 },
        ],
      },
      {
        tab: 'Y',
        flagSet: true,
        timeOriginAtOpen: 2000,
        timeOriginAtEnd: 2000,
        collected: true,
        events: [
          { type: 'settled-read', storedGeneration: 7, memoryGeneration: 7, result: 'proceed', ms: 900, tabId: 'rt-y', at: 1_020_000, refreshId: 1 },
          { type: 'refresh-sent', presentedGeneration: 7, tabId: 'rt-y', at: 1_030_000, refreshId: 1 },
          { type: 'refresh-answered', status: 'rejected', returnedGeneration: null, ms: 400, tabId: 'rt-y', at: 1_030_400, refreshId: 1 },
        ],
      },
    ],
    sessionRequests: [
      { tab: 'X', path: '/api/auth/me', status: 200, issuedAt: 1_005_000, sentAt: 1_005_010, respondedAt: 1_005_090, accessFingerprint: 'fa-7', presentedRefresh: null },
      { tab: 'X', path: '/api/auth/refresh', status: 200, issuedAt: 1_010_000, sentAt: 1_010_050, respondedAt: 1_010_400, accessFingerprint: 'fa-7', presentedRefresh: 'fp-7' },
      { tab: 'Y', path: '/api/auth/refresh', status: 401, issuedAt: 1_030_000, sentAt: 1_030_050, respondedAt: 1_030_400, accessFingerprint: 'fa-7', presentedRefresh: 'fp-7' },
    ],
    storedChanges: [
      { t: 1_004_000, generation: 7, accessFingerprint: 'fa-7', refreshFingerprint: 'fp-7', accessTokenExpiresAt: 1_020_000, lease: null },
      { t: 1_010_600, generation: 7, accessFingerprint: 'fa-7', refreshFingerprint: 'fp-7', accessTokenExpiresAt: 1_020_000, lease: null },
      { t: 1_035_000, generation: 7, accessFingerprint: 'fa-7', refreshFingerprint: 'fp-7', accessTokenExpiresAt: 1_020_000, lease: null },
    ],
  }
  return Object.assign(base, overrides)
}

// The server rows a read of one round's session returns.
function rows(overrides = {}) {
  const base = {
    ok: true,
    since: iso(999_000),
    readAt: iso(1_060_500),
    audit: [
      {
        id: 'audit-1',
        createdAt: iso(1_030_200),
        sessionId: 'sess-qa-1',
        presentedGeneration: 7,
        currentGeneration: 8,
      },
    ],
    refreshTokens: [
      { sessionId: 'sess-qa-1', generation: 7, issuedAt: iso(1_000_000), supersededAt: iso(1_010_000), graceUntil: iso(1_015_000) },
      { sessionId: 'sess-qa-1', generation: 8, issuedAt: iso(1_010_000), supersededAt: null, graceUntil: null },
    ],
    sessions: [{ id: 'sess-qa-1', revokedAt: iso(1_030_200), revokeReason: 'replay', generation: 8 }],
  }
  return Object.assign(base, overrides)
}

const findEvent = (r, type) => r.traces.flatMap((t) => t.events).find((e) => e.type === type)

test('the complete chain is hypothesis-1-observed', () => {
  const judged = judgeRound(round(), rows())
  assert.equal(judged.verdict, 'hypothesis-1-observed')
  assert.deepEqual(judged.missing, [])
  assert.ok(judged.chain, 'the chain is reported')
})

test('usable rows with no audit row and a live session are no-replay', () => {
  assert.equal(judgeRound(round(), rows({ audit: [] })).verdict, 'no-replay')
})

for (const [name, serverRows] of [
  ['null', null],
  ['ok absent', { audit: [] }],
  ['read before the round ended', rows({ readAt: iso(round().endedAt - 1) })],
  ['since after the round opened', rows({ since: iso(round().openedAt + 1) })],
]) {
  test(`server rows that are ${name} are undetermined, never no-replay`, () => {
    const judged = judgeRound(round(), serverRows)
    assert.equal(judged.verdict, 'undetermined')
    assert.ok(judged.missing.length > 0)
  })
}

for (const [name, serverRows, reason] of [
  ['without an audit array', (() => { const r = rows(); delete r.audit; return r })(), 'server-rows-schema'],
  ['with audit that is not an array', rows({ audit: {} }), 'server-rows-schema'],
  ['without a refreshTokens array', (() => { const r = rows({ audit: [] }); delete r.refreshTokens; return r })(), 'server-rows-schema'],
  ['without a sessions array', (() => { const r = rows({ audit: [] }); delete r.sessions; return r })(), 'server-rows-schema'],
  ['with an audit row that has no sessionId', rows({ audit: [{ id: 'a', createdAt: iso(1_030_200), presentedGeneration: 7, currentGeneration: 8 }] }), 'server-rows-schema'],
  ['with an audit row whose time is unreadable', rows({ audit: [{ id: 'a', createdAt: 'never', sessionId: 'sess-qa-1', presentedGeneration: 7, currentGeneration: 8 }] }), 'server-rows-schema'],
  ['with an audit row whose generations are not integers', rows({ audit: [{ id: 'a', createdAt: iso(1_030_200), sessionId: 'sess-qa-1', presentedGeneration: '7', currentGeneration: null }] }), 'server-rows-schema'],
]) {
  test(`server rows ${name} are undetermined, never no-replay`, () => {
    const judged = judgeRound(round(), serverRows)
    assert.equal(judged.verdict, 'undetermined')
    assert.deepEqual(judged.missing, [reason])
  })
}

for (const [name, mutate, failed] of [
  ['no tab roster', (r) => { delete r.tabCount }, 'tab-roster-unknown'],
  ['a tab roster of zero', (r) => { r.tabCount = 0; r.traces = [] }, 'tab-roster-unknown'],
  ['no traces at all for a roster of two', (r) => { r.traces = [] }, 'tab-roster-mismatch'],
  ['fewer traces than the roster', (r) => { r.tabCount = 3 }, 'tab-roster-mismatch'],
  ['more traces than the roster', (r) => { r.tabCount = 1 }, 'tab-roster-mismatch'],
  ['two traces under one tab label', (r) => { r.traces[1].tab = 'X' }, 'tab-roster-mismatch'],
]) {
  test(`${name} is an incomplete round`, () => {
    const r = round()
    mutate(r)
    const result = completeness(r)
    assert.equal(result.complete, false)
    assert.ok(result.failed.includes(failed), `failed: ${result.failed}`)
  })
}

test('a replay judged on zero collected tabs is supporting-unconfirmed, not replay-other-path', () => {
  const r = round({ traces: [], sessionRequests: [] })
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('tab-roster-mismatch'))
})

test('a round with no recorded sessionId is undetermined', () => {
  const judged = judgeRound(round({ sessionId: null }), rows())
  assert.equal(judged.verdict, 'undetermined')
})

test('a session that ended with no audit row is undetermined', () => {
  const judged = judgeRound(round({ sessionEnded: true }), rows({ audit: [] }))
  assert.equal(judged.verdict, 'undetermined')
  assert.ok(judged.missing.includes('session-ended-without-audit-row'))
})

test("an audit row of another session is not the round's", () => {
  const other = rows()
  other.audit[0].sessionId = 'sess-other'
  assert.equal(judgeRound(round(), other).verdict, 'no-replay')
})

test("an audit row outside the round interval is not the round's", () => {
  const later = rows()
  later.audit[0].createdAt = iso(round().endedAt + 60_000)
  assert.equal(judgeRound(round(), later).verdict, 'no-replay')
})

test('a commit timeout after the stale presentation does not complete the chain', () => {
  const r = round()
  findEvent(r, 'token-commit').at = 1_035_000
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('link:timeout-before-presentation'))
})

test('a replay with an incomplete trace and no timeout is supporting-unconfirmed with supports: []', () => {
  const r = round()
  r.traces[0].collected = false
  r.traces[0].events = r.traces[0].events.filter((e) => e.type !== 'token-commit')
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('tab-not-collected'))
  assert.deepEqual(judged.supports, [])
})

test('a replay with an incomplete trace and a timeout lists commit-timeout under supports', () => {
  const r = round()
  r.traces[0].flagSet = false
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('flag-unset'))
  assert.ok(judged.supports.includes('commit-timeout'))
})

for (const [name, mutate, failed] of [
  ['a tab that was not collected', (r) => { r.traces[1].collected = false }, 'tab-not-collected'],
  ['a tab whose page was replaced or reloaded', (r) => { r.traces[1].timeOriginAtEnd += 1 }, 'tab-reloaded'],
  [
    'a buffer at its cap',
    (r) => {
      r.traces[0].events = Array(TRACE_CAP).fill(r.filler)
    },
    'buffer-at-cap',
  ],
  ['an unset flag', (r) => { r.traces[0].flagSet = false }, 'flag-unset'],
  [
    'a refresh request with no refresh-sent',
    (r) => {
      r.traces[1].events = r.traces[1].events.filter((e) => e.type !== 'refresh-sent')
    },
    'unpaired-request',
  ],
  [
    'a refresh-sent with no request',
    (r) => {
      r.sessionRequests = r.sessionRequests.filter((q) => q.tab !== 'Y')
    },
    'unpaired-send',
  ],
  [
    'a request sent outside its trace window',
    (r) => {
      r.sessionRequests.find((q) => q.tab === 'Y').sentAt = 1_020_000
    },
    'time-cross-check',
  ],
  [
    'a presented fingerprint of another generation',
    (r) => {
      r.sessionRequests.find((q) => q.tab === 'Y').presentedRefresh = 'fp-9'
    },
    'generation-cross-check',
  ],
]) {
  test(`${name} is incomplete and supporting-unconfirmed`, () => {
    const r = round()
    mutate(r)
    assert.ok(completeness(r).failed.includes(failed), `completeness names ${failed}`)
    const judged = judgeRound(r, rows())
    assert.equal(judged.verdict, 'supporting-unconfirmed')
    assert.ok(judged.missing.includes(failed))
  })
}

test('two tabs presenting the same generation inside the window make the audit match ambiguous', () => {
  const r = round()
  r.traces.push({
    ...r.traces[1],
    tab: 'Z',
    events: r.traces[1].events.map((e) => ({ ...e, tabId: 'rt-z' })),
  })
  r.sessionRequests.push({ ...r.sessionRequests.find((q) => q.tab === 'Y'), tab: 'Z' })
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('ambiguous-audit-match'))
})

test('a write of G+1 before the stale presentation breaks the chain', () => {
  const r = round()
  r.traces[0].events.push({
    type: 'token-commit', trigger: 'reconcile', attempt: 2, triggeredBy: null,
    outcome: 'written-both', ms: 10, tabId: 'rt-x', at: 1_025_000, refreshId: 1,
  })
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('link:no-write-in-interval'))
})

test('a write of G+1 after the stale presentation does not', () => {
  const r = round()
  r.traces[0].events.push({
    type: 'token-commit', trigger: 'reconcile', attempt: 2, triggeredBy: null,
    outcome: 'written-both', ms: 10, tabId: 'rt-x', at: 1_035_000, refreshId: 1,
  })
  assert.equal(judgeRound(r, rows()).verdict, 'hypothesis-1-observed')
})

test('a replay with no timed-out commit is replay-other-path', () => {
  const r = round()
  r.traces[0].events = r.traces[0].events.filter((e) => e.type !== 'token-commit')
  assert.equal(judgeRound(r, rows()).verdict, 'replay-other-path')
})

test('a timed-out commit under a different refreshId than the 200 does not complete the chain', () => {
  const r = round()
  findEvent(r, 'token-commit').refreshId = 99
  const judged = judgeRound(r, rows())
  assert.equal(judged.verdict, 'supporting-unconfirmed')
  assert.ok(judged.missing.includes('link:timeout'))
  assert.ok(judged.supports.includes('commit-timeout'))
})
