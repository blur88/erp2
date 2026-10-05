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
    const started = this.timing ? performance.now() : 0
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise<StoredState>((resolve, reject) => {
      let settled = false
      let timer: Timer | undefined

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (this.timing) this.timing('read', performance.now() - started)
        fn()
      }

      let tx: IDBTransaction
      try {
        tx = this.db.transaction('kv', 'readonly')
      } catch (err) {
        finish(() => reject(new StorageUnavailableError(String(err))))
        return
      }

      tx.onabort = () => finish(() => reject(new StorageTimeoutError('read aborted')))
      tx.onerror = () => finish(() => reject(new StorageUnavailableError('read failed')))

      const os = tx.objectStore('kv')
      const values: Record<string, unknown> = {}
      let pending = KEYS.length

      for (const key of KEYS) {
        const req = os.get(key)
        req.onsuccess = () => {
          values[key] = req.result
          pending -= 1
          if (pending === 0) {
            finish(() => resolve(buildState(values)))
          }
        }
        req.onerror = () => finish(() => reject(new StorageUnavailableError('read failed')))
      }

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          finish(() => reject(new StorageTimeoutError('read timed out')))
          try {
            tx.abort()
          } catch {
            /* already aborted */
          }
        }, timeoutMs)
      }
    })
  }

  transact<R>(decide: (s: StoredState) => Decision<R>, opts?: { timeoutMs?: number }): Promise<R> {
    const started = this.timing ? performance.now() : 0
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS

    return new Promise<R>((resolve, reject) => {
      let settled = false
      let timer: Timer | undefined

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        if (timer !== undefined) clearTimeout(timer)
        if (this.timing) this.timing('transact', performance.now() - started)
        fn()
      }

      let tx: IDBTransaction
      try {
        tx = this.db.transaction('kv', 'readwrite')
      } catch (err) {
        finish(() => reject(new StorageUnavailableError(String(err))))
        return
      }

      let decisionResult: Decision<R> | null = null

      tx.oncomplete = () => finish(() => resolve((decisionResult as Decision<R>).result))
      tx.onabort = () => finish(() => reject(new StorageTimeoutError('transaction aborted')))
      tx.onerror = () => finish(() => reject(new StorageUnavailableError('transaction failed')))

      const os = tx.objectStore('kv')
      const values: Record<string, unknown> = {}
      let pending = KEYS.length

      for (const key of KEYS) {
        const req = os.get(key)
        req.onsuccess = () => {
          values[key] = req.result
          pending -= 1
          if (pending === 0) {
            const state = buildState(values)
            const decision = decide(state)
            decisionResult = decision
            applyWrite(os, values, state, decision.write)
          }
        }
        req.onerror = () => {
          tx.abort()
        }
      }

      if (timeoutMs > 0 && Number.isFinite(timeoutMs)) {
        timer = setTimeout(() => {
          finish(() => reject(new StorageTimeoutError('transaction timed out')))
          try {
            tx.abort()
          } catch {
            /* already aborted */
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

function applyWrite(
  os: IDBObjectStore,
  values: Record<string, unknown>,
  state: StoredState,
  write: Partial<StoredState> | undefined,
): void {
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
  void values
  void state
}

function buildState(values: Record<string, unknown>): StoredState {
  return normalizeStored({
    record: values[KEY_RECORD],
    slices: values[KEY_SLICES] ?? null,
    refreshLease: values[KEY_LEASE] ?? null,
  })
}
