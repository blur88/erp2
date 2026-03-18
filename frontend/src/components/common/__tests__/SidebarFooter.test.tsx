import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import SidebarFooter from '../SidebarFooter'
import authReducer from '@/store/slices/authSlice'

const makeStore = (authOverrides = {}) =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: {
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
        },
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

const renderFooter = (props = {}, authOverrides = {}) => {
  const store = makeStore(authOverrides)
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <SidebarFooter collapsed={false} {...props} />
      </MemoryRouter>
    </Provider>
  )
}

describe('SidebarFooter', () => {
  it('renders username in expanded mode', () => {
    renderFooter()
    expect(screen.getByText('jdoe')).toBeInTheDocument()
  })

  it('renders avatar with initials JD', () => {
    renderFooter()
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('renders version string', () => {
    renderFooter()
    expect(screen.getByText(/^v/)).toBeInTheDocument()
  })

  it('falls back to username initial when no first/last name', () => {
    renderFooter({}, {
      user: {
        id: '2',
        username: 'bob',
        firstName: '',
        lastName: '',
        email: 'b@test.com',
        role: 'admin',
        isActive: true,
        status: 'active',
        failedLoginAttempts: 0,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      },
    })
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders nothing when user is null', () => {
    const { container } = renderFooter({}, { user: null, isAuthenticated: false })
    expect(container.firstChild).toBeNull()
  })

  it('hides username and version in collapsed mode', () => {
    renderFooter({ collapsed: true })
    expect(screen.queryByText('jdoe')).not.toBeInTheDocument()
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument()
  })

  it('shows avatar initials in collapsed mode', () => {
    renderFooter({ collapsed: true })
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('dispatches logout after confirming dialog in expanded mode', () => {
    const store = makeStore()
    const dispatchSpy = vi.spyOn(store, 'dispatch')
    render(
      <Provider store={store}>
        <MemoryRouter>
          <SidebarFooter collapsed={false} />
        </MemoryRouter>
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /logout jdoe/i }))
    fireEvent.click(screen.getByRole('button', { name: /^logout$/i }))
    expect(dispatchSpy).toHaveBeenCalled()
  })

  it('opens confirmation dialog when logout icon is clicked in collapsed mode', () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <SidebarFooter collapsed={true} />
        </MemoryRouter>
      </Provider>
    )
    fireEvent.click(screen.getByRole('button', { name: /^logout$/i }))
    expect(screen.getByText('Are you sure you want to log out?')).toBeInTheDocument()
  })
})
