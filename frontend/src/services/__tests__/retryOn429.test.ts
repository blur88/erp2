import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { registerSessionRuntime } from '@/session/registry'
import { SessionEndedError } from '@/session/types'
import api from '@/services/api'
import { RETRY_429, requestWithRetryOn429 } from '@/services/retryOn429'
import { createHarness } from '@/session/__tests__/twoTabs'

// The axios adapter is the fake ingress and resource server; the session runtime
// is real and runs on the in-memory store, as in api.session.test.ts. Timers are
// fake, so every wait between attempts is measured exactly.
describe('the company-data request after a 429', () => {
  type Config = InternalAxiosRequestConfig
  type Harness = ReturnType<typeof createHarness>

  const ok = (config: Config, data: unknown = {}) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  const fail = (config: Config, status: number, headers: Record<string, string> = {}) =>
    Promise.reject(
      new AxiosError(`status ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, {
        data: { message: `refused ${status}` },
        status,
        statusText: '',
        headers,
        config,
      }),
    )

  let h: Harness
  let tab: ReturnType<Harness['createTab']>
  let sent: Config[]

  const serve = (fn: (config: Config, sendNumber: number) => unknown) => {
    sent = []
    api.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      return fn(config, sent.length)
    }) as never
  }
  const bearer = (config: Config) => String(config.headers.Authorization)

  // Runs microtasks, and timers already due, without moving the clock.
  const settle = async () => {
    for (let i = 0; i < 20; i += 1) await vi.advanceTimersByTimeAsync(0)
  }
  const sends = async (count: number) => {
    await settle()
    expect(sent).toHaveLength(count)
  }
  // Exactly one timer is pending: the wait before the next attempt.
  const waiting = async () => {
    await settle()
    expect(vi.getTimerCount()).toBe(1)
  }
  // The wait now running is exactly `ms`: nothing is sent a millisecond early.
  const expectWait = async (ms: number, sendsSoFar: number) => {
    await waiting()
    await vi.advanceTimersByTimeAsync(ms - 1)
    expect(sent).toHaveLength(sendsSoFar)
    await vi.advanceTimersByTimeAsync(1)
    await sends(sendsSoFar + 1)
  }
  // No wait timer is left once everything already due has run.
  const expectNoTimerLeft = async () => {
    await settle()
    expect(vi.getTimerCount()).toBe(0)
  }
  // Settles the promise without leaving a rejection unhandled while timers run.
  const outcome = (promise: Promise<unknown>) =>
    promise.then(
      (value) => ({ value, error: undefined as any }),
      (error) => ({ value: undefined as any, error }),
    )

  const company = (random = () => 0, signal?: AbortSignal) =>
    outcome(requestWithRetryOn429({ url: '/settings/company', method: 'GET', signal }, random))

  beforeEach(async () => {
    h = createHarness()
    tab = h.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T00:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('the budget and delays are the documented ones', () => {
    expect(RETRY_429).toEqual({ retries: 3, baseDelayMs: 500, maxDelayMs: 4000 })
  })

  it('the company-data request is retried after a 429 and succeeds', async () => {
    serve((config, n) => (n === 1 ? fail(config, 429) : ok(config, { name: 'Acme' })))
    const request = company()
    await sends(1)
    await expectWait(250, 1)
    const { value, error } = await request
    expect(error).toBeUndefined()
    expect(value.data).toEqual({ name: 'Acme' })
    expect(sent).toHaveLength(2)
    expect(sent.map((config) => config.url)).toEqual(['/settings/company', '/settings/company'])
    await expectNoTimerLeft()
  })

  describe('a valid Retry-After is respected, capped', () => {
    const cases: Array<[string, () => string, number]> = [
      ['delta-seconds', () => '2', 2000],
      ['delta-seconds of zero', () => '0', 0],
      ['delta-seconds beyond the cap', () => '30', 4000],
      ['an HTTP date', () => new Date(Date.now() + 3000).toUTCString(), 3000],
      ['an HTTP date beyond the cap', () => new Date(Date.now() + 60_000).toUTCString(), 4000],
      ['an HTTP date already past', () => new Date(Date.now() - 5000).toUTCString(), 0],
    ]
    it.each(cases)('%s', async (_name, header, wait) => {
      serve((config, n) => (n === 1 ? fail(config, 429, { 'retry-after': header() }) : ok(config)))
      // A jitter of 1 would make the backoff 500 ms: none of the waits below.
      const request = company(() => 1)
      if (wait === 0) {
        // Sent again without the clock moving at all.
        await sends(2)
      } else {
        await sends(1)
        await expectWait(wait, 1)
      }
      expect((await request).error).toBeUndefined()
      await expectNoTimerLeft()
    })

    it('the header name is matched whatever its case', async () => {
      serve((config, n) => (n === 1 ? fail(config, 429, { 'Retry-After': '2' }) : ok(config)))
      const request = company(() => 1)
      await sends(1)
      await expectWait(2000, 1)
      expect((await request).error).toBeUndefined()
    })

    it.each(['soon', '-1', '1.5', ''])('an invalid value (%j) falls back to the backoff', async (header) => {
      serve((config, n) => (n === 1 ? fail(config, 429, { 'retry-after': header }) : ok(config)))
      const request = company(() => 0)
      await sends(1)
      await expectWait(250, 1)
      expect((await request).error).toBeUndefined()
    })
  })

  describe('without Retry-After the wait is capped backoff with jitter', () => {
    // Attempt n waits between half of and all of min(cap, base * 2^n).
    it.each([
      [0, [250, 500, 1000]],
      [0.5, [375, 750, 1500]],
      [1, [500, 1000, 2000]],
    ])('jitter %d', async (jitter, waits) => {
      serve((config) => fail(config, 429))
      const request = company(() => jitter)
      await sends(1)
      for (const [index, wait] of waits.entries()) {
        const ceiling = Math.min(RETRY_429.maxDelayMs, RETRY_429.baseDelayMs * 2 ** index)
        expect(wait).toBeGreaterThanOrEqual(ceiling / 2)
        expect(wait).toBeLessThanOrEqual(ceiling)
        if (index > 0) expect(wait).toBeGreaterThan(waits[index - 1])
        await expectWait(wait, index + 1)
      }
      expect((await request).error.response.status).toBe(429)
    })
  })

  it('it stops after the retry budget and surfaces the failure', async () => {
    serve((config) => fail(config, 429))
    const request = company()
    await sends(1)
    await expectWait(250, 1)
    await expectWait(500, 2)
    await expectWait(1000, 3)
    const { error } = await request
    expect(sent).toHaveLength(RETRY_429.retries + 1)
    expect(error).toBeInstanceOf(AxiosError)
    expect(error.response.status).toBe(429)
    expect(error.response.data).toEqual({ message: 'refused 429' })
    await expectNoTimerLeft()
    // Nothing more is sent however long the tab stays open.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(4)
  })

  it.each([403, 404, 500])('other statuses are not retried (%d)', async (status) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    serve((config) => fail(config, status))
    const { error } = await company()
    expect(error.response.status).toBe(status)
    expect(sent).toHaveLength(1)
    await expectNoTimerLeft()
    consoleError.mockRestore()
  })

  it('a network error is not retried', async () => {
    serve((config) => Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)))
    const { error } = await company()
    expect(error.code).toBe('ERR_NETWORK')
    expect(sent).toHaveLength(1)
    await expectNoTimerLeft()
  })

  it('a 401 still goes through the session refresh path', async () => {
    serve((config, n) => (n === 1 ? fail(config, 401) : ok(config, { name: 'Acme' })))
    const request = company()
    await sends(2)
    const { value } = await request
    expect(value.data).toEqual({ name: 'Acme' })
    expect(sent).toHaveLength(2)
    expect(h.server.refreshCalls).toBe(1)
    expect(bearer(sent[1])).not.toBe(bearer(sent[0]))
    // No wait was involved: the re-send was the refresh path's, not this retry's.
    await expectNoTimerLeft()
  })

  it('a retry is a send like any other: a 401 on it is refreshed and re-sent', async () => {
    serve((config, n) => (n === 1 ? fail(config, 429) : n === 2 ? fail(config, 401) : ok(config, { name: 'Acme' })))
    const request = company()
    await sends(1)
    await expectWait(250, 1)
    // The refresh answers on a timer of its own.
    await vi.advanceTimersByTimeAsync(1)
    await sends(3)
    const { value } = await request
    expect(value.data).toEqual({ name: 'Acme' })
    expect(h.server.refreshCalls).toBe(1)
    expect(bearer(sent[1])).toBe(bearer(sent[0]))
    expect(bearer(sent[2])).not.toBe(bearer(sent[1]))
  })

  it('a retry whose session changed before delivery is rejected by the delivery check', async () => {
    const other = h.createTab('B')
    await other.runtime.start()
    serve(async (config, n) => {
      if (n === 1) return fail(config, 429)
      // Another tab signs out while the retry is in flight.
      await other.runtime.signOut()
      return ok(config, { name: 'Acme' })
    })
    const request = company()
    await sends(1)
    await expectWait(250, 1)
    expect((await request).error).toBeInstanceOf(SessionEndedError)
  })

  it('no retry is sent after the session ended during the wait', async () => {
    serve((config) => fail(config, 429))
    const request = company()
    await sends(1)
    await waiting()
    await tab.runtime.signOut()
    const { error } = await request
    expect(error).toBeInstanceOf(SessionEndedError)
    await expectNoTimerLeft()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(1)
  })

  it('no retry is sent after another tab ended the session during the wait', async () => {
    serve((config) => fail(config, 429))
    const other = h.createTab('B')
    await other.runtime.start()
    const request = company()
    await sends(1)
    await waiting()
    // This tab has not been told: it finds out at the retry's own gate read.
    await other.runtime.signOut()
    await vi.advanceTimersByTimeAsync(250)
    const { error } = await request
    expect(error).toBeInstanceOf(SessionEndedError)
    expect(sent).toHaveLength(1)
    await expectNoTimerLeft()
  })

  it('no retry is sent under another session', async () => {
    serve((config) => fail(config, 429))
    const request = company()
    await sends(1)
    await waiting()
    const x = h.shared.state.record.session!.sessionId
    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    const y = h.shared.state.record.session!
    expect(y.sessionId).not.toBe(x)
    const { error } = await request
    expect(error).toBeInstanceOf(SessionEndedError)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(1)
    expect(sent.map(bearer)).not.toContain(`Bearer ${y.accessToken}`)
    await expectNoTimerLeft()
  })

  it('no retry is sent under a session another tab switched to during the wait', async () => {
    serve((config) => fail(config, 429))
    const other = h.createTab('B')
    await other.runtime.start()
    const request = company()
    await sends(1)
    await waiting()
    await other.runtime.signOut()
    await other.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    const y = h.shared.state.record.session!
    await vi.advanceTimersByTimeAsync(250)
    const { error } = await request
    expect(error).toBeInstanceOf(SessionEndedError)
    expect(sent).toHaveLength(1)
    expect(sent.map(bearer)).not.toContain(`Bearer ${y.accessToken}`)
    await expectNoTimerLeft()
  })

  it('a retry refuses to go out under a session other than the one the request captured', async () => {
    serve((config) => fail(config, 429))
    // The tab switches sessions in the gap between the wait ending and the
    // re-send: too late for the session's signal to end the wait.
    const beginRequest = tab.runtime.beginRequest.bind(tab.runtime)
    let gateReads = 0
    vi.spyOn(tab.runtime, 'beginRequest').mockImplementation(async () => {
      gateReads += 1
      if (gateReads === 2) {
        await tab.runtime.signOut()
        await tab.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
      }
      return beginRequest()
    })
    const request = company()
    await sends(1)
    await waiting()
    await vi.advanceTimersByTimeAsync(250)
    const { error } = await request
    expect(error).toBeInstanceOf(SessionEndedError)
    expect(gateReads).toBe(2)
    expect(sent).toHaveLength(1)
    expect(tab.runtime.status()).toBe('signed-in')
    await expectNoTimerLeft()
  })

  describe('aborting during the wait cancels it', () => {
    it("the caller's signal", async () => {
      serve((config) => fail(config, 429))
      const caller = new AbortController()
      const request = company(() => 0, caller.signal)
      await sends(1)
      await waiting()
      caller.abort()
      const { error } = await request
      expect(error).toMatchObject({ code: 'ERR_CANCELED' })
      await expectNoTimerLeft()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(sent).toHaveLength(1)
      expect(tab.runtime.status()).toBe('signed-in')
    })

    it("the session's signal, without touching the caller's", async () => {
      serve((config) => fail(config, 429))
      const caller = new AbortController()
      const request = company(() => 0, caller.signal)
      await sends(1)
      await waiting()
      await tab.runtime.signOut()
      const { error } = await request
      expect(error).toBeInstanceOf(SessionEndedError)
      expect(caller.signal.aborted).toBe(false)
      await expectNoTimerLeft()
      await vi.advanceTimersByTimeAsync(60_000)
      expect(sent).toHaveLength(1)
    })

    it('a signal already aborted when the 429 arrives starts no wait', async () => {
      const caller = new AbortController()
      serve((config) => {
        caller.abort()
        return fail(config, 429)
      })
      const { error } = await company(() => 0, caller.signal)
      expect(error).toMatchObject({ code: 'ERR_CANCELED' })
      expect(sent).toHaveLength(1)
      await expectNoTimerLeft()
    })
  })
})
