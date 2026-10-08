#!/usr/bin/env node
// Reduce a tshark capture of the ingress-to-backend traffic to one line per
// request, and say plainly what it could not read.
//
// The traffic is plain HTTP and carries access tokens, refresh tokens and
// business data, so the raw stream never leaves this process: it arrives on
// stdin as tshark's own JSON (the `ek` format, one object per frame) and only
// the reduced records are written out. Nothing here parses packet bytes: every
// value read comes from a named field of the decoder's output, including the
// request's header lines, which tshark reports as `http_http_request_line`
// entries for the headers it has no field of its own for.
//
// Written by capture/entrypoint.sh. Usage:
//   reduce.mjs --segment <name> --out <file.jsonl> [--tshark-stderr <file>]
//              [--require-qa-id] [--iface <name> --gro-off 0|1]
//              [--tshark-version-file <file>]
//
// Output, one JSON object per line:
//   { kind: 'request', qaId, method, uri, tokenFingerprint, stream, frames,
//     frameCount, arrivedFirstMs, arrivedLastMs, status, answeredFrames,
//     answeredFrameCount, answeredFirstMs, answeredLastMs, retransmitted }
//   { kind: 'invalid', reason, stream, fromMs, toMs, detail }
//   { kind: 'health', frames, captured, dropped, analysis, tshark, reducer }
// A missing health record means the capture did not end cleanly, and a segment
// with one is the only thing that may be judged.

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { basename } from 'node:path'

const REDUCER_VERSION = `reduce.mjs (${basename(process.argv[1] ?? 'reduce.mjs')})`
const BACKEND_PORT = 3001

const argv = process.argv.slice(2)
function arg(name, fallback = null) {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const segment = arg('segment', 'segment')
const outPath = arg('out')
const tsharkStderrPath = arg('tshark-stderr', null)
const tsharkVersionPath = arg('tshark-version-file', null)
const requireQaId = argv.includes('--require-qa-id')
const iface = arg('iface', null)
const groOff = arg('gro-off', null) === '1'

if (!outPath) {
  process.stderr.write('reduce.mjs: --out is required\n')
  process.exit(2)
}

const invalid = []
const requests = []
const analysisCounts = { retransmission: 0, lost_segment: 0, ack_lost_segment: 0, overlap: 0 }
let framesSeen = 0

// The decoder writes frame times to the nanosecond; Date.parse would truncate
// them to the millisecond, and two frames of one message can be microseconds
// apart. The fractions are kept, because what says a message spanned several
// frames is that its first and last frame times differ at all.
function epochMs(iso) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z$/.exec(String(iso))
  if (!m) {
    const t = Date.parse(iso)
    return Number.isFinite(t) ? t : null
  }
  const base = Date.parse(`${m[1]}Z`)
  if (!Number.isFinite(base)) return null
  return base + Number(`0.${m[2] ?? '0'}`) * 1000
}

/** The 12-character fingerprint the harness uses, so a token can be compared without being kept. */
function fingerprint(token) {
  return token ? createHash('sha256').update(token).digest('hex').slice(0, 12) : null
}

function flag(value) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.some((v) => flag(v))
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const text = String(value)
  return text !== '' && text !== '0' && text.toLowerCase() !== 'false'
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] : value
}

const analysisOf = (layers) => layers['tcp.analysis'] ?? {}

/**
 * One stream's two directions. A direction's bytes are strictly ordered, so a
 * message is the run of frames from the byte after the previous message to the
 * frame the decoder dissected: a frame's own sequence and length say which
 * bytes it carried, and the decoder says where the message ended.
 */
class Direction {
  constructor(stream, name) {
    this.stream = stream
    this.name = name
    this.nextSeq = null
    this.pending = []
    this.lastRequest = null
  }

  message(from, to) {
    return { stream: this.stream, direction: this.name, frames: from, firstMs: from[0].ms, lastMs: to.ms }
  }
}

// Which frames a message was reassembled from, and when each was captured.
function recordFrames(list) {
  const first = list[0]
  const last = list[list.length - 1]
  return {
    frames: list.map((f) => f.frame),
    frameCount: list.length,
    firstFrame: first.frame,
    lastFrame: last.frame,
    firstMs: first.ms,
    lastMs: last.ms,
  }
}

const streams = new Map()

function directionFor(frame) {
  const key = frame.stream
  if (!streams.has(key)) streams.set(key, {})
  const sides = streams.get(key)
  const name = frame.dstPort === BACKEND_PORT ? 'request' : 'response'
  if (!sides[name]) sides[name] = new Direction(frame.stream, name)
  return sides[name]
}

// Every request frame number, so the decoder's own pairing can be checked
// against it and not merely trusted.
const requestsByFrame = new Map()

// A stream the decoder says lost a segment on, from when it says so. Nothing
// read from that stream after that point is a message anyone may rely on, so no
// request record is written for it: a doubtful message is not reported as a
// request, it is reported as invalid.
const doubtfulFrom = new Map()

