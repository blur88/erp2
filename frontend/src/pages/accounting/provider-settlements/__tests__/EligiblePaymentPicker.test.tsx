import '@testing-library/jest-dom/vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import EligiblePaymentPicker from '../EligiblePaymentPicker'

const mockEligible = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetEligiblePaymentsQuery: (...args: unknown[]) => mockEligible(...args),
}))

const PAGE_1 = [
  { id: 'pay-1', salesOrderId: 'so-1', orderNumber: 'SO-26-001', paymentDate: '2026-09-01', amount: '98.0000', referenceNumber: 'A1' },
  { id: 'pay-2', salesOrderId: 'so-2', orderNumber: 'SO-26-002', paymentDate: '2026-09-02', amount: '-50.0000', referenceNumber: 'A2' },
]
const PAGE_2 = [
  { id: 'pay-3', salesOrderId: 'so-3', orderNumber: 'SO-26-003', paymentDate: '2026-09-03', amount: '25.0000', referenceNumber: 'A3' },
]

/** Harness owning selection state, as the form page does. */
function Harness({
  enteredAmount = '48.00',
  initial = [] as Array<{ id: string; amount: string }>,
}: { enteredAmount?: string; initial?: Array<{ id: string; amount: string }> }) {
  const [selected, setSelected] = useState(initial)
  return (
    <EligiblePaymentPicker
      providerPaymentMethodId="pm-1"
      settlementDate="2026-09-20"
      selected={selected}
      onChange={setSelected}
      enteredAmount={enteredAmount}
    />
  )
}

function mockPage(rows: any[], total = 3) {
  mockEligible.mockReturnValue({
    data: { data: rows, meta: { total, page: 1, limit: 2 } },
    isLoading: false, isError: false,
  })
}

describe('EligiblePaymentPicker', () => {
  beforeEach(() => mockEligible.mockReset())

  it('keeps selections made on page 1 after paging to page 2 and back', async () => {
    // Selection state is keyed by payment id in the PARENT — it must not be
    // derived from the currently-rendered rows, or paging would silently drop it.
    mockPage(PAGE_1)
    render(<Harness />)
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    expect(screen.getByRole('checkbox', { name: /SO-26-001/ })).toBeChecked()

    mockPage(PAGE_2)
    await userEvent.click(screen.getByRole('button', { name: /next page/i }))
    expect(screen.queryByRole('checkbox', { name: /SO-26-001/ })).not.toBeInTheDocument()

    // The selected row is off-screen, but its amount must STILL be in the
    // total — this is exactly what a rendered-rows-derived total gets wrong.
    expect(screen.getByTestId('selected-count')).toHaveTextContent('1')
    expect(screen.getByTestId('selected-total')).toHaveTextContent('98.00')

    mockPage(PAGE_1)
    await userEvent.click(screen.getByRole('button', { name: /previous page/i }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /SO-26-001/ })).toBeChecked()
    })
  })

  it('shows count, selected total, entered amount and the difference', async () => {
    mockPage(PAGE_1)
    render(<Harness enteredAmount="48.00" />)
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-002/ }))

    // 98.00 + (-50.00) = 48.00, so the difference against 48.00 is zero.
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
    expect(screen.getByTestId('selected-total')).toHaveTextContent('48.00')
    expect(screen.getByTestId('entered-amount')).toHaveTextContent('48.00')
    expect(screen.getByTestId('difference')).toHaveTextContent('0.00')
  })

  it('reports a non-zero difference when the amount disagrees', async () => {
    mockPage(PAGE_1)
    render(<Harness enteredAmount="98.00" />)
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-001/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-002/ }))
    expect(screen.getByTestId('difference')).toHaveTextContent('50.00')
  })

  it('marks refund rows distinctly from payment rows', () => {
    mockPage(PAGE_1)
    render(<Harness />)
    // Assert the MARKER element, not a colour: jsdom has no layout engine and
    // imported stylesheets are not injected, so styling is unassertable here.
    const refundRow = screen.getByRole('row', { name: /SO-26-002/ })
    expect(within(refundRow).getByTestId('refund-marker')).toBeInTheDocument()
    const paymentRow = screen.getByRole('row', { name: /SO-26-001/ })
    expect(within(paymentRow).queryByTestId('refund-marker')).not.toBeInTheDocument()
  })

  it('passes search and page through to the server', async () => {
    mockPage(PAGE_1)
    render(<Harness />)
    await userEvent.type(screen.getByLabelText(/search/i), 'SO-26-003')
    await waitFor(() => {
      expect(mockEligible).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'SO-26-003', providerPaymentMethodId: 'pm-1' }),
      )
    })
  })
})
