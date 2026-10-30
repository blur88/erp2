import { createTestSession } from '@/test/createTestSession'
import { afterEach } from 'vitest'
const sessionHolder = vi.hoisted(() => ({ coordinator: null as any }))
vi.mock('@/services/session', () => ({ get sessionCoordinator() { return sessionHolder.coordinator } }))
afterEach(() => sessionHolder.coordinator?.dispose())
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SidebarUserMenu from '../SidebarUserMenu'
import authReducer from '@/store/slices/authSlice'
import { authApi } from '@/services/authApi'

vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn().mockResolvedValue({ data: undefined }) } }))
type AuthState = ReturnType<typeof authReducer>
import { darkTheme } from '@/styles/theme'

vi.mock('@/store', () => ({
  persistor: { purge: vi.fn().mockResolvedValue(undefined) },
}))

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const baseUser: NonNullable<ReturnType<typeof authReducer>['user']> = {
  id: '1',
  username: 'jdoe',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'j@test.com',
  role: 'admin',
  isActive: true,
  status: 'active',
  failedLoginAttempts: 0,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: ((state: AuthState) => state)({
        user: baseUser,
        refreshToken: 'test-refresh-token',
        accessToken: 'test-access-token',
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
        ...authOverrides,
      }),
    },
  })

const renderMenu = (props = {}, authOverrides = {}) => {
  const store = makeStore(authOverrides)
  return {
    store,
    ...render(
      <ThemeProvider theme={darkTheme}>
        <Provider store={store}>
          <MemoryRouter>
            <SidebarUserMenu collapsed={false} {...props} />
          </MemoryRouter>
        </Provider>
      </ThemeProvider>
    ),
  }
}

describe('SidebarUserMenu', () => {
  beforeEach(async () => {
    sessionHolder.coordinator = await createTestSession('test-access-token', 'test-refresh-token')
    mockNavigate.mockClear()
  })

  it('renders nothing when user is null', () => {
    const { container } = renderMenu({}, { user: null, isAuthenticated: false })
    expect(container.firstChild).toBeNull()
  })

  it('avatar click opens dropdown menu in expanded mode', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('avatar click opens dropdown menu in collapsed mode', async () => {
    renderMenu({ collapsed: true })
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    expect(await screen.findByRole('menu')).toBeInTheDocument()
  })

  it('menu contains username, Settings, Logout, and version', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    expect(screen.getAllByText('jdoe').length).toBeGreaterThan(0)
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument()
    expect(screen.getAllByText(/^v/).length).toBeGreaterThan(0)
  })

  it('Settings click navigates to /settings', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /settings/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('Logout click closes menu, clears shared auth, and navigates to login', async () => {
    const { store } = renderMenu()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'auth/clearAuth' }))
    expect(authApi.logout).toHaveBeenCalledWith('test-refresh-token', 'test-access-token')
    expect(store.getState().auth).toMatchObject({ isAuthenticated: false, accessToken: null, refreshToken: null })
  })

  it('menu closes on Escape key', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('uses the refined expanded trigger pill layout', () => {
    renderMenu()

    const trigger = screen.getByRole('button', { name: /open user menu/i })
    const styles = window.getComputedStyle(trigger)

    expect(styles.alignSelf).toBe('stretch')
    expect(styles.marginLeft).toBe('8px')
    expect(styles.marginRight).toBe('8px')
    expect(styles.marginBottom).toBe('4px')
    expect(styles.transform).toBe('translateX(0)')
  })
})
