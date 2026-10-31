import type { AuthUser } from '@/store/slices/authSlice'

export interface Session {
  id: string
  accessToken: string
  refreshToken: string
  user: AuthUser
  rememberMe: boolean
  lastActivity: number
}

export interface RefreshLock { holder: string; expires: number }
export type LockAttempt = { session: Session | null; lock: RefreshLock | null; acquired: boolean; takeover: boolean }

export interface SessionStorage {
  open(): Promise<void>
  read(): Promise<Session | null>
  readSignOutMarker(): Promise<string | null>
  change(update: (current: Session | null, lastEnded: string | null) => Session | null): Promise<Session | null>
  acquireRefreshLock(id: string, accessToken: string, holder: string, now: number): Promise<LockAttempt>
  releaseRefreshLock(lock: RefreshLock): Promise<boolean>
  close(): void
}

/** All read/modify/write operations finish in one IndexedDB transaction. */
export class IndexedDbSessionStorage implements SessionStorage {
  private database?: IDBDatabase
  constructor(private factory?: IDBFactory, private name = 'erp-session') {}

  async open(): Promise<void> {
    if (this.database) return
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = (this.factory ?? globalThis.indexedDB).open(this.name, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('session')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
      request.onblocked = () => {
        request.onsuccess = () => request.result.close()
        reject(new Error('Session storage is blocked'))
      }
    })
    this.database.onversionchange = () => this.close()
  }

  private transaction(mode: IDBTransactionMode, update?: (current: Session | null, lastEnded: string | null) => Session | null): Promise<Session | null> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const transaction = this.database.transaction('session', mode)
      const store = transaction.objectStore('session')
      let result: Session | null = null
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Session storage transaction aborted'))
      transaction.onerror = () => reject(transaction.error)
      const marker = store.get('last-ended-session')
      const request = store.get('current')
      request.onsuccess = () => {
        result = request.result ?? null
        if (update) {
          try {
            const previous = result
            result = update(result, marker.result ?? null)
            if (previous && !result) store.put(previous.id, 'last-ended-session')
            if (result) store.put(result, 'current')
            else store.delete('current')
          } catch (error) {
            transaction.abort()
            reject(error)
          }
        }
      }
    })
  }

  read() { return this.transaction('readonly') }
  readSignOutMarker(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const transaction = this.database.transaction('session', 'readonly')
      const request = transaction.objectStore('session').get('last-ended-session')
      transaction.oncomplete = () => resolve(request.result ?? null)
      transaction.onabort = () => reject(transaction.error ?? new Error('Session storage transaction aborted'))
      transaction.onerror = () => reject(transaction.error)
    })
  }
  change(update: (current: Session | null, lastEnded: string | null) => Session | null) { return this.transaction('readwrite', update) }
  acquireRefreshLock(id: string, accessToken: string, holder: string, now: number): Promise<LockAttempt> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const tx = this.database.transaction('session', 'readwrite')
      const store = tx.objectStore('session')
      const sessionRequest = store.get('current')
      const lockRequest = store.get('refresh-lock')
      let result: LockAttempt
      lockRequest.onsuccess = () => {
        const session: Session | null = sessionRequest.result ?? null
        const existing: RefreshLock | null = lockRequest.result ?? null
        const acquired = session?.id === id && session.accessToken === accessToken && (!existing || existing.expires <= now)
        const lock = acquired ? { holder, expires: now + 15000 } : existing
        if (acquired) store.put(lock, 'refresh-lock')
        result = { session, lock, acquired, takeover: !!(acquired && existing) }
      }
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('Session storage transaction aborted'))
      tx.onerror = () => reject(tx.error)
    })
  }
  releaseRefreshLock(lock: RefreshLock): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const tx = this.database.transaction('session', 'readwrite')
      const store = tx.objectStore('session')
      const request = store.get('refresh-lock')
      let released = false
      request.onsuccess = () => {
        const current: RefreshLock | undefined = request.result
        if (current?.holder === lock.holder && current.expires === lock.expires) {
          store.delete('refresh-lock'); released = true
        }
      }
      tx.oncomplete = () => resolve(released)
      tx.onabort = () => reject(tx.error ?? new Error('Session storage transaction aborted'))
      tx.onerror = () => reject(tx.error)
    })
  }
  close() { this.database?.close(); this.database = undefined }
}
