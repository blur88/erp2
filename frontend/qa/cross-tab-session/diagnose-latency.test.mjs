// node --test frontend/qa/cross-tab-session/diagnose-latency.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clusters, correlation, coveredBy } from './diagnose-latency.mjs'

test('coveredBy counts overlapping intervals once and clips to the window', () => {
  // Window 10..50. Intervals 0..20 and 15..30 cover 10..30; 45..80 covers 45..50.
  assert.equal(coveredBy(10, 50, [[0, 20], [15, 30], [45, 80]]), 25)
})

test('coveredBy is zero when nothing overlaps', () => {
  assert.equal(coveredBy(10, 20, [[0, 10], [20, 30]]), 0)
})

test('an interval inside an earlier, longer one adds nothing', () => {
  assert.equal(coveredBy(0, 100, [[10, 60], [20, 30]]), 50)
})

test('clusters groups starts that follow the previous one within the gap', () => {
  // 0, 0.4, 1.2 chain together (each within 1 ms of the previous); 5 stands alone; 9 and 9.9 pair.
  assert.deepEqual(clusters([9.9, 0, 5, 0.4, 9, 1.2], 1), [3, 1, 2])
})

test('clusters of nothing is nothing', () => {
  assert.deepEqual(clusters([], 1), [])
})

test('correlation is 1 for a rising line, -1 for a falling one, null when undefined', () => {
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-12)
  assert.ok(Math.abs(correlation([1, 2, 3, 4], [8, 6, 4, 2]) + 1) < 1e-12)
  assert.equal(correlation([1, 2, 3], [5, 5, 5]), null)
  assert.equal(correlation([1, 2], [1, 2]), null)
})