function handleFrame(rec) {
  const layers = rec.layers ?? {}
  const frameLayer = layers.frame ?? {}
  const tcp = layers.tcp ?? {}
  const analysis = analysisOf(layers)
  const http = layers.http ?? {}

  const frameNumber = Number(frameLayer.frame_frame_number)
  const ms = epochMs(frameLayer.frame_frame_time_epoch)
  const stream = Number(tcp.tcp_tcp_stream)
  const srcPort = Number(tcp.tcp_tcp_srcport)
  const dstPort = Number(tcp.tcp_tcp_dstport)
  const seq = Number(tcp.tcp_tcp_seq)
  const len = Number(tcp.tcp_tcp_len ?? 0)
  framesSeen += 1

  if (!Number.isFinite(frameNumber) || ms === null || !Number.isFinite(stream)) return

  if (flag(analysis.tcp_analysis_retransmission)) analysisCounts.retransmission += 1
  if (flag(analysis.tcp_analysis_lost_segment)) {
    analysisCounts.lost_segment += 1
    doubtfulFrom.set(stream, ms)
    invalid.push({ reason: 'lost-segment', stream, fromMs: ms, toMs: ms, detail: 'tcp.analysis.lost_segment' })
  }
  if (flag(analysis.tcp_analysis_ack_lost_segment)) {
    analysisCounts.ack_lost_segment += 1
    doubtfulFrom.set(stream, ms)
    invalid.push({
      reason: 'unseen-segment',
      stream,
      fromMs: ms,
      toMs: ms,
      detail: 'tcp.analysis.ack_lost_segment: a segment acknowledged but never seen',
    })
  }
  if (flag(analysis.tcp_analysis_flags_tree) && layers['tcp.segment']?.tcp_segment_error) {
    analysisCounts.overlap += 1
    invalid.push({ reason: 'segment-error', stream, fromMs: ms, toMs: ms, detail: 'tcp.segment.error' })
  }

  const isRequest = http.http_http_request !== undefined && http.http_http_request_method !== undefined
  const isResponse = http.http_http_response !== undefined && http.http_http_response_code !== undefined
  const dataLen = Number.isFinite(len) ? len : 0
  if (dataLen === 0 && !isRequest && !isResponse) return

  const side = directionFor({ stream, srcPort, dstPort })
  if (side.nextSeq === null) side.nextSeq = seq

  // Bytes entirely below the next message boundary: a retransmission of
  // something already read. It belongs to the message it repeats and does not
  // start a second one. On the request side it says the ingress's own send was
  // retried at TCP level, which the request record carries; on the response
  // side it changes no timestamp, because the first copy is the one the record
  // already read, so it is only counted.
  if (seq + dataLen <= side.nextSeq) {
    if (side.name === 'request' && side.lastRequest) side.lastRequest.retransmitted = true
    return
  }
  if (seq > side.nextSeq) {
    // The decoder's own sequence numbers leave a hole: bytes are missing
    // between two frames, so nothing from here on can be read as a message.
    invalid.push({
      reason: 'missing-bytes',
      stream,
      fromMs: ms,
      toMs: ms,
      detail: `tcp.seq ${seq} follows ${side.nextSeq}`,
    })
    side.pending = []
    side.nextSeq = seq
  }
  side.nextSeq = seq + dataLen
  side.pending.push({ frame: frameNumber, ms })

  if (!isRequest && !isResponse) return

  const frames = recordFrames(side.pending)
  side.pending = []

  if (isRequest) {
    const headerLines = [http.http_http_request_line ?? []].flat().map(String)
    const qaLine = headerLines.find((line) => /^x-qa-request-id:/i.test(line))
    const qaId = qaLine ? qaLine.slice(qaLine.indexOf(':') + 1).trim() : null
    const auth = firstValue(http.http_http_authorization)
    const request = {
      kind: 'request',
      qaId: qaId || null,
      method: String(firstValue(http.http_http_request_method)),
      uri: String(firstValue(http.http_http_request_uri)),
      // The fingerprint only: the token itself is never written anywhere.
      tokenFingerprint: fingerprint(auth ? String(auth).replace(/^Bearer\s+/i, '') : null),
      stream,
      // The frame numbers the message was reassembled from: more than one is
      // what says it spanned several frames, whatever the times read.
      frames: frames.frames,
      frameCount: frames.frameCount,
      arrivedFirstMs: frames.firstMs,
      arrivedLastMs: frames.lastMs,
      status: null,
      answeredFrames: null,
      answeredFrameCount: null,
      answeredFirstMs: null,
      answeredLastMs: null,
      retransmitted: false,
    }
    const doubtful = doubtfulFrom.get(stream)
    if (doubtful !== undefined && frames.firstMs >= doubtful) {
      // Reported through the invalid record above, not as a request.
      requestsByFrame.delete(frameNumber)
      return
    }
    requests.push(request)
    requestsByFrame.set(frameNumber, request)
    if (side.name === 'request') side.lastRequest = request
    if (requireQaId && !request.qaId) {
      invalid.push({
        reason: 'missing-qa-id',
        stream,
        fromMs: frames.firstMs,
        toMs: frames.lastMs,
        detail: `${request.method} ${request.uri}`,
      })
    }
    return
  }

  // A response. The decoder pairs it with the request frame it belongs to.
  const inFrame = Number(firstValue(http.http_http_request_in))
  const request = Number.isFinite(inFrame) ? requestsByFrame.get(inFrame) : null
  const status = Number(firstValue(http.http_http_response_code))
  if (!request) {
    invalid.push({
      reason: 'response-without-request',
      stream,
      fromMs: frames.firstMs,
      toMs: frames.lastMs,
      detail: `http.request_in ${Number.isFinite(inFrame) ? inFrame : '(absent)'}`,
    })
    return
  }
  if (request.status !== null || request.answeredFirstMs !== null) {
    invalid.push({
      reason: 'pairing-disagrees',
      stream,
      fromMs: frames.firstMs,
      toMs: frames.lastMs,
      detail: 'a second response for one request on this stream',
    })
    return
  }
  request.status = status
  request.answeredFrames = frames.frames
  request.answeredFrameCount = frames.frameCount
  request.answeredFirstMs = frames.firstMs
  request.answeredLastMs = frames.lastMs
}

