import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/store/slices/authSlice'
import { store as appStore } from '@/store'

// ---- helpers ----------------------------------------------------------------

function makeAuthStore(isAuthenticated: boolean, requiresPasswordChange = false) {
  return configureStore({
    reducer: { auth: authReducer as any },
    preloadedState: {
      auth: {
        user: isAuthenticated
          ? {
              id: '1',
              username: 'admin',
              email: 'admin@test.com',
              firstName: 'Admin',
              lastName: 'User',
              role: 'admin' as const,
              status: 'active' as const,
              isActive: true,
              requiresPasswordChange,
              failedLoginAttempts: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null,
        accessToken: isAuthenticated ? 'mock-token' : null,
        refreshToken: isAuthenticated ? 'mock-refresh' : null,
        isAuthenticated,
        loading: false,
        error: null,
      },
    },
  })
}

// authLoader reads from the real Redux store; we swap it for these tests
vi.mock('@/store', () => ({
  store: {
    getState: vi.fn(),
  },
}))

const mockGetState = appStore.getState as ReturnType<typeof vi.fn>

function buildRouter(initialPath: string) {
  const { redirect } = require('react-router-dom')

  function authLoader({ request }: { request: Request }) {
    const { auth } = mockGetState()
    const url = new URL(request.url)
    if (!auth.isAuthenticated) return redirect('/login')
    if (auth.user?.requiresPasswordChange && url.pathname !== '/change-password-required') {
      return redirect('/change-password-required')
    }
    return null
  }

  return createMemoryRouter(
    [
      {
        path: '/login',
        element: <div>Login Page</div>,
      },
      {
        path: '/change-password-required',
        element: <div>Change Password Page</div>,
      },
      {
        loader: authLoader,
        children: [
          { path: '/dashboard', element: <div>Dashboard</div> },
          { path: '/inventory/products', element: <div>Products Page</div> },
          { path: '/settings', element: <div>Settings Page</div> },
        ],
      },
    ],
    { initialEntries: [initialPath] }
  )
}

// ---- tests ------------------------------------------------------------------

describe('React Router v7 - unauthenticated redirect', () => {
  beforeEach(() => {
    mockGetState.mockReturnValue({
      auth: {
        isAuthenticated: false,
        user: null,
      },
    })
  })

  it('redirects unauthenticated user visiting /dashboard to /login', async () => {
    const router = buildRouter('/dashboard')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated user visiting a deep route to /login', async () => {
    const router = buildRouter('/inventory/products')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Products Page')).not.toBeInTheDocument()
  })
})

describe('React Router v7 - authenticated access', () => {
  beforeEach(() => {
    mockGetState.mockReturnValue({
      auth: {
        isAuthenticated: true,
        user: {
          id: '1',
          requiresPasswordChange: false,
        },
      },
    })
  })

  it('renders protected route content when authenticated', async () => {
    const router = buildRouter('/dashboard')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Dashboard')).toBeInTheDocument()
    })
  })

  it('allows direct URL access to deep routes when authenticated', async () => {
    const router = buildRouter('/inventory/products')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Products Page')).toBeInTheDocument()
    })
  })
})

describe('React Router v7 - password change enforcement', () => {
  it('redirects authenticated user requiring password change to /change-password-required', async () => {
    mockGetState.mockReturnValue({
      auth: {
        isAuthenticated: true,
        user: { id: '1', requiresPasswordChange: true },
      },
    })

    const router = buildRouter('/dashboard')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Change Password Page')).toBeInTheDocument()
    })
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument()
  })

  it('allows access to /change-password-required when requiresPasswordChange is true', async () => {
    mockGetState.mockReturnValue({
      auth: {
        isAuthenticated: true,
        user: { id: '1', requiresPasswordChange: true },
      },
    })

    const router = buildRouter('/change-password-required')
    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(screen.getByText('Change Password Page')).toBeInTheDocument()
    })
  })
})
