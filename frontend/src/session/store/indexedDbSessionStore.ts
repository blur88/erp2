import { normalizeStored } from '../decisions'
import type { Decision } from '../decisions'
import type { StoredState } from '../types'
import { StorageTimeoutError, StorageUnavailableError } from '../types'
import type { SessionStore } from './sessionStore'

export const SESSION_DB_NAME = 'erp-session'
export const SESSION_DB_VERSION = 1

const KEY_RECORD = 'record'
const KEY_SLICES = 'slices'
const KEY_LEASE = 'refreshLease'
const KEYS = [KEY_RECORD, KEY_SLICES, KEY_LEASE] as const

const DEFAULT_TIMEOUT_MS = 5000

export function openIndexedDbSessionStore(
  factory: IDBFactory | undefined = globalThis.indexedDB,
  opts?: { onTiming?: (op: 'read' | 'transact', ms: number) => void },
): Promise<SessionStore> {
  return new Promise((resolve, reject) => {
    if (!factory) {
      reject(new StorageUnavailableError('IndexedDB is not available'))
      return
    }

    let request: IDBOpenDBRequest
    try {
      request = factory.open(SESSION_DB_NAME, SESSION_DB_VERSION)
    } catch (err) {
      reject(new StorageUnavailableError(String(err)))
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }

    request.onerror = () => reject(new StorageUnavailableError('IndexedDB open failed'))

    request.onsuccess = () => {
      const db = request.result
      const closedListeners = new Set<() => void>()

      const notifyClosed = () => {
        closedListeners.forEach((l) => l())
      }

      db.onclose = notifyClosed
      db.onversionchange = () => {
        db.close()
        notifyClosed()
      }

      const timing = opts?.onTiming
      const store = new IndexedDbSessionStore(db, timing, closedListeners)
      resolve(store)
    }
  })
}

type Timer = ReturnType<typeof setTimeout>

class IndexedDbSessionStore implements SessionStore {
  private db: IDBDatabase
  private timing: ((op: 'read' | 'transact', ms: number) => void) | undefined
  private closedListeners: Set<() => void>

  constructor(
    db: IDBDatabase,
    timing: ((op: 'read' | 'transact', ms: number) => void) | undefined,
    closedListeners: Set<() => void>,
  ) {
    this.db = db
    this.timing = timing
    this.closedListeners = closedListeners
  }

  read(opts?: { timeoutMs?: number }): Promise<StoredState> {
    return this.run('read', 'readonly', opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS, (_os, state) => state)
  }

  transact<R>(decide: (s: StoredState) => Decision<R>, opts?: { timeoutMs?: number }): Promise<R> {
    return this.run('transact', 'readwrite', opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS, (os, state) => {
      const decision = decide(state)
      applyWrite(os, decision.write)
      return decision.result
    })
  }

  // One transaction: read the three keys, then run `body` synchronously inside it.
  // The caller is settled only by the transaction's own completion events:
  // `complete` resolves, `abort` rejects. The timer and a throwing `body` only
  // ask for an abort; they never settle the caller themselves.
  private run<R>(
    op: 'read' | 'transact',
    mode: IDBTransactionMode,
    timeoutMs: number,
    body: (os: IDBObjectStore, state: StoredState) => R,
  ): Promise<R> {
    const started = this.timing ? performance.now() : 0

    return new Promise<R>((resolve, reject) => {
      let settled = false
      let timer: Timer | undefined
      let timeoutRequestedAbort = false
      let failure: unknown = null
      let outcome: { value: R } | null = null

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (this.timing) this.timing(op, performance.now() - started)
        fn()
      }

      let tx: IDBTransaction
      try {
        tx = this.db.transaction('kv', mode)
      } catch (err) {
        finish(() => reject(new StorageUnavailableError(String(err))))
        return
      }

      tx.oncomplete = () =>
        finish(() => {
          if (outcome) resolve(outcome.value)
          else reject(new StorageUnavailableError(`${op} completed without a result`))
        })
      // A request error or a failed commit aborts the transaction, so `abort` is
      // the one place a failure is reported. Only an abort this call's own timer
      // asked for is a timeout.
      tx.onabort = () =>
        finish(() => {
          if (timeoutRequestedAbort) reject(new StorageTimeoutError(`${op} timed out`))
          else if (failure !== null) reject(new StorageUnavailableError(`${op} failed: ${String(failure)}`))
          else reject(new StorageUnavailableError(`${op} aborted`))
        })

      const os = tx.objectStore('kv')
      const values: Record<string, unknown> = {}
      let pending = KEYS.length

      for (const key of KEYS) {
        const req = os.get(key)
        req.onsuccess = () => {
          values[key] = req.result
          pending -= 1
          if (pending !== 0) return
          try {
            outcome = { value: body(os, buildState(values)) }
          } catch (err) {
            failure = err
            try {
              tx.abort()
            } catch {
              /* already aborted */
            }
          }
        }
      }

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          timeoutRequestedAbort = true
          try {
            tx.abort()
          } catch {
            // Already committing or finished: the completion event decides.
            timeoutRequestedAbort = false
          }
        }, timeoutMs)
      }
    })
  }

  onClosed(listener: () => void): () => void {
    this.closedListeners.add(listener)
    return () => this.closedListeners.delete(listener)
  }
}

function applyWrite(os: IDBObjectStore, write: Partial<StoredState> | undefined): void {
  if (!write) return
  if (write.record !== undefined) {
    os.put(write.record, KEY_RECORD)
  }
  if (write.slices !== undefined) {
    if (write.slices === null) os.delete(KEY_SLICES)
    else os.put(write.slices, KEY_SLICES)
  }
  if (write.refreshLease !== undefined) {
    if (write.refreshLease === null) os.delete(KEY_LEASE)
    else os.put(write.refreshLease, KEY_LEASE)
  }
}

function buildState(values: Record<string, unknown>): StoredState {
  return normalizeStored({
    record: values[KEY_RECORD],
    slices: values[KEY_SLICES] ?? null,
    refreshLease: values[KEY_LEASE] ?? null,
  })
}
