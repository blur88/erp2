import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import AdminRoute from '@/components/auth/AdminRoute'
import { accountingRoutes } from '../accounting.routes'

// --- Layer 1: structural — the real config wraps every element in AdminRoute ---
describe('accounting.routes config is admin-gated', () => {
  it('wraps every accounting route element in AdminRoute', () => {
    expect(accountingRoutes.length).toBeGreaterThan(0)
    for (const route of accountingRoutes) {
      const el = route.element as React.ReactElement
      expect(el).toBeTruthy()
      // The outermost element of each route must be AdminRoute.
      expect(el.type).toBe(AdminRoute)
    }
  })
})

// --- Layer 2: behavioral — render the real elements under a non-admin store ---
function storeWith(user: any) {
  // Non-admin redirect case only needs auth.user (AdminRoute reads state.auth.user).
  return configureStore({
    reducer: { auth: (state = { user, isAuthenticated: !!user }) => state } as any,
  })
}

function renderRoute(path: string, element: React.ReactNode, user: any) {
  return render(
    <Provider store={storeWith(user)}>
      <MemoryRouter initialEntries={[path]}>
        <React.Suspense fallback={<div>LOADING</div>}>
          <Routes>
            <Route path="/" element={<div>HOME_REDIRECT_TARGET</div>} />
            <Route path={path} element={element as React.ReactElement} />
          </Routes>
        </React.Suspense>
      </MemoryRouter>
    </Provider>,
  )
}

describe('accounting routes block non-admins behaviorally', () => {
  it.each(accountingRoutes.map((r) => [r.path as string, r] as const))(
    'redirects non-admin away from %s',
    async (path, route) => {
      renderRoute(path, route.element, { role: 'sales_staff' })
      // Redirected to "/" — the page (lazy) never resolves; HOME target shows.
      expect(await screen.findByText('HOME_REDIRECT_TARGET')).toBeInTheDocument()
    },
  )
})