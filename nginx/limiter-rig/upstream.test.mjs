import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_HOLD_MS, holdMsOf } from './upstream.mjs'

test('the longest hold the rig grants is 2000 ms', () => {
  assert.equal(MAX_HOLD_MS, 2000)
})

test('a hold inside the cap is granted as asked', () => {
  assert.equal(holdMsOf('1'), 1)
  assert.equal(holdMsOf('1000'), 1000)
  assert.equal(holdMsOf('1999'), 1999)
})

test('a hold at the cap is granted, one above it is cut to the cap', () => {
  assert.equal(holdMsOf('2000'), 2000)
  assert.equal(holdMsOf('2001'), 2000)
})

test('a hold far above the cap is cut to the cap', () => {
  assert.equal(holdMsOf('3600000'), 2000)
  assert.equal(holdMsOf('1e308'), 2000)
})

test('zero and negative holds are no hold', () => {
  assert.equal(holdMsOf('0'), 0)
  assert.equal(holdMsOf('-1'), 0)
  assert.equal(holdMsOf('-2001'), 0)
})

test('a value that is not a finite number is no hold', () => {
  for (const value of [undefined, '', 'abc', 'NaN', 'Infinity', '-Infinity', '12abc']) {
    assert.equal(holdMsOf(value), 0, String(value))
  }
})

test('a repeated header uses its first value, capped like any other', () => {
  assert.equal(holdMsOf(['500', '9000']), 500)
  assert.equal(holdMsOf(['9000', '500']), 2000)
})
