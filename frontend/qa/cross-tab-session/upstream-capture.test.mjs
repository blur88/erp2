// The reducer, on decoder output recorded from the real ingress and kept with
// every credential replaced by a generated value (capture/fixture.ek.jsonl,
// written by capture/sanitise-fixture.mjs).
//
// Real traffic cannot be asked to lose a segment, retransmit one on demand or
// carry the same request id twice, so those three cases are built here as
// decoder records in the recorded file's own shape and marked as such. Every
// other case is the recorded capture.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REDUCE = join(HERE, 'capture', 'reduce.mjs')
const FIXTURE = join(HERE, 'capture', 'fixture.ek.jsonl')

const recorded = readFileSync(FIXTURE, 'utf8')
const records = recorded.split('\n').filter(Boolean).map((line) => JSON.parse(line))

/** Run the reducer over some decoder output and read back what it wrote. */
function reduce(lines, { requireQaId = false, captureStderr = null, extra = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'reduce-test-'))
  const input = join(dir, 'in.ek.jsonl')
  const out = join(dir, 'out.jsonl')
  const err = join(dir, 'out.err')
  writeFileSync(input, lines.join('\n') + '\n')
  const stderrFile = join(dir, 'capture.err')
  if (captureStderr !== null) writeFileSync(stderrFile, captureStderr)
  let status = 0
  let stderr = ''
  try {
    execFileSync(process.execPath, [
      REDUCE,
      '--segment', 't',
      '--out', out,
      '--capture-stderr', captureStderr === null ? join(dir, 'none') : stderrFile,
      ...(requireQaId ? ['--require-qa-id'] : []),
      ...extra,
    ], { input: readFileSync(input), stdio: ['pipe', 'pipe', 'pipe'] })
  } catch (err) {
    status = err.status ?? 1
    stderr = String(err.stderr ?? '')
  }
  const lines2 = existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []
  return { status, stderr, records: lines2, requests: lines2.filter((r) => r.kind === 'request'), invalid: lines2.filter((r) => r.kind === 'invalid'), health: lines2.find((r) => r.kind === 'health') ?? null, text: lines2.map((l) => JSON.stringify(l)).join('\n') }
}

/** One decoder record, in the recorded file's shape. */
function frame({ number, epochMs, stream, srcPort, dstPort, seq, len, http = {}, analysis = null, ip = null, ipv6 = null }) {
  const layers = {
    frame: {
      frame_frame_number: String(number),
      frame_frame_time_epoch: new Date(epochMs).toISOString().replace('Z', '000Z').slice(0, -1) + 'Z',
    },
    tcp: {
      tcp_tcp_srcport: String(srcPort),
      tcp_tcp_dstport: String(dstPort),
      tcp_tcp_stream: String(stream),
      tcp_tcp_seq: String(seq),
      tcp_tcp_len: String(len),
    },
  }
  if (Object.keys(http).length) layers.http = http
  if (ip) layers.ip = { ip_ip_src: ip[0], ip_ip_dst: ip[1] }
  if (ipv6) layers.ipv6 = { ipv6_ipv6_src: ipv6[0], ipv6_ipv6_dst: ipv6[1] }
  if (analysis) layers['tcp.analysis'] = analysis
  return JSON.stringify({ timestamp: String(Math.floor(epochMs)), layers })
}

function requestHttp({ qaId, method = 'GET', uri = '/api/x', authorization = 'Bearer eyJhbGciOiJIUzI1NiJ9.Z2VuZXJhdGVk.c2ln', padding = null }) {
  const lines = []
  if (padding !== null) lines.push(`X-QA-Padding: ${padding}\r\n`)
  if (qaId) lines.push(`x-qa-request-id: ${qaId}\r\n`)
  lines.push(`Host: backend:3001\r\n`)
  return {
    http_http_request: true,
    http_http_request_method: method,
    http_http_request_uri: uri,
    http_http_request_version: 'HTTP/1.1',
    http_http_request_line: lines,
    ...(authorization ? { http_http_authorization: authorization } : {}),
  }
}

const byId = (result, qaId) => result.requests.find((r) => r.qaId === qaId) ?? null

