import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RequireSession from '../RequireSession'

type AuthStub = { isAuthenticated: boolean; user: { requiresPasswordChange?: boolean } | null }

function renderGuarded(auth: AuthStub) {
  const store = configureStore({ reducer: { auth: (state: AuthStub = auth) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/guarded']}>
        <Routes>
          <Route
            path="/guarded"
            element={
              <RequireSession>
                <div>signed-in shell</div>
              </RequireSession>
            }
          />
          <Route path="/login" element={<div>sign-in page</div>} />
          <Route path="/change-password-required" element={<div>password-change page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('RequireSession', () => {
  it('renders its children for a session that has nothing outstanding', () => {
    renderGuarded({ isAuthenticated: true, user: { requiresPasswordChange: false } })
    expect(screen.getByText('signed-in shell')).toBeInTheDocument()
  })

  it('sends a tab with no session to the sign-in page without rendering its children', () => {
    renderGuarded({ isAuthenticated: false, user: null })
    expect(screen.getByText('sign-in page')).toBeInTheDocument()
    expect(screen.queryByText('signed-in shell')).not.toBeInTheDocument()
  })

  it('sends a session that must change its password to that page without rendering its children', () => {
    renderGuarded({ isAuthenticated: true, user: { requiresPasswordChange: true } })
    expect(screen.getByText('password-change page')).toBeInTheDocument()
    expect(screen.queryByText('signed-in shell')).not.toBeInTheDocument()
  })

  it('no session takes priority over a stale user that must change its password', () => {
    renderGuarded({ isAuthenticated: false, user: { requiresPasswordChange: true } })
    expect(screen.getByText('sign-in page')).toBeInTheDocument()
  })
})
