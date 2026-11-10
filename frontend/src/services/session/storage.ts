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
export interface RefreshFailure { sessionId: string; refreshToken: string; status: number; message: string; settledAt: number }
export type LockAttempt = { session: Session | null; lock: RefreshLock | null; acquired: boolean; takeover: boolean; failure?: RefreshFailure }

export interface SessionStorage {
  open(): Promise<void>
  read(): Promise<Session | null>
  readSignOutMarker(): Promise<string | null>
  change(update: (current: Session | null, lastEnded: string | null) => Session | null): Promise<Session | null>
  saveRefresh(id: string, refreshToken: string, credentials: Pick<Session, 'accessToken' | 'refreshToken' | 'user'>): Promise<{ session: Session | null; saved: boolean }>
  acquireRefreshLock(id: string, accessToken: string, holder: string, clock: () => number, waitingFor?: RefreshLock, requestStartedAt?: number): Promise<LockAttempt>
  releaseRefreshLock(lock: RefreshLock): Promise<boolean>
  releaseRefreshLockWithFailure(lock: RefreshLock, failure: RefreshFailure): Promise<boolean>
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

  private transaction(mode: IDBTransactionMode, update?: (current: Session | null, lastEnded: string | null) => Session | null, clearRefreshFailuresFor?: () => string | undefined): Promise<Session | null> {
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
            // Outcomes belong only to the credentials that produced them. Drop them atomically
            // when a Session ends, is replaced, or successfully refreshes.
            const changedCredentials = previous && (!result || result.id !== previous.id || result.accessToken !== previous.accessToken || result.refreshToken !== previous.refreshToken)
            const failureSessionId = clearRefreshFailuresFor?.() ?? (changedCredentials ? previous.id : undefined)
            if (failureSessionId) {
              this.deleteRefreshFailures(store, failureSessionId)
            }
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
  saveRefresh(id: string, refreshToken: string, credentials: Pick<Session, 'accessToken' | 'refreshToken' | 'user'>) {
    let saved = false
    return this.transaction('readwrite', current => {
      if (current?.id !== id || current.refreshToken !== refreshToken) return current
      saved = true
      return { ...current, ...credentials }
    }, () => saved ? id : undefined).then(session => ({ session, saved }))
  }
  private refreshFailureKey(lock: RefreshLock) { return `refresh-failure:${lock.holder}:${lock.expires}` }

  private deleteRefreshFailures(store: IDBObjectStore, sessionId: string) {
    const request = store.openCursor()
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return
      if (String(cursor.key).startsWith('refresh-failure:') && (cursor.value as RefreshFailure).sessionId === sessionId) cursor.delete()
      cursor.continue()
    }
  }

  acquireRefreshLock(id: string, accessToken: string, holder: string, clock: () => number, waitingFor?: RefreshLock, requestStartedAt?: number): Promise<LockAttempt> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const tx = this.database.transaction('session', 'readwrite')
      const store = tx.objectStore('session')
      const sessionRequest = store.get('current')
      const lockRequest = store.get('refresh-lock')
      const failureRequest = waitingFor ? store.get(this.refreshFailureKey(waitingFor)) : undefined
      const failuresCursor = !waitingFor && requestStartedAt !== undefined ? store.openCursor() : undefined
      let result: LockAttempt
      let lockReady = false
      let failureReady = !failureRequest && !failuresCursor
      let relevantFailure: RefreshFailure | undefined
      tx.oncomplete = () => resolve(result)
      tx.onabort = () => reject(tx.error ?? new Error('Session storage transaction aborted'))
      tx.onerror = () => reject(tx.error)
      const finish = () => {
        if (!lockReady || !failureReady) return
        const now = clock()
        const session: Session | null = sessionRequest.result ?? null
        const existing: RefreshLock | null = lockRequest.result ?? null
        const failure: RefreshFailure | undefined = failureRequest?.result ?? relevantFailure
        if (failure && failure.sessionId === id && session?.id === id) {
          result = { session, lock: existing, acquired: false, takeover: false, failure }
          return
        }
        const acquired = session?.id === id && session.accessToken === accessToken && (!existing || existing.expires <= now)
        const lock = acquired ? { holder, expires: now + 15000 } : existing
        if (acquired) store.put(lock, 'refresh-lock')
        result = { session, lock, acquired, takeover: !!(acquired && existing) }
      }
      lockRequest.onsuccess = () => { lockReady = true; finish() }
      if (failureRequest) failureRequest.onsuccess = () => { failureReady = true; finish() }
      if (failuresCursor) failuresCursor.onsuccess = () => {
        const cursor = failuresCursor.result
        if (!cursor) { failureReady = true; finish(); return }
        const failure = cursor.value as RefreshFailure
        const session = sessionRequest.result as Session | null
        if (String(cursor.key).startsWith('refresh-failure:') && failure.sessionId === id && failure.refreshToken === session?.refreshToken && requestStartedAt! < failure.settledAt && (!relevantFailure || failure.settledAt < relevantFailure.settledAt)) {
          relevantFailure = failure
        }
        cursor.continue()
      }
    })
  }

  releaseRefreshLockWithFailure(lock: RefreshLock, failure: RefreshFailure): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const tx = this.database.transaction('session', 'readwrite')
      const store = tx.objectStore('session')
      const request = store.get('refresh-lock')
      const sessionRequest = store.get('current')
      let released = false
      let lockReady = false
      let sessionReady = false
      const finish = () => {
        if (!lockReady || !sessionReady) return
        const current: RefreshLock | undefined = request.result
        if (current?.holder === lock.holder && current.expires === lock.expires) {
          const session: Session | undefined = sessionRequest.result
          if (session?.id === failure.sessionId && session.refreshToken === failure.refreshToken) {
            store.put(failure, this.refreshFailureKey(lock))
          }
          store.delete('refresh-lock')
          released = true
        }
      }
      request.onsuccess = () => { lockReady = true; finish() }
      sessionRequest.onsuccess = () => { sessionReady = true; finish() }
      tx.oncomplete = () => resolve(released)
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
