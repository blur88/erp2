import { createAuthHttp } from './authHttp'
import { openIndexedDbSessionStore } from './store/indexedDbSessionStore'
import { createSessionRuntime, type RuntimeEvents, type SessionRuntime } from './runtime'
import type { TraceEvent } from './trace'
import { attachResumeReconcile } from './resumeReconcile'
import { registerSessionRuntime } from './registry'
import type { SessionStore } from './store/sessionStore'
import type { ActiveSession, StoredState } from './types'
import { StorageUnavailableError } from './types'
import { store, apiSlices } from '@/store'
import {
  sessionEstablished,
  tokensUpdated,
  sessionEnded,
  storageUnavailable,
  storageWaiting,
} from '@/store/slices/authSlice'
import { RESET_FOR_SESSION_END } from '@/store/sessionReset'

const SESSION_CHANNEL_NAME = 'erp-session'

function makeChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  const bc = new BroadcastChannel(SESSION_CHANNEL_NAME)
  return {
    post: () => bc.postMessage(1),
    subscribe: (fn: () => void) => {
      const listener = () => fn()
      bc.addEventListener('message', listener)
      return () => bc.removeEventListener('message', listener)
    },
  }
}

const timingEnabled =
  typeof sessionStorage !== 'undefined' && sessionStorage.getItem('erp-session-timing') === '1'

const recordTiming = (op: 'read' | 'transact', ms: number) => {
  if (!timingEnabled) return
  const w = window as unknown as { __erpSessionTimings?: Array<{ op: string; ms: number }> }
  if (!w.__erpSessionTimings) w.__erpSessionTimings = []
  if (w.__erpSessionTimings.length >= 5000) return
  w.__erpSessionTimings.push({ op, ms })
}

const recordTrace = (event: TraceEvent) => {
  if (!timingEnabled) return
  const w = window as unknown as { __erpSessionTrace?: TraceEvent[] }
  if (!w.__erpSessionTrace) w.__erpSessionTrace = []
  if (w.__erpSessionTrace.length >= 5000) return
  w.__erpSessionTrace.push(event)
}

const events: RuntimeEvents = {
  sessionEstablished(session: ActiveSession) {
    store.dispatch(sessionEstablished(session))
  },
  tokensUpdated(tokens) {
    store.dispatch(tokensUpdated(tokens))
  },
  sessionEnded(reason) {
    store.dispatch(sessionEnded())
    store.dispatch({ type: RESET_FOR_SESSION_END })
    apiSlices.forEach((slice) => store.dispatch(slice.util.resetApiState()))
    if (reason === 'storage') store.dispatch(storageUnavailable())
  },
  storageWaiting(waiting) {
    store.dispatch(storageWaiting(waiting))
  },
}

// The runtime is created immediately with an unresolved store; `sessionReady()`
// swaps in the real adapter, then starts. Everything that needs a session awaits
// `sessionReady()`.
// A store that reports every operation as unavailable. Used until IndexedDB
// opens, and forever when it cannot (fail closed, spec B8).
const unavailableStore: SessionStore = {
  read: async () => {
    throw new StorageUnavailableError('session storage unavailable')
  },
  transact: async () => {
    throw new StorageUnavailableError('session storage unavailable')
  },
  onClosed: () => () => undefined,
}

const openingStore: Promise<SessionStore> = openIndexedDbSessionStore(undefined, {
  onTiming: timingEnabled ? recordTiming : undefined,
}).catch((err) => {
  if (err instanceof StorageUnavailableError) return unavailableStore
  throw err
})

const pendingStore: SessionStore = {
  read: async (opts) => (await openingStore).read(opts),
  transact: async (decide, opts) => (await openingStore).transact(decide, opts),
  onClosed: (listener) => {
    let detach = () => undefined
    void openingStore.then((s) => {
      detach = s.onClosed(listener)
    })
    return () => detach()
  },
}

export const sessionRuntime: SessionRuntime = createSessionRuntime({
  store: pendingStore,
  http: createAuthHttp(),
  events,
  channel: makeChannel(),
  tabId: `tab-${Math.random().toString(36).slice(2)}`,
  now: () => Date.now(),
  onTrace: timingEnabled ? recordTrace : undefined,
})

let startPromise: Promise<void> | null = null

registerSessionRuntime(sessionRuntime)

export function sessionReady(): Promise<void> {
  if (!startPromise) {
    startPromise = (async () => {
      await openingStore
      await sessionRuntime.start()
    })()
  }
  return startPromise
}

attachResumeReconcile(sessionRuntime)

export type { StoredState }
