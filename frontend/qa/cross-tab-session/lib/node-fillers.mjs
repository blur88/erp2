// The load generator of the induced-delay scenario (case 17): filler requests
// sent by this Node process, not by a browser. Bounded, identified and
// rate-controlled, and stopped for certain (node-fillers.test.mjs).
//
// Why Node and not a browser context: at twenty application tabs the browser
// is busy enough that fillers sent from one of its contexts arrive in fits and
// starts and do not keep the limiter's excess up (measured on f2ce87c67: the
// excess was above the delay threshold for 6 to 10% of the six seconds before
// the logout at twenty tabs, against 76 to 93% at five). This process is in the
// same container as the browser, so its requests leave from the same address
// and land in the same limiter bucket; that is read from the ingress log of
// every attempt, not assumed.
//
// It changes the load generator. It changes nothing about the application
// workload the scenario makes its claim about.

const running = new Set()

/**
 * Starts sending `ratePerSecond` unauthenticated GETs a second to `base + path`,
 * each with `x-qa-request-id: <prefix>-<n>`, never more than `maxInFlight`
 * outstanding, never more than `maxTotal` in all, never for longer than
 * `maxMs`. Returns { stop }, which ends it, aborts what is outstanding and
 * resolves with what was sent.
 */
export function startNodeFillers({ base, path, prefix, ratePerSecond, maxInFlight, maxTotal, maxMs }) {
  if (!(ratePerSecond > 0)) throw new Error('ratePerSecond must be positive')
  if (!(maxInFlight > 0)) throw new Error('maxInFlight must be positive')
  if (!(maxTotal > 0)) throw new Error('maxTotal is required: the generator is bounded')
  if (!(maxMs > 0)) throw new Error('maxMs is required: the generator is bounded')
  if (!/^fill-/.test(prefix)) throw new Error('the prefix must start with fill-: that is how a filler is told from the application')

  const abort = new AbortController()
  const summary = { sent: 0, answered: 0, aborted: 0, failed: 0, statuses: {}, stoppedBy: null, startedAt: Date.now(), stoppedAt: null }
  const outstanding = new Set()
  let stopped = false
  const startedAt = Date.now()

  const end = (why) => {
    if (stopped) return
    stopped = true
    summary.stoppedBy = why
    summary.stoppedAt = Date.now()
    clearInterval(timer)
    abort.abort()
    running.delete(handle)
  }

  const sendOne = () => {
    const id = `${prefix}-${String((summary.sent += 1)).padStart(5, '0')}`
    const request = fetch(`${base}${path}`, { headers: { 'x-qa-request-id': id }, signal: abort.signal })
      .then(async (response) => {
        summary.answered += 1
        summary.statuses[response.status] = (summary.statuses[response.status] ?? 0) + 1
        await response.arrayBuffer().catch(() => undefined)
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') summary.aborted += 1
        else summary.failed += 1
      })
      .finally(() => outstanding.delete(request))
    outstanding.add(request)
  }

  // A tick more often than the rate, and a count of what is due: the rate holds
  // even when a tick is late.
  let due = 0
  let last = Date.now()
  const timer = setInterval(() => {
    if (stopped) return
    const now = Date.now()
    if (now - startedAt >= maxMs) return end('maxMs')
    due += ((now - last) / 1000) * ratePerSecond
    last = now
    while (due >= 1 && !stopped) {
      due -= 1
      if (summary.sent >= maxTotal) return end('maxTotal')
      if (outstanding.size >= maxInFlight) {
        due = Math.min(due, 1) // not owed later: a full pipe is the bound, not a debt
        break
      }
      sendOne()
    }
  }, 10)
  timer.unref?.()

  const handle = {
    async stop() {
      end('stop')
      await Promise.allSettled([...outstanding])
      return { ...summary, config: { ratePerSecond, maxInFlight, maxTotal, maxMs } }
    },
  }
  running.add(handle)
  return handle
}

/** Stops every generator still running. Called on every way out of a case. */
export async function stopAllNodeFillers() {
  await Promise.allSettled([...running].map((handle) => handle.stop()))
}
