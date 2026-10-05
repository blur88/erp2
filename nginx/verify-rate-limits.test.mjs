import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseZones,
  intervalSeconds,
  maxJudgedSeconds,
  drainWaitSeconds,
  requestsToExhaust,
  admittedBounds,
  peakDemand,
  candidateBurst,
} from './verify-rate-limits.mjs'

const conf = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'nginx.conf'), 'utf8')

test('parsing the real nginx.conf yields the two zones', () => {
  const zones = parseZones(conf)
  assert.deepEqual(zones.login_limit, { ratePerSecond: 5 / 60, rateText: '5r/m', burst: 3 })
  assert.deepEqual(zones.session_limit, { ratePerSecond: 1, rateText: '1r/s', burst: 20 })
})

test('the table for 5r/m burst 3', () => {
  const r = 5 / 60
  assert.equal(intervalSeconds(r), 12)
  assert.equal(maxJudgedSeconds(r), 10)
  assert.equal(drainWaitSeconds(r, 3), 53)
  assert.equal(requestsToExhaust(r, 3), 10)
  assert.deepEqual(admittedBounds(r, 3, 10), { lower: 4, upper: 5 })
})

test('the table for 1r/s burst 20', () => {
  const r = 1
  assert.equal(intervalSeconds(r), 1)
  assert.equal(maxJudgedSeconds(r), 5)
  assert.equal(drainWaitSeconds(r, 20), 26)
  assert.equal(requestsToExhaust(r, 20), 32)
  assert.deepEqual(admittedBounds(r, 20, 5), { lower: 21, upper: 26 })
})

test('the table for 1r/s burst 60', () => {
  const r = 1
  assert.equal(drainWaitSeconds(r, 60), 66)
  assert.equal(requestsToExhaust(r, 60), 82)
  assert.deepEqual(admittedBounds(r, 60, 5), { lower: 61, upper: 66 })
})

test('the Tmax predicate at its boundary', () => {
  assert.equal(maxJudgedSeconds(5 / 60), 10) // interval 12 s
  assert.equal(maxJudgedSeconds(6 / 60), 5) // interval exactly 10 s, strict >
  assert.equal(maxJudgedSeconds(1 / 10.9), 10) // interval 10.9 s
})

test('peak demand: a spread-out burst has a low E, a dense one a high E', () => {
  const sparse = []
  for (let i = 0; i < 30; i += 1) sparse.push(i * 4)
  assert.equal(peakDemand(sparse, 1), 1)

  const dense = []
  for (let i = 0; i < 30; i += 1) dense.push(i * 0.001)
  assert.ok(peakDemand(dense, 1) > 29 && peakDemand(dense, 1) <= 30)

  const instant = new Array(30).fill(0)
  assert.equal(peakDemand(instant, 1), 30)
})

test('candidate burst is 1.25x(E-1) rounded up', () => {
  assert.equal(candidateBurst(30), 37)
  assert.equal(candidateBurst(21), 25)
})
