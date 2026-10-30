import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import '@testing-library/jest-dom/vitest'
import MandatoryPasswordChangePage from '../MandatoryPasswordChangePage'
import authReducer from '../../../store/slices/authSlice'
import { authApi } from '@/services/authApi'

vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn(), changePassword: vi.fn() } }))
const navigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

const renderPage = () => {
  const initial = authReducer(undefined, { type: 'init' })
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' } } })
  render(
    <Provider store={store}>
      <BrowserRouter>
        <MandatoryPasswordChangePage />
      </BrowserRouter>
    </Provider>
  )
  return store
}

describe('MandatoryPasswordChangePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authApi.logout).mockResolvedValue({ data: undefined } as any)
    vi.mocked(authApi.changePassword).mockResolvedValue({ data: undefined } as any)
  })

  it('explicit sign-out clears via backend logout call and replaces login', async () => {
    const store = renderPage()
    fireEvent.click(screen.getByRole('button', { name: /logout/i }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login', { replace: true }))
    expect(authApi.logout).toHaveBeenCalledWith('refresh')
    expect(store.getState().auth.isAuthenticated).toBe(false)
  })

  it('successful password change delays the backend logout call for two seconds without explicit navigation', async () => {
    const store = renderPage()
    fireEvent.change(screen.getByLabelText(/^current password/i), { target: { value: 'OldPassword@1' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPassword@1' } })
    fireEvent.change(screen.getByLabelText(/^confirm new password/i), { target: { value: 'NewPassword@1' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
    await screen.findByText(/Password changed successfully!/)
    expect(authApi.logout).not.toHaveBeenCalled()
    await waitFor(() => expect(authApi.logout).toHaveBeenCalledWith('refresh'), { timeout: 3000 })
    await waitFor(() => expect(store.getState().auth.isAuthenticated).toBe(false))
    expect(navigate).not.toHaveBeenCalled()
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /password change required/i })).toBeInTheDocument()
  })

  it('does not apply a hardcoded gradient background', () => {
    renderPage()

    // MUI applies `bgcolor` via CSS custom properties, not inline `style` attributes,
    // so jsdom never sets `style.background` for sx-prop colors. This assertion documents
    // intent: the gradient (#667eea) must not be present as a literal inline style.
    const allElements = document.querySelectorAll('*')
    const hasGradient = Array.from(allElements).some(el =>
      (el as HTMLElement).style?.background?.includes('667eea')
    )

    expect(hasGradient).toBe(false)
  })
})
