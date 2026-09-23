import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettlementRowPicker from '../SettlementRowPicker'
import type { SelectedRow } from '../settlementSelection'

const mockRows = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetEligibleSettlementRowsQuery: (...a: unknown[]) => mockRows(...a),
}))

const TIKTOK = {
  salesOrderId: 'so-8', orderNumber: 'SO-26-008', paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok',
  netAmount: '70.0000',
  payments: [
    { id: 'p1', paymentDate: '2026-09-01', amount: '100.0000', referenceNumber: 'TT-1' },
    { id: 'r1', paymentDate: '2026-09-02', amount: '-30.0000', referenceNumber: 'TT-R' },
  ],
}
const DEDUCTION = { ...TIKTOK, salesOrderId: 'so-9', orderNumber: 'SO-26-009', netAmount: '-30.0000', payments: [] }
const ATOME = { ...TIKTOK, salesOrderId: 'so-5', orderNumber: 'SO-26-005', paymentMethodId: 'pm-at', paymentMethodName: 'Atome', netAmount: '20.0000', payments: [] }

function Harness({ entered = '' }: { entered?: string }) {
  const [selected, setSelected] = useState<SelectedRow[]>([])
  return <SettlementRowPicker settlementDate="2026-09-20" selected={selected} onChange={setSelected} enteredAmount={entered} />
}

beforeEach(() => {
  mockRows.mockReset().mockReturnValue({
    data: { data: [TIKTOK, DEDUCTION, ATOME], meta: { total: 3, page: 1, limit: 25 } },
  })
})

describe('SettlementRowPicker', () => {
  it('shows Sales Order No, Payment Method and Net Amount columns with no provider filter', () => {
    render(<Harness />)
    for (const h of ['Sales Order No', 'Payment Method', 'Net Amount']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    expect(mockRows.mock.calls[0][0]).not.toHaveProperty('providerPaymentMethodId')
    expect(screen.getByText('SO-26-008')).toBeInTheDocument()
  })

  it('marks a negative net as a Deduction', () => {
    render(<Harness />)
    const row = screen.getByText('SO-26-009').closest('tr')!
    expect(within(row).getByTestId('deduction-marker')).toHaveTextContent('Deduction')
  })

  it('expands a row to its underlying payments', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /show payments for SO-26-008/i }))
    expect(screen.getByText('TT-1')).toBeInTheDocument()
    expect(screen.getByText('TT-R')).toBeInTheDocument()
  })

  it('totals the selection exactly and keeps it across pages', async () => {
    const { rerender } = render(<Harness entered="40" />)
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-009 TikTok/ }))
    expect(screen.getByTestId('selected-total')).toHaveTextContent('40.00')
    expect(screen.getByTestId('difference')).toHaveTextContent('0.00')
    mockRows.mockReturnValue({ data: { data: [], meta: { total: 3, page: 2, limit: 25 } } })
    rerender(<Harness entered="40" />)
    expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
  })

  it('warns on mixed methods, naming each with its count', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ }))
    await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-005 Atome/ }))
    const alert = screen.getByTestId('mixed-methods-warning')
    expect(alert).toHaveTextContent('TikTok (1)')
    expect(alert).toHaveTextContent('Atome (1)')
    expect(alert).toHaveTextContent(/separate settlement/i)
  })

  it('passes settlementId through so a draft sees its own claims', () => {
    render(<SettlementRowPicker settlementDate="2026-09-20" settlementId="ps-1" selected={[]} onChange={() => {}} enteredAmount="" />)
    expect(mockRows.mock.calls[0][0]).toMatchObject({ settlementId: 'ps-1' })
  })
})
