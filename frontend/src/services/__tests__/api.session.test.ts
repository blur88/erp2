import { describe, it, expect, beforeEach, vi } from 'vitest'
import axios from 'axios'
import { registerSessionRuntime } from '@/session/registry'
import { createSessionRuntime } from '@/session/runtime'
import { createSharedMemory, createMemorySessionStore } from '@/session/store/memorySessionStore'
import type { AuthHttp } from '@/session/authHttp'
import type { SessionRuntime } from '@/session/runtime'
import { SessionEndedError } from '@/session/types'
import api from '@/services/api'

function makeRuntime() {
  const memory = createSharedMemory()
  const store = createMemorySessionStore(memory)
  let seq = 0
  const http: AuthHttp = {
    async login(credentials) {
      const id = `sess-${++seq}`
      return {
        sessionId: id,
        generation: 1,
        accessToken: `at-${id}`,
        accessTokenExpiresAt: 1000,
        refreshToken: `rt-${id}`,
        user: { id: 'u', username: credentials.usernameOrEmail } as never,
        requiresPasswordChange: false,
      }
    },
    async refresh() {
      throw new Error('not used')
    },
    async logout() {},
  }
  const runtime = createSessionRuntime({
    store,
    http,
    events: {
      sessionEstablished: vi.fn(),
      tokensUpdated: vi.fn(),
      sessionEnded: vi.fn(),
    },
    channel: null,
    tabId: 'test',
    now: () => 1000,
  })
  return { runtime, memory }
}

describe('api session interceptors', () => {
  let runtime: SessionRuntime

  beforeEach(() => {
    const h = makeRuntime()
    runtime = h.runtime
    registerSessionRuntime(runtime)
  })

  const respond = (fn: (config: any) => any) => {
    api.defaults.adapter = async (config: any) => fn(config)
  }

  it('a request is not sent when beginRequest rejects', async () => {
    let adapterCalled = false
    respond(() => {
      adapterCalled = true
      return { data: {}, status: 200, headers: {}, config: {} }
    })
    await expect(api.get('/auth/me')).rejects.toBeTruthy()
    expect(adapterCalled).toBe(false)
  })

  it('attaches the access token when signed in', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const token = (await (await import('@/session/registry')).getSessionRuntime())!.claim()
    expect(token).toBeTruthy()
    let authorization: string | undefined
    respond((config) => {
      authorization = config.headers.Authorization
      return { data: {}, status: 200, headers: {}, config }
    })
    await api.get('/auth/me')
    expect(authorization?.startsWith('Bearer ')).toBe(true)
  })

  it('a 200 whose session changed is rejected with SessionEndedError', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    respond((config) => ({ data: {}, status: 200, headers: {}, config }))
    await runtime.signOut()
    await expect(api.get('/inventory')).rejects.toBeInstanceOf(SessionEndedError)
  })

  it('sends the request and returns a normal response when the session is intact', async () => {
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    respond((config) => ({ data: { ok: true }, status: 200, headers: {}, config }))
    const response = await api.get('/inventory')
    expect(response.data).toEqual({ ok: true })
  })

  it('does not assign window.location anywhere', () => {
    const source = api.toString()
    expect(source).not.toMatch(/window\.location\s*=/)
  })
})
