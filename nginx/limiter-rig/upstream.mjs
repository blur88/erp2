// A recording upstream for the limiter rig (nginx/limiter-rig/rig.sh).
// No dependencies and no NGINX: it answers every path, records when each
// request arrived, and can hold a response so that requests are in flight
// together rather than one after another.
//
//   port 3001  any path -> 200 {} after the X-Rig-Hold-Ms header's
//              milliseconds (default 0, at most MAX_HOLD_MS)
//   port 3002  GET /__arrivals    -> [{ seq, qaId, uri, arrivedMs }]
//              DELETE /__arrivals -> clears the record, answers the count
//
// arrivedMs is taken first thing in the request handler, from the same clock
// as timeOrigin, so arrival times are comparable with each other.

import http from 'node:http'
import { fileURLToPath } from 'node:url'

const REQUEST_PORT = 3001
const CONTROL_PORT = 3002

// The longest hold a request can ask for. The probe holds for 2000 ms and
// the verification phases for less; without a cap the header would let any
// client keep a response, and its timer, pending for as long as it liked.
export const MAX_HOLD_MS = 2000

/** The hold an X-Rig-Hold-Ms header value asks for: 0 unless it is a positive finite number, never above MAX_HOLD_MS. */
export function holdMsOf(headerValue) {
  const text = Array.isArray(headerValue) ? headerValue[0] : headerValue
  if (typeof text !== 'string' || text.trim() === '') return 0
  const asked = Number(text)
  if (!Number.isFinite(asked) || asked <= 0) return 0
  return Math.min(asked, MAX_HOLD_MS)
}

const arrivals = []
let seq = 0

function nowMs() {
  return performance.timeOrigin + performance.now()
}

const requests = http.createServer((req, res) => {
  const arrivedMs = nowMs()
  const hold = holdMsOf(req.headers['x-rig-hold-ms'])
  arrivals.push({
    seq: seq++,
    qaId: req.headers['x-qa-request-id'] ?? null,
    uri: req.url,
    arrivedMs,
  })
  const answer = () => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{}')
  }
  if (hold > 0) setTimeout(answer, hold)
  else answer()
})

const control = http.createServer((req, res) => {
  const json = (status, body) => {
    const text = JSON.stringify(body)
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) })
    res.end(text)
  }
  if (req.method === 'GET' && req.url === '/__arrivals') {
    json(200, arrivals)
    return
  }
  if (req.method === 'DELETE' && req.url === '/__arrivals') {
    const cleared = arrivals.length
    arrivals.length = 0
    json(200, { cleared })
    return
  }
  json(404, { error: 'unknown control path' })
})

// Listening only when run as the rig's upstream, so that the tests can
// import holdMsOf without opening ports.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  requests.listen(REQUEST_PORT, () => process.stdout.write(`rig upstream listening on ${REQUEST_PORT}\n`))
  control.listen(CONTROL_PORT, () => process.stdout.write(`rig control listening on ${CONTROL_PORT}\n`))

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => process.exit(0))
  }
}
