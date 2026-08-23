import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { OwnerEquityDocument, OwnerEquityType } from '@/types'

import OwnerEquityDetailView from '../OwnerEquityDetailView'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/accountingApi', () => ({
  useCompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
  useUncompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
  useCancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
  useUncancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
  useSettleOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
  useRefundOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) })), { isLoading: false }]),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  // Distinguishable payloads so a test can prove WHICH hook feeds the settle
  // dialog: Capital Injection accepts any active method, Cash Drawing only
  // purchase-enabled ones. Both hooks are mounted; one is always skipped.
  useGetActivePaymentMethodsForPurchasesQuery: () => ({
    data: [{ id: 'pm-purchases', code: 'BANK', name: 'Purchases Only Method', accountingChannel: 'BANK' }],
  }),
  useGetActivePaymentMethodsQuery: () => ({
    data: [{ id: 'pm-all', code: 'CASH', name: 'Any Active Method', accountingChannel: 'CASH' }],
  }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/common/PaymentDialog', () => ({
  // Renders the names of the paymentMethods it was handed, so a test can assert
  // WHICH query fed the dialog without depending on PaymentDialog's internals.
  default: ({ open, onSubmit, paymentMethods = [] }: any) =>
    open ? (
      <div data-testid="oe-settle-dialog" onClick={() => onSubmit([])}>
        SettleDialog
        {paymentMethods.map((m: any) => (
          <span key={m.id}>{m.name}</span>
        ))}
      </div>
    ) : null,
}))

vi.mock('@/components/common/RefundDialog', () => ({
  default: ({ open, onSubmit }: any) =>
    open ? <div data-testid="oe-refund-dialog" onClick={() => onSubmit([])}>RefundDialog</div> : null,
}))

function buildDoc(overrides: Partial<OwnerEquityDocument> = {}): OwnerEquityDocument {
  const type = (overrides.type as OwnerEquityType) ?? 'CAPITAL_INJECTION'
  const isStock = type === 'STOCK_DRAWING'
  return {
    id: 'eq-1',
    referenceNumber: 'EQ-26-001',
    equityDate: '2026-08-01',
    type,
    description: 'Description text',
    notes: null,
    documentStatus: overrides.documentStatus ?? 'DRAFT',
    settlementStatus: null,
    totalAmount: isStock ? null : '5000.0000',
    settledAmount: null,
    balance: isStock ? null : '5000.0000',
    productId: isStock ? 'p1' : null,
    quantity: isStock ? '10' : null,
    unitCost: isStock ? '50.0000' : null,
    totalCost: isStock ? '500.0000' : null,
    completedAt: null,
    completedBy: null,
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    settlements: [],
    product: isStock ? { id: 'p1', slug: 'widget', name: 'Widget' } : null,
    ...overrides,
  }
}

function renderDetail(overrides: Partial<OwnerEquityDocument> = {}) {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/owner-equity/EQ-26-001/view']}>
        <OwnerEquityDetailView document={buildDoc(overrides)} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OwnerEquityDetailView', () => {
  it('shows a Settlements tab for monetary documents', () => {
    renderDetail({ type: 'CAPITAL_INJECTION' })
    expect(screen.getByRole('tab', { name: /Settlements/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Stock Details/ })).not.toBeInTheDocument()
  })

  it('shows a Stock Details tab for stock drawings', () => {
    renderDetail({ type: 'STOCK_DRAWING' })
    expect(screen.getByRole('tab', { name: /Stock Details/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Settlements/ })).not.toBeInTheDocument()
  })

  it('drives its action bar from getOwnerEquityActionMetas', () => {
    renderDetail({ type: 'STOCK_DRAWING', documentStatus: 'COMPLETED' })
    expect(screen.getByRole('button', { name: /Uncomplete/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })

  // #1094: a completed monetary document offers Refund and nothing else — no
  // Complete/Uncomplete, and no Edit/Settle/Cancel.
  it('offers only Refund on a completed monetary document', () => {
    renderDetail({
      type: 'CAPITAL_INJECTION',
      documentStatus: 'COMPLETED',
      settlementStatus: 'SETTLED',
    })
    expect(screen.getByRole('button', { name: /Refund/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Uncomplete/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Complete/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Settle|Receive/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument()
  })

  // Asserting the button renders is not enough: the button existed while its
  // confirmation dialog was never rendered, so clicking it did nothing.
  it('opens a confirmation dialog when Uncomplete is clicked', async () => {
    renderDetail({ type: 'STOCK_DRAWING', documentStatus: 'COMPLETED' })

    await userEvent.click(screen.getByRole('button', { name: /Uncomplete/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Uncomplete Owner Equity/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Uncomplete/ })).toBeInTheDocument()
  })

  // Regression: both call sites used the purchases-only query unconditionally,
  // so a Capital Injection could not be settled with a method that is valid for
  // receipts but not enabled for purchases — those methods were simply missing
  // from the dialog.
  it('offers ALL active payment methods when settling a capital injection', async () => {
    renderDetail({ type: 'CAPITAL_INJECTION', documentStatus: 'DRAFT', settlementStatus: 'UNSETTLED' })

    await userEvent.click(screen.getByRole('button', { name: /Settle|Receive/i }))
    const dialog = await screen.findByTestId('oe-settle-dialog')

    expect(within(dialog).getByText('Any Active Method')).toBeInTheDocument()
    expect(within(dialog).queryByText('Purchases Only Method')).not.toBeInTheDocument()
  })

  it('restricts a cash drawing to purchase-enabled payment methods', async () => {
    renderDetail({ type: 'CASH_DRAWING', documentStatus: 'DRAFT', settlementStatus: 'UNSETTLED' })

    await userEvent.click(screen.getByRole('button', { name: /Settle|Pay/i }))
    const dialog = await screen.findByTestId('oe-settle-dialog')

    expect(within(dialog).getByText('Purchases Only Method')).toBeInTheDocument()
    expect(within(dialog).queryByText('Any Active Method')).not.toBeInTheDocument()
  })

  it('explains the stock and journal effect when uncompleting a stock drawing', async () => {
    renderDetail({ type: 'STOCK_DRAWING', documentStatus: 'COMPLETED' })

    await userEvent.click(screen.getByRole('button', { name: /Uncomplete/ }))

    expect(await screen.findByText(/restores the drawn stock/i)).toBeInTheDocument()
  })
  // #1113: quantities are stored with four-decimal precision; the Stock Details
  // field must show the normalized value, not the storage precision.
  it('normalizes the Stock Details quantity for display', async () => {
    renderDetail({ type: 'STOCK_DRAWING', quantity: '1.0000' })

    await userEvent.click(screen.getByRole('tab', { name: /Stock Details/ }))

    const label = await screen.findByText('Quantity')
    const value = label.nextElementSibling

    expect(value).toHaveTextContent(/^1$/)
  })

  it('preserves other query params when the tab changes', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: { empty: (s = null) => s } })
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/accounting/owner-equity/EQ-1/view?tab=0&probe=keepme']}>
          <LocationProbe />
          <OwnerEquityDetailView document={buildDoc()} />
        </MemoryRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })
})
