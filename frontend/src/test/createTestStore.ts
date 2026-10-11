import { configureStore, type Middleware, type Reducer, type UnknownAction } from '@reduxjs/toolkit'
import { afterEach } from 'vitest'

import { tickBatchedEnhancers } from './storeBatching'

// The store a test builds around RTK Query slices. Two things it does that a
// bare `configureStore` in a test file does not (#1364):
//
// - it batches notifications per microtask, so it never starts Redux Toolkit's
//   uncancellable 100 ms animation-frame fallback timer (see storeBatching.ts).
//   That is earlier than the application's store notifies, so this store is for
//   tests whose subject is not that timing;
// - it belongs to the test that created it. After that test, anything still
//   mounted is unmounted and each slice's state is reset, which aborts requests
//   in flight and clears the polling and unused-data timers.
//
// A store therefore lives for one test: create it in the test or in a
// `beforeEach`, not at module scope or in a `beforeAll`.
//
// Not cleared: RTK Query's 500 ms subscription-sync timer, which it offers no
// way to cancel. On this store its late callback only dispatches; it reaches no
// browser global.

interface TestApiSlice {
  reducerPath: string
  reducer: Reducer<any, any>
  middleware: Middleware<any, any, any>
  util: { resetApiState: () => UnknownAction }
}

interface TestStoreOptions {
  apis: TestApiSlice[]
  /** Plain reducers the test needs next to the API slices. */
  reducer?: Record<string, Reducer<any, any>>
  preloadedState?: Record<string, unknown>
}

const disposers = new Set<() => void>()

export function createTestStore({ apis, reducer = {}, preloadedState }: TestStoreOptions) {
  const store = configureStore({
    reducer: { ...reducer, ...Object.fromEntries(apis.map((api) => [api.reducerPath, api.reducer])) },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apis.map((api) => api.middleware)),
    enhancers: tickBatchedEnhancers,
    preloadedState,
  })
  disposeAfterTest(() => {
    for (const api of apis) store.dispatch(api.util.resetApiState())
  })
  return store as Omit<typeof store, 'getState'> & { getState: () => any }
}

/** For a store this module did not create (appHarness loads the application's own, batching as in production). */
export function disposeAfterTest(dispose: () => void) {
  disposers.add(dispose)
}

/** Runs after each test of a file that imports this module; exported for the helper's own test. */
export async function disposeTestStores() {
  if (disposers.size === 0) return
  // Unmount first: a hook still mounted answers a reset by fetching again.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
  for (const dispose of disposers) dispose()
  disposers.clear()
}

afterEach(disposeTestStores)