test('a request and its response on one stream: one record, four timestamps in order', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  const r = byId(result, 'fix-reuse-1')
  assert.notEqual(r, null)
  assert.equal(r.method, 'GET')
  assert.equal(r.uri, '/api/settings/company')
  assert.equal(r.status, 200)
  // The four timestamps in order: the request's own frames, then its answer's.
  // The first two are equal for a request that arrived in one frame.
  assert.ok(r.arrivedFirstMs <= r.arrivedLastMs)
  assert.ok(r.arrivedLastMs < r.answeredFirstMs, 'the request arrived before it was answered')
  assert.ok(r.answeredFirstMs <= r.answeredLastMs)
  assert.equal(result.requests.filter((x) => x.qaId === 'fix-reuse-1').length, 1)
})

test('two requests reusing one stream: two records, each with its own response', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  const first = byId(result, 'fix-reuse-1')
  const second = byId(result, 'fix-reuse-2')
  assert.equal(first.stream, second.stream, 'the two requests are on one connection')
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.ok(first.answeredLastMs < second.arrivedFirstMs, 'the first answer came before the second request')
  assert.notDeepEqual(first.answeredFrames, second.answeredFrames)
})

test('two streams interleaved in time are not confused', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  const a = byId(result, 'fix-par-1')
  const b = byId(result, 'fix-par-2')
  assert.notEqual(a.stream, b.stream)
  assert.ok(a.arrivedFirstMs < b.arrivedFirstMs)
  assert.equal(a.uri, '/api/auth/me')
  assert.equal(b.uri, '/api/dashboard/stats')
  assert.equal(b.status, 404, 'the status read is the one that stream saw')
})

test('a request reassembled from several frames has arrivedFirstMs < arrivedLastMs', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  const r = byId(result, 'fix-multiframe')
  assert.notEqual(r, null)
  assert.ok(r.frameCount > 1, `expected more than one frame, got ${r.frameCount}`)
  assert.ok(r.arrivedFirstMs < r.arrivedLastMs)
  assert.deepEqual(r.frames.slice().sort((x, y) => x - y), r.frames)
})

test('a retransmitted segment gives one record marked retransmitted, not two', () => {
  const t = 1791500000000
  const lines = [
    frame({ number: 1, epochMs: t, stream: 0, srcPort: 51000, dstPort: 3001, seq: 1, len: 200, http: requestHttp({ qaId: 'rt-1' }) }),
    // The same bytes again, after the request was already read.
    frame({ number: 2, epochMs: t + 5, stream: 0, srcPort: 51000, dstPort: 3001, seq: 1, len: 200, analysis: { tcp_analysis_retransmission: '1' } }),
    frame({ number: 3, epochMs: t + 10, stream: 0, srcPort: 3001, dstPort: 51000, seq: 1, len: 100, http: { http_http_response: true, http_http_response_code: '200', http_http_request_in: '1' } }),
  ]
  const result = reduce(lines)
  assert.equal(result.requests.length, 1)
  assert.equal(result.requests[0].qaId, 'rt-1')
  assert.equal(result.requests[0].retransmitted, true)
  assert.equal(result.health.analysis.retransmission, 1)
})

test('a lost-segment flag gives an invalid record and no request record for that message', () => {
  const t = 1791500000000
  const lines = [
    frame({ number: 1, epochMs: t, stream: 0, srcPort: 51000, dstPort: 3001, seq: 1, len: 200, http: requestHttp({ qaId: 'lost-1' }) }),
    frame({ number: 2, epochMs: t + 1, stream: 0, srcPort: 51000, dstPort: 3001, seq: 201, len: 100, analysis: { tcp_analysis_lost_segment: '1' } }),
    frame({ number: 3, epochMs: t + 5, stream: 0, srcPort: 51000, dstPort: 3001, seq: 301, len: 180, http: requestHttp({ qaId: 'lost-2' }) }),
    frame({ number: 4, epochMs: t + 9, stream: 0, srcPort: 3001, dstPort: 51000, seq: 1, len: 100, http: { http_http_response: true, http_http_response_code: '200', http_http_request_in: '1' } }),
  ]
  const result = reduce(lines)
  const lost = result.invalid.filter((r) => r.reason === 'lost-segment')
  assert.equal(lost.length, 1)
  assert.equal(lost[0].stream, 0)
  assert.notEqual(byId(result, 'lost-1'), null, 'the message the flag does not cover is still read')
  assert.equal(byId(result, 'lost-2'), null, 'the message the flag covers is not reported as a request')
  assert.equal(result.health.analysis.lost_segment, 1)
})

