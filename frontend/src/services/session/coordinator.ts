import type { AuthResponse } from '@/store/slices/authSlice'
import type { Session, SessionStorage } from './storage'

export const STORAGE_UNAVAILABLE = "This browser's storage is unavailable"
export interface SessionChannel {
  postMessage(message: unknown): void
  close(): void
  subscribe?(listener: () => void): () => void
}
export interface SignInContext { lastEndedSessionId: string | null }
interface Options {
  storage: SessionStorage
  channel?: SessionChannel
  clock?: () => number
  resumeTargets?: { window: EventTarget; document: EventTarget }
  cleanup?: (next: Session | null) => void
  onError?: (error: unknown) => void
  legacyStorage?: Pick<Storage, 'removeItem'>
}

export class SessionCoordinator {
  private current: Session | null = null
  private listeners = new Set<(session: Session | null) => void>()
  private pending: Promise<unknown> = Promise.resolve()
  private disposed = false
  private opened = false
  private detach: Array<() => void> = []
  private listening = false
  private waiters = new Set<() => void>()
  private reconcile = () => {
    for (const wake of this.waiters) wake()
    void this.credentialsForRequest().catch(error => this.options.onError?.(error))
  }

  private listen() {
    if (this.listening) return
    this.listening = true
    const unsubscribe = this.options.channel?.subscribe?.(this.reconcile)
    if (unsubscribe) this.detach.push(unsubscribe)
    const targets = this.options.resumeTargets
    if (!targets) return
    for (const [target, event] of [[targets.window, 'focus'], [targets.window, 'pageshow'], [targets.document, 'visibilitychange']] as const) {
      target.addEventListener(event, this.reconcile)
      this.detach.push(() => target.removeEventListener(event, this.reconcile))
    }
  }
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
    if (this.disposed) return null
    if (this.current && this.current.id !== session?.id) {
      // Block the old Session before clearing any user-owned state.
      this.current = null
      this.options.cleanup?.(session)
    }
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
      legacy?.removeItem('persist:erp-notifications')
      await this.options.storage.open()
      this.opened = true
    } catch {
      throw new Error(STORAGE_UNAVAILABLE)
    }
  }

  start() {
    return this.run(async () => {
      await this.open()
      this.listen()
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
    return this.run(async () => {
      let saved = false
      const current = await this.options.storage.change(session => {
        if (session?.id !== id || session.refreshToken !== refreshToken) return session
        saved = true
        return { ...session, accessToken: response.accessToken, refreshToken: response.refreshToken, user: response.user }
      })
      this.adopt(current)
      return saved ? current : null
    })
  }

  /** Coordinate refresh without holding the local operation queue across the network. */
  async refreshAfter401(id: string, usedAccessToken: string, refresh: (token: string) => Promise<AuthResponse>): Promise<Session> {
    const holder = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
    const verify = (session: Session | null) => {
      if (!session || session.id !== id) throw new Error('Session ended before refresh')
      return session
    }
    for (;;) {
      let session = verify(await this.credentialsForRequest())
      if (session.accessToken !== usedAccessToken) return session
      const attempt = await this.run(async () => {
        const result = await this.options.storage.acquireRefreshLock(id, usedAccessToken, holder, this.options.clock ?? Date.now)
        this.adopt(result.session)
        return result
      })
      session = verify(attempt.session)
      if (session.accessToken !== usedAccessToken) return session
      if (!attempt.acquired || !attempt.lock) {
        await this.waitForRefreshChange()
        continue
      }
      const lock = attempt.lock
      const release = async () => {
        if (await this.options.storage.releaseRefreshLock(lock)) this.options.channel?.postMessage('changed')
      }
      session = verify(await this.credentialsForRequest())
      if (session.accessToken !== usedAccessToken) { await release(); return session }
      const triedToken = session.refreshToken
      let response: AuthResponse
      try {
        response = await refresh(triedToken)
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status
        if (status === 429) await release()
        if (status === 401) {
          const latest = verify(await this.credentialsForRequest())
          if (latest.accessToken !== usedAccessToken || latest.refreshToken !== triedToken) { await release(); continue }
          if (!attempt.takeover) {
            const ended = await this.signOut(id, triedToken)
            await release()
            if (!ended) {
              const current = verify(this.getSnapshot())
              if (current.accessToken !== usedAccessToken || current.refreshToken !== triedToken) continue
            }
          }
        }
        throw error
      }
      // A failed or rejected save has an uncertain server outcome: leave the lock.
      const saved = await this.saveRefresh(id, triedToken, response)
      if (!saved || saved.id !== id || saved.accessToken !== response.accessToken || saved.refreshToken !== response.refreshToken) {
        throw new Error('Session ended during refresh')
      }
      this.options.channel?.postMessage('changed')
      await release()
      return saved
    }
  }

  private waitForRefreshChange(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.disposed) { reject(new Error('Session coordinator is disposed')); return }
      const wake = () => { clearTimeout(timer); this.waiters.delete(wake); resolve() }
      const timer = setTimeout(wake, 250)
      this.waiters.add(wake)
    })
  }

  setCleanup(cleanup: (next: Session | null) => void) { this.options.cleanup = cleanup }

  getSnapshot() { return this.current }
  subscribe(listener: (session: Session | null) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const wake of this.waiters) wake()
    this.listeners.clear()
    for (const detach of this.detach) detach()
    this.detach = []
    this.options.channel?.close()
    // Close after any already-running transaction finishes.
    void this.pending.finally(() => this.options.storage.close())
  }
}
