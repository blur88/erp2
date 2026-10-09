import { test } from 'node:test'
import assert from 'node:assert/strict'
import { requestIdFor } from './lib/request-id.mjs'

test('a request with no identifier gets the harness one, from its sequence number', () => {
  assert.equal(requestIdFor({}, 17), 'app-17')
  assert.equal(requestIdFor({ accept: '*/*' }, 3), 'app-3')
})

test('an identifier the sender set is kept, not replaced', () => {
  assert.equal(requestIdFor({ 'x-qa-request-id': 'probe-004' }, 17), 'probe-004')
})

test('an empty or blank identifier is not one', () => {
  assert.equal(requestIdFor({ 'x-qa-request-id': '' }, 17), 'app-17')
  assert.equal(requestIdFor({ 'x-qa-request-id': '   ' }, 17), 'app-17')
})

test('a sender may not take a harness identifier: app-* is always the harness sequence', () => {
  assert.equal(requestIdFor({ 'x-qa-request-id': 'app-999' }, 17), 'app-17')
})

test('headers absent altogether behave as no identifier', () => {
  assert.equal(requestIdFor(undefined, 5), 'app-5')
  assert.equal(requestIdFor(null, 5), 'app-5')
})
