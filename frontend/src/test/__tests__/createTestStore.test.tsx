import { configureStore } from '@reduxjs/toolkit'
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestStore, disposeTestStores } from '../createTestStore'
import { settleFrameBatchedNotifications } from '../storeBatching'

// #1364. Redux Toolkit's default batching pairs each animation frame with a
// 100 ms fallback timer that calls `cancelAnimationFrame`, and a fallback that
// fires after jsdom is gone fails the run. These tests watch for that pair being
// started. Timers are fake and the frame never runs, so the store built with the
// default on purpose leaves nothing behind either.

const api = createApi({
  reducerPath: 'probeApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    value: builder.query<number, void>({ queryFn: async () => ({ data: 1 }) }),
  }),
})

let frames: ReturnType<typeof vi.spyOn>
let timeouts: ReturnType<typeof vi.spyOn>
const fallbackTimers = () => timeouts.mock.calls.filter(([, delay]) => delay === 100).length

beforeEach(() => {
  vi.useFakeTimers()
  frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0)
  timeouts = vi.spyOn(globalThis, 'setTimeout')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('store batching in tests', () => {
  it('a store with the default batching starts a frame and its fallback timer', async () => {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
    })

    await store.dispatch(api.endpoints.value.initiate())

    expect(frames).toHaveBeenCalled()
    expect(fallbackTimers()).toBeGreaterThan(0)
  })

  it('a test store starts neither', async () => {
    const store = createTestStore({ apis: [api] })

    const result = await store.dispatch(api.endpoints.value.initiate())

    expect(result.data).toBe(1)
    expect(frames).not.toHaveBeenCalled()
    expect(fallbackTimers()).toBe(0)
  })

  it('a store with the default batching has no fallback timer left once it is settled', async () => {
    const store = configureStore({
      reducer: { [api.reducerPath]: api.reducer },
      middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(api.middleware),
    })
    // Stays subscribed, so the only timers are the subscription sync and the fallbacks.
    await store.dispatch(api.endpoints.value.initiate())
    expect(vi.getTimerCount()).toBeGreaterThan(0)

    const settled = settleFrameBatchedNotifications()
    await vi.runAllTimersAsync()
    await settled

    // The sync timer dispatched again, which started a second fallback: both are gone.
    expect(fallbackTimers()).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
    expect(frames).toHaveBeenCalledTimes(2)
  })
})

describe('what a test store leaves behind', () => {
  it('its unused-data timer is cleared and its state reset when the test ends', async () => {
    const store = createTestStore({ apis: [api] })
    const subscription = store.dispatch(api.endpoints.value.initiate())
    await subscription
    subscription.unsubscribe()
    // Past RTK Query's own short timers (polling update, subscription sync).
    await vi.advanceTimersByTimeAsync(600)

    // What remains is the timer that would remove the unused entry in 60 s.
    expect(vi.getTimerCount()).toBe(1)
    expect(api.endpoints.value.select()(store.getState()).data).toBe(1)

    await disposeTestStores()

    expect(vi.getTimerCount()).toBe(0)
    expect(api.endpoints.value.select()(store.getState()).status).toBe('uninitialized')
  })

  it('a request still in flight is aborted', async () => {
    let aborted = false
    const slowApi = createApi({
      reducerPath: 'slowProbeApi',
      baseQuery: fakeBaseQuery(),
      endpoints: (builder) => ({
        value: builder.query<number, void>({
          queryFn: (_arg, { signal }) =>
            new Promise(() => {
              signal.addEventListener('abort', () => {
                aborted = true
              })
            }),
        }),
      }),
    })
    const store = createTestStore({ apis: [slowApi] })
    void store.dispatch(slowApi.endpoints.value.initiate())
    await vi.advanceTimersByTimeAsync(0)
    expect(aborted).toBe(false)

    await disposeTestStores()

    expect(aborted).toBe(true)
  })
})
