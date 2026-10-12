import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import api from '@/services/api'
import { registerSessionRuntime } from '@/session/registry'
import { createHarness } from '@/session/__tests__/twoTabs'
import { settingsApiSlice, useGetCompanySettingsQuery } from '@/store/api/settingsApi'
import authReducer, { sessionEstablished, tokensUpdated } from '@/store/slices/authSlice'
import { createTestStore } from '@/test/createTestStore'
import MainLayout from '../MainLayout'

vi.mock('../SidebarFooter', () => ({ default: () => null }))

// The real TopBar needs a data router for `useMatches`; this keeps the control
// the drawer test uses (the menu button) and nothing else of it.
vi.mock('../TopBar', () => ({
  default: ({ onMobileMenuOpen }: { onMobileMenuOpen: () => void }) => (
    <button type="button" aria-label="open drawer" onClick={onMobileMenuOpen} />
  ),
}))

type Config = InternalAxiosRequestConfig

// The layout with both sidebars and the real provider and endpoint, so what the
// drawer sends (or does not) is observable at the ingress.
describe('MainLayout company recovery', () => {
  let sent: Config[]
  let store: ReturnType<typeof createTestStore>

  const reads = () => sent.filter((config) => config.url === '/settings/company')

  const ok = (config: Config, name = 'Acme Trading') => ({
    data: { data: { id: 'c1', name } },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  })

  const status = (config: Config, code: number) =>
    Promise.reject(
      new AxiosError(`status ${code}`, AxiosError.ERR_BAD_RESPONSE, config, null, {
        data: '',
        status: code,
        statusText: '',
        headers: {},
        config,
      }),
    )

  const serveReads = (answer: (n: number, config: Config) => unknown) => {
    api.defaults.adapter = (async (config: Config) => {
      sent.push(config)
      return answer(reads().length, config)
    }) as never
  }

  const renderLayout = () =>
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <MainLayout />
        </MemoryRouter>
      </Provider>,
    )

  const openDrawer = async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(screen.getByRole('button', { name: 'open drawer' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
  }

  const strips = () => screen.queryAllByText('Company details unavailable')
  // The permanent drawer is docked in the tree; the temporary one is portalled
  // after it, so it is the last.
  const drawer = () => {
    const papers = document.querySelectorAll('.MuiDrawer-paper')
    return papers[papers.length - 1] as HTMLElement
  }

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sent = []
    store = createTestStore({ apis: [settingsApiSlice], reducer: { auth: authReducer } })
    const h = createHarness()
    const tab = h.createTab('A')
    await tab.runtime.start()
    await tab.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    registerSessionRuntime(tab.runtime)
    tab.events.tokensUpdated.mockImplementation((tokens: never) => {
      store.dispatch(tokensUpdated(tokens))
    })
    vi.spyOn(Math, 'random').mockReturnValue(0)
    store.dispatch(
      sessionEstablished({
        sessionId: 'sess-1',
        generation: 1,
        accessToken: 'at-1',
        accessTokenExpiresAt: Date.now() + 3_600_000,
        refreshToken: 'rt-1',
        user: { id: 'u', username: 'u', role: 'sales_staff' } as never,
        rememberMe: true,
      }),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0) })

  const stop = async () => {
    serveReads((_n, config) => status(config, 503))
    renderLayout()
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    await settle()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })
    await settle()
    expect(reads()).toHaveLength(3)
    expect(strips().length).toBeGreaterThan(0)
  }

  it('scenario 12: both sidebars show the company from one read, and opening the drawer sends nothing', async () => {
    serveReads((_n, config) => ok(config))

    renderLayout()
    await settle()
    expect(reads()).toHaveLength(1)
    // The temporary drawer is not mounted until it is opened.
    expect(screen.getAllByText('Acme Trading')).toHaveLength(1)

    await openDrawer()

    expect(reads()).toHaveLength(1)
    expect(screen.getAllByText('Acme Trading')).toHaveLength(2)
    expect(within(drawer()).getByText('Acme Trading')).toBeInTheDocument()
  })

  it('scenario 12: opening the drawer while stopped sends nothing and shows the strip there too', async () => {
    await stop()

    await openDrawer()

    expect(reads()).toHaveLength(3)
    expect(within(drawer()).getByText('Company details unavailable')).toBeInTheDocument()
  })

  it('scenario 12: Retry in the drawer\'s strip reads once and clears both strips', async () => {
    await stop()
    await openDrawer()

    serveReads((_n, config) => ok(config))
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await user.click(within(drawer()).getByRole('button', { name: 'Retry' }))
    await settle()

    expect(reads()).toHaveLength(4)
    expect(strips()).toHaveLength(0)
  })

  const SettingsPage = () => {
    useGetCompanySettingsQuery()
    return null
  }

  it('scenario 13: a settings page read while stopped succeeds and clears the strip', async () => {
    await stop()
    const spent = reads().length

    serveReads((_n, config) => ok(config))
    render(
      <Provider store={store}>
        <SettingsPage />
      </Provider>,
    )
    await settle()

    // The page's own read is sent as today, and the sidebar follows it.
    expect(reads()).toHaveLength(spent + 1)
    expect(screen.getAllByText('Acme Trading')).toHaveLength(1)
    expect(strips()).toHaveLength(0)
  })

  it('scenario 13: a settings page read that fails while stopped starts no automatic cycle', async () => {
    await stop()
    const spent = reads().length

    serveReads((_n, config) => status(config, 503))
    render(
      <Provider store={store}>
        <SettingsPage />
      </Provider>,
    )
    await settle()

    expect(reads()).toHaveLength(spent + 1)
    expect(strips().length).toBeGreaterThan(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    await settle()

    // Still stopped, and the page's failure started no cycle of its own.
    expect(strips().length).toBeGreaterThan(0)
    expect(reads()).toHaveLength(spent + 1)
  })
})
