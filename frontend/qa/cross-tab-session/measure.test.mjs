// node --test frontend/qa/cross-tab-session/measure.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { peakDemand } from './measure.mjs'
import { busiestSecond, candidateBurst, median, percentile } from './lib/stats.mjs'
import { durationSeconds } from './lib/config.mjs'

// Eight requests at each of seconds 0, 1, 2 and 3, then two at second 4:
// no one-second interval holds more than 8, yet at 1 r/s the bucket never
// catches up: 8, 15, 22, 29, then 28 + 2 = 30.
const spreadOut = [0, 1, 2, 3].flatMap((s) => Array(8).fill(s)).concat([4, 4])

test('a spread-out burst: the busiest second is 8 and the peak demand E is 30', () => {
  assert.equal(busiestSecond(spreadOut), 8)
  assert.equal(peakDemand(spreadOut, 1), 30)
})

test('peak demand of one instantaneous burst is its size', () => {
  assert.equal(peakDemand(Array(21).fill(5), 1), 21)
})

test('peak demand drains between requests and never below zero', () => {
  assert.equal(peakDemand([0, 10, 20], 1), 1)
  assert.equal(peakDemand([0, 0.5, 1], 1), 2)
})

test('peak demand of no requests is zero', () => {
  assert.equal(peakDemand([], 1), 0)
})

test('the busiest second counts a half-open interval', () => {
  assert.equal(busiestSecond([0, 0.5, 0.999, 1]), 3)
  assert.equal(busiestSecond([]), 0)
})

test('candidate burst is 1.25 x (E - 1), rounded up', () => {
  assert.equal(candidateBurst(30), 37)
  assert.equal(candidateBurst(21), 25)
})

test('median and nearest-rank percentile', () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95), 10)
  assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95)
  assert.equal(percentile([], 95), null)
})

test('durations as the backend writes them', () => {
  assert.equal(durationSeconds('20s'), 20)
  assert.equal(durationSeconds('15m'), 900)
  assert.equal(durationSeconds('60'), 60)
  assert.throws(() => durationSeconds('soon'))
})
