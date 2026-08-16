import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
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
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
  // Capital Injection accepts any active method, Cash Drawing only
  // purchase-enabled ones — both hooks are mounted, one is always skipped.
  useGetActivePaymentMethodsQuery: () => ({ data: [] }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/common/PaymentDialog', () => ({
  default: ({ open, onSubmit }: any) =>
    open ? <div data-testid="oe-settle-dialog" onClick={() => onSubmit([])}>SettleDialog</div> : null,
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
    renderDetail({ type: 'CAPITAL_INJECTION', documentStatus: 'COMPLETED' })
    expect(screen.getByRole('button', { name: /Uncomplete/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
  })

  // Asserting the button renders is not enough: the button existed while its
  // confirmation dialog was never rendered, so clicking it did nothing.
  it('opens a confirmation dialog when Uncomplete is clicked', async () => {
    renderDetail({ type: 'CAPITAL_INJECTION', documentStatus: 'COMPLETED' })

    await userEvent.click(screen.getByRole('button', { name: /Uncomplete/ }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Uncomplete Owner Equity/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /Uncomplete/ })).toBeInTheDocument()
  })

  it('explains the stock and journal effect when uncompleting a stock drawing', async () => {
    renderDetail({ type: 'STOCK_DRAWING', documentStatus: 'COMPLETED' })

    await userEvent.click(screen.getByRole('button', { name: /Uncomplete/ }))

    expect(await screen.findByText(/restores the drawn stock/i)).toBeInTheDocument()
  })
})
