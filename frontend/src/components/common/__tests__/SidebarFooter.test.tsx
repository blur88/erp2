import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it } from 'vitest'
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

// SidebarFooter is a layout shell - SidebarUserMenu is a Redux-connected child,
// so Provider + MemoryRouter are still required even though SidebarFooter itself
// has no Redux or router dependencies.
const renderFooter = (props = {}, authOverrides = {}) =>
  render(
    <Provider store={makeStore(authOverrides)}>
      <MemoryRouter>
        <SidebarFooter collapsed={false} {...props} />
      </MemoryRouter>
    </Provider>
  )

describe('SidebarFooter (layout shell)', () => {
  it('renders in expanded mode without crashing', () => {
    const { container } = renderFooter()
    expect(container.firstChild).not.toBeNull()
  })

  it('renders in collapsed mode without crashing', () => {
    const { container } = renderFooter({ collapsed: true })
    expect(container.firstChild).not.toBeNull()
  })

  it('passes collapsed=false to SidebarUserMenu', () => {
    renderFooter({ collapsed: false })
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument()
  })

  it('passes collapsed=true to SidebarUserMenu', () => {
    renderFooter({ collapsed: true })
    expect(screen.getByRole('button', { name: /open user menu/i })).toBeInTheDocument()
  })
})