test('a response with no request gives an invalid record', () => {
  const t = 1791500000000
  const lines = [
    frame({ number: 1, epochMs: t, stream: 0, srcPort: 3001, dstPort: 51000, seq: 1, len: 400, http: { http_http_response: true, http_http_response_code: '200' } }),
  ]
  const result = reduce(lines)
  assert.equal(result.requests.length, 0)
  assert.equal(result.invalid.filter((r) => r.reason === 'response-without-request').length, 1)
})

test('two requests with one qa id give invalid records, not one request and one nothing', () => {
  const t = 1791500000000
  const lines = [
    frame({ number: 1, epochMs: t, stream: 0, srcPort: 51000, dstPort: 3001, seq: 1, len: 200, http: requestHttp({ qaId: 'same-1' }) }),
    frame({ number: 2, epochMs: t + 4, stream: 0, srcPort: 3001, dstPort: 51000, seq: 1, len: 100, http: { http_http_response: true, http_http_response_code: '200', http_http_request_in: '1' } }),
    frame({ number: 3, epochMs: t + 8, stream: 0, srcPort: 51000, dstPort: 3001, seq: 201, len: 200, http: requestHttp({ qaId: 'same-1' }) }),
    frame({ number: 4, epochMs: t + 12, stream: 0, srcPort: 3001, dstPort: 51000, seq: 101, len: 100, http: { http_http_response: true, http_http_response_code: '200', http_http_request_in: '3' } }),
  ]
  const result = reduce(lines)
  assert.equal(result.invalid.filter((r) => r.reason === 'duplicate-qa-id').length, 2)
})

test('a request with no qa id is invalid only when one is required', () => {
  const t = 1791500000000
  const lines = [
    frame({ number: 1, epochMs: t, stream: 0, srcPort: 51000, dstPort: 3001, seq: 1, len: 200, http: requestHttp({ qaId: null }) }),
    frame({ number: 2, epochMs: t + 4, stream: 0, srcPort: 3001, dstPort: 51000, seq: 1, len: 100, http: { http_http_response: true, http_http_response_code: '200', http_http_request_in: '1' } }),
  ]
  assert.equal(reduce(lines).invalid.filter((r) => r.reason === 'missing-qa-id').length, 0)
  assert.equal(reduce(lines, { requireQaId: true }).invalid.filter((r) => r.reason === 'missing-qa-id').length, 1)
})

test('no output line carries a credential or a body from the capture', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  // What the capture really carried, read from the raw values the sanitiser
  // replaced: the pattern of a JWT and of the long generated refresh token are
  // the only credential shapes that could survive.
  assert.equal(/eyJ[A-Za-z0-9_-]{20,}/.test(result.text), false, 'a JWT-shaped value reached the output')
  assert.equal(/Bearer\s/i.test(result.text), false, 'an Authorization header reached the output')
  assert.equal(/accessToken|refreshToken/.test(result.text), false, 'a token field name reached the output')
  assert.equal(/pppppppppp|yyyyyyyyyy|xxxxxxxxxx/.test(result.text), false, 'a padding or body value reached the output')
  // The fingerprint of the generated token is kept; the token is not.
  assert.match(result.text, /"tokenFingerprint":"[0-9a-f]{12}"/)
})

test('malformed decoder input makes the reducer exit non-zero and print no value of it', () => {
  const secretish = 'eyJhbGciOiJIUzI1NiJ9.secret-part.signature-part'
  const lines = [
    JSON.stringify({ layers: { frame: { frame_frame_number: '1', frame_frame_time_epoch: '2026-10-08T10:00:00.000000000Z' } } }),
    `{ this is not json and mentions ${secretish} }`,
  ]
  const result = reduce(lines)
  assert.notEqual(result.status, 0)
  assert.equal(result.text.includes(secretish), false, 'the malformed input was printed')
})

