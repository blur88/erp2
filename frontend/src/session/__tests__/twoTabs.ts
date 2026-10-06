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
  // Superseded refresh tokens and when each was superseded: grace is per token.
  superseded: Map<string, number>
  revoked: boolean
}

export interface RefreshGate {
  /** Refresh requests the server has answered but whose responses are held. */
  waiting(): number
  /** Deliver one held response (the oldest unless an index is given). */
  releaseOne(index?: number): void
  /** Deliver every held response and stop holding. */
  release(): void
}

export interface FakeServer {
  sessions: Map<string, FakeSession>
  refreshCalls: number
  rotations: number
  recoveries: number
  refreshGate: { wait(): Promise<void> } | null
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
    rotations: 0,
    recoveries: 0,
    refreshGate: null,
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
    accessToken: `at-${sessionId}-${generation}-${server.nextSeq++}`,
    accessTokenExpiresAt: clock.value + server.accessLifetimeMs,
    refreshToken,
    user: user as never,
  }
}

function findSession(server: FakeServer, refreshToken: string): FakeSession | undefined {
  return [...server.sessions.values()].find((s) => s.refreshToken === refreshToken || s.superseded.has(refreshToken))
}

// Mirrors the server's refresh rules (spec A5): the current token rotates; a
// superseded token strictly inside its own grace recovers the current tokens and
// writes nothing; at or after its deadline it is replay and revokes the session.
function answerRefresh(server: FakeServer, refreshToken: string): TokenResponse {
  const failure = server.refreshFailure?.()
  if (failure) throw failure
  const found = findSession(server, refreshToken)
  if (!found || found.revoked) throw new RefreshRejectedError('refresh rejected')

  if (found.refreshToken === refreshToken) {
    found.superseded.set(found.refreshToken, clock.value)
    found.generation += 1
    found.refreshToken = `rt-${found.sessionId}-${found.generation}`
    server.rotations += 1
  } else if (clock.value - (found.superseded.get(refreshToken) as number) >= server.graceMs) {
    found.revoked = true
    throw new RefreshRejectedError('replay')
  } else {
    server.recoveries += 1
  }
  return issue(server, found.sessionId, found.generation, found.refreshToken, { id: 'u' })
}

export function holdRefreshResponses(server: FakeServer): RefreshGate {
  const held: Array<() => void> = []
  const gate = { wait: () => new Promise<void>((resolve) => held.push(resolve)) }
  server.refreshGate = gate
  return {
    waiting: () => held.length,
    releaseOne(index = 0) {
      held.splice(index, 1)[0]?.()
    },
    release() {
      if (server.refreshGate === gate) server.refreshGate = null
      held.splice(0).forEach((resolve) => resolve())
    },
  }
}

export function now(): number {
  return clock.value
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
        superseded: new Map(),
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
      // The server decides when the request arrives; only the response is delayed.
      let respond: () => TokenResponse
      try {
        const response = answerRefresh(server, refreshToken)
        respond = () => response
      } catch (error) {
        respond = () => {
          throw error
        }
      }
      if (server.refreshGate) await server.refreshGate.wait()
      else await new Promise<void>((resolve) => setTimeout(resolve, 0))
      return respond()
    },

    async logout(refreshToken) {
      server.logoutCalls.push(refreshToken)
      const found = findSession(server, refreshToken)
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
