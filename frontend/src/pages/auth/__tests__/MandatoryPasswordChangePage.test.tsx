import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import '@testing-library/jest-dom/vitest'
import authReducer, { storageUnavailable } from '../../../store/slices/authSlice'

const changePasswordMock = vi.fn()
vi.mock('@/services/authApi', () => ({
  authApi: { changePassword: (...a: unknown[]) => changePasswordMock(...a) },
  getApiBaseUrl: () => '/api',
}))
const passwordChanged = vi.fn().mockResolvedValue(undefined)
vi.mock('@/session', () => ({ sessionRuntime: { passwordChanged: (...a: unknown[]) => passwordChanged(...a), signOut: vi.fn() } }))

import MandatoryPasswordChangePage from '../MandatoryPasswordChangePage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const renderPage = () => {
  const store = configureStore({ reducer: { auth: authReducer } })
  render(
    <Provider store={store}>
      <BrowserRouter>
        <MandatoryPasswordChangePage />
      </BrowserRouter>
    </Provider>
  )
}

describe('MandatoryPasswordChangePage', () => {
  beforeEach(() => {
    changePasswordMock.mockReset()
    passwordChanged.mockClear()
    mockNavigate.mockClear()
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /password change required/i })).toBeInTheDocument()
  })

  it('calls passwordChanged and dispatches no logout on success', async () => {
    changePasswordMock.mockResolvedValue({ data: {} })
    renderPage()

    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'OldPass@123' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'NewPass@123' } })
    fireEvent.change(screen.getByLabelText(/confirm/i), { target: { value: 'NewPass@123' } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => expect(passwordChanged).toHaveBeenCalled())
  })

  it('shows the storage-unavailable screen in place of the form', () => {
    const store = configureStore({ reducer: { auth: authReducer } })
    store.dispatch(storageUnavailable())
    render(
      <Provider store={store}>
        <BrowserRouter>
          <MandatoryPasswordChangePage />
        </BrowserRouter>
      </Provider>
    )

    expect(screen.getByText(/this browser cannot store your session safely/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /change password/i })).not.toBeInTheDocument()
    expect(document.querySelector('form')).toBeNull()
  })

  it('does not apply a hardcoded gradient background', () => {
    renderPage()

    const allElements = document.querySelectorAll('*')
    const hasGradient = Array.from(allElements).some(el =>
      (el as HTMLElement).style?.background?.includes('667eea')
    )

    expect(hasGradient).toBe(false)
  })
})
