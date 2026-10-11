// The load generator of the induced-delay scenario (lib/node-fillers.mjs),
// against a server of its own: bounded, identified, rate-controlled, and
// stopped for certain.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { startNodeFillers, stopAllNodeFillers } from './lib/node-fillers.mjs'

// holdMs null: the server takes the request and never answers it.
const serve = async (holdMs = 0) => {
  const seen = []
  let inFlight = 0
  let peak = 0
  const server = createServer((req, res) => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    seen.push({ id: req.headers['x-qa-request-id'], at: Date.now(), auth: req.headers.authorization ?? null, url: req.url })
    if (holdMs === null) return
    setTimeout(() => {
      inFlight -= 1
      res.writeHead(401).end('{}')
    }, holdMs)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const close = () =>
    new Promise((r) => {
      server.close(r)
      server.closeAllConnections()
    })
  return { base: `http://127.0.0.1:${server.address().port}`, seen, peak: () => peak, close }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Every test runs inside this. The generators are stopped and the server is
// closed whatever the test found: a server left open keeps the test process
// alive, and a failed assertion becomes a run that never ends (#1365).
const withServer = async (holdMs, body) => {
  const s = await serve(holdMs)
  try {
    return await body(s)
  } finally {
    await stopAllNodeFillers()
    await s.close()
  }
}

// A wait that fails instead of hanging when what it waits for never comes.
const within = (promise, ms, what) => {
  let timer
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${what} did not happen within ${ms} ms`)), ms)
  })
  return Promise.race([promise, late]).finally(() => clearTimeout(timer))
}
const until = async (condition, ms, what) => {
  const deadline = Date.now() + ms
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`${what} did not happen within ${ms} ms`)
    await sleep(5)
  }
}

const numberOf = (id) => Number(id.slice(id.lastIndexOf('-') + 1))

test('requests are sent at about the rate asked for, each with its own identifier and no credential', () =>
  withServer(0, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10, maxTotal: 1000, maxMs: 10_000 })
    const began = Date.now()
    await sleep(1000)
    const summary = await f.stop()
    const elapsed = Date.now() - began
    // Never faster than asked: that is the control. (How close it gets from
    // below depends on how busy the machine running the tests is, so the lower
    // bound only says that it sends.)
    assert.ok(s.seen.length <= Math.ceil((50 * elapsed) / 1000) + 2, `${s.seen.length} in ${elapsed} ms at 50 a second`)
    assert.ok(s.seen.length >= 10, `${s.seen.length} in ${elapsed} ms`)
    assert.equal(new Set(s.seen.map((x) => x.id)).size, s.seen.length)
    assert.ok(s.seen.every((x) => /^fill-t-\d{5}$/.test(x.id)))
    assert.ok(s.seen.every((x) => x.auth === null && x.url === '/api/x'))
    // Sent is counted when a request is started, and the stop aborts what is
    // outstanding: an aborted request may never have reached the server, so
    // sent and seen are not equal on a busy machine. What holds at any load is
    // that the server saw only what was sent, and that every request it did not
    // see is one the stop aborted. (Not the other way round: an aborted request
    // may have arrived first.)
    assert.ok(s.seen.every((x) => numberOf(x.id) >= 1 && numberOf(x.id) <= summary.sent), `an identifier above ${summary.sent} was seen`)
    assert.ok(summary.sent - s.seen.length <= summary.aborted, `${summary.sent} sent, ${s.seen.length} seen, ${summary.aborted} aborted`)
    assert.equal(summary.failed, 0)
    assert.equal(summary.answered + summary.aborted, summary.sent)
    assert.equal(summary.statuses['401'], summary.answered)
  }))

test('no more than maxInFlight are outstanding at once, however slow the server', () =>
  withServer(200, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 200, maxInFlight: 4, maxTotal: 1000, maxMs: 10_000 })
    await sleep(700)
    await f.stop()
    assert.ok(s.peak() <= 4, `peak ${s.peak()}`)
    assert.ok(s.peak() >= 3)
  }))

// The server holds each answer, so the last requests are certainly outstanding
// when the count is reached. Reaching it used to abort them (#1365).
test('it stops by itself at maxTotal, and the requests already started are answered, not aborted', () =>
  withServer(100, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 500, maxInFlight: 10, maxTotal: 25, maxMs: 10_000 })
    const summary = await within(f.finished, 5000, 'the generator finishing by itself')
    assert.equal(summary.stoppedBy, 'maxTotal')
    assert.equal(summary.sent, 25)
    assert.equal(summary.aborted, 0)
    assert.equal(summary.failed, 0)
    assert.equal(summary.answered, 25)
    assert.equal(summary.statuses['401'], 25)
    assert.equal(s.seen.length, 25)
    assert.equal(new Set(s.seen.map((x) => x.id)).size, 25)
    await sleep(200)
    assert.equal(s.seen.length, 25, 'nothing sent after maxTotal')
  }))

test('maxMs still ends it while it waits for the last answers after maxTotal', () =>
  withServer(null, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 500, maxInFlight: 10, maxTotal: 5, maxMs: 1000 })
    const summary = await within(f.finished, 5000, 'the generator finishing by itself')
    // All five were sent, so it was waiting, and for the original deadline:
    // counted from the start, not from when the count was reached.
    assert.equal(summary.sent, 5)
    assert.equal(summary.stoppedBy, 'maxMs')
    assert.equal(summary.answered, 0)
    assert.equal(summary.aborted, 5)
    const ran = summary.stoppedAt - summary.startedAt
    assert.ok(ran >= 1000, `ended after ${ran} ms`)
    assert.ok(s.seen.length <= 5)
  }))

test('stop and stopAllNodeFillers abort what it is still waiting for after maxTotal', () =>
  withServer(null, async (s) => {
    const config = { base: s.base, path: '/api/x', ratePerSecond: 500, maxInFlight: 10, maxTotal: 5, maxMs: 10_000 }
    const a = startNodeFillers({ ...config, prefix: 'fill-a' })
    await until(() => s.seen.length === 5, 5000, 'five requests arriving')
    await sleep(100) // past the tick that finds the count reached
    const stopped = await within(a.stop(), 1000, 'stop returning')
    assert.equal(stopped.stoppedBy, 'stop')
    assert.equal(stopped.aborted, 5)

    const b = startNodeFillers({ ...config, prefix: 'fill-b' })
    await until(() => s.seen.length === 10, 5000, 'five more requests arriving')
    await sleep(100)
    await within(stopAllNodeFillers(), 1000, 'stopAllNodeFillers returning')
    const all = await within(b.finished, 1000, 'the second generator finishing')
    assert.equal(all.stoppedBy, 'stop')
    assert.equal(all.aborted, 5)
  }))

test('it stops by itself at maxMs', () =>
  withServer(0, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10, maxTotal: 10_000, maxMs: 300 })
    const summary = await within(f.finished, 5000, 'the generator finishing by itself')
    assert.equal(summary.stoppedBy, 'maxMs')
    // A request sent just before the deadline may still be on its way to the
    // server; it is given time to arrive before the count is taken.
    await sleep(200)
    const before = s.seen.length
    await sleep(300)
    assert.equal(s.seen.length, before, 'nothing sent after maxMs')
  }))

test('after stop nothing more is sent, and requests still outstanding are aborted', () =>
  withServer(2000, async (s) => {
    const f = startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-t', ratePerSecond: 100, maxInFlight: 6, maxTotal: 1000, maxMs: 10_000 })
    await sleep(300)
    const started = Date.now()
    const summary = await f.stop()
    assert.ok(Date.now() - started < 1000, 'stop does not wait for slow answers')
    await sleep(200) // as above: sent before the stop, not after
    const count = s.seen.length
    await sleep(400)
    assert.equal(s.seen.length, count)
    assert.ok(summary.aborted >= 1)
  }))

test('stopAllNodeFillers stops every generator still running: the way out on any exit', () =>
  withServer(0, async (s) => {
    startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-a', ratePerSecond: 100, maxInFlight: 6, maxTotal: 10_000, maxMs: 10_000 })
    startNodeFillers({ base: s.base, path: '/api/x', prefix: 'fill-b', ratePerSecond: 100, maxInFlight: 6, maxTotal: 10_000, maxMs: 10_000 })
    await sleep(200)
    await stopAllNodeFillers()
    // These servers answer at once, so a request sent just before the stop may
    // still be on its way to the server when the stop returns. It was sent
    // before, not after; it is given time to arrive before the count is taken.
    await sleep(200)
    const count = s.seen.length
    await sleep(300)
    assert.equal(s.seen.length, count)
  }))

test('bounds are required: a generator without them is refused', () => {
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'fill-t', ratePerSecond: 50, maxInFlight: 10 }), /maxTotal/)
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'fill-t', ratePerSecond: 0, maxInFlight: 10, maxTotal: 1, maxMs: 1 }), /ratePerSecond/)
  assert.throws(() => startNodeFillers({ base: 'http://127.0.0.1:1', path: '/api/x', prefix: 'nope', ratePerSecond: 5, maxInFlight: 1, maxTotal: 1, maxMs: 1 }), /fill-/)
})
