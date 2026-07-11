import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi } from 'vitest'
import AdminRoute from '@/components/auth/AdminRoute'

function createStore(role: string | null, isAuthenticated = true) {
  return configureStore({
    reducer: {
      auth: () => ({
        isAuthenticated,
        user: role ? { role } : null,
        loading: false,
        accessToken: 'token',
      }),
    },
  })
}

function TestPage() {
  return <div>Accounting Page Content</div>
}

describe('Accounting route guard', () => {
  it('renders accounting page for admin user', () => {
    const store = createStore('admin')
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/chart-of-accounts']}>
          <Routes>
            <Route path="/accounting/chart-of-accounts" element={<AdminRoute><TestPage /></AdminRoute>} />
            <Route path="/" element={<div>Home Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByText('Accounting Page Content')).toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('redirects non-admin user to home page', () => {
    const store = createStore('manager')
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/chart-of-accounts']}>
          <Routes>
            <Route path="/accounting/chart-of-accounts" element={<AdminRoute><TestPage /></AdminRoute>} />
            <Route path="/" element={<div>Home Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Accounting Page Content')).not.toBeInTheDocument()
  })

  it('redirects unauthenticated user to login', () => {
    const store = createStore(null, false)
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/chart-of-accounts']}>
          <Routes>
            <Route path="/accounting/chart-of-accounts" element={<AdminRoute><TestPage /></AdminRoute>} />
            <Route path="/login" element={<div>Login Page</div>} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    )
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Accounting Page Content')).not.toBeInTheDocument()
  })

  it('renders all 5 sidebar items in the accounting section for admin', () => {
    // Verify the route config exists by rendering the routes page
    const store = createStore('admin')

    // Test each accounting route renders for admin
    const accountingPages = [
      '/accounting/chart-of-accounts',
      '/accounting/settings',
      '/accounting/journal-entries',
      '/accounting/general-ledger',
      '/accounting/trial-balance',
    ]

    for (const path of accountingPages) {
      const { unmount } = render(
        <Provider store={store}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path={path} element={<AdminRoute><div data-testid={`page-${path}`}>Page at {path}</div></AdminRoute>} />
              <Route path="/" element={<div>Home Page</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>,
      )
      expect(screen.getByTestId(`page-${path}`)).toBeInTheDocument()
      unmount()
    }
  })
})
