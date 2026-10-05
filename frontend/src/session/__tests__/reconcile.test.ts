import { describe, it, expect } from 'vitest'
import { reconcile } from '../reconcile'
import type { ActiveSession, SessionRecord } from '../types'

const sess = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  sessionId: 'S',
  generation: 1,
  accessToken: 'at',
  accessTokenExpiresAt: 1000,
  refreshToken: 'rt',
  user: {} as never,
  rememberMe: false,
  ...over,
})

const rec = (session: ActiveSession | null, revision = 1): SessionRecord => ({ revision, session })

describe('reconcile', () => {
  it.each<[string, string | null, ActiveSession | null, SessionRecord, string]>([
    ['no claim', null, sess(), rec(sess({ generation: 2 })), 'none'],
    ['higher generation', 'S', sess({ generation: 1 }), rec(sess({ generation: 2 })), 'adopt-tokens'],
    ['same generation later expiry', 'S', sess({ accessTokenExpiresAt: 1000 }), rec(sess({ accessTokenExpiresAt: 2000 })), 'adopt-access'],
    ['same generation same expiry', 'S', sess({ accessTokenExpiresAt: 1000 }), rec(sess({ accessTokenExpiresAt: 1000 })), 'none'],
    ['same generation earlier expiry', 'S', sess({ accessTokenExpiresAt: 2000 }), rec(sess({ accessTokenExpiresAt: 1000 })), 'none'],
    ['lower generation', 'S', sess({ generation: 3 }), rec(sess({ generation: 2 })), 'end-locally'],
    ['different session', 'S', sess({ sessionId: 'S' }), rec(sess({ sessionId: 'T' })), 'end-locally'],
    ['signed out', 'S', sess({ sessionId: 'S' }), rec(null), 'end-locally'],
    ['no memory with a claim', 'S', null, rec(sess({ sessionId: 'S' })), 'adopt-tokens'],
  ])('%s', (_name, claim, memory, stored, action) => {
    expect(reconcile(claim, memory, stored)).toBe(action)
  })
})
