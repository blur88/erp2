// node --test frontend/qa/cross-tab-session/company-recovery.test.mjs
//
// The harness's reading of the sidebar recovery strip and of a tab's company
// reads (lib/company-recovery.mjs), without a browser.
//
// The direction of every decision matters here as elsewhere: a strip that is
// not showing must never be read as showing, a read must never be attributed to
// something that came after it, and a trace with nothing in it must read as
// `none` rather than as tokens adopted from somewhere.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COLLAPSED_RETRY_NAME,
  READ_CAUSES,
  STRIP_TEXT,
  classifyReads,
  judgeStrip,
  readCounts,
  summariseWindows,
  tokenOrigin,
  windowRecord,
} from './lib/company-recovery.mjs'

const read = (seq, issuedAt, over = {}) => ({
  seq,
  tab: 'N1',
  zone: 'business',
  method: 'GET',
  path: '/api/settings/company',
  issuedAt,
  status: 200,
  qaId: `app-${seq}`,
  ...over,
})

// The strip's wording and the collapsed button's name are the application's,
// and a harness that drifts from them reads nothing at all.
test('the wording and the collapsed name are the ones the sidebar renders', async () => {
  const { readFileSync } = await import('node:fs')
  const source = readFileSync(
    new URL('../../src/components/common/companyRecovery/CompanyUnavailableStrip.tsx', import.meta.url),
    'utf8',
  )
  assert.ok(source.includes(STRIP_TEXT), 'CompanyUnavailableStrip does not carry the strip wording')
  assert.ok(source.includes(COLLAPSED_RETRY_NAME), 'CompanyUnavailableStrip does not carry the collapsed name')
  assert.ok(source.includes(`aria-label="${COLLAPSED_RETRY_NAME}"`), 'the collapsed button is not labelled with that name')
})

describe('judgeStrip', () => {
  test('the expanded form shows with its wording and a Retry that may be pressed', () => {
    const judged = judgeStrip({ expanded: true, collapsed: false, retryDisabled: false, retryLabel: 'Retry' })
    assert.equal(judged.showing, true)
    assert.equal(judged.form, 'expanded')
    assert.equal(judged.canRetry, true)
    assert.equal(judged.retryLabel, 'Retry')
  })

  test('the expanded form still shows while Retry is disabled', () => {
    const judged = judgeStrip({ expanded: true, collapsed: false, retryDisabled: true, retryLabel: 'Retrying…' })
    assert.equal(judged.showing, true)
    assert.equal(judged.canRetry, false)
  })

  test('the collapsed form shows with the wording only in the tooltip', () => {
    const judged = judgeStrip({ expanded: false, collapsed: true, retryDisabled: false, retryLabel: null })
    assert.equal(judged.showing, true)
    assert.equal(judged.form, 'collapsed')
    // No visible row: the expanded snapshot is false, not merely empty.
    assert.equal(judged.retryLabel, null)
  })

  test('nothing showing reads as not showing, and says no form', () => {
    const judged = judgeStrip({ expanded: false, collapsed: false, retryDisabled: null, retryLabel: null })
    assert.equal(judged.showing, false)
    assert.equal(judged.form, 'none')
    assert.equal(judged.canRetry, false)
  })

  test('a missing read is not showing, never a crash', () => {
    assert.equal(judgeStrip(null).showing, false)
    assert.equal(judgeStrip(undefined).form, 'none')
  })
})

describe('classifyReads', () => {
  const entries = [read(1, 1000), read(2, 3000), read(3, 9000), read(4, 20_000)]

  test('a read with nothing before it is the page load\'s own', () => {
    assert.deepEqual(
      classifyReads([entries[0]]).map((r) => r.after),
      ['page load'],
    )
  })

  test('each read is attributed to the last thing that preceded it', () => {
    const events = [
      { at: 2000, kind: 'navigation' },
      { at: 8000, kind: 'tokens renewed' },
      { at: 19_000, kind: 'retry click' },
    ]
    assert.deepEqual(
      classifyReads(entries, events).map((r) => r.after),
      ['page load', 'navigation', 'tokens renewed', 'retry click'],
    )
  })

  test('a read is never attributed to something that came after it', () => {
    const events = [{ at: 5000, kind: 'tokens renewed' }]
    assert.deepEqual(
      classifyReads(entries, events).map((r) => r.after),
      ['page load', 'page load', 'tokens renewed', 'tokens renewed'],
    )
  })

  test('an event of a kind that attributes nothing is ignored', () => {
    const events = [{ at: 5000, kind: 'a click somewhere else' }, { at: null, kind: 'navigation' }]
    assert.deepEqual(
      classifyReads(entries, events).map((r) => r.after),
      READ_CAUSES.slice(0, 1).concat(['page load', 'page load', 'page load']),
    )
  })

  test('two events at one instant are ordered by the list they arrived in', () => {
    // The harness records events as it observes them, so the later entry is the
    // later thing. Neither is dropped and neither is guessed at.
    const events = [
      { at: 1000, kind: 'navigation' },
      { at: 1000, kind: 'retry click' },
    ]
    assert.equal(classifyReads([entries[0]], events)[0].after, 'retry click')
    assert.equal(classifyReads([entries[0]], events.slice().reverse())[0].after, 'navigation')
  })

  test('only the company read is counted, and its status is what it got', () => {
    const mixed = [
      read(1, 1000, { status: null, failed: 'net::ERR_FAILED' }),
      { ...read(2, 1100), path: '/api/settings/regional' },
      { ...read(3, 1200), method: 'POST' },
      { ...read(4, 1300), zone: 'session', path: '/api/auth/refresh' },
    ]
    const classified = classifyReads(mixed)
    assert.equal(classified.length, 1)
    assert.equal(classified[0].status, 'net::ERR_FAILED')
    assert.equal(classified[0].qaId, 'app-1')
  })

  test('a read still in flight reads as pending, not as a failure', () => {
    assert.equal(classifyReads([read(1, 1000, { status: null })])[0].status, 'pending')
  })
})

