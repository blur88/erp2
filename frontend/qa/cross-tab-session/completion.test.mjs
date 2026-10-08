// When each tab of a loading round first held its expected data
// (lib/completion.mjs), and the deadline it is judged against
// (lib/w1-judgement.mjs). No browser here.
//
//   node --test frontend/qa/cross-tab-session/completion.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { completionOf } from './lib/completion.mjs'
import { DEADLINE_MS, BLOCKING_SIZES } from './lib/w1-judgement.mjs'

// One sample per poll per tab: { tab, atMs, complete, pending }.
// `complete` is what lib/usable.mjs read from the tab, `pending` how many of
// the tab's business requests had no answer yet.
const sample = (tab, atMs, complete, pending = 0) => ({ tab, atMs, complete, pending })

test('a tab complete at its third sample reports that sample\'s time', () => {
  const samples = [
    sample('t1', 250, false),
    sample('t2', 250, false),
    sample('t1', 750, false),
    sample('t1', 1000, true),
    sample('t2', 1000, true),
  ]
  const result = completionOf(samples, 250)
  assert.equal(result.perTab.length, 2)
  const t1 = result.perTab.find((t) => t.tab === 't1')
  const t2 = result.perTab.find((t) => t.tab === 't2')
  assert.equal(t1.completedAfterMs, 1000)
  assert.equal(t2.completedAfterMs, 1000)
  assert.equal(result.lastCompletedAfterMs, 1000)
  assert.equal(result.pollMs, 250)
})

test('a tab that is complete but still has a request without an answer is not complete', () => {
  const samples = [sample('t1', 250, true, 1), sample('t1', 500, true, 1), sample('t1', 750, true, 0)]
  const result = completionOf(samples, 250)
  assert.equal(result.perTab[0].completedAfterMs, 750)
})

test('a tab that is never complete is null, and makes the last completion null', () => {
  const samples = [sample('t1', 250, true), sample('t2', 250, false), sample('t2', 500, false)]
  const result = completionOf(samples, 250)
  assert.equal(result.perTab.find((t) => t.tab === 't1').completedAfterMs, 250)
  assert.equal(result.perTab.find((t) => t.tab === 't2').completedAfterMs, null)
  assert.equal(result.lastCompletedAfterMs, null)
})

test('one tab complete and one not: the round has no last completion', () => {
  const result = completionOf([sample('t1', 250, true), sample('t2', 250, false)], 250)
  assert.equal(result.lastCompletedAfterMs, null)
})

test('no samples at all is no completion, not a zero', () => {
  const result = completionOf([], 250)
  assert.deepEqual(result.perTab, [])
  assert.equal(result.lastCompletedAfterMs, null)
})

test('the first sample of a tab that is already complete counts', () => {
  const result = completionOf([sample('t1', 250, true)], 250)
  assert.equal(result.perTab[0].completedAfterMs, 250)
})

test('the deadlines are fixed: 5 s, 10 s and 15 s', () => {
  assert.deepEqual(DEADLINE_MS, { 5: 5000, 10: 10000, 20: 15000 })
  assert.deepEqual(BLOCKING_SIZES, [5, 10, 20])
})