test('a decoder record with no frame layer is refused rather than half read', () => {
  const result = reduce([JSON.stringify({ layers: { tcp: { tcp_tcp_stream: '0' } } })])
  assert.notEqual(result.status, 0)
})

test('the health record says how the capture ended', () => {
  const result = reduce([...recorded.split('\n').filter(Boolean)])
  assert.ok(result.health, 'a health record is written')
  assert.ok(result.health.frames > 0)
  assert.equal(typeof result.health.dropped, 'object') // null: tshark reports drops only when it dropped
  assert.ok(result.health.reducer.startsWith('reduce.mjs'))
})

// --- what dumpcap says it dropped -------------------------------------------

const DUMPCAP_OK =
  "Capturing on 'any'\nFile: -\nPackets: 709 Packets captured: 709\n" +
  "Packets received/dropped on interface 'any': 709/0 (pcap:0/dumpcap:0/flushed:0/ps_ifdrop:0) (100.0%)\n"

const one = () => [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 40000, dstPort: 3001, seq: 1, len: 100, http: requestHttp({ qaId: 'a' }) })]

test('an explicitly reported zero is read as zero dropped', () => {
  const { health } = reduce(one(), { captureStderr: DUMPCAP_OK })
  assert.equal(health.dropped, 0)
  assert.equal(health.captured, 709)
  assert.deepEqual(health.dropDetail, { received: 709, pcap: 0, dumpcap: 0, flushed: 0, ps_ifdrop: 0 })
})

test('a reported drop is read as that many', () => {
  const text = DUMPCAP_OK.replace("709/0 (pcap:0/dumpcap:0", "709/3 (pcap:3/dumpcap:0")
  assert.equal(reduce(one(), { captureStderr: text }).health.dropped, 3)
})

test('no drop line at all leaves the count unknown, never zero', () => {
  // What tshark alone prints when nothing was dropped: a captured count and nothing about drops.
  assert.equal(reduce(one(), { captureStderr: "Capturing on 'any'\n709 packets captured\n" }).health.dropped, null)
  assert.equal(reduce(one(), { captureStderr: '' }).health.dropped, null)
  assert.equal(reduce(one()).health.dropped, null) // no file
})

test('a malformed drop line leaves the count unknown', () => {
  for (const bad of ["709/ (pcap:0/dumpcap:0/flushed:0/ps_ifdrop:0)", "709/x (pcap:0/dumpcap:0/flushed:0/ps_ifdrop:0)", "709/0"]) {
    const text = `Packets received/dropped on interface 'any': ${bad}\n`
    assert.equal(reduce(one(), { captureStderr: text }).health.dropped, null, bad)
  }
})

test('a total that disagrees with its own parts is not believed', () => {
  const text = "Packets received/dropped on interface 'any': 709/0 (pcap:2/dumpcap:0/flushed:0/ps_ifdrop:0) (100.0%)\n"
  assert.equal(reduce(one(), { captureStderr: text }).health.dropped, null)
})

test('two interfaces reporting: the drops are added, and one unreadable line makes the whole count unknown', () => {
  const two = "Packets received/dropped on interface 'eth0': 5/1 (pcap:1/dumpcap:0/flushed:0/ps_ifdrop:0) (83.3%)\n" +
    "Packets received/dropped on interface 'lo': 5/2 (pcap:0/dumpcap:2/flushed:0/ps_ifdrop:0) (71.4%)\n"
  assert.equal(reduce(one(), { captureStderr: two }).health.dropped, 3)
  assert.equal(reduce(one(), { captureStderr: two + "Packets received/dropped on interface 'x': 5/\n" }).health.dropped, null)
})

// --- sizes, and whether the padding arrived -----------------------------------

