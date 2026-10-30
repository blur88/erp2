import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { beforeEach, expect, it, vi } from 'vitest'
import RootLayout from '../RootLayout'
import authReducer from '@/store/slices/authSlice'
import { authApi } from '@/services/authApi'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async importOriginal => ({
  ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => navigate,
}))
vi.mock('@/hooks/useRegionalSettings', () => ({ useRegionalSettings: vi.fn() }))
vi.mock('@/pages/accounting/bank-reconciliations/useClearReconciliationDraftsOnSignOut', () => ({ useClearReconciliationDraftsOnSignOut: vi.fn() }))
vi.mock('@/hooks/useIdleTimer', () => ({ useIdleTimer: () => ({ remainingTime: 1, reset: vi.fn() }) }))
vi.mock('@/components/auth/IdleWarningDialog', () => ({ default: ({ onLogout }: { onLogout: () => void }) => <button onClick={onLogout}>Sign out now</button> }))
vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn() } }))

beforeEach(() => {
  navigate.mockClear()
  vi.mocked(authApi.logout).mockReset().mockResolvedValue({ data: undefined } as any)
})

it.each(['refresh', undefined])('root forced/idle sign-out clears auth and replaces login (window token %s)', async refreshToken => {
  const initial = authReducer(undefined, { type: 'init' })
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: {
    auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' },
  } })
  ;(window as any).store = { getState: () => ({ auth: { refreshToken } }) }
  try {
    render(<Provider store={store}><MemoryRouter><RootLayout /></MemoryRouter></Provider>)
    fireEvent.click(screen.getByText('Sign out now'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }))
    expect(store.getState().auth).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false })
    expect(authApi.logout).toHaveBeenCalledTimes(refreshToken ? 1 : 0)
  } finally {
    delete (window as any).store
  }
})
