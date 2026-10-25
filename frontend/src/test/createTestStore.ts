import { setTimeout as nextTurn } from 'node:timers/promises'
import { configureStore, type Middleware, type Reducer, type UnknownAction } from '@reduxjs/toolkit'

import { afterEach } from 'vitest'

interface TestApiSlice {
  reducerPath: string
  reducer: Reducer<any, any>
  middleware: Middleware<any, any, any>
  util: { resetApiState: () => UnknownAction }
}

interface TestStoreOptions {
  apis: TestApiSlice[]
  reducer?: Record<string, Reducer<any, any>>
  preloadedState?: Record<string, unknown>
}

const disposers = new Set<() => void>()

/**
 * A store for one test: create it in the test or beforeEach, never at module
 * scope or in beforeAll. Notifications batch per microtask. This is NOT how the
 * application's store notifies; use it when notification timing is not the
 * subject of the test. Tick batching starts neither an animation frame nor
 * Redux Toolkit's uncancellable 100 ms frame-fallback timer (#1364, #1450).
 * Disposal unmounts, resets every API slice (aborting requests and clearing
 * polling/unused-data timers), then clears the registry and lets aborts settle.
 *
 * RTK Query's 500 ms subscription-sync timer cannot be cancelled. Its late
 * callback on a tick-batched store only dispatches; it touches no browser global.
 */
export function createTestStore({ apis, reducer = {}, preloadedState }: TestStoreOptions) {
  const store = configureStore({
    reducer: { ...reducer, ...Object.fromEntries(apis.map((api) => [api.reducerPath, api.reducer])) },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(apis.map((api) => api.middleware)),
    enhancers: (getDefaultEnhancers) => getDefaultEnhancers({ autoBatch: { type: 'tick' } }),
    preloadedState,
  })
  disposers.add(() => {
    for (const api of apis) store.dispatch(api.util.resetApiState())
  })
  return store as Omit<typeof store, 'getState'> & { getState: () => any }
}

/** Runs in afterEach; exported so tests can observe disposal before it returns. */
export async function disposeTestStores() {
  if (disposers.size === 0) return
  // Unmount first: a mounted query hook responds to reset by fetching again.
  // Do not rely on setup.ts's cleanup hook: Vitest runs after-hooks as a stack.
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react')
    cleanup()
  }
  for (const dispose of disposers) dispose()
  disposers.clear()
  // Abort rejections and their pending promise reactions must settle before
  // Vitest closes the environment. A microtask alone is not sufficient.
  await nextTurn(0)
}

afterEach(disposeTestStores)
