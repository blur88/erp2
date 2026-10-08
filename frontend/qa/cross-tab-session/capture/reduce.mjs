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
//   reduce.mjs --segment <name> --out <file.jsonl> [--capture-stderr <file>]
//              [--require-qa-id] [--iface <name> --gro-off 0|1]
//              [--sender-iface <name> --sender-offload-off 0|1]
//              [--tshark-version-file <file>]
//
// Output, one JSON object per line:
//   { kind: 'request', qaId, method, uri, tokenFingerprint, stream, frames,
//     frameCount, frameBytes, bytes, paddingBytes, arrivedFirstMs,
//     arrivedLastMs, status, answeredFrames, answeredFrameCount,
//     answeredFirstMs, answeredLastMs, retransmitted }
//   { kind: 'invalid', reason, stream, fromMs, toMs, detail, src, dst }
//   { kind: 'health', frames, captured, dropped, dropDetail, analysis, tshark,
//     reducer }
// `dropped` is a number only when the capture tool reported one; a count it
// did not report is null, never zero.
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
const captureStderrPath = arg('capture-stderr', null)
const tsharkVersionPath = arg('tshark-version-file', null)
const requireQaId = argv.includes('--require-qa-id')
const iface = arg('iface', null)
const groOff = arg('gro-off', null) === '1'
// The sending end (the ingress): null when the capture was not told.
const senderIface = arg('sender-iface', null)
const senderOffloadArg = arg('sender-offload-off', null)
const senderOffloadOff = senderOffloadArg === null ? null : senderOffloadArg === '1'

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

// Which frames a message was reassembled from, how many bytes each carried,
// and when each was captured.
function recordFrames(list) {
  const first = list[0]
  const last = list[list.length - 1]
  return {
    frames: list.map((f) => f.frame),
    frameCount: list.length,
    frameBytes: list.map((f) => f.bytes),
    bytes: list.reduce((sum, f) => sum + f.bytes, 0),
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

// Both ends of the connection a frame travelled on, as address:port. Null when
// the decoder named no address: a guess would be worse than nothing.
function endpoints(layers, srcPort, dstPort) {
  const v4 = layers.ip
  const v6 = layers.ipv6
  const one = (address, port, bracket) =>
    typeof address === 'string' && address !== '' ? `${bracket ? `[${address}]` : address}:${port}` : null
  if (v4 && v4.ip_ip_src !== undefined) {
    return { src: one(firstValue(v4.ip_ip_src), srcPort, false), dst: one(firstValue(v4.ip_ip_dst), dstPort, false) }
  }
  if (v6 && v6.ipv6_ipv6_src !== undefined) {
    return { src: one(firstValue(v6.ipv6_ipv6_src), srcPort, true), dst: one(firstValue(v6.ipv6_ipv6_dst), dstPort, true) }
  }
  return { src: null, dst: null }
}

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
  const ends = endpoints(layers, srcPort, dstPort)

  if (flag(analysis.tcp_analysis_retransmission)) analysisCounts.retransmission += 1
  if (flag(analysis.tcp_analysis_lost_segment)) {
    analysisCounts.lost_segment += 1
    doubtfulFrom.set(stream, ms)
    invalid.push({ reason: 'lost-segment', stream, fromMs: ms, toMs: ms, detail: 'tcp.analysis.lost_segment', ...ends })
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
      ...ends,
    })
  }
  if (flag(analysis.tcp_analysis_flags_tree) && layers['tcp.segment']?.tcp_segment_error) {
    analysisCounts.overlap += 1
    invalid.push({ reason: 'segment-error', stream, fromMs: ms, toMs: ms, detail: 'tcp.segment.error', ...ends })
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
      ...ends,
    })
    side.pending = []
    side.nextSeq = seq
  }
  side.nextSeq = seq + dataLen
  side.pending.push({ frame: frameNumber, ms, bytes: dataLen })

  if (!isRequest && !isResponse) return

  const frames = recordFrames(side.pending)
  side.pending = []

  if (isRequest) {
    const headerLines = [http.http_http_request_line ?? []].flat().map(String)
    const qaLine = headerLines.find((line) => /^x-qa-request-id:/i.test(line))
    const qaId = qaLine ? qaLine.slice(qaLine.indexOf(':') + 1).trim() : null
    // The padding a feasibility request carries, by its length alone: whether
    // it reached the backend is the question, and its content is never kept.
    const paddingLine = headerLines.find((line) => /^x-qa-padding:/i.test(line))
    const paddingBytes = paddingLine ? paddingLine.slice(paddingLine.indexOf(':') + 1).trim().length : null
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
      frameBytes: frames.frameBytes,
      bytes: frames.bytes,
      paddingBytes,
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
        ...ends,
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
      ...ends,
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
      ...ends,
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

/**
 * What the capture tool says it captured and dropped, from the file its stderr
 * went to. The tool is dumpcap, which ends with one line per interface:
 *
 *   Packets received/dropped on interface 'any': 709/0 (pcap:0/dumpcap:0/flushed:0/ps_ifdrop:0) (100.0%)
 *
 * `dropped` is a number only when every such line could be read in full and
 * its total equals the sum of its parts. Anything else - no line, a line cut
 * short, a total that disagrees with its parts - leaves it null: a count nobody
 * reported is not a count of zero. (tshark on its own prints a drop line only
 * when it dropped something, which is why it is not what captures here.)
 */
function readCaptureCounts() {
  const counts = { captured: null, dropped: null, dropDetail: null }
  if (!captureStderrPath) return counts
  let text = ''
  try {
    text = readFileSync(captureStderrPath, 'utf8')
  } catch {
    return counts
  }
  const captured = /Packets captured:\s*(\d+)/.exec(text) ?? /(\d+)\s+packets captured/.exec(text)
  if (captured) counts.captured = Number(captured[1])

  const lines = text.split('\n').filter((line) => line.includes('Packets received/dropped on interface'))
  if (lines.length === 0) return counts
  const full = /^Packets received\/dropped on interface '[^']*': (\d+)\/(\d+) \(pcap:(\d+)\/dumpcap:(\d+)\/flushed:(\d+)\/ps_ifdrop:(\d+)\)/
  const detail = { received: 0, pcap: 0, dumpcap: 0, flushed: 0, ps_ifdrop: 0 }
  let dropped = 0
  for (const line of lines) {
    const m = full.exec(line.trim())
    if (!m) return counts
    const [received, total, pcap, dumpcap, flushed, ifdrop] = m.slice(1).map(Number)
    if (total !== pcap + dumpcap + flushed + ifdrop) return counts
    dropped += total
    detail.received += received
    detail.pcap += pcap
    detail.dumpcap += dumpcap
    detail.flushed += flushed
    detail.ps_ifdrop += ifdrop
  }
  counts.dropped = dropped
  counts.dropDetail = detail
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
    dropDetail: counts.dropDetail,
    analysis: analysisCounts,
    tshark: readTsharkVersion(),
    reducer: REDUCER_VERSION,
    requireQaId,
    iface,
    // Whether segmentation offload was off, so the frames a message spans are
    // the segments it was sent in and not one coalesced frame.
    groOff,
    // And at the sending end, which is the one that decides: with segmentation
    // offload on there, a request larger than the MTU crosses the bridge as one
    // large frame and is never segmented at all, whatever this end is set to.
    senderIface,
    senderOffloadOff,
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
