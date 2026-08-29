import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { accountingRoutes } from '../accounting.routes'

// The routes lazy-load real pages that would need RTK Query providers. Mock
// each page module so Suspense resolves to a stable marker instead.
vi.mock('../ChartOfAccountsPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../AccountingSettingsPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../JournalEntriesPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../JournalEntryViewPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../GeneralLedgerPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../TrialBalancePage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../ProfitAndLossPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../expenses/ExpensesPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../expenses/ExpenseFormPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../expenses/ExpenseDetailPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../owner-equity/OwnerEquityPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../owner-equity/OwnerEquityFormPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))
vi.mock('../owner-equity/OwnerEquityDetailPage', () => ({
  default: () => <div>ACCOUNTING_PAGE</div>,
}))

function storeWithRole(role: string) {
  return configureStore({
    reducer: {
      auth: (state = { user: { role }, isAuthenticated: true }) => state,
    } as any,
  })
}

function renderRoute(path: string, element: React.ReactNode, role: string) {
  return render(
    <Provider store={storeWithRole(role)}>
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

// NOTE: no unauthenticated case here. A bare accounting route element rendered
// in isolation is intentionally NOT authentication-protected — authentication is
// enforced by authLoader at the parent router (router.tsx), not by these elements.
describe('accounting routes are reachable by any authenticated role', () => {
  const NON_ADMIN_ROLES = [
    'manager',
    'sales_staff',
    'inventory_staff',
    'procurement_staff',
  ] as const

  it('defines every accounting route', () => {
    expect(accountingRoutes).toHaveLength(15)
  })

  it.each(
    NON_ADMIN_ROLES.flatMap((role) =>
      accountingRoutes.map((route) => [role, route.path as string, route] as const),
    ),
  )('renders %s the page at %s', async (role, path, route) => {
    renderRoute(path, route.element, role)
    expect(await screen.findByText('ACCOUNTING_PAGE')).toBeInTheDocument()
    expect(screen.queryByText('HOME_REDIRECT_TARGET')).not.toBeInTheDocument()
  })

  it.each(accountingRoutes.map((r) => [r.path as string, r] as const))(
    'renders an admin the page at %s',
    async (path, route) => {
      renderRoute(path, route.element, 'admin')
      expect(await screen.findByText('ACCOUNTING_PAGE')).toBeInTheDocument()
    },
  )
})
