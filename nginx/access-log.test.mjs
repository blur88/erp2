import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLine, attribute } from './access-log.mjs'

// One test per line of the plan's Step 1 list. Every line is a real shape of
// the `limits` log format, so the fields are pinned as the format writes them.

const PASSED =
  '10.0.0.7 - - [08/Oct/2026:15:29:00 +0000] "GET /api/settings/company HTTP/1.1" 200 512 "-" "qa-agent" ' +
  'msec=1759944540.123 rt=0.020 urt="0.015" lreq=PASSED lconn=PASSED qa="app-7"'

test('a passed request: both limiters passed, one upstream, startMs is endMs - requestMs', () => {
  const e = parseLine(PASSED)
  assert.notEqual(e, null)
  assert.equal(e.remoteAddr, '10.0.0.7')
  assert.equal(e.method, 'GET')
  assert.equal(e.uri, '/api/settings/company')
  assert.equal(e.status, 200)
  assert.equal(e.endMs, 1759944540123)
  assert.equal(e.requestMs, 20)
  assert.equal(e.startMs, e.endMs - e.requestMs)
  assert.equal(e.upstream.kind, 'single')
  assert.equal(e.upstream.ms, 15)
  assert.equal(e.nonUpstreamMs, e.requestMs - e.upstream.ms)
  assert.equal(e.limitReq, 'PASSED')
  assert.equal(e.limitConn, 'PASSED')
  assert.equal(e.qaId, 'app-7')
})

test('urt="-": no upstream was contacted, so no upstream time and no non-upstream duration', () => {
  const line =
    '10.0.0.7 - - [08/Oct/2026:15:29:01 +0000] "GET /api/settings/company HTTP/1.1" 429 0 "-" "qa-agent" ' +
    'msec=1759944541.500 rt=0.001 urt="-" lreq=REJECTED lconn=- qa="app-8"'
  const e = parseLine(line)
  assert.deepEqual(e.upstream, { kind: 'none', ms: null })
  assert.equal(e.nonUpstreamMs, null)
})

test('urt with two values, comma separated, is summed', () => {
  const line =
    '10.0.0.7 - - [08/Oct/2026:15:29:02 +0000] "GET /api/dashboard HTTP/1.1" 200 1024 "-" "qa-agent" ' +
    'msec=1759944542.250 rt=0.200 urt="0.004, 0.120" lreq=PASSED lconn=PASSED qa="app-9"'
  const e = parseLine(line)
  assert.equal(e.upstream.kind, 'multiple')
  assert.equal(e.upstream.ms, 124)
})

test('urt with two values, colon separated, is summed', () => {
  const line =
    '10.0.0.7 - - [08/Oct/2026:15:29:03 +0000] "GET /api/dashboard HTTP/1.1" 200 1024 "-" "qa-agent" ' +
    'msec=1759944543.000 rt=0.050 urt="0.004 : 0.010" lreq=PASSED lconn=PASSED qa="app-10"'
  const e = parseLine(line)
  assert.equal(e.upstream.kind, 'multiple')
  assert.equal(e.upstream.ms, 14)
})

test('lreq=- and lconn=- are null, not a made-up verdict', () => {
  const line =
    '10.0.0.9 - - [08/Oct/2026:15:29:04 +0000] "GET /manifest.json HTTP/1.1" 200 41 "-" "qa-agent" ' +
    'msec=1759944544.010 rt=0.001 urt="0.001" lreq=- lconn=- qa="mark-1"'
  const e = parseLine(line)
  assert.equal(e.limitReq, null)
  assert.equal(e.limitConn, null)
})

test('a request with no x-qa-request-id header has qaId null', () => {
  const line =
    '10.0.0.7 - - [08/Oct/2026:15:29:05 +0000] "GET /api/auth/me HTTP/1.1" 401 33 "-" "qa-agent" ' +
    'msec=1759944545.000 rt=0.010 urt="0.008" lreq=PASSED lconn=PASSED qa="-"'
  assert.equal(parseLine(line).qaId, null)
})

test('qa="probe-7" is read as the request id', () => {
  const line =
    '10.0.0.7 - - [08/Oct/2026:15:29:06 +0000] "GET /api/auth/me HTTP/1.1" 200 900 "-" "qa-agent" ' +
    'msec=1759944546.000 rt=0.010 urt="0.008" lreq=- lconn=PASSED qa="probe-7"'
  assert.equal(parseLine(line).qaId, 'probe-7')
})

test('a line in the old combined format is null, not a partial read', () => {
  const combined =
    '10.0.0.7 - - [08/Oct/2026:15:29:00 +0000] "GET /api/settings/company HTTP/1.1" 200 512 "-" "qa-agent"'
  assert.equal(parseLine(combined), null)
})

test('an empty line is null', () => {
  assert.equal(parseLine(''), null)
  assert.equal(parseLine('\n'), null)
  assert.equal(parseLine('   '), null)
})

test('attribute: a 429 with limit_req REJECTED is limit_req', () => {
  const e = parseLine(
    '10.0.0.7 - - [08/Oct/2026:15:29:07 +0000] "GET /api/dashboard HTTP/1.1" 429 0 "-" "qa-agent" ' +
      'msec=1759944547.000 rt=0.000 urt="-" lreq=REJECTED lconn=- qa="r-1"'
  )
  assert.equal(attribute(e), 'limit_req')
})

test('attribute: a 429 with limit_conn REJECTED is limit_conn', () => {
  const e = parseLine(
    '10.0.0.7 - - [08/Oct/2026:15:29:08 +0000] "GET /api/dashboard HTTP/1.1" 429 0 "-" "qa-agent" ' +
      'msec=1759944548.000 rt=0.000 urt="-" lreq=- lconn=REJECTED qa="r-2"'
  )
  assert.equal(attribute(e), 'limit_conn')
})

test('attribute: a 429 with neither field REJECTED is unattributed', () => {
  const e = parseLine(
    '10.0.0.7 - - [08/Oct/2026:15:29:09 +0000] "GET /api/dashboard HTTP/1.1" 429 61 "-" "qa-agent" ' +
      'msec=1759944549.000 rt=0.050 urt="0.040" lreq=PASSED lconn=PASSED qa="r-3"'
  )
  assert.equal(attribute(e), 'unattributed')
})

test('attribute: a 200 is none', () => {
  const e = parseLine(PASSED)
  assert.equal(attribute(e), 'none')
})

test('a delayed line is attributed to no limiter as a rejection', () => {
  const e = parseLine(
    '10.0.0.7 - - [08/Oct/2026:15:29:10 +0000] "GET /api/dashboard HTTP/1.1" 200 512 "-" "qa-agent" ' +
      'msec=1759944550.900 rt=0.900 urt="0.010" lreq=DELAYED lconn=PASSED qa="d-1"'
  )
  assert.equal(e.limitReq, 'DELAYED')
  assert.equal(attribute(e), 'none')
})
