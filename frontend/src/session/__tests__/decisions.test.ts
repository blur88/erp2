import { describe, it, expect } from 'vitest'
import {
  signInCommit,
  tokenCommit,
  explicitEndCommit,
  failureEndCommit,
  cancelledSignInCleanup,
  slicesWrite,
  leaseAcquire,
  leaseRelease,
  normalizeStored,
} from '../decisions'
import type { ActiveSession, StoredState, TokenResponse } from '../types'

const session = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  sessionId: 'S',
  generation: 1,
  accessToken: 'at-1',
  accessTokenExpiresAt: 1000,
  refreshToken: 'rt-1',
  user: { id: 'u' } as never,
  rememberMe: false,
  ...over,
})

const response = (over: Partial<TokenResponse> = {}): TokenResponse => ({
  sessionId: 'S',
  generation: 1,
  accessToken: 'at-1',
  accessTokenExpiresAt: 1000,
  refreshToken: 'rt-1',
  user: { id: 'u' } as never,
  ...over,
})

const state = (over: Partial<StoredState> = {}): StoredState => ({
  record: { revision: 0, session: null },
  slices: null,
  refreshLease: null,
  ...over,
})

const signedIn = (over: Partial<ActiveSession> = {}, revision = 3): StoredState =>
  state({ record: { revision, session: session(over) } })

describe('signInCommit', () => {
  it.each<[string, StoredState, number, { ok: boolean; displaced: unknown }]>([
    ['cold start', state(), 0, { ok: true, displaced: null }],
    ['over a live different session', signedIn({ sessionId: 'OLD' }), 3, { ok: true, displaced: 'OLD' }],
    ['over the same session', signedIn(), 3, { ok: true, displaced: null }],
  ])('%s', (_name, s, capturedRevision, expected) => {
    const { result, write } = signInCommit(s, {
      capturedRevision,
      attemptCurrent: true,
      response: response({ sessionId: 'S', generation: 2 }),
      rememberMe: false,
    })
    expect(result.ok).toBe(expected.ok)
    if (result.ok) {
      expect(result.displaced?.sessionId ?? null).toBe(expected.displaced)
      expect(write).toEqual({
        record: { revision: capturedRevision + 1, session: session({ generation: 2 }) },
        slices: null,
      })
    }
  })

  it('rejects when the revision moved', () => {
    const { result, write } = signInCommit(signedIn({}, 5), {
      capturedRevision: 3,
      attemptCurrent: true,
      response: response(),
      rememberMe: false,
    })
    expect(result).toEqual({ ok: false, reason: 'revision-changed' })
    expect(write).toBeUndefined()
  })

  // Both preconditions are checked inside the transaction (spec B4 row 1): an
  // attempt cancelled while its commit was queued writes nothing, whatever the
  // revision, and the caller can tell it from a revision that moved.
  it.each<[string, StoredState, number]>([
    ['with a matching revision, over a live session', signedIn({ sessionId: 'OLD' }, 3), 3],
    ['with a matching revision, cold', state(), 0],
    ['with a revision that moved', signedIn({ sessionId: 'OLD' }, 5), 3],
  ])('writes nothing when the attempt is no longer current, %s', (_name, s, capturedRevision) => {
    const { result, write } = signInCommit(s, {
      capturedRevision,
      attemptCurrent: false,
      response: response({ sessionId: 'NEW' }),
      rememberMe: false,
    })
    expect(result).toEqual({ ok: false, reason: 'attempt-cancelled' })
    expect(write).toBeUndefined()
  })

  it('keeps revision monotonic and reports the displaced session', () => {
    const { write } = signInCommit(signedIn({ sessionId: 'OLD' }, 3), {
      capturedRevision: 3,
      attemptCurrent: true,
      response: response({ sessionId: 'NEW' }),
      rememberMe: false,
    })
    expect(write?.record?.revision).toBe(4)
    expect((write?.record?.session as ActiveSession).sessionId).toBe('NEW')
  })
})

