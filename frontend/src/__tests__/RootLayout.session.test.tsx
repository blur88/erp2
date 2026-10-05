import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import authReducer from '@/store/slices/authSlice'

const signOut = vi.fn().mockResolvedValue(undefined)
vi.mock('@/session', () => ({ sessionRuntime: { signOut: (...a: unknown[]) => signOut(...a) } }))

const idleHandlers: { onTimeout?: () => void } = {}
vi.mock('@/hooks/useIdleTimer', () => ({
  useIdleTimer: (opts: { onTimeout: () => void }) => {
    idleHandlers.onTimeout = opts.onTimeout
    return { remainingTime: 0, reset: vi.fn() }
  },
}))

vi.mock('@/hooks/useRegionalSettings', () => ({ useRegionalSettings: vi.fn() }))

import RootLayout from '@/RootLayout'

const makeStore = () =>
  configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        user: { id: '1', username: 'u', firstName: 'U', lastName: 'L' } as never,
        accessToken: 'a',
        refreshToken: 'r',
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
        sessionId: 's',
        generation: 1,
        storageUnavailable: false,
      },
    },
  })

describe('RootLayout idle timeout', () => {
  beforeEach(() => {
    signOut.mockClear()
  })

  it('calls sessionRuntime.signOut on idle timeout', async () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <RootLayout />
        </MemoryRouter>
      </Provider>
    )
    await waitFor(() => expect(idleHandlers.onTimeout).toBeDefined())
    idleHandlers.onTimeout?.()
    await waitFor(() => expect(signOut).toHaveBeenCalled())
  })

  it('renders its outlet content container', () => {
    render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <RootLayout />
        </MemoryRouter>
      </Provider>
    )
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
