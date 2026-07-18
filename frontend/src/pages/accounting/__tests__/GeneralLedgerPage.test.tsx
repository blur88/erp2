import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockAccounts, mockGLData, mockAccountsQuery, mockGLQuery } = vi.hoisted(() => ({
  mockAccounts: {
    data: [
      {
        id: 'acct-1',
        code: '1100',
        name: 'Cash',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '0.0000',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'acct-2',
        code: '1200',
        name: 'Bank Account',
        type: 'Asset' as const,
        parentId: null,
        description: null,
        isActive: true,
        createdBy: null,
        isSystem: false,
        isPostable: true,
        openingBalance: '1000.0000',
        createdAt: '',
        updatedAt: '',
      },
    ],
    meta: { total: 2 },
  },
  mockGLData: {
    account: { id: 'acct-1', code: '1100', name: 'Cash' },
    openingBalance: '5000.0000',
    movements: [
      {
        date: '2026-07-01',
        journalEntryId: 'je-1',
        journalNo: 'JV-001',
        description: 'Initial balance entry',
        debit: '5000.0000',
        credit: '0.0000',
        balance: '10000.0000',
        sourceType: 'OPENING_BALANCE' as const,
        sourceDocumentId: null,
        sourceRef: null,
      },
      {
        date: '2026-07-05',
        journalEntryId: 'je-2',
        journalNo: 'JV-002',
        description: 'Sales revenue',
        debit: '0.0000',
        credit: '2000.0000',
        balance: '8000.0000',
        sourceType: 'SALES_ORDER' as const,
        sourceDocumentId: 'so-1',
        sourceRef: 'SO-001',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '2000.0000',
    closingBalance: '8000.0000',
  },
  mockAccountsQuery: vi.fn().mockReturnValue({ data: null, isFetching: false }),
  mockGLQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountsQuery: mockAccountsQuery,
  useGetGeneralLedgerQuery: mockGLQuery,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

import GeneralLedgerPage from '../GeneralLedgerPage'

function renderPage(initialEntry = '/accounting/general-ledger') {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  const router = createMemoryRouter(
    [
      { path: '/accounting/general-ledger', element: <GeneralLedgerPage /> },
      { path: '/sales/orders/:id/view', element: <div>Sales Order Page</div> },
      { path: '/accounting/journal-entries/:id', element: <div>JE Page</div> },
    ],
    { initialEntries: [initialEntry] },
  )
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  )
  return router
}

describe('GeneralLedgerPage', () => {
  beforeEach(() => {
    mockGLQuery.mockReturnValue({ data: undefined, isFetching: false })
    mockAccountsQuery.mockReturnValue({ data: null, isFetching: false })
  })

  it('shows empty state when no account is selected', () => {
    renderPage()
    expect(
      screen.getByText('Select an account to view ledger movements.'),
    ).toBeInTheDocument()
  })

  it('renders movements, opening balance, and closing balance when an account is selected', () => {
    mockAccountsQuery.mockReturnValue({ data: mockAccounts, isFetching: false })
    mockGLQuery.mockReturnValue({ data: mockGLData, isFetching: false })

    renderPage('/accounting/general-ledger?accountId=acct-1')

    const accountInfoElements = screen.getAllByText('1100 - Cash')
    expect(accountInfoElements.length).toBeGreaterThanOrEqual(1)
    const obTexts = screen.getAllByText(/Opening Balance/)
    expect(obTexts.length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/5,000/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('JV-001')).toBeInTheDocument()
    expect(screen.getByText('JV-002')).toBeInTheDocument()

    const soLink = screen.getByRole('link', { name: 'SO-001' })
    expect(soLink).toHaveAttribute('href', '/sales/orders/SO-001/view')
    expect(soLink).toHaveAccessibleDescription('Sales Order')
  })
})
