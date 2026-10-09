// The load generator of the induced-delay scenario (lib/node-fillers.mjs),
// against a server of its own: bounded, identified, rate-controlled, and
// stopped for certain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { startNodeFillers, stopAllNodeFillers } from './lib/node-fillers.mjs'

const serve = async (holdMs = 0) => {
  const seen = []
  let inFlight = 0
  let peak = 0
  const server = createServer((req, res) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    seen.push({ id: req.headers['x-qa-request-id'], at: Date.now(), auth: req.headers.authorization ?? null, url: req.url })
    setTimeout(() => {
      inFlight -= 1
      res.writeHead(401).end('{}')
    }, holdMs)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${server.address().port}`, seen, peak: () => peak, close: () => new Promise((r) => server.close(r)) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

test('requests are sent at about the rate asked for, each with its own identifier and no credential', async () => {
  const s = await serve()
  const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10, maxTotal: 1000, maxMs: 10_000 })
  const began = Date.now()
  await sleep(1000)
  const summary = await f.stop()
  const elapsed = Date.now() - began
  await s.close()
  // Never faster than asked: that is the control. (How close it gets from
  // below depends on how busy the machine running the tests is, so the lower
  // bound only says that it sends.)
  assert.ok(s.seen.length <= Math.ceil((50 * elapsed) / 1000) + 2, `${s.seen.length} in ${elapsed} ms at 50 a second`)
  assert.ok(s.seen.length >= 10, `${s.seen.length} in ${elapsed} ms`)
  assert.equal(new Set(s.seen.map((x) => x.id)).size, s.seen.length)
  assert.ok(s.seen.every((x) => /^fill-t-\d{5}$/.test(x.id)))
  assert.ok(s.seen.every((x) => x.auth === null && x.url === '/api/x'))
  assert.equal(summary.sent, s.seen.length)
  assert.equal(summary.statuses['401'], summary.answered)
})

test('no more than maxInFlight are outstanding at once, however slow the server', async () => {
  const s = await serve(200)
  const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 200, maxInFlight: 4, maxTotal: 1000, maxMs: 10_000 })
  await sleep(700)
  await f.stop()
  await s.close()
  assert.ok(s.peak() <= 4, `peak ${s.peak()}`)
  assert.ok(s.peak() >= 3)
})

test('it stops by itself at maxTotal', async () => {
  const s = await serve()
  const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 500, maxInFlight: 10, maxTotal: 25, maxMs: 10_000 })
  await sleep(600)
  const summary = await f.stop()
  await s.close()
  assert.equal(s.seen.length, 25)
  assert.equal(summary.stoppedBy, 'maxTotal')
})

test('it stops by itself at maxMs', async () => {
  const s = await serve()
  const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10, maxTotal: 10_000, maxMs: 300 })
  await sleep(800)
  const before = s.seen.length
  await sleep(300)
  assert.equal(s.seen.length, before, 'nothing sent after maxMs')
  const summary = await f.stop()
  await s.close()
  assert.equal(summary.stoppedBy, 'maxMs')
})

test('after stop nothing more is sent, and requests still outstanding are aborted', async () => {
  const s = await serve(2000)
  const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 100, maxInFlight: 6, maxTotal: 1000, maxMs: 10_000 })
  await sleep(300)
  const started = Date.now()
  const summary = await f.stop()
  assert.ok(Date.now() - started < 1000, 'stop does not wait for slow answers')
  const count = s.seen.length
  await sleep(400)
  assert.equal(s.seen.length, count)
  assert.ok(summary.aborted >= 1)
  await s.close()
})

test('stopAllNodeFillers stops every generator still running: the way out on any exit', async () => {
  const s = await serve()
  startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-a', ratePerSecond: 100, maxInFlight: 6, maxTotal: 10_000, maxMs: 10_000 })
  startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-b', ratePerSecond: 100, maxInFlight: 6, maxTotal: 10_000, maxMs: 10_000 })
  // The server is closed whatever is found: left open, it keeps the test
  // process alive, and a failure here becomes a run that never ends.
  try {
    await sleep(200)
    await stopAllNodeFillers()
    // These servers answer at once, so a request sent just before the stop may
    // still be on its way to the server when the stop returns. It was sent
    // before, not after; it is given time to arrive before the count is taken.
    await sleep(200)
    const count = s.seen.length
    await sleep(300)
    assert.equal(s.seen.length, count)
  } finally {
    await s.close()
  }
})

test('bounds are required: a generator without them is refused', () => {
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10 }), /maxTotal/)
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'fill-t', ratePerSecond: 0, maxInFlight: 10, maxTotal: 1, maxMs: 1 }), /ratePerSecond/)
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'nope', ratePerSecond: 5, maxInFlight: 1, maxTotal: 1, maxMs: 1 }), /fill-/)
})
