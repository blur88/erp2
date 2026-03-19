import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SidebarUserMenu from '../SidebarUserMenu'
import authReducer from '@/store/slices/authSlice'

vi.mock('@/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store')>()
  return { ...actual, persistor: { purge: vi.fn().mockResolvedValue(undefined) } }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const baseUser = {
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
      auth: {
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
      },
    },
  })

const renderMenu = (props = {}, authOverrides = {}) => {
  const store = makeStore(authOverrides)
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <SidebarUserMenu collapsed={false} {...props} />
        </MemoryRouter>
      </Provider>
    ),
  }
}

describe('SidebarUserMenu', () => {
  beforeEach(() => {
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

  it('Logout click closes menu and opens confirmation popover', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(screen.getByText(/log out\?/i)).toBeInTheDocument()
  })

  it('Cancel closes popover without dispatching logout', async () => {
    const { store } = renderMenu()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await screen.findByText(/log out\?/i)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await waitFor(() => expect(screen.queryByText(/log out\?/i)).not.toBeInTheDocument())
    expect(dispatchSpy).not.toHaveBeenCalled()
  })

  it('Confirm dispatches logout thunk', async () => {
    const { store } = renderMenu()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.click(screen.getByRole('menuitem', { name: /logout/i }))
    await screen.findByText(/log out\?/i)
    fireEvent.click(screen.getByRole('button', { name: /^logout$/i }))
    expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Function))
  })

  it('menu closes on Escape key', async () => {
    renderMenu()
    fireEvent.click(screen.getByRole('button', { name: /open user menu/i }))
    await screen.findByRole('menu')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
})
