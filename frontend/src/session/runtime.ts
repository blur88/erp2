import { RefreshRejectedError, type AuthHttp } from './authHttp'
import {
  signInCommit,
  tokenCommit,
  explicitEndCommit,
  failureEndCommit,
  cancelledSignInCleanup,
  slicesWrite,
  leaseAcquire,
  leaseRelease,
  type Decision,
} from './decisions'
import { reconcile, type ReconcileAction } from './reconcile'
import type { SessionStore } from './store/sessionStore'
import {
  SessionEndedError,
  StorageUnavailableError,
  type ActiveSession,
  type LoginCredentials,
  type SessionRef,
  type StoredState,
} from './types'

export class SessionChangedElsewhereError extends Error {}

export interface RuntimeEvents {
  sessionEstablished(session: ActiveSession): void
  tokensUpdated(tokens: { accessToken: string; accessTokenExpiresAt: number; refreshToken: string }): void
  sessionEnded(reason: 'explicit' | 'failure' | 'elsewhere' | 'storage'): void
}

export interface RuntimeDeps {
  store: SessionStore
  http: AuthHttp
  events: RuntimeEvents
  channel: { post(): void; subscribe(fn: () => void): () => void } | null
  tabId: string
  now: () => number
}

export type RuntimeStatus = 'starting' | 'signed-out' | 'signed-in' | 'storage-unavailable'

export interface SessionRuntime {
  start(): Promise<void>
  status(): RuntimeStatus
  claim(): string | null
  signIn(credentials: LoginCredentials): Promise<{ requiresPasswordChange: boolean }>
  cancelSignIn(): void
  beginRequest(): Promise<{ ref: SessionRef; accessToken: string; signal: AbortSignal }>
  canDeliver(ref: SessionRef): Promise<boolean>
  handleUnauthorized(ref: SessionRef): Promise<'retry' | 'ended'>
  reconcileNow(): Promise<void>
  persistSlices(originSessionId: string | null, json: string): Promise<void>
  readSlices(): Promise<string | null>
  signOut(): Promise<void>
  passwordChanged(): Promise<void>
  endAfterFinalUnauthorized(ref: SessionRef): Promise<'ended' | 'kept'>
}

const LEASE_TTL_MS = 20000

