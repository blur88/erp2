import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { configureStore } from '@reduxjs/toolkit'
import { createApi } from '@reduxjs/toolkit/query'
import { axiosBaseQuery } from '@/store/api/baseQuery'
import { registerSessionRuntime } from '@/session/registry'
import { createSessionRuntime } from '@/session/runtime'
import { createSharedMemory, createMemorySessionStore } from '@/session/store/memorySessionStore'
import type { AuthHttp } from '@/session/authHttp'
import type { SessionRuntime } from '@/session/runtime'
import { SessionEndedError } from '@/session/types'
import api from '@/services/api'
import { authApi } from '@/services/authApi'
import { createAuthHttp } from '@/session/authHttp'
import { createHarness, holdRefreshResponses } from '@/session/__tests__/twoTabs'

function makeRuntime(memory = createSharedMemory(), prefix = 'sess') {
  const store = createMemorySessionStore(memory)
  let seq = 0
  const http: AuthHttp = {
    async login(credentials) {
      const id = `${prefix}-${++seq}`
      return {
        sessionId: id,
        generation: 1,
        accessToken: `at-${id}`,
        accessTokenExpiresAt: 1000,
        refreshToken: `rt-${id}`,
        user: { id: 'u', username: credentials.usernameOrEmail } as never,
        requiresPasswordChange: false,
      }
    },
    async refresh() {
      throw new Error('not used')
    },
    async logout() {},
  }
  const runtime = createSessionRuntime({
    store,
    http,
    events: {
      sessionEstablished: vi.fn(),
      tokensUpdated: vi.fn(),
      sessionEnded: vi.fn(),
    },
    channel: null,
    tabId: 'test',
    now: () => 1000,
  })
  return { runtime, memory }
}

