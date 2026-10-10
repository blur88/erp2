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
  type SignInCommitResult,
} from './decisions'
import { reconcile, type ReconcileAction } from './reconcile'
import type { TraceBody, TraceEvent } from './trace'
import type { SessionStore } from './store/sessionStore'
import {
  SessionEndedError,
  StorageTimeoutError,
  StorageUnavailableError,
  type ActiveSession,
  type LoginCredentials,
  type SessionRef,
  type StoredState,
  type TokenResponse,
} from './types'

export class SessionChangedElsewhereError extends Error {}

export interface RuntimeEvents {
  sessionEstablished(session: ActiveSession): void
  tokensUpdated(tokens: {
    generation: number
    accessToken: string
    accessTokenExpiresAt: number
    refreshToken: string
  }): void
  sessionEnded(reason: 'explicit' | 'failure' | 'elsewhere' | 'storage'): void
  /** The start-up read timed out (`true`), or a later one settled what it left open (`false`). */
  storageWaiting(waiting: boolean): void
}

export interface RuntimeDeps {
  store: SessionStore
  http: AuthHttp
  events: RuntimeEvents
  channel: { post(): void; subscribe(fn: () => void): () => void } | null
  tabId: string
  now: () => number
  /** Opt-in trace of the refresh path. When absent nothing is recorded. */
  onTrace?: (event: TraceEvent) => void
}

// 'storage-waiting': the start-up read timed out. Storage did not answer, so the
// tab is not signed-out (a session may be stored) and storage has not been found
// broken either (spec B3, B8: a timeout settles nothing and signs nobody out).
export type RuntimeStatus = 'starting' | 'signed-out' | 'signed-in' | 'storage-waiting' | 'storage-unavailable'

export interface SessionRuntime {
  start(): Promise<void>
  /** Resolves when `start()` has settled, in any state. Never rejects. */
  whenStarted(): Promise<void>
  /** Repeats the start-up read of a tab left 'storage-waiting'. Does nothing in any other state. Never rejects. */
  retryStart(): Promise<void>
  status(): RuntimeStatus
  claim(): string | null
  signIn(credentials: LoginCredentials): Promise<{ requiresPasswordChange: boolean }>
  cancelSignIn(): void
  beginRequest(): Promise<{ ref: SessionRef; accessToken: string; signal: AbortSignal }>
  canDeliver(ref: SessionRef): Promise<boolean>
  handleUnauthorized(ref: SessionRef): Promise<'retry' | 'ended'>
  reconcileNow(): Promise<void>
  /** Writes the tagged slices; `json: null` removes them. Skipped unless the origin is still the session. */
  persistSlices(originSessionId: string | null, json: string | null): Promise<void>
  readSlices(): Promise<string | null>
  signOut(): Promise<void>
  passwordChanged(): Promise<void>
  endAfterFinalUnauthorized(ref: SessionRef): Promise<'ended' | 'kept'>
}

const LEASE_TTL_MS = 20000

// How many times a 200's commit is attempted before the request gives up on it.
// The response is kept either way; the number is not part of the design.
const TOKEN_COMMIT_ATTEMPTS_INLINE = 2

// How often the transaction that clears a cancelled sign-in's session is
// attempted: when the cancellation is found, and then on later reconciles.
const CLEANUP_ATTEMPTS_AT_CANCEL = 2
const CLEANUP_ATTEMPTS_LATER = 3

// A 200 this tab has received and has not yet committed. It is held outside
// `memory`, so a tab whose generation is higher than the stored one never ends
// itself on these tokens, and `memory` and Redux keep the old generation until a
// commit completes. Memory only: it ends with the tab.
type PendingTokenCommit = {
  sessionId: string
  refreshId: number
  response: TokenResponse
  /** The lease this refresh holds, or null when it outwaited the lease. */
  lease: { expiresAt: number } | null
  attempts: number
}

