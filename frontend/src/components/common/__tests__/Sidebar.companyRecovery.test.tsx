import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'
import api from '@/services/api'
import { registerSessionRuntime } from '@/session/registry'
import { createHarness } from '@/session/__tests__/twoTabs'
import { settingsApiSlice } from '@/store/api/settingsApi'

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
    const store = configureStore({
      reducer: {
        auth: () => ({ user: { role: 'sales_staff' } }),
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
      },
      middleware: (getDefault) => getDefault().concat(settingsApiSlice.middleware),
    })
    return render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Sidebar />
        </MemoryRouter>
      </Provider>,
    )
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
})
