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

export function createMemorySessionStore(shared: SharedMemory): MemorySessionStore {
  const closedListeners = new Set<() => void>()

  let holdResolvers: Array<() => void> | null = null
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
    if (holdResolvers === null) return null
    return new Promise<void>((resolve) => {
      holdResolvers?.push(resolve)
    })
  }

  return {
    read(opts) {
      const timeoutMs = opts?.timeoutMs ?? 5000
      return enqueue(async (cancelled) => {
        ensureOpen()
        const hold = waitForHold()
        if (hold) await hold
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
      const timeoutMs = opts?.timeoutMs ?? 5000
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
      holdResolvers = []
      return {
        release() {
          const resolvers = holdResolvers ?? []
          holdResolvers = null
          resolvers.forEach((r) => r())
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