test('a request records the bytes each of its frames carried, and their sum', () => {
  const lines = [
    frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 40000, dstPort: 3001, seq: 1, len: 1448 }),
    frame({ number: 2, epochMs: 1001, stream: 0, srcPort: 40000, dstPort: 3001, seq: 1449, len: 1448 }),
    frame({ number: 3, epochMs: 1002, stream: 0, srcPort: 40000, dstPort: 3001, seq: 2897, len: 600, http: requestHttp({ qaId: 'big' }) }),
  ]
  const r = byId(reduce(lines), 'big')
  assert.deepEqual(r.frameBytes, [1448, 1448, 600])
  assert.equal(r.bytes, 3496)
  assert.equal(r.frameCount, 3)
})

test('the padding header is recorded by its length only', () => {
  const padding = 'x'.repeat(4096)
  const lines = [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 40000, dstPort: 3001, seq: 1, len: 4500, http: requestHttp({ qaId: 'pad', padding }) })]
  const result = reduce(lines)
  assert.equal(byId(result, 'pad').paddingBytes, 4096)
  assert.ok(!result.text.includes('xxxxxxxx'), 'the padding itself is not written')
})

test('a request without the padding header says so', () => {
  assert.equal(byId(reduce(one()), 'a').paddingBytes, null)
})

// --- where an unreadable request came from -----------------------------------

test('a request with no qa id names both ends of its connection: IPv6', () => {
  const lines = [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 51234, dstPort: 3001, seq: 1, len: 90, ipv6: ['::1', '::1'], http: requestHttp({ qaId: null, uri: '/api/health' }) })]
  const [record] = reduce(lines, { requireQaId: true }).invalid
  assert.equal(record.reason, 'missing-qa-id')
  assert.equal(record.src, '[::1]:51234')
  assert.equal(record.dst, '[::1]:3001')
})

test('a request with no qa id names both ends of its connection: IPv4', () => {
  const lines = [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 51234, dstPort: 3001, seq: 1, len: 90, ip: ['172.18.0.5', '172.18.0.2'], http: requestHttp({ qaId: null }) })]
  const [record] = reduce(lines, { requireQaId: true }).invalid
  assert.equal(record.src, '172.18.0.5:51234')
  assert.equal(record.dst, '172.18.0.2:3001')
})

test('an invalid record whose frame names no address says null, not a guess', () => {
  const lines = [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 51234, dstPort: 3001, seq: 1, len: 90, http: requestHttp({ qaId: null }) })]
  const [record] = reduce(lines, { requireQaId: true }).invalid
  assert.equal(record.src, null)
  assert.equal(record.dst, null)
})

// --- which offload settings the capture ran under --------------------------------

test('the health record says whether segmentation offload was off at the sending end', () => {
  assert.equal(reduce(one(), { extra: ['--sender-offload-off', '1', '--sender-iface', 'erp_nginx:eth0'] }).health.senderOffloadOff, true)
  assert.equal(reduce(one(), { extra: ['--sender-offload-off', '0'] }).health.senderOffloadOff, false)
  assert.equal(reduce(one(), { extra: ['--sender-offload-off', '1', '--sender-iface', 'erp_nginx:eth0'] }).health.senderIface, 'erp_nginx:eth0')
})

test('a capture that was not told about the sending end says it does not know', () => {
  assert.equal(reduce(one()).health.senderOffloadOff, null)
})

// --- what the capture was scoped to ------------------------------------------------

test('a request record names both ends of its connection', () => {
  const lines = [frame({ number: 1, epochMs: 1000, stream: 0, srcPort: 40000, dstPort: 3001, seq: 1, len: 100, ip: ['172.18.0.4', '172.18.0.2'], http: requestHttp({ qaId: 'a' }) })]
  const r = byId(reduce(lines), 'a')
  assert.equal(r.src, '172.18.0.4:40000')
  assert.equal(r.dst, '172.18.0.2:3001')
})

test('the health record says which address and filter the capture was scoped to', () => {
  const filter = 'tcp port 3001 and host 172.18.0.4'
  const { health } = reduce(one(), { extra: ['--ingress-addr', '172.18.0.4', '--filter', filter] })
  assert.equal(health.ingressAddr, '172.18.0.4')
  assert.equal(health.filter, filter)
})

test('a capture that was not scoped says so', () => {
  const { health } = reduce(one())
  assert.equal(health.ingressAddr, null)
  assert.equal(health.filter, null)
})