describe('readCounts', () => {
  test('every cause is present whether or not it happened', () => {
    const counts = readCounts([read(1, 1000)])
    assert.deepEqual(Object.keys(counts), [...READ_CAUSES, 'total'])
    assert.equal(counts['page load'], 1)
    assert.equal(counts.navigation, 0)
    assert.equal(counts.total, 1)
  })

  test('nothing read is all zeroes, not a missing shape', () => {
    assert.equal(readCounts([]).total, 0)
    assert.equal(readCounts(null).total, 0)
    assert.equal(readCounts([], null).total, 0)
  })
})

describe('tokenOrigin', () => {
  test('a tab that refreshed is its own', () => {
    const origin = tokenOrigin([
      { type: 'refresh-sent', presentedGeneration: 2 },
      { type: 'settled-read', memoryGeneration: 2 },
      { type: 'token-commit', outcome: 'written-both' },
    ])
    assert.equal(origin.ownRefreshes, 1)
    assert.equal(origin.adoptedTokens, 0)
    assert.equal(origin.origin, 'own')
  })

  test('a tab that never refreshed and held a newer generation adopted it', () => {
    const origin = tokenOrigin([
      { type: 'settled-read', memoryGeneration: 3 },
      { type: 'settled-read', memoryGeneration: 4 },
    ])
    assert.equal(origin.ownRefreshes, 0)
    assert.deepEqual([...origin.adoptedGenerations], [3, 4])
    assert.equal(origin.origin, 'adopted' === origin.origin ? 'adopted' : origin.origin)
    assert.equal(origin.origin === 'own', false)
  })

  test('both together read as mixed, and the counts stay apart', () => {
    const origin = tokenOrigin([
      { type: 'refresh-sent', presentedGeneration: 2 },
      { type: 'settled-read', memoryGeneration: 2 },
      { type: 'settled-read', memoryGeneration: 3 },
    ])
    assert.equal(origin.ownRefreshes, 1)
    assert.equal(origin.adoptedTokens, 1)
    assert.equal(origin.origin, 'mixed')
  })

  test('an empty trace is none, never adopted', () => {
    assert.equal(tokenOrigin([]).origin, 'none')
    assert.equal(tokenOrigin(null).origin, 'none')
    assert.equal(tokenOrigin([null, { type: 'settled-read' }]).adoptedTokens, 0)
  })

  test('a generation presented by this tab is its own even if it is also held', () => {
    const origin = tokenOrigin([
      { type: 'refresh-sent', presentedGeneration: 2 },
      { type: 'refresh-sent', presentedGeneration: 2 },
      { type: 'settled-read', memoryGeneration: 2 },
    ])
    assert.equal(origin.ownRefreshes, 2)
    assert.equal(origin.adoptedTokens, 0)
  })
})

describe('the two windows', () => {
  const windowOne = windowRecord({
    window: 1,
    entries: [read(1, 1000), read(2, 4000, { status: 429 })],
    strip: { expanded: true, collapsed: false, retryDisabled: true, retryLabel: 'Retrying…' },
    companyNameInSidebar: null,
    trace: [{ type: 'refresh-sent', presentedGeneration: 2 }],
  })
  const windowTwo = windowRecord({
    window: 2,
    entries: [read(3, 20_000)],
    events: [{ at: 19_000, kind: 'navigation' }],
    strip: { expanded: false, collapsed: false, retryDisabled: null, retryLabel: null },
    companyNameInSidebar: 'Acme Trading',
    trace: [{ type: 'settled-read', memoryGeneration: 3 }],
  })

  test('each window keeps its own counts, its own strip and its own tokens', () => {
    assert.equal(windowOne.reads.total, 2)
    assert.equal(windowTwo.reads.total, 1)
    assert.equal(windowOne.reads.navigation, 0)
    assert.equal(windowTwo.reads.navigation, 1)
    assert.equal(windowOne.strip.showing, true)
    assert.equal(windowTwo.strip.showing, false)
    assert.equal(windowOne.companyNameInSidebar, null)
    assert.equal(windowTwo.companyNameInSidebar, 'Acme Trading')
    assert.equal(windowOne.tokens.ownRefreshes, 1)
    assert.equal(windowTwo.tokens.adoptedTokens, 1)
  })

  test('the summary keeps the windows apart and adds nothing across them', () => {
    const summary = summariseWindows([windowOne, windowTwo])
    assert.deepEqual(summary.windows, [1, 2])
    assert.equal(summary.tabsWithStrip, 1)
    assert.equal(summary.ownRefreshes, 1)
    assert.equal(summary.adoptedTokens, 1)
    assert.equal(summary.readsAfterStrip['page load'], 2)
    assert.equal(summary.readsAfterStrip.navigation, 1)
    assert.equal(summary.readsAfterStrip['retry click'], 0)
    assert.equal(summary.readsAfterStrip['tokens renewed'], 0)
  })

  test('no windows is an empty summary, not a crash', () => {
    assert.deepEqual(summariseWindows([]).windows, [])
    assert.equal(summariseWindows(null).tabsWithStrip, 0)
  })

  test('a missing entry is treated as a tab that read nothing', () => {
    const empty = windowRecord({ window: 1 })
    assert.equal(empty.reads.total, 0)
    assert.equal(empty.strip.showing, false)
    assert.equal(empty.tokens.origin, 'none')
  })
})