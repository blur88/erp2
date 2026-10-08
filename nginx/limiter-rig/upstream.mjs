// A recording upstream for the limiter rig (nginx/limiter-rig/rig.sh).
// No dependencies and no NGINX: it answers every path, records when each
// request arrived, and can hold a response so that requests are in flight
// together rather than one after another.
//
//   port 3001  any path -> 200 {} after the X-Rig-Hold-Ms header's
//              milliseconds (default 0)
//   port 3002  GET /__arrivals    -> [{ seq, qaId, uri, arrivedMs }]
//              DELETE /__arrivals -> clears the record, answers the count
//
// arrivedMs is taken first thing in the request handler, from the same clock
// as timeOrigin, so arrival times are comparable with each other.

import http from 'node:http'

const REQUEST_PORT = 3001
const CONTROL_PORT = 3002

const arrivals = []
let seq = 0

function nowMs() {
  return performance.timeOrigin + performance.now()
}

const requests = http.createServer((req, res) => {
  const arrivedMs = nowMs()
  const rawHold = req.headers['x-rig-hold-ms']
  const holdMs = Number(Array.isArray(rawHold) ? rawHold[0] : rawHold)
  arrivals.push({
    seq: seq++,
    qaId: req.headers['x-qa-request-id'] ?? null,
    uri: req.url,
    arrivedMs,
  })
  const hold = Number.isFinite(holdMs) && holdMs > 0 ? holdMs : 0
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

requests.listen(REQUEST_PORT, () => process.stdout.write(`rig upstream listening on ${REQUEST_PORT}\n`))
control.listen(CONTROL_PORT, () => process.stdout.write(`rig control listening on ${CONTROL_PORT}\n`))

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => process.exit(0))
}