describe('tokenCommit', () => {
  it('writes both tokens on a higher generation', () => {
    const { result, write } = tokenCommit(signedIn({ generation: 1 }), {
      claim: 'S',
      requestSessionId: 'S',
      response: response({ generation: 2, refreshToken: 'rt-2' }),
    })
    expect(result.outcome).toBe('written-both')
    expect(write?.record?.revision).toBe(3)
    expect((write?.record?.session as ActiveSession).refreshToken).toBe('rt-2')
  })

  it('refuses while the tab has no claim although storage still holds the session', () => {
    const { result, write } = tokenCommit(signedIn(), {
      claim: null,
      requestSessionId: 'S',
      response: response({ generation: 2 }),
    })
    expect(result.outcome).toBe('session-mismatch')
    expect(write).toBeUndefined()
  })

  it('at equal generation writes only accessToken and accessTokenExpiresAt', () => {
    const before = signedIn({ generation: 1, accessToken: 'old', accessTokenExpiresAt: 1000, refreshToken: 'rt-keep' })
    const { result, write } = tokenCommit(before, {
      claim: 'S',
      requestSessionId: 'S',
      response: response({ generation: 1, accessToken: 'new', accessTokenExpiresAt: 2000, refreshToken: 'rt-other', user: { id: 'other' } as never }),
    })
    expect(result.outcome).toBe('written-access')
    const stored = write?.record?.session as ActiveSession
    expect(stored.accessToken).toBe('new')
    expect(stored.accessTokenExpiresAt).toBe(2000)
    expect(stored.refreshToken).toBe('rt-keep')
    expect(stored.user).toBe(before.record.session?.user)
  })

  it('discards an equal generation with an earlier expiry', () => {
    const { result, write } = tokenCommit(signedIn({ generation: 1, accessTokenExpiresAt: 5000 }), {
      claim: 'S',
      requestSessionId: 'S',
      response: response({ generation: 1, accessTokenExpiresAt: 4000 }),
    })
    expect(result.outcome).toBe('discarded')
    expect(write).toBeUndefined()
  })

  it('discards a lower generation', () => {
    const { result } = tokenCommit(signedIn({ generation: 3 }), {
      claim: 'S',
      requestSessionId: 'S',
      response: response({ generation: 2 }),
    })
    expect(result.outcome).toBe('discarded')
  })

  it('reports session-mismatch when the four ids differ', () => {
    const { result, write } = tokenCommit(signedIn({ sessionId: 'S' }), {
      claim: 'S',
      requestSessionId: 'X',
      response: response({ sessionId: 'Y' }),
    })
    expect(result.outcome).toBe('session-mismatch')
    expect(write).toBeUndefined()
  })
})

describe('explicitEndCommit', () => {
  it('clears the target and increments revision', () => {
    const { result, write } = explicitEndCommit(signedIn({ sessionId: 'S' }), { targetSessionId: 'S' })
    expect(result.cleared).toBe(true)
    expect(write).toEqual({ record: { revision: 4, session: null }, slices: null })
  })

  it('against an already signed-out record still increments revision', () => {
    const { result, write } = explicitEndCommit(state({ record: { revision: 2, session: null } }), { targetSessionId: 'S' })
    expect(result.cleared).toBe(false)
    expect(write?.record?.revision).toBe(3)
    expect(write?.record?.session).toBeNull()
  })

  it('against a different live session increments revision and leaves that session', () => {
    const other = signedIn({ sessionId: 'OTHER' })
    const { result, write } = explicitEndCommit(other, { targetSessionId: 'S' })
    expect(result.cleared).toBe(false)
    expect(write?.record?.revision).toBe(4)
    expect((write?.record?.session as ActiveSession).sessionId).toBe('OTHER')
    expect(write?.slices).toBeUndefined()
  })
})

