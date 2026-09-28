import '@testing-library/jest-dom/vitest'
import { ThemeProvider } from '@mui/material/styles'
import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { darkTheme } from '@/styles/theme'
import SettlementRowPicker from '../SettlementRowPicker'
import type { SelectedRow } from '../settlementSelection'

const mockRows = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetEligibleSettlementRowsQuery: (...a: unknown[]) => mockRows(...a),
}))

// Through the app theme, so themed colours (error.main) actually compute.
function render(ui: ReactElement) {
  const result = rtlRender(<ThemeProvider theme={darkTheme}>{ui}</ThemeProvider>)
  return {
    ...result,
    rerender: (next: ReactElement) => result.rerender(<ThemeProvider theme={darkTheme}>{next}</ThemeProvider>),
  }
}

// darkTheme's error.main (colors.error[400], #ef5350).
const ERROR_MAIN = 'rgb(239, 83, 80)'

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

  it('shows a negative net in error red with its minus sign and a screen-reader Deduction label', () => {
    render(<Harness />)
    const row = screen.getByText('SO-26-009').closest('tr')!
    const amount = within(row).getByTestId('net-amount')
    // formatCurrency places the sign after the symbol: 'RM -30.00'.
    expect(amount.textContent).toContain('-30.00')
    expect(getComputedStyle(amount).color).toBe(ERROR_MAIN)
    // The label lives in the amount's own cell, so it is announced with it.
    const label = within(row).getByText('Deduction')
    expect(label.closest('td')).toBe(amount.closest('td'))
    expect(within(row).queryByTestId('deduction-marker')).not.toBeInTheDocument()
  })

  it('shows a positive net without a Deduction label or error colour', () => {
    render(<Harness />)
    const row = screen.getByText('SO-26-008').closest('tr')!
    const amount = within(row).getByTestId('net-amount')
    expect(amount.textContent).not.toContain('-')
    expect(getComputedStyle(amount).color).not.toBe(ERROR_MAIN)
    expect(within(row).queryByText('Deduction')).not.toBeInTheDocument()
  })

  it('shows each group as a single net row with no expandable payment details', () => {
    render(<Harness />)
    expect(screen.queryByRole('button', { name: /payments for/i })).not.toBeInTheDocument()
    expect(screen.queryByText('TT-1')).not.toBeInTheDocument()
    expect(screen.queryByText('TT-R')).not.toBeInTheDocument()
    expect(screen.getAllByRole('columnheader')).toHaveLength(4)
  })

  it('renders the table and its pagination inside one card', () => {
    render(<Harness />)
    const card = screen.getByRole('table').closest('.MuiPaper-root')!
    expect(card).not.toBeNull()
    expect(within(card as HTMLElement).getByText(/Showing 1–3 of 3 records/)).toBeInTheDocument()
  })

  it('shows a loading row on first load, without pagination', () => {
    mockRows.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<Harness />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Sales Order No' })).toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('shows an error row when the rows fail to load, without pagination', () => {
    mockRows.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<Harness />)
    expect(screen.getByText('Failed to load payments.')).toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('shows an empty row when no payments are eligible', () => {
    mockRows.mockReturnValue({ data: { data: [], meta: { total: 0, page: 1, limit: 25 } } })
    render(<Harness />)
    expect(screen.getByText('No eligible payments for this settlement date.')).toBeInTheDocument()
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
  })

  it('names the search in the empty row when a search is active', async () => {
    render(<Harness />)
    mockRows.mockReturnValue({ data: { data: [], meta: { total: 0, page: 1, limit: 25 } } })
    await userEvent.type(screen.getByLabelText('Search'), 'zzz')
    expect(await screen.findByText('No payments match your search.')).toBeInTheDocument()
  })

  it('keeps pagination when a page comes back empty but rows remain, so the user can page back', () => {
    // Rows claimed elsewhere can empty the current page while total > 0.
    mockRows.mockReturnValue({ data: { data: [], meta: { total: 30, page: 1, limit: 25 } } })
    render(<Harness />)
    expect(screen.getByText(/of 30 records/)).toBeInTheDocument()
  })

  it('keeps showing the current rows while a refetch is in flight', () => {
    mockRows.mockReturnValue({
      data: { data: [TIKTOK], meta: { total: 1, page: 1, limit: 25 } }, isLoading: false, isFetching: true,
    })
    render(<Harness />)
    expect(screen.getByText('SO-26-008')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
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

  it('refetches the eligible rows whenever the picker mounts', () => {
    render(<Harness />)
    expect(mockRows.mock.calls[0][1]).toEqual({ refetchOnMountOrArgChange: true })
  })

  it('passes settlementId through so a draft sees its own claims', () => {
    render(<SettlementRowPicker settlementDate="2026-09-20" settlementId="ps-1" selected={[]} onChange={() => {}} enteredAmount="" />)
    expect(mockRows.mock.calls[0][0]).toMatchObject({ settlementId: 'ps-1' })
  })
})
