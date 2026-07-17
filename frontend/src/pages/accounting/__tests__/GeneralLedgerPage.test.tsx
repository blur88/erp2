import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
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

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <GeneralLedgerPage />
      </MemoryRouter>
    </Provider>,
  )
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
    mockAccountsQuery.mockReturnValue({
      data: mockAccounts,
      isFetching: false,
    })
    mockGLQuery.mockReturnValue({
      data: mockGLData,
      isFetching: false,
    })

    renderPage()

    // Select an account from the dropdown
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /account/i }))
    fireEvent.click(screen.getByRole('option', { name: /1100 - Cash/ }))

    // Account info section shows code and name (may appear multiple times — in select + header)
    const accountInfoElements = screen.getAllByText('1100 - Cash')
    expect(accountInfoElements.length).toBeGreaterThanOrEqual(1)

    // Opening balance is shown (check component renders the opening balance text)
    const obTexts = screen.getAllByText(/Opening Balance/)
    expect(obTexts.length).toBeGreaterThanOrEqual(1)
    const fiveThousandElements = screen.getAllByText(/5,000/)
    expect(fiveThousandElements.length).toBeGreaterThanOrEqual(1)

    // Movements table shows journal entries
    expect(screen.getByText('JV-001')).toBeInTheDocument()
    expect(screen.getByText('JV-002')).toBeInTheDocument()
    expect(screen.getByText('Initial balance entry')).toBeInTheDocument()
    expect(screen.getByText('Sales revenue')).toBeInTheDocument()

    // Summary section shows totals
    const creditElements = screen.getAllByText(/2,000/)
    expect(creditElements.length).toBeGreaterThanOrEqual(1)
    const closingElements = screen.getAllByText(/8,000/)
    expect(closingElements.length).toBeGreaterThanOrEqual(1)

    // Source link for SALES_ORDER uses sourceRef (SO-001) with /view suffix
    expect(screen.getByText('Sales Order').closest('a')).toHaveAttribute(
      'href',
      '/sales/orders/SO-001/view',
    )
  })
})
