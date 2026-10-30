import type { AuthResponse } from '@/store/slices/authSlice'
import type { Session, SessionStorage } from './storage'

export const STORAGE_UNAVAILABLE = "This browser's storage is unavailable"
export interface SessionChannel {
  postMessage(message: unknown): void
  close(): void
}
export interface SignInContext { lastEndedSessionId: string | null }
interface Options {
  storage: SessionStorage
  channel?: SessionChannel
  clock?: () => number
  legacyStorage?: Pick<Storage, 'removeItem'>
}

export class SessionCoordinator {
  private current: Session | null = null
  private listeners = new Set<(session: Session | null) => void>()
  private pending: Promise<unknown> = Promise.resolve()
  private disposed = false
  private opened = false
  constructor(private options: Options) {}

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(async () => {
      if (this.disposed) throw new Error('Session coordinator is disposed')
      return operation()
    })
    this.pending = result.catch(() => {})
    return result
  }

  private adopt(session: Session | null) {
    this.current = session
    for (const listener of this.listeners) listener(session)
    return session
  }

  private async open() {
    if (this.opened) return
    try {
      // Never deserialize legacy auth, even if it contains a valid token.
      const legacy = this.options.legacyStorage ?? globalThis.localStorage
      legacy?.removeItem('persist:erp-app')
      await this.options.storage.open()
      this.opened = true
    } catch {
      throw new Error(STORAGE_UNAVAILABLE)
    }
  }

  start() {
    return this.run(async () => {
      await this.open()
      return this.adopt(await this.options.storage.read())
    })
  }

  credentialsForRequest() {
    return this.run(async () => {
      await this.open()
      return this.adopt(await this.options.storage.read())
    })
  }

  /** Capture before sending login; a matched sign-out invalidates this attempt. */
  beginSignIn(): Promise<SignInContext> {
    return this.run(async () => {
      await this.open()
      return { lastEndedSessionId: await this.options.storage.readSignOutMarker() }
    })
  }

  signIn(response: AuthResponse, rememberMe = false, context?: SignInContext) {
    return this.run(async () => {
      await this.open()
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
      const session: Session = { id, accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user, rememberMe, lastActivity: (this.options.clock ?? Date.now)() }
      let saved = false
      const current = await this.options.storage.change((current, lastEnded) => {
        if (context && context.lastEndedSessionId !== lastEnded) return current
        saved = true
        return session
      })
      if (!saved) { this.adopt(current); return null }
      this.options.channel?.postMessage('changed')
      // A concurrent sign-in may already have replaced our save.
      return this.adopt(await this.options.storage.read())
    })
  }

  signOut(id: string, refreshToken?: string) {
    return this.run(async () => {
      let ended: Session | null = null
      const session = await this.options.storage.change(current => {
        if (current?.id !== id || (refreshToken !== undefined && current.refreshToken !== refreshToken)) return current
        ended = current
        return null
      })
      if (ended) this.options.channel?.postMessage('changed')
      this.adopt(session)
      return ended
    })
  }

  /** A matched field update cannot restore a deleted or replaced Session. */
  updateField<K extends Exclude<keyof Session, 'id'>>(id: string, field: K, value: Session[K]) {
    return this.run(async () => this.adopt(await this.options.storage.change(current => {
      if (current?.id !== id) return current
      return { ...current, [field]: field === 'lastActivity' ? Math.max(current.lastActivity, value as number) : value }
    })))
  }

  /** Token rotation needs a pair update matched to the token actually tried. */
  saveRefresh(id: string, refreshToken: string, response: AuthResponse) {
    return this.run(async () => this.adopt(await this.options.storage.change(current => {
      if (current?.id !== id || current.refreshToken !== refreshToken) return current
      return { ...current, accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user }
    })))
  }

  getSnapshot() { return this.current }
  subscribe(listener: (session: Session | null) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    this.options.channel?.close()
    // Close after any already-running transaction finishes.
    void this.pending.finally(() => this.options.storage.close())
  }
}