describe('api session interceptors', () => {
  let runtime: SessionRuntime
  let memory: ReturnType<typeof createSharedMemory>

  beforeEach(() => {
    const h = makeRuntime()
    runtime = h.runtime
    memory = h.memory
    registerSessionRuntime(runtime)
  })

  const respond = (fn: (config: any) => any) => {
    api.defaults.adapter = async (config: any) => fn(config)
  }

  it('a request is not sent when beginRequest rejects', async () => {
    let adapterCalled = false
    respond(() => {
      adapterCalled = true
      return { data: {}, status: 200, headers: {}, config: {} }
    })
    await expect(api.get('/auth/me')).rejects.toBeTruthy()
    expect(adapterCalled).toBe(false)
  })

  it('attaches the access token when signed in', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const token = (await (await import('@/session/registry')).getSessionRuntime())!.claim()
    expect(token).toBeTruthy()
    let authorization: string | undefined
    respond((config) => {
      authorization = config.headers.Authorization
      return { data: {}, status: 200, headers: {}, config }
    })
    await api.get('/auth/me')
    expect(authorization?.startsWith('Bearer ')).toBe(true)
  })

  // The server's 200 for a request sent under session X, held until the test
  // releases it. The adapter ignores the abort signal, as a response already on
  // its way does.
  const holdResponse = (data: unknown) => {
    const sent: any[] = []
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    api.defaults.adapter = async (config: any) => {
      sent.push(config)
      await held
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    return { sent, release: () => release() }
  }

  // Another tab of the same browser replaces the stored session with its own.
  // This tab is not told: it finds out when it next reads the record.
  const changeSessionElsewhere = async () => {
    const other = makeRuntime(memory, 'other').runtime
    await other.start()
    await other.signIn({ usernameOrEmail: 'y', password: 'p' })
    expect(memory.state.record.session?.sessionId).toBe('other-1')
    expect(runtime.claim()).toBe('sess-1')
  }

  it('a 200 whose session changed is rejected with SessionEndedError', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const response = holdResponse({ secret: 'for-x' })
    const canDeliver = vi.spyOn(runtime, 'canDeliver')

    const request = api.get('/inventory')
    const settled = request.then(
      (value) => ({ value: value.data }),
      (error: unknown) => ({ error }),
    )
    // The request went out under X; its response is on the way.
    await vi.waitFor(() => expect(response.sent).toHaveLength(1))
    expect(response.sent[0].headers.Authorization).toBe('Bearer at-sess-1')

    await changeSessionElsewhere()
    response.release()

    // The 200 arrived, and it is not handed over: the delivery check found the
    // stored session is no longer the one the request was sent under.
    expect(await settled).toEqual({ error: expect.any(SessionEndedError) })
    expect(canDeliver).toHaveBeenCalledTimes(1)
    expect(canDeliver).toHaveBeenCalledWith({ sessionId: 'sess-1', generation: 1 })
    await expect(canDeliver.mock.results[0].value).resolves.toBe(false)
    expect(runtime.claim()).toBeNull()
  })

  it('an RTK Query call whose session changed settles rejected, not pending', async () => {
    const testApi = createApi({
      reducerPath: 'deliveryTestApi',
      baseQuery: axiosBaseQuery(),
      endpoints: (builder) => ({
        inventory: builder.query<{ secret: string }, void>({ query: () => ({ url: '/inventory' }) }),
      }),
    })
    const store = configureStore({
      reducer: { [testApi.reducerPath]: testApi.reducer },
      middleware: (getDefault) => getDefault().concat(testApi.middleware),
    })
    const entry = () => testApi.endpoints.inventory.select()(store.getState())

    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const response = holdResponse({ secret: 'for-x' })

    const query = store.dispatch(testApi.endpoints.inventory.initiate())
    await vi.waitFor(() => expect(response.sent).toHaveLength(1))
    expect(entry().status).toBe('pending')

    await changeSessionElsewhere()
    response.release()

    const result = await query
    expect(result.isError).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.error).toEqual({ status: undefined, data: 'session ended before delivery' })
    expect(entry().status).toBe('rejected')
    expect(entry().data).toBeUndefined()
    query.unsubscribe()
  })

  it('sends the request and returns a normal response when the session is intact', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    respond((config) => ({ data: { ok: true }, status: 200, headers: {}, config }))
    const response = await api.get('/inventory')
    expect(response.data).toEqual({ ok: true })
  })

  it('the public default-credentials request is sent while signed out, outside the session gate', async () => {
    await runtime.start()
    expect(runtime.status()).toBe('signed-out')
    const gated: any[] = []
    respond((config) => {
      gated.push(config)
      return { data: {}, status: 200, headers: {}, config }
    })
    const bare: any[] = []
    const previous = axios.defaults.adapter
    axios.defaults.adapter = (async (config: any) => {
      bare.push(config)
      return { data: { showDefaultCredentials: true }, status: 200, statusText: 'OK', headers: {}, config }
    }) as never
    try {
      const response = await authApi.shouldShowDefaultCredentials()
      expect(response.data).toEqual({ showDefaultCredentials: true })
    } finally {
      axios.defaults.adapter = previous
    }

    expect(bare).toHaveLength(1)
    expect(bare[0].url).toBe('/auth/show-default-credentials')
    expect(bare[0].method).toBe('get')
    expect(bare[0].headers.Authorization).toBeUndefined()
    expect(gated).toHaveLength(0)
  })

  // The interceptors used to send the tab to /login themselves. Where a tab goes
  // when its session ends is the router's business (sessionRouting.test.tsx);
  // this module must not navigate, which only its source can show.
  it('does not assign window.location anywhere', () => {
    const source = readFileSync(fileURLToPath(new URL('../api.ts', import.meta.url)), 'utf8')
    expect(source).toContain('api.interceptors.response.use')
    expect(source).not.toMatch(/\blocation\s*(\.\s*(href|pathname|search|hash))?\s*=(?!=)/)
    expect(source).not.toMatch(/\blocation\s*\.\s*(assign|replace|reload)\s*\(/)
  })

  it('gate timings are recorded only when the flag is set', async () => {
    const store: Record<string, string> = {}
    ;(globalThis as unknown as { window: unknown }).window = globalThis
    ;(globalThis as unknown as { location: unknown }).location = { origin: 'http://localhost:3000' }
    ;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
    }
    const w = globalThis as unknown as { __erpSessionTimings?: unknown[] }
    delete w.__erpSessionTimings

    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    respond((config) => ({ data: {}, status: 200, headers: {}, config }))
    await api.get('/inventory')
    expect(w.__erpSessionTimings).toBeUndefined()

    store['erp-session-timing'] = '1'
    await api.get('/inventory')
    expect(Array.isArray(w.__erpSessionTimings)).toBe(true)
    expect((w.__erpSessionTimings as unknown[]).length).toBeGreaterThan(0)

    // Each gate timing carries how many gate reads were already in flight when
    // it started: a lone request sees none, requests begun together see each other.
    type Timing = { op: string; ms: number; inFlight?: number; id?: number }
    const lone = w.__erpSessionTimings as Timing[]
    expect(lone.every((t) => t.inFlight === 0)).toBe(true)

    w.__erpSessionTimings = []
    await Promise.all([api.get('/inventory'), api.get('/inventory'), api.get('/inventory')])
    const together = (w.__erpSessionTimings as Timing[]).filter((t) => t.op === 'gate-before')
    expect(together).toHaveLength(3)
    expect(together.map((t) => t.inFlight).sort()).toEqual([0, 1, 2])
    // A request's two gate timings share an id, and no two requests share one.
    const all = w.__erpSessionTimings as Timing[]
    const afters = all.filter((t) => t.op === 'gate-after')
    expect(new Set(together.map((t) => t.id)).size).toBe(3)
    expect(afters.map((t) => t.id).sort()).toEqual(together.map((t) => t.id).sort())
    delete store['erp-session-timing']
  })
})

