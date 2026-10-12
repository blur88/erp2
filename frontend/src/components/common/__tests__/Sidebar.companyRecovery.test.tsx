import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'
import api from '@/services/api'
import { registerSessionRuntime } from '@/session/registry'
import { createHarness } from '@/session/__tests__/twoTabs'
import { createAuthHttp } from '@/session/authHttp'
import { createSessionRuntime } from '@/session/runtime'
import { createMemorySessionStore, createSharedMemory } from '@/session/store/memorySessionStore'
import { settingsApiSlice } from '@/store/api/settingsApi'
import { createTestStore } from '@/test/createTestStore'

vi.mock('../SidebarFooter', () => ({
  default: () => null,
}))

// The sidebar on the real settings endpoint and session runtime; the axios
// adapter is the ingress. The signed-in user is not an administrator, so the
// Settings > Company page, the only other reader of this data, is out of reach.
describe('Sidebar company data after a 429', () => {
  type Config = InternalAxiosRequestConfig
  let sent: Config[]

  const renderSidebar = () => {
    const store = createTestStore({
      apis: [settingsApiSlice],
      reducer: { auth: () => ({ user: { role: 'sales_staff' } }) },
    })
    return render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    )
  }

  // A runtime whose refresh leaves through the same adapter as the read, so
  // `sent` counts the refresh as well. The harness's own server answers refreshes
  // in process and never reaches the ingress.
  const runtimeRefreshingThrough = (ingress: axios.AxiosAdapter) => {
    const authClient = axios.create()
    authClient.defaults.adapter = ingress
    const runtime = createSessionRuntime({
      store: createMemorySessionStore(createSharedMemory()),
      http: createAuthHttp(authClient),
      events: {
        sessionEstablished: vi.fn(),
        tokensUpdated: vi.fn(),
        sessionEnded: vi.fn(),
        storageWaiting: vi.fn(),
        slicesRecovered: vi.fn(),
      },
      channel: null,
      tabId: 'A',
      now: () => Date.now(),
    })
    return runtime
  }

  beforeEach(async () => {
    localStorage.clear()
    const h = createHarness()
    const tab = h.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
    // No jitter: the one wait is the shortest the backoff allows (250 ms).
    vi.spyOn(Math, 'random').mockReturnValue(0)
    sent = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the company data without any user action when the request is refused once and then answered', async () => {
    api.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      if (sent.length === 1) {
        return Promise.reject(
          new AxiosError('status 429', AxiosError.ERR_BAD_REQUEST, config, null, {
            data: '',
            status: 429,
            statusText: 'Too Many Requests',
            headers: {},
            config,
          }),
        )
      }
      return { data: { data: { id: 'c1', name: 'Acme Trading' } }, status: 200, statusText: 'OK', headers: {}, config }
    }) as never

    renderSidebar()

    expect(await screen.findByText('Acme Trading', {}, { timeout: 3000 })).toBeInTheDocument()
    expect(sent.map((config) => `${config.method} ${config.url}`)).toEqual([
      'get /settings/company',
      'get /settings/company',
    ])
  })

  it('labels a refused refresh as refresh-blocked', async () => {
    // The read is answered 401, the refresh behind it 429. The refresh error is
    // what reaches the caller, with the refresh request as its config.
    const ingress = (async (config: Config) => {
      sent.push(config)
      const status = config.url === '/auth/refresh' ? 429 : 401
      return Promise.reject(
        new AxiosError(`status ${status}`, AxiosError.ERR_BAD_RESPONSE, config, null, {
          data: '',
          status,
          statusText: '',
          headers: {},
          config,
        }),
      )
    }) as never
    const runtime = runtimeRefreshingThrough((async (config: Config) => {
      if (config.url === '/auth/login') {
        return {
          data: {
            sessionId: 'sess-1',
            generation: 1,
            accessToken: 'at-1',
            accessTokenExpiresAt: Date.now() + 3600_000,
            refreshToken: 'rt-1',
            user: { id: 'u', username: 'u' },
          },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }
      return (ingress as (c: Config) => Promise<never>)(config)
    }) as never)
    await runtime.start()
    await runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(runtime)
    api.defaults.adapter = ingress

    const store = createTestStore({ apis: [settingsApiSlice] })
    await store.dispatch(settingsApiSlice.endpoints.getCompanySettings.initiate())

    expect(settingsApiSlice.endpoints.getCompanySettings.select()(store.getState()).error).toEqual(
      expect.objectContaining({ status: 429, cause: 'refresh-blocked' }),
    )
    expect(sent.filter((config) => config.url === '/auth/refresh')).toHaveLength(1)
  })
})
