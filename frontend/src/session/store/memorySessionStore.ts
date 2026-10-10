import type { Decision } from '../decisions'
import type { StoredState } from '../types'
import { StorageTimeoutError, StorageUnavailableError } from '../types'
import type { SessionStore } from './sessionStore'

export interface SharedMemory {
  state: StoredState
  queue: Promise<void>
  closed: boolean
}

export function createSharedMemory(): SharedMemory {
  return {
    state: { record: { revision: 0, session: null }, slices: null, refreshLease: null },
    queue: Promise.resolve(),
    closed: false,
  }
}

export interface MemorySessionStore extends SessionStore {
  holdNextTransaction(): { release(): void }
  failNextRead(error: Error): void
  close(): void
}

// `defaultTimeoutMs` shortens the store's own timeout for the tests that model
// storage answering nobody, instead of waiting the real five seconds.
export function createMemorySessionStore(shared: SharedMemory, opts?: { defaultTimeoutMs?: number }): MemorySessionStore {
  const closedListeners = new Set<() => void>()
  const defaultTimeoutMs = opts?.defaultTimeoutMs ?? 5000

  let holdActive = false
  let holdReleased = false
  let holdWaiters: Array<() => void> = []
  let nextReadError: Error | null = null

  const ensureOpen = () => {
    if (shared.closed) throw new StorageUnavailableError('session storage unavailable')
  }

  const enqueue = <R>(run: (cancelled: () => boolean) => Promise<R>, timeoutMs: number): Promise<R> => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let timedOut = false
    const cancelled = () => timedOut

    const runWhenScheduled = shared.queue.then(() => {
      if (cancelled()) throw new StorageTimeoutError('transaction timed out')
      return run(cancelled)
    })

    shared.queue = runWhenScheduled.then(
      () => undefined,
      () => undefined,
    )

    let rejectTimeout: ((e: Error) => void) | undefined
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      rejectTimeout = reject
    })

    if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
      timer = setTimeout(() => {
        timedOut = true
        rejectTimeout?.(new StorageTimeoutError('transaction timed out'))
      }, timeoutMs)
    }

    return Promise.race([runWhenScheduled, timeoutPromise]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
  }

  const waitForHold = (): Promise<void> | null => {
    if (!holdActive) return null
    if (holdReleased) {
      holdActive = false
      return null
    }
    return new Promise<void>((resolve) => {
      holdWaiters.push(() => {
        holdActive = false
        resolve()
      })
    })
  }

  return {
    read(opts) {
      const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs
      return enqueue(async (cancelled) => {
        ensureOpen()
        if (cancelled()) throw new StorageTimeoutError('transaction timed out')
        ensureOpen()
        if (nextReadError) {
          const err = nextReadError
          nextReadError = null
          throw err
        }
        return shared.state
      }, timeoutMs)
    },

    transact<R>(decide: (s: StoredState) => Decision<R>, opts?: { timeoutMs?: number }) {
      const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs
      return enqueue(async (cancelled) => {
        ensureOpen()
        const hold = waitForHold()
        if (hold) await hold
        if (cancelled()) throw new StorageTimeoutError('transaction timed out')
        ensureOpen()
        const decision = decide(shared.state)
        if (decision.write) {
          shared.state = { ...shared.state, ...decision.write }
        }
        return decision.result
      }, timeoutMs)
    },

    onClosed(listener) {
      closedListeners.add(listener)
      return () => closedListeners.delete(listener)
    },

    holdNextTransaction() {
      holdActive = true
      holdReleased = false
      holdWaiters = []
      return {
        release() {
          if (!holdActive) return
          holdReleased = true
          const waiters = holdWaiters
          holdWaiters = []
          waiters.forEach((w) => w())
        },
      }
    },

    failNextRead(error) {
      nextReadError = error
    },

    close() {
      shared.closed = true
      closedListeners.forEach((l) => l())
    },
  }
}
