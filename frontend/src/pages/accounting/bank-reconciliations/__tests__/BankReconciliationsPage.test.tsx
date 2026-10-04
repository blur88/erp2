import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BankReconciliationsPage, { HEADERS } from '../BankReconciliationsPage'
import { CONFIRM_COPY } from '../bankReconciliationActions'

const mockList = vi.fn()
const mockAccounts = vi.fn()
const mockDiscard = vi.fn()
const mockCancelReopen = vi.fn()
const mockReopen = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

const trigger = (fn: ReturnType<typeof vi.fn>) => (arg: unknown) => ({ unwrap: () => fn(arg) })

vi.mock('@/store/api/accountingApi', () => ({
  useGetBankReconciliationsQuery: (...args: unknown[]) => mockList(...args),
  useGetAccountsQuery: () => mockAccounts(),
  useDiscardBankReconciliationMutation: () => [trigger(mockDiscard), { isLoading: false }],
  useCancelReopenBankReconciliationMutation: () => [trigger(mockCancelReopen), { isLoading: false }],
  useReopenBankReconciliationMutation: () => [trigger(mockReopen), { isLoading: false }],
}))

const summary = {
  openingBalance: '0.00',
  closingBalance: '1000.00',
  moneyIn: '0.00',
  moneyOut: '0.00',
  calculatedClosingBalance: '1000.00',
  difference: '0.00',
  openingClearedNet: null,
  openingBalanceDifference: null,
  unclassifiedCount: null,
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'br-1',
    reconciliationNo: 'BR-26-001',
    sequenceNo: 1,
    bankAccountId: 'b1',
    bankAccount: { code: '1200', name: 'CIMB', isActive: true, isBankAccount: true },
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
    status: 'DRAFT',
    reopened: false,
    currentVersionNo: null,
    lockVersion: 3,
    completedAt: null,
    completedBy: null,
    isLatest: true,
    accountHasDraft: false,
    summary,
    ...over,
  }
}

function renderPage(rows: unknown[], initialEntries: string[] = ['/']) {
  mockList.mockReturnValue({
    data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } },
    isFetching: false,
    isError: false,
  })
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <BankReconciliationsPage />
    </MemoryRouter>,
  )
}

describe('BankReconciliationsPage', () => {
  beforeEach(() => {
    for (const m of [mockList, mockAccounts, mockDiscard, mockCancelReopen, mockReopen, mockShowSuccess, mockShowError]) {
      m.mockReset()
    }
    for (const m of [mockDiscard, mockCancelReopen, mockReopen]) m.mockResolvedValue(undefined)
    mockAccounts.mockReturnValue({
      data: {
        data: [
          { id: 'b1', code: '1200', name: 'CIMB', isActive: true, isBankAccount: true },
          { id: 'x1', code: '1000', name: 'Cash', isActive: true, isBankAccount: false },
        ],
      },
      isLoading: false,
    })
    window.history.replaceState(null, '', '/')
    localStorage.clear()
  })

  it('renders the eight columns in order and the New Reconciliation action', () => {
    expect(HEADERS).toEqual([
      'Reconciliation No', 'Bank Account', 'From', 'To', 'Closing Balance', 'Difference', 'Status', 'Actions',
    ])
    renderPage([row()])
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(HEADERS)
    expect(screen.getByRole('button', { name: /New Reconciliation/ })).toBeInTheDocument()
    const cells = screen.getAllByRole('cell')
    expect(cells[0]).toHaveTextContent('BR-26-001')
    expect(cells[1]).toHaveTextContent('1200 CIMB')
  })

  it('shows Completed figures from the row summary and a Reopened chip on a reopened draft', () => {
    const first = renderPage([
      row({
        status: 'COMPLETED',
        currentVersionNo: 1,
        summary: { ...summary, closingBalance: '2500.50', difference: '0.00' },
      }),
    ])
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByTestId('closing-balance')).toHaveTextContent('2,500.50')
    first.unmount()

    renderPage([row({ status: 'DRAFT', currentVersionNo: 1, reopened: true })])
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Reopened')).toBeInTheDocument()
  })

  it('sends only periodFrom when only the start of the period filter is set', async () => {
    window.history.replaceState(null, '', '/?period=custom&period_from=2026-02-01')
    renderPage([row()], ['/?period=custom&period_from=2026-02-01'])
    await waitFor(() => {
      const last = mockList.mock.calls.at(-1)?.[0]
      expect(last.periodFrom).toBe('2026-02-01')
      expect(last.periodTo).toBeUndefined()
    })
  })

  it('sends status and bankAccountId as query params once chosen', async () => {
    renderPage([row()])
    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(screen.getByRole('option', { name: 'Completed' }))
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'COMPLETED' })),
    )
    await userEvent.click(screen.getByLabelText('Bank Account'))
    await userEvent.click(screen.getByRole('option', { name: '1200 CIMB' }))
    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(expect.objectContaining({ bankAccountId: 'b1' })),
    )
  })

  it('formats amounts with two decimals and never -0.00', () => {
    renderPage([row({ summary: { ...summary, closingBalance: '1000.0000', difference: '-0.00' } })])
    expect(screen.getByTestId('closing-balance')).toHaveTextContent('1,000.00')
    const diff = screen.getByTestId('difference')
    expect(diff).toHaveTextContent('0.00')
    expect(diff.textContent).not.toContain('-')
  })

  it('row menu follows availableActions and never offers Complete', async () => {
    renderPage([row()])
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent)
    expect(items).toEqual(['View', 'Edit', 'Discard'])
  })

  it('Discard confirms with CONFIRM_COPY.discard and sends lockVersion', async () => {
    renderPage([row()])
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Discard' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(CONFIRM_COPY.discard.title)).toBeInTheDocument()
    expect(within(dialog).getByText(CONFIRM_COPY.discard.message)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: CONFIRM_COPY.discard.confirmText }))
    expect(mockDiscard).toHaveBeenCalledWith({ id: 'br-1', lockVersion: 3 })
    await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
  })

  it('shows the server error text when an action is rejected', async () => {
    mockDiscard.mockRejectedValue({ status: 409, data: 'This reconciliation was changed by someone else.' })
    renderPage([row()])
    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Discard' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: CONFIRM_COPY.discard.confirmText }),
    )
    await waitFor(() =>
      expect(mockShowError).toHaveBeenCalledWith('This reconciliation was changed by someone else.'),
    )
  })

  it('keeps a reconciliation of an inactive bank account visible and filterable', async () => {
    renderPage([
      row({
        id: 'br-2',
        bankAccountId: 'b9',
        bankAccount: { code: '1299', name: 'Old Bank', isActive: false, isBankAccount: false },
      }),
    ])
    expect(screen.getByText('1299 Old Bank')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Bank Account'))
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toContain('1299 Old Bank')
    expect(options).toContain('1200 CIMB')
    expect(options).not.toContain('1000 Cash')
  })

  it('opens the detail page when a row is clicked', async () => {
    mockList.mockReturnValue({
      data: { data: [row()], meta: { total: 1, page: 1, limit: 25 } },
      isFetching: false,
      isError: false,
    })
    const router = createMemoryRouter(
      [
        { path: '/accounting/bank-reconciliations', element: <BankReconciliationsPage /> },
        { path: '/accounting/bank-reconciliations/:id/view', element: <div>DETAIL PAGE</div> },
        { path: '/accounting/bank-reconciliations/create', element: <div>CREATE PAGE</div> },
      ],
      { initialEntries: ['/accounting/bank-reconciliations'] },
    )
    render(<RouterProvider router={router} />)
    await userEvent.click(screen.getByText('BR-26-001'))
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument()
  })
})
