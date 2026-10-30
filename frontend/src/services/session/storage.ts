import type { AuthUser } from '@/store/slices/authSlice'

export interface Session {
  id: string
  accessToken: string
  refreshToken: string
  user: AuthUser
  rememberMe: boolean
  lastActivity: number
}

export interface SessionStorage {
  open(): Promise<void>
  read(): Promise<Session | null>
  change(update: (current: Session | null) => Session | null): Promise<Session | null>
  close(): void
}

/** All read/modify/write operations finish in one IndexedDB transaction. */
export class IndexedDbSessionStorage implements SessionStorage {
  private database?: IDBDatabase
  constructor(private factory: IDBFactory = globalThis.indexedDB, private name = 'erp-session') {}

  async open(): Promise<void> {
    if (this.database) return
    this.database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.name, 1)
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

  private transaction(mode: IDBTransactionMode, update?: (current: Session | null) => Session | null): Promise<Session | null> {
    return new Promise((resolve, reject) => {
      if (!this.database) { reject(new Error('Session storage is not open')); return }
      const transaction = this.database.transaction('session', mode)
      const store = transaction.objectStore('session')
      let result: Session | null = null
      transaction.oncomplete = () => resolve(result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Session storage transaction aborted'))
      transaction.onerror = () => reject(transaction.error)
      const request = store.get('current')
      request.onsuccess = () => {
        result = request.result ?? null
        if (update) {
          try {
            result = update(result)
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
  change(update: (current: Session | null) => Session | null) { return this.transaction('readwrite', update) }
  close() { this.database?.close(); this.database = undefined }
}