// The refresh and retry path: the axios adapter is the fake resource server, the
// runtime is real and runs on the in-memory store against the fake auth server.
describe('api session interceptors — 401, refresh and retry', () => {
  type Config = InternalAxiosRequestConfig
  type Harness = ReturnType<typeof createHarness>

  const ok = (config: Config, data: unknown = {}) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  const fail = (config: Config, status: number, data: unknown = {}) =>
    Promise.reject(
      new AxiosError(`status ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, {
        data,
        status,
        statusText: '',
        headers: {},
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

  beforeEach(async () => {
    h = createHarness()
    tab = h.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
  })

  it('a 401 triggers one refresh and one retry', async () => {
    serve((config, n) => (n === 1 ? fail(config, 401) : ok(config, { ok: true })))
    const response = await api.get('/inventory')
    expect(response.data).toEqual({ ok: true })
    expect(sent).toHaveLength(2)
    expect(h.server.refreshCalls).toBe(1)
    expect(bearer(sent[1])).not.toBe(bearer(sent[0]))
    expect(bearer(sent[1])).toBe(`Bearer ${(await tab.runtime.beginRequest()).accessToken}`)
  })

  it('all concurrent 401s share one refresh', async () => {
    const first = `Bearer ${(await tab.runtime.beginRequest()).accessToken}`
    // Hold the three original sends until all are in flight, then 401 each.
    const inFlight: Array<() => void> = []
    serve(async (config) => {
      if (bearer(config) !== first) return ok(config, { url: config.url })
      await new Promise<void>((resolve) => {
        inFlight.push(resolve)
        if (inFlight.length === 3) inFlight.forEach((release) => release())
      })
      return fail(config, 401)
    })

    const responses = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')])
    expect(responses.map((r) => r.data)).toEqual([{ url: '/a' }, { url: '/b' }, { url: '/c' }])
    expect(h.server.refreshCalls).toBe(1)
    expect(sent).toHaveLength(6)
  })

  it('the third 401 ends the session through endAfterFinalUnauthorized', async () => {
    const endSpy = vi.spyOn(tab.runtime, 'endAfterFinalUnauthorized')
    const revision = h.shared.state.record.revision
    serve((config) => fail(config, 401))

    await expect(api.get('/inventory')).rejects.toMatchObject({ response: { status: 401 } })

    // The third send ran at generation 3, after two accepted refreshes.
    expect(endSpy).toHaveBeenCalledTimes(1)
    expect(endSpy).toHaveBeenCalledWith({ sessionId: 'sess-1', generation: 3 })
    expect(tab.runtime.status()).toBe('signed-out')
    expect(tab.runtime.claim()).toBeNull()
    expect(tab.events.ended).toEqual(['failure'])
    expect(h.shared.state.record.session).toBeNull()
    expect(h.shared.state.record.revision).toBe(revision)
  })

  it('sends at most three times and refreshes at most twice', async () => {
    serve((config) => fail(config, 401))
    await expect(api.get('/inventory')).rejects.toMatchObject({ response: { status: 401 } })
    expect(sent).toHaveLength(3)
    expect(h.server.refreshCalls).toBe(2)
  })

  it('the third 401 ends nothing when another tab advanced the session', async () => {
    const endSpy = vi.spyOn(tab.runtime, 'endAfterFinalUnauthorized')
    serve((config, n) => {
      if (n === 3) {
        // Another tab refreshed while the third send was in flight.
        const session = h.shared.state.record.session!
        h.shared.state = {
          ...h.shared.state,
          record: {
            ...h.shared.state.record,
            session: { ...session, generation: 4, accessToken: 'at-other-tab', refreshToken: 'rt-other-tab' },
          },
        }
      }
      return fail(config, 401)
    })

    await expect(api.get('/inventory')).rejects.toMatchObject({ response: { status: 401 } })

    expect(sent).toHaveLength(3)
    expect(endSpy).toHaveBeenCalledWith({ sessionId: 'sess-1', generation: 3 })
    await expect(endSpy.mock.results[0].value).resolves.toBe('kept')
    expect(tab.runtime.status()).toBe('signed-in')
    expect(tab.events.ended).toEqual([])
    expect(h.shared.state.record.session?.generation).toBe(4)
    // It reconciled: the other tab's tokens are already in this tab's memory.
    expect((tab.events.tokensUpdated as Mock).mock.calls.at(-1)?.[0].accessToken).toBe('at-other-tab')
  })

  it('a request sent under one session is not re-sent after the tab switched to another', async () => {
    const x = h.shared.state.record.session!.sessionId
    serve((config) => fail(config, 401))
    // The refresh for X's 401 is still in flight when the tab signs out and in again as Y.
    const gate = holdRefreshResponses(h.server)
    const request = api.get('/inventory')
    await vi.waitFor(() => expect(gate.waiting()).toBe(1))
    await tab.runtime.signOut()
    await tab.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
    const y = { ...h.shared.state.record.session! }
    expect(y.sessionId).not.toBe(x)
    gate.release()

    await expect(request).rejects.toMatchObject({ response: { status: 401 } })
    expect(sent).toHaveLength(1)
    expect(sent.map(bearer)).not.toContain(`Bearer ${y.accessToken}`)
    expect(tab.runtime.claim()).toBe(y.sessionId)
    expect(h.shared.state.record.session).toEqual(y)
  })

  it('a retry refuses to go out under a session other than the one the request captured', async () => {
    serve((config) => fail(config, 401))
    // The tab switches sessions in the gap between the runtime answering 'retry' and the re-send.
    vi.spyOn(tab.runtime, 'handleUnauthorized').mockImplementation(async () => {
      await tab.runtime.signOut()
      await tab.runtime.signIn({ usernameOrEmail: 'y', password: 'p' })
      return 'retry'
    })

    await expect(api.get('/inventory')).rejects.toBeInstanceOf(SessionEndedError)
    expect(sent).toHaveLength(1)
    expect(tab.runtime.status()).toBe('signed-in')
  })

  it('change-password with a 400 CURRENT_PASSWORD_INCORRECT surfaces the error, sends no refresh and ends no session', async () => {
    serve((config) => fail(config, 400, { code: 'CURRENT_PASSWORD_INCORRECT', message: 'Current password is incorrect' }))

    await expect(authApi.changePassword({ currentPassword: 'x', newPassword: 'y' } as never)).rejects.toMatchObject({
      response: { status: 400, data: { code: 'CURRENT_PASSWORD_INCORRECT' } },
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/auth/change-password')
    expect(h.server.refreshCalls).toBe(0)
    expect(tab.runtime.status()).toBe('signed-in')
    expect(tab.events.ended).toEqual([])
    expect(h.shared.state.record.session?.sessionId).toBe('sess-1')
  })

  it('change-password with a 401 follows the ordinary refresh and retry', async () => {
    serve((config, n) => (n === 1 ? fail(config, 401) : ok(config, null)))

    await expect(authApi.changePassword({ currentPassword: 'x', newPassword: 'y' } as never)).resolves.toMatchObject({
      status: 200,
    })
    expect(sent).toHaveLength(2)
    expect(h.server.refreshCalls).toBe(1)
    expect(sent[1].url).toBe('/auth/change-password')
    expect(sent[1].method).toBe('patch')
    expect(JSON.parse(sent[1].data)).toEqual({ currentPassword: 'x', newPassword: 'y' })
    expect(bearer(sent[1])).not.toBe(bearer(sent[0]))
    expect(tab.runtime.status()).toBe('signed-in')
  })

  it("attaches the session abort signal and keeps the caller's own signal working", async () => {
    let finish: Array<() => void> = []
    serve(async (config, n) => {
      if (n === 2) return fail(config, 401) // the first send of '/retried'
      await new Promise<void>((resolve) => finish.push(resolve))
      return ok(config)
    })
    const settle = () => {
      finish.forEach((resolve) => resolve())
      finish = []
    }
    const inFlight = (count: number) => vi.waitFor(() => expect(finish).toHaveLength(count))

    // The caller's signal aborts the request.
    const caller = new AbortController()
    const first = api.get('/inventory', { signal: caller.signal })
    await inFlight(1)
    const firstSignal = sent[0].signal as AbortSignal
    expect(firstSignal.aborted).toBe(false)
    caller.abort()
    expect(firstSignal.aborted).toBe(true)
    settle()
    await expect(first).rejects.toMatchObject({ code: 'ERR_CANCELED' })

    // It still does on the retry after a refresh.
    const retryCaller = new AbortController()
    const retried = api.get('/retried', { signal: retryCaller.signal })
    await inFlight(1)
    expect(sent.map((config) => config.url)).toEqual(['/inventory', '/retried', '/retried'])
    const retrySignal = sent[2].signal as AbortSignal
    expect(retrySignal.aborted).toBe(false)
    retryCaller.abort()
    expect(retrySignal.aborted).toBe(true)
    settle()
    await expect(retried).rejects.toMatchObject({ code: 'ERR_CANCELED' })

    // The session's signal aborts it too, without touching the caller's.
    const untouched = new AbortController()
    const ended = api.get('/inventory', { signal: untouched.signal })
    await inFlight(1)
    const sessionSignal = sent[3].signal as AbortSignal
    expect(sessionSignal.aborted).toBe(false)
    await tab.runtime.signOut()
    expect(sessionSignal.aborted).toBe(true)
    expect(untouched.signal.aborted).toBe(false)
    settle()
    await expect(ended).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  })

  it('login, refresh and logout never pass through this instance', async () => {
    serve((config) => ok(config))
    const bare: Config[] = []
    const previous = axios.defaults.adapter
    axios.defaults.adapter = (async (config: Config) => {
      bare.push(config)
      return ok(config, {})
    }) as never
    try {
      const http = createAuthHttp()
      await http.login({ usernameOrEmail: 'u', password: 'p' })
      await http.refresh('rt')
      await http.logout('rt')
    } finally {
      axios.defaults.adapter = previous
    }

    expect(bare.map((config) => config.url)).toEqual(['/auth/login', '/auth/refresh', '/auth/logout'])
    for (const config of bare) expect(config.headers.Authorization).toBeUndefined()
    expect(sent).toHaveLength(0)
    expect(h.server.refreshCalls).toBe(0)
  })
})
