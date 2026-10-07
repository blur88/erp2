import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { registerSessionRuntime } from '@/session/registry'
import api from '@/services/api'
import { createHarness } from '@/session/__tests__/twoTabs'
import { settingsApiSlice } from '../settingsApi'
import { paymentMethodsApiSlice } from '../paymentMethodsApi'
import { userManagementApiSlice } from '../userManagementApi'

// The endpoints as the application dispatches them, on the real session runtime
// (in-memory store) with the axios adapter as the ingress. Only the company-data
// read may be re-sent after a 429.
describe('RTK Query endpoints after a 429 from the ingress', () => {
  type Config = InternalAxiosRequestConfig

  const ok = (config: Config, data: unknown = {}) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
  const refuse = (config: Config) =>
    Promise.reject(
      new AxiosError('status 429', AxiosError.ERR_BAD_REQUEST, config, null, {
        data: '<html><body>429 Too Many Requests</body></html>',
        status: 429,
        statusText: 'Too Many Requests',
        headers: {},
        config,
      }),
    )

  let sent: Config[]
  const serve = (fn: (config: Config, sendNumber: number) => unknown) => {
    sent = []
    api.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      return fn(config, sent.length)
    }) as never
  }

  const makeStore = () =>
    configureStore({
      reducer: {
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
        [paymentMethodsApiSlice.reducerPath]: paymentMethodsApiSlice.reducer,
        [userManagementApiSlice.reducerPath]: userManagementApiSlice.reducer,
      },
      middleware: (getDefault) =>
        getDefault().concat(
          settingsApiSlice.middleware,
          paymentMethodsApiSlice.middleware,
          userManagementApiSlice.middleware,
        ),
    })
  let store: ReturnType<typeof makeStore>

  // Runs every wait to its end; the exact waits are asserted in retryOn429.test.ts.
  const settled = async <T>(promise: Promise<T>): Promise<T> => {
    await vi.runAllTimersAsync()
    return promise
  }

  beforeEach(async () => {
    const h = createHarness()
    const tab = h.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
    store = makeStore()
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('the company-data request is retried after a 429 and succeeds', async () => {
    serve((config, n) => (n === 1 ? refuse(config) : ok(config, { data: { id: 'c1', name: 'Acme Trading' } })))

    const result = await settled(store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate()))

    expect(result.isSuccess).toBe(true)
    // Unwrapped as before: the endpoint still normalizes `{ data }`.
    expect(result.data).toEqual({ id: 'c1', name: 'Acme Trading' })
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      'get /settings/company',
      'get /settings/company',
    ])
  })

  it('it stops after the retry budget and surfaces the failure', async () => {
    serve((config) => refuse(config))

    const result = await settled(store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate()))

    expect(sent).toHaveLength(4)
    expect(result.isError).toBe(true)
    // The same error shape every endpoint reports for a refused request.
    expect(result.error).toEqual({ status: 429, data: 'status 429' })
  })

  it('a company-data request aborted during the wait sends nothing more', async () => {
    serve((config) => refuse(config))

    const request = store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())
    // Part of the way into the first wait (250 ms with no jitter).
    await vi.advanceTimersByTimeAsync(100)
    expect(sent).toHaveLength(1)
    request.abort()
    await request
    await vi.advanceTimersByTimeAsync(60_000)
    expect(sent).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  describe('no other endpoint is retried on 429', () => {
    it.each([
      ['another read of the same slice', () => settingsApiSlice.endpoints.getRegionalSettings.initiate(), 'get /settings/regional'],
      [
        'a read of the payment methods slice',
        () => paymentMethodsApiSlice.endpoints.getActivePaymentMethods.initiate(),
        'get /settings/payment-methods/active',
      ],
      [
        'a read of the user management slice',
        () => userManagementApiSlice.endpoints.getStatistics.initiate(),
        'get /users/statistics',
      ],
    ])('%s', async (_name, initiate, expected) => {
      serve((config) => refuse(config))

      const result = await settled(store.dispatch(initiate() as never) as unknown as Promise<any>)

      expect(result.isError).toBe(true)
      expect(result.error).toEqual({ status: 429, data: 'status 429' })
      expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([expected])
    })

    it('a company-data mutation is not retried', async () => {
      serve((config) => refuse(config))

      const result = await settled(
        store.dispatch(settingsApiSlice.endpoints.updateCompanySettings.initiate({ name: 'Acme' } as never)),
      )

      expect(result.error).toEqual({ status: 429, data: 'status 429' })
      expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual(['put /settings/company'])
    })
  })
})