// Duplicate ids: one identifier must mean one request.
function markDuplicateQaIds() {
  const seen = new Map()
  for (const request of requests) {
    if (!request.qaId) continue
    if (seen.has(request.qaId)) {
      for (const other of [seen.get(request.qaId), request]) {
        invalid.push({
          reason: 'duplicate-qa-id',
          stream: other.stream,
          fromMs: other.arrivedFirstMs,
          toMs: other.arrivedLastMs,
          detail: `${other.method} ${other.uri}`,
        })
      }
    } else {
      seen.set(request.qaId, request)
    }
  }
}

/** tshark's own captured and dropped counts, read from the file its stderr went to. */
function readCaptureCounts() {
  const counts = { captured: null, dropped: null }
  if (!tsharkStderrPath) return counts
  let text = ''
  try {
    text = readFileSync(tsharkStderrPath, 'utf8')
  } catch {
    return counts
  }
  const captured = /(\d+)\s+packets captured/.exec(text)
  const dropped = /(\d+)\s+packets dropped/.exec(text)
  if (captured) counts.captured = Number(captured[1])
  if (dropped) counts.dropped = Number(dropped[1])
  return counts
}

/** Which decoder produced this capture: the tool prints its version, not its stream. */
function readTsharkVersion() {
  if (!tsharkVersionPath) return null
  try {
    const m = /TShark \(Wireshark\)\s+([\d.]+)/.exec(readFileSync(tsharkVersionPath, 'utf8'))
    return m ? `tshark ${m[1]}` : null
  } catch {
    return null
  }
}

function write(line) {
  appendFileSync(outPath, JSON.stringify(line) + '\n')
}

async function drainStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function main() {
  writeFileSync(outPath, '')
  const text = await drainStdin()
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      // Not a field value, never the line itself: which record failed is all
      // that is safe to say.
      process.stderr.write('reduce.mjs: a decoder record was not JSON\n')
      process.exitCode = 1
      return
    }
    if (!rec.layers) continue // the ek header
    if (!rec.layers.frame || rec.layers.frame.frame_frame_number === undefined) {
      process.stderr.write('reduce.mjs: a decoder record has no frame layer\n')
      process.exitCode = 1
      return
    }
    handleFrame(rec)
  }

  markDuplicateQaIds()
  for (const request of requests) write(request)
  for (const record of invalid) write({ kind: 'invalid', ...record })
  const counts = readCaptureCounts()
  write({
    kind: 'health',
    frames: framesSeen,
    requests: requests.length,
    invalid: invalid.length,
    captured: counts.captured,
    dropped: counts.dropped,
    analysis: analysisCounts,
    tshark: readTsharkVersion(),
    reducer: REDUCER_VERSION,
    requireQaId,
    iface,
    // Whether segmentation offload was off, so the frames a message spans are
    // the segments it was sent in and not one coalesced frame.
    groOff,
  })
}

// An uncaught error exits non-zero without printing the input it was reading.
process.on('uncaughtException', (err) => {
  process.stderr.write(`reduce.mjs: ${err.name} while reducing the capture\n`)
  process.exit(1)
})
process.on('unhandledRejection', () => process.exit(1))

main().catch((err) => {
  process.stderr.write(`reduce.mjs: ${err.name} while reducing the capture\n`)
  process.exit(1)
})
