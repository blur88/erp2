import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { createAuthHttp, SESSION_PROTOCOL_HEADER, SESSION_PROTOCOL_VERSION, RefreshRejectedError } from '../authHttp'
import * as apiModule from '@/services/api'

const lastConfig = () => {
  const calls = (axios as unknown as { __requests: any[] }).__requests
  return calls[calls.length - 1]
}

describe('authHttp', () => {
  let requests: any[]

  beforeEach(() => {
    requests = []
    ;(axios as unknown as { __requests: any[] }).__requests = requests
    // Axios adapter mocked at the adapter level.
    axios.defaults.adapter = async (config: any) => {
      requests.push(config)
      const handler = (axios as unknown as { __handler?: (c: any) => any }).__handler
      if (handler) return handler(config)
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
    }
  })

  afterEach(() => {
    delete (axios as unknown as { __handler?: unknown }).__handler
  })

  const respond = (fn: (config: any) => any) => {
    ;(axios as unknown as { __handler?: (c: any) => any }).__handler = fn
  }

  const respondError = (status: number) =>
    respond((config) => {
      const err: any = new Error(`status ${status}`)
      err.config = config
      err.response = { status, data: {}, headers: {}, config }
      throw err
    })

  it('login and refresh send X-ERP-Session-Protocol: 2', async () => {
    respond(() => ({ data: { sessionId: 'S', generation: 1, accessToken: 'a', accessTokenExpiresAt: 1, refreshToken: 'r', user: {} }, status: 200, headers: {}, config: {} }))
    const http = createAuthHttp()
    await http.login({ usernameOrEmail: 'u', password: 'p' })
    expect(lastConfig().headers[SESSION_PROTOCOL_HEADER]).toBe(SESSION_PROTOCOL_VERSION)

    await http.refresh('r')
    expect(lastConfig().headers[SESSION_PROTOCOL_HEADER]).toBe(SESSION_PROTOCOL_VERSION)
  })

  it('logout sends the refresh token in the body, no Authorization header', async () => {
    respond(() => ({ data: {}, status: 204, headers: {}, config: {} }))
    const http = createAuthHttp()
    await http.logout('rt')
    const cfg = lastConfig()
    expect(JSON.parse(cfg.data)).toEqual({ refreshToken: 'rt' })
    expect(cfg.headers.Authorization).toBeUndefined()
  })

  it('logout resolves when the server answers 500, times out, or the network fails', async () => {
    const http = createAuthHttp()

    respondError(500)
    await expect(http.logout('rt')).resolves.toBeUndefined()

    respond(() => {
      const err: any = new Error('timeout')
      err.code = 'ECONNABORTED'
      throw err
    })
    await expect(http.logout('rt')).resolves.toBeUndefined()

    respond(() => {
      const err: any = new Error('network')
      err.code = 'ERR_NETWORK'
      throw err
    })
    await expect(http.logout('rt')).resolves.toBeUndefined()
  })

  it('refresh maps 401 to RefreshRejectedError and leaves network errors, 429 and 5xx as ordinary errors', async () => {
    const http = createAuthHttp()

    respondError(401)
    await expect(http.refresh('rt')).rejects.toBeInstanceOf(RefreshRejectedError)

    for (const status of [429, 500]) {
      respondError(status)
      const err = await http.refresh('rt').catch((e) => e)
      expect(err).not.toBeInstanceOf(RefreshRejectedError)
      expect(err.response.status).toBe(status)
    }

    respond(() => {
      const err: any = new Error('network')
      err.code = 'ERR_NETWORK'
      throw err
    })
    const err = await http.refresh('rt').catch((e) => e)
    expect(err).not.toBeInstanceOf(RefreshRejectedError)
  })

  it('refresh carries a 15000 ms timeout', async () => {
    respond(() => ({ data: { sessionId: 'S', generation: 1, accessToken: 'a', accessTokenExpiresAt: 1, refreshToken: 'r', user: {} }, status: 200, headers: {}, config: {} }))
    const http = createAuthHttp()
    await http.refresh('rt')
    expect(lastConfig().timeout).toBe(15000)
  })

  it('none of the three goes through the authenticated api instance', async () => {
    const spy = vi.spyOn(apiModule, 'default', 'get')
    respond(() => ({ data: { sessionId: 'S', generation: 1, accessToken: 'a', accessTokenExpiresAt: 1, refreshToken: 'r', user: {} }, status: 200, headers: {}, config: {} }))
    const http = createAuthHttp()
    await http.login({ usernameOrEmail: 'u', password: 'p' })
    await http.refresh('r')
    await http.logout('r')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