describe('failureEndCommit', () => {
  it('clears at the same session and generation, leaving revision unchanged', () => {
    const { result, write } = failureEndCommit(signedIn(), { sessionId: 'S', generation: 1 })
    expect(result.ended).toBe(true)
    expect(write).toEqual({ record: { revision: 3, session: null }, slices: null })
  })

  it.each([
    ['different session', { sessionId: 'X', generation: 1 }],
    ['different generation', { sessionId: 'S', generation: 2 }],
  ])('does nothing on %s', (_name, ref) => {
    const { result, write } = failureEndCommit(signedIn(), ref)
    expect(result.ended).toBe(false)
    expect(write).toBeUndefined()
  })

  it('leaves revision unchanged (documents that an independent pending sign-in may still commit)', () => {
    const { write } = failureEndCommit(signedIn({}, 7), { sessionId: 'S', generation: 1 })
    expect(write?.record?.revision).toBe(7)
  })
})

describe('cancelledSignInCleanup', () => {
  it('clears the cancelled session and increments revision', () => {
    const { result, write } = cancelledSignInCleanup(signedIn({ sessionId: 'C' }), { sessionId: 'C' })
    expect(result.cleared).toBe(true)
    expect(write?.record?.revision).toBe(4)
    expect(write?.record?.session).toBeNull()
    expect(write?.slices).toBeNull()
  })

  it('after a newer session committed writes nothing', () => {
    const { result, write } = cancelledSignInCleanup(signedIn({ sessionId: 'NEW' }), { sessionId: 'C' })
    expect(result.cleared).toBe(false)
    expect(write).toBeUndefined()
  })
})

describe('slicesWrite', () => {
  it('writes when origin, claim and stored session are equal and non-null', () => {
    const { result, write } = slicesWrite(signedIn({ sessionId: 'Y' }), {
      originSessionId: 'Y',
      claim: 'Y',
      json: '{"a":1}',
    })
    expect(result.written).toBe(true)
    expect(write).toEqual({ slices: { sessionId: 'Y', json: '{"a":1}' } })
  })

  it('skips a payload queued under X after the tab claimed Y', () => {
    const { result, write } = slicesWrite(signedIn({ sessionId: 'Y' }), {
      originSessionId: 'X',
      claim: 'Y',
      json: '{}',
    })
    expect(result.written).toBe(false)
    expect(write).toBeUndefined()
  })

  it('a removal deletes the slices under the same three-way check', () => {
    const stored = { ...signedIn({ sessionId: 'Y' }), slices: { sessionId: 'Y', json: '{"a":1}' } }
    const removed = slicesWrite(stored, { originSessionId: 'Y', claim: 'Y', json: null })
    expect(removed.result.written).toBe(true)
    expect(removed.write).toEqual({ slices: null })

    const skipped = slicesWrite(stored, { originSessionId: 'X', claim: 'Y', json: null })
    expect(skipped.result.written).toBe(false)
    expect(skipped.write).toBeUndefined()
  })

  it('skips a signed-out payload (all three null)', () => {
    const { result, write } = slicesWrite(state(), { originSessionId: null, claim: null, json: '{}' })
    expect(result.written).toBe(false)
    expect(write).toBeUndefined()
  })
})