export function createSessionRuntime(deps: RuntimeDeps): SessionRuntime {
  const { store, http, events, channel, tabId, now } = deps

  let status: RuntimeStatus = 'starting'
  let memory: ActiveSession | null = null
  let lastCredential: { sessionId: string; refreshToken: string } | null = null
  let attemptCounter = 0
  let currentAttempt = 0
  let signInAbort: AbortController | null = null
  let sessionAbort = new AbortController()
  let refreshInFlight: Promise<'retry' | 'ended'> | null = null

  const claim = () => memory?.sessionId ?? null
  const remember = (session: ActiveSession) => {
    lastCredential = { sessionId: session.sessionId, refreshToken: session.refreshToken }
  }
  const post = () => channel?.post()
  const isEligible = (sessionId: string) => claim() === sessionId

  const moveToStorageUnavailable = () => {
    if (status === 'storage-unavailable') return
    status = 'storage-unavailable'
    memory = null
    sessionAbort.abort()
    sessionAbort = new AbortController()
    events.sessionEnded('storage')
  }

  const clearLocally = (reason: 'explicit' | 'failure' | 'elsewhere') => {
    memory = null
    status = 'signed-out'
    sessionAbort.abort()
    sessionAbort = new AbortController()
    events.sessionEnded(reason)
  }

  const readRecord = async (): Promise<StoredState> => {
    try {
      return await store.read()
    } catch (err) {
      if (err instanceof StorageUnavailableError) moveToStorageUnavailable()
      throw err
    }
  }

  const transact = async <R>(decide: (s: StoredState) => Decision<R>): Promise<R> => {
    try {
      return await store.transact(decide)
    } catch (err) {
      if (err instanceof StorageUnavailableError) moveToStorageUnavailable()
      throw err
    }
  }

  // ---- reconciliation -------------------------------------------------------

  const applyAdoption = (action: ReconcileAction, stored: StoredState): boolean => {
    const remote = stored.record.session
    if (action === 'end-locally') {
      if (status === 'signed-in') clearLocally('elsewhere')
      return true
    }
    if (remote === null) return false
    if (action === 'adopt-tokens') {
      memory = { ...remote }
      remember(memory)
      events.tokensUpdated({
        accessToken: remote.accessToken,
        accessTokenExpiresAt: remote.accessTokenExpiresAt,
        refreshToken: remote.refreshToken,
      })
      return true
    }
    if (action === 'adopt-access' && memory) {
      memory = { ...memory, accessToken: remote.accessToken, accessTokenExpiresAt: remote.accessTokenExpiresAt }
      events.tokensUpdated({
        accessToken: remote.accessToken,
        accessTokenExpiresAt: remote.accessTokenExpiresAt,
        refreshToken: memory.refreshToken,
      })
      return true
    }
    return false
  }

  const reconcileNow = async (): Promise<void> => {
    if (status === 'starting') return
    const stored = await readRecord()
    applyAdoption(reconcile(claim(), memory, stored.record), stored)
  }

  // ---- startup --------------------------------------------------------------

  const start = async (): Promise<void> => {
    try {
      const stored = await store.read()
      if (stored.record.session) {
        memory = { ...stored.record.session }
        remember(memory)
        status = 'signed-in'
        events.sessionEstablished(memory)
      } else {
        status = 'signed-out'
      }
    } catch (err) {
      if (err instanceof StorageUnavailableError) moveToStorageUnavailable()
      else status = 'signed-out'
    }

    store.onClosed(() => moveToStorageUnavailable())

    if (channel) {
      channel.subscribe(() => {
        void reconcileNow().catch(() => undefined)
      })
    }
  }

  // ---- sign-in --------------------------------------------------------------

  const signIn = async (credentials: LoginCredentials): Promise<{ requiresPasswordChange: boolean }> => {
    const attempt = ++attemptCounter
    currentAttempt = attempt
    signInAbort = new AbortController()
    const captured = await store.read()
    const capturedRevision = captured.record.revision

    let response: Awaited<ReturnType<AuthHttp['login']>>
    try {
      response = await http.login(credentials, signInAbort.signal)
    } catch (err) {
      if (attempt === currentAttempt) currentAttempt = 0
      throw err
    }

    if (attempt !== currentAttempt) {
      void http.logout(response.refreshToken)
      throw new SessionChangedElsewhereError('sign-in cancelled')
    }

    const rememberMe = credentials.rememberMe === true
    let commit
    try {
      commit = await transact((s) => signInCommit(s, { capturedRevision, response, rememberMe }))
    } catch (err) {
      if (attempt === currentAttempt) currentAttempt = 0
      throw err
    }

    if (!commit.ok) {
      void http.logout(response.refreshToken)
      if (attempt === currentAttempt) currentAttempt = 0
      throw new SessionChangedElsewhereError('session changed elsewhere')
    }

    if (attempt !== currentAttempt) {
      void http.logout(response.refreshToken)
      await transact((s) => cancelledSignInCleanup(s, { sessionId: response.sessionId }))
      throw new SessionChangedElsewhereError('sign-in cancelled')
    }

    const session: ActiveSession = {
      sessionId: response.sessionId,
      generation: response.generation,
      accessToken: response.accessToken,
      accessTokenExpiresAt: response.accessTokenExpiresAt,
      refreshToken: response.refreshToken,
      user: response.user,
      rememberMe,
    }
    memory = session
    remember(session)
    status = 'signed-in'
    events.sessionEstablished(session)
    post()

    if (commit.displaced) void http.logout(commit.displaced.refreshToken)

    return { requiresPasswordChange: response.requiresPasswordChange === true }
  }

  const cancelSignIn = () => {
    attemptCounter += 1
    currentAttempt = 0
    signInAbort?.abort()
  }

  // ---- request lifecycle ----------------------------------------------------

  const beginRequest = async (): Promise<{ ref: SessionRef; accessToken: string; signal: AbortSignal }> => {
    const stored = await readRecord()
    applyAdoption(reconcile(claim(), memory, stored.record), stored)

    if (!memory || claim() === null) throw new SessionEndedError('no claim')

    const session = memory
    return {
      ref: { sessionId: session.sessionId, generation: session.generation },
      accessToken: session.accessToken,
      signal: sessionAbort.signal,
    }
  }

  const canDeliver = async (ref: SessionRef): Promise<boolean> => {
    const stored = await readRecord()
    applyAdoption(reconcile(claim(), memory, stored.record), stored)
    return claim() === ref.sessionId && stored.record.session?.sessionId === ref.sessionId
  }

  const acquireLease = async (): Promise<boolean> =>
    (await transact((s) => leaseAcquire(s, { owner: tabId, now: now(), ttlMs: LEASE_TTL_MS }))).acquired

  const doRefresh = async (): Promise<'retry' | 'ended'> => {
    const first = await readRecord()
    if (applyAdoption(reconcile(claim(), memory, first.record), first)) {
      if (status !== 'signed-in') return 'ended'
      return 'retry'
    }
    if (!memory) return 'ended'

    // The lease covers the refresh request itself: the tab that holds it sends,
    // the others wait to adopt its tokens. A tab that outwaits the lease proceeds
    // without it, and only the owner ever releases it.
    let holdsLease = await acquireLease()
    try {
      if (!holdsLease) {
        const maxRounds = Math.max(1, Math.floor(LEASE_TTL_MS / 250))
        for (let round = 0; round < maxRounds && !holdsLease; round += 1) {
          await new Promise((r) => setTimeout(r, 250))
          const again = await readRecord()
          if (applyAdoption(reconcile(claim(), memory, again.record), again)) {
            if (status !== 'signed-in') return 'ended'
            return 'retry'
          }
          if (!memory) return 'ended'
          holdsLease = await acquireLease()
        }
      }

      const second = await readRecord()
      if (applyAdoption(reconcile(claim(), memory, second.record), second)) {
        if (status !== 'signed-in') return 'ended'
        return 'retry'
      }
      if (!memory) return 'ended'

      return await sendRefresh(memory)
    } finally {
      if (holdsLease) await transact((s) => leaseRelease(s, { owner: tabId })).catch(() => undefined)
    }
  }

  const sendRefresh = async (session: ActiveSession): Promise<'retry' | 'ended'> => {
    const requestSessionId = session.sessionId
    const capturedGeneration = session.generation
    const refreshToken = session.refreshToken

    let response
    try {
      response = await http.refresh(refreshToken)
    } catch (err) {
      if (err instanceof RefreshRejectedError) {
        const after = await readRecord()
        applyAdoption(reconcile(claim(), memory, after.record), after)
        const stored = after.record.session
        if (stored && (stored.generation > capturedGeneration || stored.sessionId !== requestSessionId)) {
          return 'retry'
        }
        const ended = await transact((s) =>
          failureEndCommit(s, { sessionId: requestSessionId, generation: capturedGeneration }),
        )
        if (ended.ended) {
          clearLocally('failure')
          post()
          return 'ended'
        }
        // Another tab changed the record between the read and the commit, so
        // nothing was ended: follow what is stored now.
        await reconcileNow()
        return claim() !== null ? 'retry' : 'ended'
      }
      throw err
    }

    const outcome = await transact((s) =>
      tokenCommit(s, { claim: claim(), requestSessionId, response }),
    )

    if (outcome.outcome === 'discarded' || outcome.outcome === 'session-mismatch') {
      const after = await readRecord()
      applyAdoption(reconcile(claim(), memory, after.record), after)
      if (status !== 'signed-in') return 'ended'
      return 'retry'
    }

    if (isEligible(requestSessionId) && memory) {
      memory = { ...memory, ...response }
      remember(memory)
      events.tokensUpdated({
        accessToken: response.accessToken,
        accessTokenExpiresAt: response.accessTokenExpiresAt,
        refreshToken: response.refreshToken,
      })
      post()
    }
    return 'retry'
  }

  const handleUnauthorized = async (ref: SessionRef): Promise<'retry' | 'ended'> => {
    // The request was sent under a session this tab no longer holds. It is never
    // refreshed for and never re-sent: a retry would go out with another
    // session's token.
    if (claim() !== ref.sessionId) return 'ended'
    // The tab adopted or refreshed since this request was sent: its 401 is for a
    // token the tab no longer uses, so retry with the current one.
    if (memory && memory.generation > ref.generation) return 'retry'
    if (!refreshInFlight) {
      const promise = (async () => {
        try {
          return await doRefresh()
        } finally {
          refreshInFlight = null
        }
      })()
      refreshInFlight = promise
    }
    const outcome = await refreshInFlight
    // The tab may have switched sessions while the refresh was in flight.
    return claim() === ref.sessionId ? outcome : 'ended'
  }

  // ---- slices ---------------------------------------------------------------

  const persistSlices = async (originSessionId: string | null, json: string): Promise<void> => {
    await transact((s) => slicesWrite(s, { originSessionId, claim: claim(), json }))
  }

  const readSlices = async (): Promise<string | null> => {
    const stored = await store.read()
    if (stored.record.session && stored.slices && stored.slices.sessionId === stored.record.session.sessionId) {
      return stored.slices.json
    }
    return null
  }

  // ---- endings --------------------------------------------------------------

  const signOut = async (): Promise<void> => {
    const captured = memory
      ? { sessionId: memory.sessionId, refreshToken: memory.refreshToken }
      : lastCredential
    memory = null
    lastCredential = null
    status = status === 'storage-unavailable' ? 'storage-unavailable' : 'signed-out'
    sessionAbort.abort()
    sessionAbort = new AbortController()
    events.sessionEnded('explicit')
    if (captured) void http.logout(captured.refreshToken)
    try {
      await transact((s) => explicitEndCommit(s, { targetSessionId: captured?.sessionId ?? '' }))
    } catch {
      /* tab already cleared; the logout was already sent */
    }
    post()
  }

  const passwordChanged = async (): Promise<void> => {
    const target = memory?.sessionId ?? lastCredential?.sessionId ?? null
    memory = null
    lastCredential = null
    status = 'signed-out'
    sessionAbort.abort()
    sessionAbort = new AbortController()
    events.sessionEnded('explicit')
    if (target) {
      try {
        await transact((s) => explicitEndCommit(s, { targetSessionId: target }))
      } catch {
        /* ignore */
      }
    }
    post()
  }

  const endAfterFinalUnauthorized = async (ref: SessionRef): Promise<'ended' | 'kept'> => {
    const ended = await transact((s) => failureEndCommit(s, ref))
    if (ended.ended) {
      clearLocally('failure')
      post()
      return 'ended'
    }
    return 'kept'
  }

  return {
    start,
    status: () => status,
    claim,
    signIn,
    cancelSignIn,
    beginRequest,
    canDeliver,
    handleUnauthorized,
    reconcileNow,
    persistSlices,
    readSlices,
    signOut,
    passwordChanged,
    endAfterFinalUnauthorized,
  }
}
