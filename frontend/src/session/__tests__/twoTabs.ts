import { vi } from 'vitest'
import { createSessionRuntime, type SessionRuntime, type RuntimeEvents } from '../runtime'
import type { AuthHttp } from '../authHttp'
import { RefreshRejectedError } from '../authHttp'
import {
  createSharedMemory,
  createMemorySessionStore,
  type MemorySessionStore,
  type SharedMemory,
} from '../store/memorySessionStore'
import type { TokenResponse } from '../types'

export interface FakeSession {
  sessionId: string
  generation: number
  refreshToken: string
  prevRefreshToken: string | null
  prevSupersededAt: number | null
  revoked: boolean
}

export interface FakeServer {
  sessions: Map<string, FakeSession>
  refreshCalls: number
  logoutCalls: string[]
  nextSeq: number
  accessLifetimeMs: number
  graceMs: number
  loginHold: boolean
  failLoginAfterHold: Error | null
  refreshFailure: (() => Error | null) | null
}

const clock = { value: 1_000_000 }

export function advance(ms: number) {
  clock.value += ms
}

export function createServer(opts?: { accessLifetimeMs?: number; graceMs?: number }): FakeServer {
  return {
    sessions: new Map(),
    refreshCalls: 0,
    logoutCalls: [],
    nextSeq: 1,
    accessLifetimeMs: opts?.accessLifetimeMs ?? 60000,
    graceMs: opts?.graceMs ?? 60000,
    loginHold: false,
    failLoginAfterHold: null,
    refreshFailure: null,
  }
}

function issue(server: FakeServer, sessionId: string, generation: number, refreshToken: string, user: unknown): TokenResponse {
  return {
    sessionId,
    generation,
    accessToken: `at-${sessionId}-${generation}`,
    accessTokenExpiresAt: clock.value + server.accessLifetimeMs,
    refreshToken,
    user: user as never,
  }
}

export function makeHttp(server: FakeServer): AuthHttp {
  return {
    async login(credentials) {
      const sessionId = `sess-${server.nextSeq++}`
      const refreshToken = `rt-${sessionId}-1`
      server.sessions.set(sessionId, {
        sessionId,
        generation: 1,
        refreshToken,
        prevRefreshToken: null,
        prevSupersededAt: null,
        revoked: false,
      })
      const deliver = () => {
        if (server.failLoginAfterHold) throw server.failLoginAfterHold
        return {
          ...issue(server, sessionId, 1, refreshToken, { id: 'u', username: credentials.usernameOrEmail }),
          requiresPasswordChange: false,
        }
      }
      if (server.loginHold) {
        server.loginHold = false
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
      return deliver()
    },

    async refresh(refreshToken) {
      server.refreshCalls += 1
      const failure = server.refreshFailure?.()
      if (failure) throw failure
      const found = [...server.sessions.values()].find(
        (s) => s.refreshToken === refreshToken || s.prevRefreshToken === refreshToken,
      )
      if (!found || found.revoked) throw new RefreshRejectedError('refresh rejected')
      if (found.refreshToken !== refreshToken) {
        if (clock.value - (found.prevSupersededAt ?? 0) > server.graceMs) {
          found.revoked = true
          throw new RefreshRejectedError('replay')
        }
      }
      found.prevRefreshToken = found.refreshToken
      found.prevSupersededAt = clock.value
      found.generation += 1
      found.refreshToken = `rt-${found.sessionId}-${found.generation}`
      return issue(server, found.sessionId, found.generation, found.refreshToken, { id: 'u' })
    },

    async logout(refreshToken) {
      server.logoutCalls.push(refreshToken)
      const found = [...server.sessions.values()].find(
        (s) => s.refreshToken === refreshToken || s.prevRefreshToken === refreshToken,
      )
      if (found) found.revoked = true
    },
  }
}

export interface Tab {
  runtime: SessionRuntime
  store: MemorySessionStore
  channelPost: ReturnType<typeof vi.fn>
  events: RuntimeEvents & {
    established: number
    updated: number
    ended: string[]
  }
  deliverChannel(): void
}

export function createHarness(opts?: { accessLifetimeMs?: number; graceMs?: number; channel?: boolean }) {
  const server = createServer(opts)
  const shared: SharedMemory = createSharedMemory()
  const useChannel = opts?.channel !== false

  const createTab = (tabId: string): Tab => {
    let notify: (() => void) | null = null
    const channelPost = vi.fn(() => notify?.())
    const channel = useChannel
      ? {
          post: channelPost,
          subscribe: (fn: () => void) => {
            notify = fn
            return () => {
              notify = null
            }
          },
        }
      : null

    const events: Tab['events'] = {
      established: 0,
      updated: 0,
      ended: [],
      sessionEstablished: vi.fn(() => {
        events.established += 1
      }),
      tokensUpdated: vi.fn(() => {
        events.updated += 1
      }),
      sessionEnded: vi.fn((reason: string) => {
        events.ended.push(reason)
      }),
    }

    const store = createMemorySessionStore(shared)
    const runtime = createSessionRuntime({
      store,
      http: makeHttp(server),
      events,
      channel,
      tabId,
      now: () => clock.value,
    })

    return { runtime, store, channelPost, events, deliverChannel: () => notify?.() }
  }

  return { server, shared, createTab }
}