describe('lease', () => {
  it('acquires when there is no lease', () => {
    const { result, write } = leaseAcquire(state(), { owner: 'A', now: 100, ttlMs: 20000 })
    expect(result.acquired).toBe(true)
    expect(write?.refreshLease).toEqual({ owner: 'A', expiresAt: 20100 })
  })

  it('acquires when the lease has expired', () => {
    const s = state({ refreshLease: { owner: 'B', expiresAt: 100 } })
    const { result } = leaseAcquire(s, { owner: 'A', now: 100, ttlMs: 20000 })
    expect(result.acquired).toBe(true)
  })

  it('does not acquire a live lease', () => {
    const s = state({ refreshLease: { owner: 'B', expiresAt: 101 } })
    const { result, write } = leaseAcquire(s, { owner: 'A', now: 100, ttlMs: 20000 })
    expect(result.acquired).toBe(false)
    expect(write).toBeUndefined()
  })

  it('releases only the owner', () => {
    const s = state({ refreshLease: { owner: 'A', expiresAt: 101 } })
    expect(leaseRelease(s, { owner: 'B', expiresAt: 101 }).result.released).toBe(false)
    expect(leaseRelease(s, { owner: 'A', expiresAt: 101 }).result.released).toBe(true)
    expect(leaseRelease(s, { owner: 'A', expiresAt: 101 }).write).toEqual({ refreshLease: null })
  })

  it('acquire returns the expiresAt it wrote, so the release can name it', () => {
    const acquired = leaseAcquire(state(), { owner: 'A', now: 100, ttlMs: 20000 })
    expect(acquired.result).toEqual({ acquired: true, expiresAt: 20100 })
    expect(acquired.write?.refreshLease).toEqual({ owner: 'A', expiresAt: 20100 })
    const refused = leaseAcquire(state({ refreshLease: { owner: 'B', expiresAt: 101 } }), {
      owner: 'A',
      now: 100,
      ttlMs: 20000,
    })
    expect(refused.result).toEqual({ acquired: false, expiresAt: null })
  })

  it('leaseRelease does nothing for the same owner under a later lease', () => {
    // The owner is the tab id, so the owner alone cannot say which acquisition
    // is being released: a lease the same tab took for newer work must survive
    // an older attempt's release.
    const s = state({ refreshLease: { owner: 'A', expiresAt: 2000 } })
    expect(leaseRelease(s, { owner: 'A', expiresAt: 1000 })).toEqual({ result: { released: false } })
  })

  it('leaseRelease does nothing for another owner under the same expiry', () => {
    const s = state({ refreshLease: { owner: 'A', expiresAt: 1000 } })
    expect(leaseRelease(s, { owner: 'B', expiresAt: 1000 })).toEqual({ result: { released: false } })
  })

  it('leaseRelease does nothing when there is no lease', () => {
    expect(leaseRelease(state(), { owner: 'A', expiresAt: 1000 })).toEqual({ result: { released: false } })
  })
})

describe('revision is never reset', () => {
  it('fold a sequence and assert non-decreasing', () => {
    let s = state()
    const revisions: number[] = [s.record.revision]
    const step = (write: Partial<StoredState> | undefined) => {
      if (write) s = { ...s, ...write }
      revisions.push(s.record.revision)
    }
    step(signInCommit(s, { capturedRevision: s.record.revision, response: response({ sessionId: 'A' }), rememberMe: false }).write)
    step(explicitEndCommit(s, { targetSessionId: 'A' }).write)
    step(signInCommit(s, { capturedRevision: s.record.revision, response: response({ sessionId: 'B' }), rememberMe: false }).write)
    step(failureEndCommit(s, { sessionId: 'B', generation: 1 }).write)
    step(cancelledSignInCleanup(s, { sessionId: 'C' }).write)
    for (let i = 1; i < revisions.length; i += 1) {
      expect(revisions[i]).toBeGreaterThanOrEqual(revisions[i - 1])
    }
  })
})

describe('normalizeStored', () => {
  it.each<[unknown, number]>([
    [undefined, 0],
    [null, 0],
    ['x', 0],
    [{}, 0],
    [{ record: { revision: 'a' } }, 0],
    [{ record: { revision: 7, session: { sessionId: 1 } } }, 7],
    [{ record: { revision: 7, session: { ...session(), user: undefined } } }, 7],
    [{ record: { revision: 7, session: { ...session(), user: null } } }, 7],
    [{ record: { revision: 7, session: { ...session(), user: 'u' } } }, 7],
    [{ record: { revision: 7, session: { ...session(), generation: 1.5 } } }, 7],
    [{ record: { revision: -1, session: session() } }, 0],
    [{ record: { revision: 2.5, session: session() } }, 0],
  ])('%j becomes signed-out with revision %i', (raw, revision) => {
    const s = normalizeStored(raw)
    expect(s.record.session).toBeNull()
    expect(s.record.revision).toBe(revision)
  })

  it('returns a well-formed state equal', () => {
    const well: StoredState = {
      record: { revision: 4, session: session() },
      slices: { sessionId: 'S', json: '{}' },
      refreshLease: { owner: 'A', expiresAt: 5 },
    }
    expect(normalizeStored(well)).toEqual(well)
  })
})
