import type { ActiveSession, SessionRef, StoredState, TokenResponse } from './types'

export type Decision<R> = { write?: Partial<StoredState>; result: R }

export function signInCommit(
  s: StoredState,
  a: { capturedRevision: number; response: TokenResponse; rememberMe: boolean },
): Decision<{ ok: true; displaced: ActiveSession | null } | { ok: false }> {
  if (s.record.revision !== a.capturedRevision) {
    return { result: { ok: false } }
  }

  const previous = s.record.session
  const displaced = previous && previous.sessionId !== a.response.sessionId ? previous : null

  const session: ActiveSession = {
    sessionId: a.response.sessionId,
    generation: a.response.generation,
    accessToken: a.response.accessToken,
    accessTokenExpiresAt: a.response.accessTokenExpiresAt,
    refreshToken: a.response.refreshToken,
    user: a.response.user,
    rememberMe: a.rememberMe,
  }

  return {
    write: { record: { revision: a.capturedRevision + 1, session }, slices: null },
    result: { ok: true, displaced },
  }
}

export function tokenCommit(
  s: StoredState,
  a: { claim: string | null; requestSessionId: string; response: TokenResponse },
): Decision<{ outcome: 'written-both' | 'written-access' | 'discarded' | 'session-mismatch' }> {
  const stored = s.record.session
  const ids = [a.claim, a.requestSessionId, a.response.sessionId, stored?.sessionId ?? null]

  if (a.claim === null || a.requestSessionId !== a.response.sessionId || a.claim !== a.requestSessionId || stored === null || stored.sessionId !== a.claim) {
    return { result: { outcome: 'session-mismatch' } }
  }

  if (a.response.generation > stored.generation) {
    return {
      write: {
        record: {
          revision: s.record.revision,
          session: {
            sessionId: a.response.sessionId,
            generation: a.response.generation,
            accessToken: a.response.accessToken,
            accessTokenExpiresAt: a.response.accessTokenExpiresAt,
            refreshToken: a.response.refreshToken,
            user: a.response.user,
            rememberMe: stored.rememberMe,
          },
        },
      },
      result: { outcome: 'written-both' },
    }
  }

  if (a.response.generation === stored.generation && a.response.accessTokenExpiresAt > stored.accessTokenExpiresAt) {
    return {
      write: {
        record: {
          revision: s.record.revision,
          session: { ...stored, accessToken: a.response.accessToken, accessTokenExpiresAt: a.response.accessTokenExpiresAt },
        },
      },
      result: { outcome: 'written-access' },
    }
  }

  void ids
  return { result: { outcome: 'discarded' } }
}

export function explicitEndCommit(s: StoredState, a: { targetSessionId: string }): Decision<{ cleared: boolean }> {
  const stored = s.record.session
  const cleared = stored !== null && stored.sessionId === a.targetSessionId

  const write: Partial<StoredState> = {
    record: { revision: s.record.revision + 1, session: cleared ? null : stored },
  }
  if (cleared) write.slices = null

  return { write, result: { cleared } }
}

export function failureEndCommit(s: StoredState, a: SessionRef): Decision<{ ended: boolean }> {
  const stored = s.record.session
  if (stored === null || stored.sessionId !== a.sessionId || stored.generation !== a.generation) {
    return { result: { ended: false } }
  }
  return {
    write: { record: { revision: s.record.revision, session: null }, slices: null },
    result: { ended: true },
  }
}

export function cancelledSignInCleanup(s: StoredState, a: { sessionId: string }): Decision<{ cleared: boolean }> {
  const stored = s.record.session
  if (stored === null || stored.sessionId !== a.sessionId) {
    return { result: { cleared: false } }
  }
  return {
    write: { record: { revision: s.record.revision + 1, session: null }, slices: null },
    result: { cleared: true },
  }
}

export function slicesWrite(
  s: StoredState,
  a: { originSessionId: string | null; claim: string | null; json: string },
): Decision<{ written: boolean }> {
  const stored = s.record.session
  if (
    a.originSessionId === null ||
    a.claim === null ||
    a.originSessionId !== a.claim ||
    stored === null ||
    stored.sessionId !== a.claim
  ) {
    return { result: { written: false } }
  }
  return {
    write: { slices: { sessionId: a.claim, json: a.json } },
    result: { written: true },
  }
}

export function leaseAcquire(s: StoredState, a: { owner: string; now: number; ttlMs: number }): Decision<{ acquired: boolean }> {
  if (s.refreshLease !== null && s.refreshLease.expiresAt > a.now) {
    return { result: { acquired: false } }
  }
  return {
    write: { refreshLease: { owner: a.owner, expiresAt: a.now + a.ttlMs } },
    result: { acquired: true },
  }
}

export function leaseRelease(s: StoredState, a: { owner: string }): Decision<{ released: boolean }> {
  if (s.refreshLease === null || s.refreshLease.owner !== a.owner) {
    return { result: { released: false } }
  }
  return { write: { refreshLease: null }, result: { released: true } }
}

export function normalizeStored(raw: unknown): StoredState {
  const empty: StoredState = { record: { revision: 0, session: null }, slices: null, refreshLease: null }
  if (raw === null || typeof raw !== 'object') return empty

  const obj = raw as Record<string, unknown>
  const record = obj.record
  if (record === null || typeof record !== 'object') return empty

  const rec = record as Record<string, unknown>
  const revision = typeof rec.revision === 'number' && Number.isFinite(rec.revision) ? rec.revision : 0

  const session = normalizeSession(rec.session)
  const slices = normalizeSlices(obj.slices)
  const refreshLease = normalizeLease(obj.refreshLease)

  return { record: { revision, session }, slices, refreshLease }
}

function normalizeSession(raw: unknown): ActiveSession | null {
  if (raw === null || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.sessionId !== 'string' || typeof s.generation !== 'number') return null
  if (typeof s.accessToken !== 'string' || typeof s.accessTokenExpiresAt !== 'number') return null
  if (typeof s.refreshToken !== 'string') return null
  return {
    sessionId: s.sessionId,
    generation: s.generation,
    accessToken: s.accessToken,
    accessTokenExpiresAt: s.accessTokenExpiresAt,
    refreshToken: s.refreshToken,
    user: (s.user ?? null) as ActiveSession['user'],
    rememberMe: s.rememberMe === true,
  }
}

function normalizeSlices(raw: unknown): StoredState['slices'] {
  if (raw === null || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  if (typeof s.sessionId !== 'string' || typeof s.json !== 'string') return null
  return { sessionId: s.sessionId, json: s.json }
}

function normalizeLease(raw: unknown): StoredState['refreshLease'] {
  if (raw === null || typeof raw !== 'object') return null
  const l = raw as Record<string, unknown>
  if (typeof l.owner !== 'string' || typeof l.expiresAt !== 'number') return null
  return { owner: l.owner, expiresAt: l.expiresAt }
}