type PendingDropReason = 'written' | 'discarded' | 'session-mismatch' | 'claim-changed' | 'storage-unavailable'

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
  let startRetryInFlight: Promise<void> | null = null
  // A cancelled sign-in's session that the record may still hold, because no
  // transaction clearing it has completed. Memory only: it ends with the tab.
  let pendingCleanup: { sessionId: string; attemptsLeft: number } | null = null
  let cleanupInFlight: { pending: object; settled: Promise<void> } | null = null
  let pendingTokenCommit: PendingTokenCommit | null = null
  let tokenCommitInFlight: { pending: PendingTokenCommit; settled: Promise<void> } | null = null
  // Trace state. `refreshId` numbers the refreshes of this runtime so the events
  // of one refresh can be joined; it is 0 outside a refresh.
  let refreshIdCounter = 0
  let currentRefreshId = 0
  let announceStarted: () => void = () => undefined
  const started = new Promise<void>((resolve) => {
    announceStarted = resolve
  })

  const claim = () => memory?.sessionId ?? null
  const remember = (session: ActiveSession) => {
    lastCredential = { sessionId: session.sessionId, refreshToken: session.refreshToken }
  }
  const post = () => channel?.post()
  const isEligible = (sessionId: string) => claim() === sessionId
  // A no-op unless the runtime was given an `onTrace` dependency. `traceAs` is
  // for an event that belongs to a refresh other than the one running now — an
  // entry's later attempts, and its lease release — so it names that refresh
  // rather than relying on what the current one happens to be by then.
  const traceAs = (refreshId: number, body: TraceBody): void => {
    deps.onTrace?.({ ...body, tabId, at: now(), refreshId })
  }
  const trace = (body: TraceBody): void => traceAs(currentRefreshId, body)
  // Best effort: a logout that fails changes nothing in the browser.
  const logoutBestEffort = (refreshToken: string) => {
    void http.logout(refreshToken).catch(() => undefined)
  }

  // Best effort: a release that fails leaves the lease to expire, and one that
  // finds a different lease under the same owner releases nothing. It is traced
  // under the refresh the lease belongs to, which is not always the one running
  // now: an entry released after its refresh ended still belongs to it.
  const releaseLease = async (lease: { expiresAt: number }, refreshId: number): Promise<void> => {
    const startedAt = now()
    try {
      const released = await transact((s) => leaseRelease(s, { owner: tabId, expiresAt: lease.expiresAt }))
      traceAs(refreshId, {
        type: 'lease-release',
        outcome: released.released ? 'released' : 'not-owner',
        ms: now() - startedAt,
      })
    } catch {
      traceAs(refreshId, { type: 'lease-release', outcome: 'failed', ms: now() - startedAt })
    }
  }

  // The entry is removed for a settled commit, a claim change or storage
  // becoming unavailable, and for no other reason: running out of attempts would
  // recreate the loss it exists to prevent. Only the entry that is still current
  // is removed, so a late attempt cannot clear a newer one.
  const resolvePending = (entry: PendingTokenCommit, reason: PendingDropReason): void => {
    if (pendingTokenCommit !== entry) return
    pendingTokenCommit = null
    traceAs(entry.refreshId, { type: 'pending-dropped', reason })
    // The entry owns the lease from the moment it is installed, and releases it
    // once. A tab that failed closed writes nothing at all, so it releases
    // nothing either.
    const lease = entry.lease
    entry.lease = null
    if (lease !== null && reason !== 'storage-unavailable') void releaseLease(lease, entry.refreshId)
  }

  const moveToStorageUnavailable = () => {
    if (status === 'storage-unavailable') return
    status = 'storage-unavailable'
    memory = null
    pendingCleanup = null
    if (pendingTokenCommit) resolvePending(pendingTokenCommit, 'storage-unavailable')
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
        generation: remote.generation,
        accessToken: remote.accessToken,
        accessTokenExpiresAt: remote.accessTokenExpiresAt,
        refreshToken: remote.refreshToken,
      })
      return true
    }
    if (action === 'adopt-access' && memory) {
      memory = { ...memory, accessToken: remote.accessToken, accessTokenExpiresAt: remote.accessTokenExpiresAt }
      events.tokensUpdated({
        generation: memory.generation,
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
    // Nothing to reconcile yet: what brings a tab here (a channel message, a
    // resume) is a reason to ask storage again.
    if (status === 'storage-waiting') return retryStart()
    await attemptPendingCleanup()
    // A pending commit is this tab's own uncommitted tokens: one attempt, and a
    // timed-out attempt is not an error of the reconcile. The entry stays, and
    // the read below still happens and is still applied.
    if (pendingTokenCommit) {
      try {
        await attemptPendingTokenCommit('reconcile', null)
      } catch {
        /* the entry stays for a later trigger */
      }
    }
    const stored = await readRecord()
    applyAdoption(reconcile(claim(), memory, stored.record), stored)
  }

  // ---- startup --------------------------------------------------------------

  // What a tab is at start is what the stored record says. A read that times
  // out says nothing. One that fails in any other way, whatever the error's
  // class, puts the tab in the storage-unavailable state: only a completed
  // read can say that no session is stored.
  const readAtStart = async (): Promise<'settled' | 'timed-out'> => {
    let stored: StoredState
    // Only the read: what the application does with the answer is not a
    // failure of storage, and is not reported as one.
    try {
      stored = await store.read()
    } catch (err) {
      if (err instanceof StorageTimeoutError) return 'timed-out'
      moveToStorageUnavailable()
      return 'settled'
    }
    if (stored.record.session) {
      memory = { ...stored.record.session }
      remember(memory)
      status = 'signed-in'
      events.sessionEstablished(memory)
    } else {
      status = 'signed-out'
    }
    return 'settled'
  }

  const start = async (): Promise<void> => {
    try {
      if ((await readAtStart()) === 'timed-out') {
        status = 'storage-waiting'
        events.storageWaiting(true)
      }
    } finally {
      // Also when a listener threw: whoever waits for the start is not left
      // waiting for ever by an error that is reported to the caller of start().
      store.onClosed(() => moveToStorageUnavailable())

      if (channel) {
        channel.subscribe(() => {
          void reconcileNow().catch(() => undefined)
        })
      }

      announceStarted()
    }
  }

  const retryStart = (): Promise<void> => {
    if (status !== 'storage-waiting') return Promise.resolve()
    if (!startRetryInFlight) {
      startRetryInFlight = (async () => {
        try {
          const outcome = await readAtStart()
          // Storage may have closed under the read; that already settled it.
          if (outcome === 'settled' && (status as RuntimeStatus) !== 'storage-unavailable') events.storageWaiting(false)
        } finally {
          startRetryInFlight = null
        }
      })()
    }
    return startRetryInFlight
  }

  // ---- sign-in --------------------------------------------------------------

  // One attempt at clearing a cancelled sign-in's session. It is the same
  // conditional transaction each time, so one that runs after a newer session
  // was committed writes nothing. An attempt that times out did not commit and
  // leaves the cleanup pending while attempts remain; one that completes,
  // whether it cleared the record or found nothing to clear, settles it.
  // Never rejects.
  //
  // None is started while this tab has a sign-in attempt of its own under way,
  // whoever asks: a reconcile, or the cancelled attempt's own retry. A cleanup
  // that committed then would change the revision that attempt captured and
  // refuse its commit. That commit replaces the leftover session itself; an
  // attempt that fails or is cancelled leaves the cleanup for the reconcile
  // after it. One already queued when the attempt began is no danger: the
  // attempt's read is queued behind it and sees what it wrote.
  const attemptPendingCleanup = (): Promise<void> => {
    const pending = pendingCleanup
    if (!pending) return Promise.resolve()
    if (cleanupInFlight?.pending === pending) return cleanupInFlight.settled
    if (currentAttempt !== 0) return Promise.resolve()
    pending.attemptsLeft -= 1
    const settled = (async () => {
      try {
        const cleanup = await transact((s) => cancelledSignInCleanup(s, { sessionId: pending.sessionId }))
        if (pendingCleanup === pending) pendingCleanup = null
        if (cleanup.cleared) post()
      } catch {
        // Storage found unusable has already dropped it (the tab writes nothing
        // in that state). Otherwise it stays for a later reconcile, if any
        // attempt is left.
        if (pendingCleanup === pending && pending.attemptsLeft <= 0) pendingCleanup = null
      } finally {
        if (cleanupInFlight?.pending === pending) cleanupInFlight = null
      }
    })()
    cleanupInFlight = { pending, settled }
    return settled
  }

  const signIn = async (credentials: LoginCredentials): Promise<{ requiresPasswordChange: boolean }> => {
    // Storage has not said whether a session is stored: signing in now could
    // displace one. Nothing is read and nothing is sent.
    if (status === 'storage-waiting') throw new StorageTimeoutError('session storage has not answered')
    const attempt = ++attemptCounter
    currentAttempt = attempt
    signInAbort = new AbortController()
    let captured: StoredState
    try {
      captured = await readRecord()
    } catch (err) {
      // The attempt ended here. Left current, it would hold the cleanup back
      // for as long as the tab stays on the sign-in page.
      if (attempt === currentAttempt) currentAttempt = 0
      throw err
    }
    const capturedRevision = captured.record.revision

    let response: Awaited<ReturnType<AuthHttp['login']>>
    try {
      response = await http.login(credentials, signInAbort.signal)
    } catch (err) {
      if (attempt === currentAttempt) currentAttempt = 0
      throw err
    }

    if (attempt !== currentAttempt) {
      logoutBestEffort(response.refreshToken)
      throw new SessionChangedElsewhereError('sign-in cancelled')
    }

    const rememberMe = credentials.rememberMe === true
    let commit: SignInCommitResult
    try {
      // Whether the attempt is still current is read when the transaction runs,
      // not when it is queued: a cancellation in between writes nothing.
      commit = await transact((s) =>
        signInCommit(s, { capturedRevision, attemptCurrent: attempt === currentAttempt, response, rememberMe }),
      )
    } catch (err) {
      // Nothing was committed, so nobody holds the session the server created.
      logoutBestEffort(response.refreshToken)
      if (attempt === currentAttempt) currentAttempt = 0
      throw err
    }

    if (commit.ok === false) {
      logoutBestEffort(response.refreshToken)
      if (commit.reason === 'attempt-cancelled') throw new SessionChangedElsewhereError('sign-in cancelled')
      if (attempt === currentAttempt) currentAttempt = 0
      throw new SessionChangedElsewhereError('session changed elsewhere')
    }

    // The commit completed and the attempt was cancelled after the transaction
    // decided. The record holds a session no tab claims: it is cleared, but only
    // while it is still that session, so a newer one is never touched. For the
    // caller the sign-in was cancelled whether or not the cleanup completed; one
    // that timed out is tried once more here and then when the tab reconciles.
    if (attempt !== currentAttempt) {
      logoutBestEffort(response.refreshToken)
      if (commit.displaced) logoutBestEffort(commit.displaced.refreshToken)
      const cleanup = {
        sessionId: response.sessionId,
        attemptsLeft: CLEANUP_ATTEMPTS_AT_CANCEL + CLEANUP_ATTEMPTS_LATER,
      }
      pendingCleanup = cleanup
      for (let n = 0; n < CLEANUP_ATTEMPTS_AT_CANCEL && pendingCleanup === cleanup; n += 1) {
        await attemptPendingCleanup()
      }
      if ((status as RuntimeStatus) === 'storage-unavailable') {
        throw new StorageUnavailableError('session storage unavailable')
      }
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
    // The attempt is over, so it no longer holds back a cleanup.
    currentAttempt = 0
    // This commit replaced whatever an earlier cancelled attempt left stored.
    pendingCleanup = null
    events.sessionEstablished(session)
    post()

    if (commit.displaced) logoutBestEffort(commit.displaced.refreshToken)

    return { requiresPasswordChange: response.requiresPasswordChange === true }
  }

  const cancelSignIn = () => {
    attemptCounter += 1
    currentAttempt = 0
    signInAbort?.abort()
  }

  // ---- request lifecycle ----------------------------------------------------

  const beginRequest = async (): Promise<{ ref: SessionRef; accessToken: string; signal: AbortSignal }> => {
    if (status === 'storage-waiting') throw new SessionEndedError('no claim')
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

  // Each acquisition has one release path, and one release function, which
  // always passes the expiresAt captured at the acquisition.
  const acquireLease = async (): Promise<{ expiresAt: number } | null> => {
    const startedAt = now()
    const outcome = await transact((s) => leaseAcquire(s, { owner: tabId, now: now(), ttlMs: LEASE_TTL_MS }))
    const lease = outcome.acquired && outcome.expiresAt !== null ? { expiresAt: outcome.expiresAt } : null
    trace({ type: 'lease-acquire', acquired: lease !== null, expiresAt: lease?.expiresAt ?? null, ms: now() - startedAt })
    return lease
  }

  // One attempt at the entry's commit, shared while one is in flight. It
  // resolves when the attempt settled, whatever it did; it rejects only with the
  // storage error, and a StorageUnavailableError has already failed the tab
  // closed by the time it arrives. An attempt that times out leaves the entry
  // for the next trigger: it is never dropped for running out of attempts.
  const attemptPendingTokenCommit = async (
    trigger: 'inline' | 'reconcile' | 'refresh' | 'final-401',
    triggeredBy: number | null,
  ): Promise<void> => {
    const entry = pendingTokenCommit
    if (!entry) return
    if (tokenCommitInFlight?.pending === entry) return tokenCommitInFlight.settled
    entry.attempts += 1
    const attempt = entry.attempts
    const settled = (async () => {
      const startedAt = now()
      // Every attempt on this entry is traced under the refresh that received
      // the response, whatever triggered it.
      const refreshId = entry.refreshId
      try {
        let outcome
        try {
          outcome = await transact((s) =>
            tokenCommit(s, { claim: claim(), requestSessionId: entry.sessionId, response: entry.response }),
          )
        } catch (err) {
          traceAs(refreshId, {
            type: 'token-commit',
            trigger,
            attempt,
            triggeredBy,
            outcome: err instanceof StorageUnavailableError ? 'unavailable' : 'timeout',
            ms: now() - startedAt,
          })
          throw err
        }
        traceAs(refreshId, { type: 'token-commit', trigger, attempt, triggeredBy, outcome: outcome.outcome, ms: now() - startedAt })

        if (outcome.outcome === 'discarded' || outcome.outcome === 'session-mismatch') {
          resolvePending(entry, outcome.outcome)
          // Clearing the entry does not establish that this tab's tokens are
          // eligible, so the record is read again and applied before any caller
          // of this attempt can send anything.
          const after = await readRecord()
          applyAdoption(reconcile(claim(), memory, after.record), after)
          return
        }

        // A commit that wrote is applied only for the entry that is still
        // current, and only for a claim that is still this session.
        if (pendingTokenCommit !== entry || !memory || !isEligible(entry.sessionId)) return
        memory = { ...memory, ...entry.response }
        remember(memory)
        events.tokensUpdated({
          generation: entry.response.generation,
          accessToken: entry.response.accessToken,
          accessTokenExpiresAt: entry.response.accessTokenExpiresAt,
          refreshToken: entry.response.refreshToken,
        })
        post()
        resolvePending(entry, 'written')
      } finally {
        if (tokenCommitInFlight?.pending === entry) tokenCommitInFlight = null
      }
    })()
    tokenCommitInFlight = { pending: entry, settled }
    return settled
  }

  const doRefresh = async (): Promise<'retry' | 'ended'> => {
    refreshIdCounter += 1
    currentRefreshId = refreshIdCounter
    try {
      return await runRefresh()
    } finally {
      currentRefreshId = 0
    }
  }

  const runRefresh = async (): Promise<'retry' | 'ended'> => {
    const startedWith = memory
    if (!startedWith) return 'ended'

    // A pending commit is this tab's own uncommitted tokens, and it is attempted
    // before anything is compared, after `startedWith` was taken. A commit that
    // lands moves memory past that snapshot, so `settled()` below returns
    // 'retry' and no second refresh is sent. A timeout here rejects the caller.
    if (pendingTokenCommit) {
      await attemptPendingTokenCommit('refresh', currentRefreshId)
    }

    // Reconciles, then says whether this refresh is already settled. The tab can
    // take newer tokens on another path while this one waits for the lease (a
    // channel message, another request's reconcile); the reconcile here then
    // finds nothing to adopt, so the tab's own tokens are compared with the ones
    // the refresh was started for. Sending anyway would rotate a second time.
    const settled = async (): Promise<'retry' | 'ended' | null> => {
      const startedAt = now()
      const stored = await readRecord()
      applyAdoption(reconcile(claim(), memory, stored.record), stored)
      let result: 'retry' | 'ended' | 'proceed'
      if (status !== 'signed-in' || !memory) {
        result = 'ended'
      } else {
        const movedOn =
          memory.sessionId !== startedWith.sessionId ||
          memory.generation > startedWith.generation ||
          memory.accessTokenExpiresAt > startedWith.accessTokenExpiresAt
        result = movedOn ? 'retry' : 'proceed'
      }
      trace({
        type: 'settled-read',
        storedGeneration: stored.record.session?.generation ?? null,
        memoryGeneration: memory?.generation ?? null,
        result,
        ms: now() - startedAt,
      })
      return result === 'proceed' ? null : result
    }

    const first = await settled()
    if (first) return first

    // The lease covers the refresh request itself: the tab that holds it sends,
    // the others wait to adopt its tokens. A tab that outwaits the lease proceeds
    // without it, and only the owner ever releases it.
    let lease = await acquireLease()
    // Installing an entry that records this lease transfers its ownership: from
    // then on the entry releases it, once, when it is removed.
    let takenOverByEntry = false
    try {
      if (!lease) {
        const maxRounds = Math.max(1, Math.floor(LEASE_TTL_MS / 250))
        for (let round = 0; round < maxRounds && !lease; round += 1) {
          await new Promise((r) => setTimeout(r, 250))
          const again = await settled()
          if (again) return again
          lease = await acquireLease()
        }
      }

      const second = await settled()
      if (second) return second
      if (!memory) return 'ended'

      return await sendRefresh(memory, lease, () => {
        takenOverByEntry = true
      })
    } finally {
      if (lease) {
        if (takenOverByEntry) {
          trace({ type: 'lease-release', outcome: 'skipped-pending', ms: 0 })
        } else {
          await releaseLease(lease, currentRefreshId)
        }
      }
    }
  }

  const sendRefresh = async (
    session: ActiveSession,
    lease: { expiresAt: number } | null,
    onLeaseTakenOver: () => void,
  ): Promise<'retry' | 'ended'> => {
    const requestSessionId = session.sessionId
    const capturedGeneration = session.generation
    const refreshToken = session.refreshToken

    trace({ type: 'refresh-sent', presentedGeneration: capturedGeneration })
    const sentAt = now()
    let response
    try {
      response = await http.refresh(refreshToken)
    } catch (err) {
      if (err instanceof RefreshRejectedError) {
        trace({ type: 'refresh-answered', status: 'rejected', returnedGeneration: null, ms: now() - sentAt })
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
      trace({ type: 'refresh-answered', status: 'error', returnedGeneration: null, ms: now() - sentAt })
      throw err
    }
    trace({ type: 'refresh-answered', status: 'ok', returnedGeneration: response.generation, ms: now() - sentAt })

    // The response is installed as this tab's pending commit before any storage
    // call, and only while it is still the session this tab claims and no entry
    // is already waiting. From here the response is kept: it is never dropped
    // because an attempt failed.
    if (isEligible(requestSessionId) && pendingTokenCommit === null) {
      const entry: PendingTokenCommit = {
        sessionId: requestSessionId,
        refreshId: currentRefreshId,
        response,
        lease,
        attempts: 0,
      }
      pendingTokenCommit = entry
      onLeaseTakenOver()
      let lastError: unknown = null
      for (let n = 0; n < TOKEN_COMMIT_ATTEMPTS_INLINE && pendingTokenCommit === entry; n += 1) {
        try {
          await attemptPendingTokenCommit('inline', null)
        } catch (err) {
          lastError = err
          // Storage found unusable has already dropped the entry and failed the
          // tab closed; there is nothing to retry.
          if (err instanceof StorageUnavailableError) throw err
        }
      }
      if (pendingTokenCommit === entry) {
        // The request fails with the storage error, as it does today, and the
        // session is kept: the entry holds the tokens and the lease.
        throw lastError ?? new StorageTimeoutError('token commit did not land')
      }
      return status !== 'signed-in' ? 'ended' : 'retry'
    }

    const committedAt = now()
    let outcome
    try {
      outcome = await transact((s) => tokenCommit(s, { claim: claim(), requestSessionId, response }))
    } catch (err) {
      trace({
        type: 'token-commit',
        trigger: 'inline',
        attempt: 1,
        triggeredBy: null,
        outcome: err instanceof StorageUnavailableError ? 'unavailable' : 'timeout',
        ms: now() - committedAt,
      })
      throw err
    }
    trace({
      type: 'token-commit',
      trigger: 'inline',
      attempt: 1,
      triggeredBy: null,
      outcome: outcome.outcome,
      ms: now() - committedAt,
    })

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
        generation: response.generation,
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

  const persistSlices = async (originSessionId: string | null, json: string | null): Promise<void> => {
    await transact((s) => slicesWrite(s, { originSessionId, claim: claim(), json }))
  }

  const readSlices = async (): Promise<string | null> => {
    if (status === 'storage-waiting') return null
    const stored = await store.read()
    const sessionId = stored.record.session?.sessionId ?? null
    // Read back only when the tag is the stored session, and that session is
    // the one this tab holds: a tab about to end locally shows nobody's slices.
    if (sessionId !== null && sessionId === claim() && stored.slices?.sessionId === sessionId) {
      return stored.slices.json
    }
    return null
  }

  // ---- endings --------------------------------------------------------------

  const signOut = async (): Promise<void> => {
    // A waiting tab holds no session and has not been told of one: there is
    // nothing to end, so nothing is announced, written or posted.
    if (status === 'storage-waiting') return
    const captured = memory
      ? { sessionId: memory.sessionId, refreshToken: memory.refreshToken }
      : lastCredential
    memory = null
    lastCredential = null
    if (status !== 'storage-unavailable') status = 'signed-out'
    sessionAbort.abort()
    sessionAbort = new AbortController()
    events.sessionEnded('explicit')
    if (captured) logoutBestEffort(captured.refreshToken)
    try {
      await transact((s) => explicitEndCommit(s, { targetSessionId: captured?.sessionId ?? '' }))
    } catch {
      /* tab already cleared; the logout was already sent */
    }
    post()
  }

  const passwordChanged = async (): Promise<void> => {
    if (status === 'storage-waiting') return
    const target = memory?.sessionId ?? lastCredential?.sessionId ?? null
    memory = null
    lastCredential = null
    if (status !== 'storage-unavailable') status = 'signed-out'
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
    // While an entry is pending, the stored session and the request's are both
    // the superseded generation, so the comparison below would end a session
    // whose newer tokens this tab is holding. One attempt first; if the entry is
    // still pending afterwards, the session is kept and nothing is written.
    if (pendingTokenCommit) {
      try {
        await attemptPendingTokenCommit('final-401', null)
      } catch {
        /* the entry stays, and with it the session */
      }
      if (pendingTokenCommit) return 'kept'
    }
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
    retryStart,
    whenStarted: () => started,
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
