#!/usr/bin/env node
// Make a recorded capture safe to keep: keep only the fields the reducer reads,
// in the decoder's own layer structure, with every credential replaced by a
// generated value.
//
// The fixture the reducer's tests run on is produced by this script:
//
//   record-fixture.sh  # a capture of the real ingress, written outside the repository
//   node capture/sanitise-fixture.mjs <raw>.ek capture/fixture.ek.jsonl
//
// and the raw capture is deleted as soon as it has been read. The assertions at
// the end are what make the fixture trustworthy: a value that still looks like a
// credential once the generated ones are taken out did not get replaced, and the
// script fails rather than writes.
//
// Usage: node capture/sanitise-fixture.mjs <raw.ek> <out.jsonl>

import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath] = process.argv
if (!inPath || !outPath) {
  process.stderr.write('usage: sanitise-fixture.mjs <raw.ek> <out.jsonl>\n')
  process.exit(2)
}

// Values that stand in for what the capture really carried. They are meant to
// look like the real thing, so a test that compares a fingerprint has something
// to compare.
const GENERATED = {
  access: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.Z2VuZXJhdGVkLWZpeHR1cmU.c2lnbmF0dXJl',
  refresh: 'generated-refresh-token-value-000000000000',
}

// Every field the reducer reads, and nothing else. A field not listed here is
// dropped, which is also how response bodies and packet payloads go: they are
// not read, so they are not kept.
const KEEP = {
  frame: ['frame_frame_number', 'frame_frame_time_epoch', 'frame_frame_len'],
  tcp: ['tcp_tcp_srcport', 'tcp_tcp_dstport', 'tcp_tcp_stream', 'tcp_tcp_seq', 'tcp_tcp_len'],
  'tcp.analysis': ['tcp_analysis_retransmission', 'tcp_analysis_lost_segment', 'tcp_analysis_ack_lost_segment'],
  'tcp.segment': ['tcp_segment_error'],
  http: [
    'http_http_request',
    'http_http_request_method',
    'http_http_request_uri',
    'http_http_request_version',
    'http_http_request_line',
    'http_http_authorization',
    'http_http_response',
    'http_http_response_code',
    'http_http_request_in',
  ],
}

let dropped = 0

function keepLayer(layer, value) {
  const allowed = new Set(KEEP[layer] ?? [])
  const kept = {}
  for (const [name, field] of Object.entries(value ?? {})) {
    if (!allowed.has(name)) {
      dropped += 1
      continue
    }
    if (name === 'http_http_authorization') {
      kept[name] = GENERATED.access
      continue
    }
    if (name === 'http_http_request_line') {
      // tshark reports a header line it has no field of its own for as an
      // http_http_request_line item whose text is the whole line. The
      // Authorization line is one of those, so it is dropped here: its value
      // has already been replaced in http_http_authorization above.
      kept[name] = []
        .concat(field)
        .map(String)
        .filter((line) => !/^authorization:/i.test(line))
        .map((line) => line.replace(/(refreshToken=)[^&\s"]+/gi, `$1${GENERATED.refresh}`))
      continue
    }
    kept[name] = field
  }
  return kept
}

const out = []
for (const line of readFileSync(inPath, 'utf8').split('\n')) {
  if (line.trim() === '') continue
  const record = JSON.parse(line)
  if (!record.layers) continue // the ek header record
  const layers = {}
  for (const [layer, value] of Object.entries(record.layers)) {
    if (!(layer in KEEP)) {
      dropped += Object.keys(value ?? {}).length
      continue
    }
    layers[layer] = keepLayer(layer, value)
  }
  out.push(JSON.stringify({ timestamp: record.timestamp, layers }))
}

const text = out.join('\n') + '\n'
for (const forbidden of [/eyJ[A-Za-z0-9_-]{10,}/, /Bearer\s+\S{20,}/]) {
  const hit = out.findIndex((l) =>
    forbidden.test(l.split(GENERATED.access).join('').split(GENERATED.refresh).join('')),
  )
  if (hit >= 0) {
    process.stderr.write(`sanitise-fixture: a credential survived in record ${hit}\n`)
    process.exit(1)
  }
}
writeFileSync(outPath, text)
console.log(`kept ${out.length} records, dropped ${dropped} fields, ${text.length} bytes`)
