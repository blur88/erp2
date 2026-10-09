import { vi } from 'vitest'
import axios, { type InternalAxiosRequestConfig } from 'axios'
import type { SharedMemory } from '../store/memorySessionStore'
import type { ActiveSession, StoredState } from '../types'

// Loads the application's own store and session modules, freshly evaluated in
// the order `main.tsx` imports them, with only the two edges of the session
// layer replaced: IndexedDB by the in-memory store, and the network by an axios
// adapter. Everything between them (runtime, registry, events, redux-persist
// adapter, resume listeners) is the real wiring.

export const storedSession = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  sessionId: 'sess-stored',
  generation: 1,
  accessToken: 'at-stored',
  accessTokenExpiresAt: Date.now() + 60_000,
  refreshToken: 'rt-stored',
  user: { id: 'u1', username: 'stored', firstName: 'Stored', lastName: 'User' } as never,
  rememberMe: false,
  ...over,
})

// What redux-persist writes for the persisted slices: each slice serialized on
// its own, then the whole object serialized again.
export const persistedPayload = (slices: Record<string, unknown>, version = 7): string =>
  JSON.stringify({
    ...Object.fromEntries(Object.entries(slices).map(([key, value]) => [key, JSON.stringify(value)])),
    _persist: JSON.stringify({ version, rehydrated: true }),
  })

export interface LoadAppOptions {
  /**
   * 'unavailable': IndexedDB cannot be opened. 'busy': it opens, and the
   * start-up read times out, as behind a tab paused mid-transaction. 'failing':
   * it opens, and the start-up read rejects with an error of no known class.
   */
  storage?: 'memory' | 'unavailable' | 'busy' | 'failing'
  stored?: Partial<StoredState>
  /** Runs after the mocks are in place and before any application module is imported. */
  beforeImport?: () => void
  /** A request waits for what this returns before it is answered. */
  holdRequest?: (config: InternalAxiosRequestConfig) => Promise<void> | undefined
}

export async function loadApp(options: LoadAppOptions = {}) {
  vi.resetModules()

  const { createSharedMemory, createMemorySessionStore } = await import('../store/memorySessionStore')
  const { StorageTimeoutError, StorageUnavailableError } = await import('../types')
  const { createSessionRuntime } = await import('../runtime')

  const shared: SharedMemory = createSharedMemory()
  let failNextRead: (error: Error) => void = () => undefined
  shared.state = { ...shared.state, ...options.stored }

  vi.doMock('@/session/store/indexedDbSessionStore', () => ({
    openIndexedDbSessionStore: async (
      _factory?: unknown,
      opts?: { onTiming?: (op: 'read' | 'transact', ms: number) => void },
    ) => {
      if (options.storage === 'unavailable') throw new StorageUnavailableError('IndexedDB is not available')
      const memoryStore = createMemorySessionStore(shared)
      failNextRead = (error) => memoryStore.failNextRead(error)
      if (options.storage === 'busy') failNextRead(new StorageTimeoutError('read timed out'))
      if (options.storage === 'failing') failNextRead(new Error('unclassified read failure'))
      // Like the real store, report each operation's duration when asked to.
      return {
        ...memoryStore,
        read: async (readOpts?: { timeoutMs?: number }) => {
          const state = await memoryStore.read(readOpts)
          opts?.onTiming?.('read', 0)
          return state
        },
      }
    },
  }))

  // The bare auth client copies the adapter when it is created, at import.
  const requests: InternalAxiosRequestConfig[] = []
  let seq = 0
  const previousAdapter = axios.defaults.adapter
  axios.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    requests.push(config)
    await options.holdRequest?.(config)
    let data: unknown = {}
    if (config.url === '/auth/login') {
      const sessionId = `sess-${++seq}`
      data = {
        sessionId,
        generation: 1,
        accessToken: `at-${sessionId}`,
        accessTokenExpiresAt: Date.now() + 60_000,
        refreshToken: `rt-${sessionId}`,
        user: { id: 'u1', username: JSON.parse(config.data).usernameOrEmail },
        requiresPasswordChange: false,
      }
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }) as never

  options.beforeImport?.()

  let storeModule: typeof import('@/store')
  let sessionModule: typeof import('@/session')
  try {
    // main.tsx imports the store first, then the router, which imports the session.
    storeModule = await import('@/store')
    sessionModule = await import('@/session')
  } finally {
    axios.defaults.adapter = previousAdapter
  }

  const rehydrated = (): Promise<void> => {
    const { persistor } = storeModule
    if (persistor.getState().bootstrapped) return Promise.resolve()
    return new Promise((resolve) => {
      const unsubscribe = persistor.subscribe(() => {
        if (persistor.getState().bootstrapped) {
          unsubscribe()
          resolve()
        }
      })
    })
  }

  // Another tab of the same browser: its own runtime on the same stored record.
  const otherTab = async () => {
    const calls: string[] = []
    const runtime = createSessionRuntime({
      store: createMemorySessionStore(shared),
      http: {
        login: async () => {
          throw new Error('not used')
        },
        refresh: async () => {
          throw new Error('not used')
        },
        logout: async () => {
          calls.push('logout')
        },
      },
      events: {
        sessionEstablished: () => undefined,
        tokensUpdated: () => undefined,
        sessionEnded: () => undefined,
        storageWaiting: () => undefined,
      },
      channel: null,
      tabId: 'other-tab',
      now: () => Date.now(),
    })
    await runtime.start()
    return { runtime, calls }
  }

  return {
    shared,
    requests,
    store: storeModule.store,
    persistor: storeModule.persistor,
    storeModule,
    sessionRuntime: sessionModule.sessionRuntime,
    sessionReady: sessionModule.sessionReady,
    /** The application's next storage read rejects with this. */
    failNextRead: (error: Error) => failNextRead(error),
    /** The next read times out again: the other tab is still busy. */
    stillBusy: () => failNextRead(new StorageTimeoutError('read timed out')),
    rehydrated,
    otherTab,
  }
}
