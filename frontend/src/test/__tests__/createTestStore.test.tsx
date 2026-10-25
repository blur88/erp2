import { configureStore } from '@reduxjs/toolkit'
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestStore, disposeTestStores } from '../createTestStore'

const api = createApi({
  reducerPath: 'probeApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    value: builder.query<number, void>({ queryFn: async () => ({ data: 1 }) }),
  }),
})

describe('store batching in tests', () => {
  let frames: ReturnType<typeof vi.spyOn>
  let timeouts: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
    timeouts = vi.spyOn(globalThis, 'setTimeout')
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('a default-batched control starts a frame and its 100 ms fallback', async () => {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
    })
    await store.dispatch(api.endpoints.value.initiate())

    expect(frames).toHaveBeenCalled()
    expect(timeouts.mock.calls.some(([, delay]) => delay === 100)).toBe(true)
    store.dispatch(api.util.resetApiState())
  })

  it('a helper store starts neither a frame nor its fallback', async () => {
    const store = createTestStore({ apis: [api] })
    const result = await store.dispatch(api.endpoints.value.initiate())

    expect(result.data).toBe(1)
    expect(frames).not.toHaveBeenCalled()
    expect(timeouts.mock.calls.some(([, delay]) => delay === 100)).toBe(false)
  })

  it('disposal resets every slice and clears their unused-data timers', async () => {
    const otherApi = createApi({
      reducerPath: 'otherProbeApi',
      baseQuery: fakeBaseQuery(),
      endpoints: (builder) => ({
        value: builder.query<number, void>({ queryFn: async () => ({ data: 2 }) }),
      }),
    })
    const store = createTestStore({ apis: [api, otherApi] })
    const first = store.dispatch(api.endpoints.value.initiate())
    const second = store.dispatch(otherApi.endpoints.value.initiate())
    await Promise.all([first, second])
    first.unsubscribe()
    second.unsubscribe()
    await vi.advanceTimersByTimeAsync(600)

    expect(api.endpoints.value.select()(store.getState()).data).toBe(1)
    expect(otherApi.endpoints.value.select()(store.getState()).data).toBe(2)
    // Each cached result has one 60 s unused-data timer; short timers have fired.
    expect(vi.getTimerCount()).toBe(2)

    await disposeTestStores()

    expect(api.endpoints.value.select()(store.getState()).status).toBe('uninitialized')
    expect(otherApi.endpoints.value.select()(store.getState()).status).toBe('uninitialized')
    expect(vi.getTimerCount()).toBe(0)
  })
})

it('disposal waits for an aborted request and its rejection to settle', async () => {
  let requestStarted = false
  let rejectionSettled = false
  let aborted = false
  let resultSettled = false
  const unhandled: unknown[] = []
  const onUnhandled = (reason: unknown) => unhandled.push(reason)
  process.on('unhandledRejection', onUnhandled)
  try {
    const slowApi = createApi({
      reducerPath: 'slowProbeApi',
      baseQuery: fakeBaseQuery<string>(),
      endpoints: (builder) => ({
        value: builder.query<number, void>({
          queryFn: (_arg, { signal }) => {
            requestStarted = true
            return new Promise<never>((_resolve, reject) => {
              signal.addEventListener('abort', () => {
                aborted = true
                // Model a transport whose abort rejection arrives on the next turn.
                setTimeout(() => reject(new Error('transport aborted')), 0)
              }, { once: true })
            }).catch(() => {
              rejectionSettled = true
              return { error: 'transport aborted' }
            })
          },
        }),
      }),
    })
    const store = createTestStore({ apis: [slowApi] })
    const request = store.dispatch(slowApi.endpoints.value.initiate())
    void request.then(() => { resultSettled = true })
    expect(requestStarted).toBe(true)
    expect(rejectionSettled).toBe(false)

    await disposeTestStores()

    expect(aborted).toBe(true)
    expect(resultSettled).toBe(true)
    expect(rejectionSettled).toBe(true)
    expect(unhandled).toEqual([])
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }
})


it('disposal unmounts a query hook before reset, so it does not refetch', async () => {
  const query = vi.fn(async () => ({ data: 7 }))
  const hookApi = createApi({
    reducerPath: 'hookProbeApi',
    baseQuery: fakeBaseQuery(),
    endpoints: (builder) => ({ value: builder.query<number, void>({ queryFn: query }) }),
  })
  const store = createTestStore({ apis: [hookApi] })
  let mounted = false
  const { result } = renderHook(() => {
    useEffect(() => {
      mounted = true
      return () => { mounted = false }
    }, [])
    return hookApi.useValueQuery()
  }, {
    wrapper: ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>,
  })
  await waitFor(() => expect(result.current.data).toBe(7))
  expect(mounted).toBe(true)
  expect(query).toHaveBeenCalledTimes(1)
  // Observe the reset through the store interface, including the hook's mount
  // state at that instant. React scheduling must not conceal reversed ordering.
  const mountedAtReset: boolean[] = []
  const unsubscribe = store.subscribe(() => {
    if (hookApi.endpoints.value.select()(store.getState()).status === 'uninitialized') {
      mountedAtReset.push(mounted)
    }
  })
  try {
    await act(() => disposeTestStores())

    expect(mountedAtReset.length).toBeGreaterThan(0)
    expect(mountedAtReset).not.toContain(true)
    expect(mounted).toBe(false)
    expect(query).toHaveBeenCalledTimes(1)
  } finally {
    unsubscribe()
  }
})

// Deliberately keep the previous store only to observe the registered hook.
// A new store is still created inside its own test.
describe('automatic per-test disposal', { concurrent: false }, () => {
  let previousStore: ReturnType<typeof createTestStore>

  it('creates a store with cached data in one test', async () => {
    previousStore = createTestStore({ apis: [api] })
    await previousStore.dispatch(api.endpoints.value.initiate())
    expect(api.endpoints.value.select()(previousStore.getState()).data).toBe(1)
  })

  it('the registered afterEach resets that store before the next test', () => {
    expect(api.endpoints.value.select()(previousStore.getState()).status).toBe('uninitialized')
  })
})
