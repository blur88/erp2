import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const {
  balancedData,
  imbalancedData,
  noZeroData,
  withZeroData,
  mockUseGetTrialBalanceQuery,
} = vi.hoisted(() => {
  const balanced = {
    rows: [
      { code: '1100', name: 'Cash', debit: '5000.0000', credit: '0.0000' },
      {
        code: '2100',
        name: 'Customer Deposit',
        debit: '0.0000',
        credit: '5000.0000',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '5000.0000',
    difference: '0.0000',
    balanced: true,
  }

  const imbalanced = {
    rows: [
      { code: '1100', name: 'Cash', debit: '5000.0000', credit: '0.0000' },
      {
        code: '2100',
        name: 'Customer Deposit',
        debit: '0.0000',
        credit: '4000.0000',
      },
    ],
    totalDebit: '5000.0000',
    totalCredit: '4000.0000',
    difference: '1000.0000',
    balanced: false,
  }

  const zeroAccount = {
    code: '3000',
    name: 'Retained Earnings',
    debit: '0.0000',
    credit: '0.0000',
  }

  return {
    balancedData: balanced,
    imbalancedData: imbalanced,
    noZeroData: { ...balanced, rows: [...balanced.rows] },
    withZeroData: { ...balanced, rows: [...balanced.rows, zeroAccount] },
    mockUseGetTrialBalanceQuery: vi.fn(),
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetTrialBalanceQuery: mockUseGetTrialBalanceQuery,
}))

import TrialBalancePage from '../TrialBalancePage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <TrialBalancePage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('TrialBalancePage', () => {
  beforeEach(() => {
    mockUseGetTrialBalanceQuery.mockReset()
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: balancedData,
      isFetching: false,
      error: undefined,
    })
  })

  it('shows accounts with debit > 0 in debit column and credit > 0 in credit column', () => {
    renderPage()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Customer Deposit')).toBeInTheDocument()
    expect(screen.getByText('1100')).toBeInTheDocument()
    expect(screen.getByText('2100')).toBeInTheDocument()
  })

  it('renders warning Alert for imbalanced trial balance', () => {
    mockUseGetTrialBalanceQuery.mockReturnValue({
      data: imbalancedData,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const alert = screen.getByRole('alert')
    expect(alert).toBeInTheDocument()
    expect(alert).toHaveTextContent(/not balanced/i)
    expect(alert).toHaveTextContent('RM 1,000.00')
    expect(alert).not.toHaveTextContent('1000.0000')
  })

  it('does not render warning Alert for balanced trial balance', () => {
    renderPage()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows zero-balance rows after toggling "Show zero-balance accounts" checkbox', async () => {
    const user = userEvent.setup()
    mockUseGetTrialBalanceQuery.mockImplementation(
      (params: { asOfDate?: string; showZero?: boolean }) => {
        if (params.showZero) {
          return {
            data: withZeroData,
            isFetching: false,
            error: undefined,
          }
        }
        return {
          data: noZeroData,
          isFetching: false,
          error: undefined,
        }
      },
    )
    renderPage()

    expect(screen.queryByText('Retained Earnings')).not.toBeInTheDocument()

    const checkbox = screen.getByLabelText(/show zero.balance/i)
    await user.click(checkbox)

    expect(screen.getByText('Retained Earnings')).toBeInTheDocument()
  })

  it('formats row cells and totals as currency, em-dash for zero', () => {
    renderPage()
    const cash = screen.getByText('Cash').closest('tr')!.querySelectorAll('td')
    expect(cash[2]).toHaveTextContent('RM 5,000.00')
    expect(cash[2]).not.toHaveTextContent('5000.0000')
    expect(cash[3]).toHaveTextContent('—')
    expect(cash[3]).not.toHaveTextContent('RM')
    const deposit = screen.getByText('Customer Deposit').closest('tr')!.querySelectorAll('td')
    expect(deposit[2]).toHaveTextContent('—')
    expect(deposit[3]).toHaveTextContent('RM 5,000.00')
    const totalCells = screen.getByText('Total').closest('tr')!.querySelectorAll('td')
    expect(totalCells[1]).toHaveTextContent('RM 5,000.00')
    expect(totalCells[1]).not.toHaveTextContent('5000.0000')
    expect(totalCells[2]).toHaveTextContent('RM 5,000.00')
    expect(totalCells[2]).not.toHaveTextContent('5000.0000')
    expect(screen.getByText(/Difference:/)).toHaveTextContent('RM 0.00')
  })
})
