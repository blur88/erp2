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
const mockMethods = vi.fn()
vi.mock('@/store/api/accountingApi', () => ({
  useGetEligibleSettlementRowsQuery: (...a: unknown[]) => mockRows(...a),
  useGetEligibleSettlementMethodsQuery: (...a: unknown[]) => mockMethods(...a),
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

const METHODS = [
  { id: 'pm-tt', name: 'TikTok', isActive: true, deleted: false },
  { id: 'pm-at', name: 'Atome', isActive: true, deleted: false },
]

function Harness({
  entered = '', settlementDate = '2026-09-20', onSelectionChange,
}: { entered?: string; settlementDate?: string; onSelectionChange?: (next: SelectedRow[]) => void }) {
  const [selected, setSelected] = useState<SelectedRow[]>([])
  return (
    <SettlementRowPicker
      settlementDate={settlementDate}
      selected={selected}
      onChange={(next) => { onSelectionChange?.(next); setSelected(next) }}
      enteredAmount={entered}
    />
  )
}

/** Answer like the server: the rows of the requested method and search, or every row. */
function serveRows(all: Array<typeof TIKTOK>, total?: number) {
  mockRows.mockImplementation((args: { paymentMethodId?: string; search?: string; page?: number }) => {
    const data = all
      .filter((r) => !args.paymentMethodId || r.paymentMethodId === args.paymentMethodId)
      .filter((r) => !args.search || r.orderNumber.includes(args.search))
    return { data: { data, meta: { total: total ?? data.length, page: args.page ?? 1, limit: 25 } } }
  })
}

const lastRowsArgs = () => mockRows.mock.calls.at(-1)![0] as Record<string, unknown>
const methodFilter = () => screen.getByRole('combobox', { name: 'Payment Method' })
const searchInput = () => screen.getByLabelText('Search')
const clearSearch = () => screen.getByRole('button', { name: 'Clear search' })

async function chooseMethod(name: string) {
  await userEvent.click(methodFilter())
  await userEvent.click(screen.getByRole('option', { name }))
}

beforeEach(() => {
  mockRows.mockReset()
  serveRows([TIKTOK, DEDUCTION, ATOME])
  mockMethods.mockReset().mockReturnValue({ data: METHODS, isLoading: false, isError: false })
})

describe('SettlementRowPicker', () => {
  it('shows Sales Order No, Payment Method and Net Amount columns, unfiltered by default', () => {
    render(<Harness />)
    for (const h of ['Sales Order No', 'Payment Method', 'Net Amount']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    // #1335: the filter is optional. The default view is still cross-method.
    expect(methodFilter()).toHaveTextContent('All Payment Methods')
    expect(mockRows.mock.calls[0][0]).not.toHaveProperty('paymentMethodId')
    expect(mockRows.mock.calls[0][0]).not.toHaveProperty('providerPaymentMethodId')
    expect(screen.getByText('SO-26-008')).toBeInTheDocument()
    expect(screen.getByText('SO-26-005')).toBeInTheDocument()
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

  // The screen-reader label is absolutely positioned. Without a positioned
  // ancestor inside the table's scroll box it is laid out against the page, and
  // at narrow widths (table wider than the viewport) it gives the whole page a
  // horizontal scrollbar. Measured in a browser at 375px on PR #1336.
  it('contains the hidden Deduction label inside the table scroll box', () => {
    render(<Harness />)
    const scrollBox = screen.getByRole('table').parentElement!
    expect(getComputedStyle(scrollBox).overflowX).toBe('auto')
    expect(getComputedStyle(scrollBox).position).toBe('relative')
    const label = within(screen.getByText('SO-26-009').closest('tr')!).getByText('Deduction')
    expect(getComputedStyle(label).position).toBe('absolute')
    expect(scrollBox.contains(label)).toBe(true)
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

  describe('Payment Method filter (#1335)', () => {
    // Measured in a browser on PR #1336: a `small` Search (37.1px) beside the
    // `xs` filter (32px). jsdom has no layout, so the guard is the size variant
    // both controls resolve to, which is what fixes their height in the theme.
    it('renders Search at the same size variant as the filter beside it', () => {
      render(<Harness />)
      const sizeOf = (el: HTMLElement) =>
        [...el.closest('.MuiInputBase-root')!.classList].filter((c) => c.startsWith('MuiInputBase-size'))
      expect(sizeOf(methodFilter())).toEqual(['MuiInputBase-sizeXs'])
      expect(sizeOf(screen.getByLabelText('Search'))).toEqual(['MuiInputBase-sizeXs'])
    })

    it('offers every eligible method, marking inactive and deleted ones', async () => {
      mockMethods.mockReturnValue({
        data: [
          ...METHODS,
          { id: 'pm-in', name: 'GrabPay', isActive: false, deleted: false },
          { id: 'pm-del', name: 'Lazada', isActive: true, deleted: true },
        ],
        isLoading: false, isError: false,
      })
      render(<Harness />)
      await userEvent.click(methodFilter())
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'All Payment Methods', 'TikTok', 'Atome', 'GrabPay (inactive)', 'Lazada (deleted)',
      ])
    })

    it('scopes the options to the settlement date and the draft, never to Search', async () => {
      render(<SettlementRowPicker settlementDate="2026-09-20" settlementId="ps-1" selected={[]} onChange={() => {}} enteredAmount="" />)
      await userEvent.type(screen.getByLabelText('Search'), 'SO-26')
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({ search: 'SO-26' }))
      expect(mockMethods).toHaveBeenCalled()
      for (const [args, options] of mockMethods.mock.calls) {
        expect(args).toEqual({ settlementDate: '2026-09-20', settlementId: 'ps-1' })
        expect(options).toEqual({ refetchOnMountOrArgChange: true })
      }
    })

    it('omits settlementId from the options scope on a new settlement', () => {
      render(<Harness />)
      expect(mockMethods.mock.calls[0][0]).toEqual({ settlementDate: '2026-09-20' })
    })

    it('filters the rows to the chosen method, positive and Deduction alike', async () => {
      render(<Harness />)
      await chooseMethod('TikTok')
      expect(lastRowsArgs()).toMatchObject({ paymentMethodId: 'pm-tt' })
      expect(methodFilter()).toHaveTextContent('TikTok')
      expect(screen.getByText('SO-26-008')).toBeInTheDocument()
      const deduction = screen.getByText('SO-26-009').closest('tr')!
      expect(within(deduction).getByText('Deduction')).toBeInTheDocument()
      expect(screen.queryByText('SO-26-005')).not.toBeInTheDocument()
    })

    it('choosing All Payment Methods restores the cross-method view', async () => {
      render(<Harness />)
      await chooseMethod('Atome')
      expect(screen.queryByText('SO-26-008')).not.toBeInTheDocument()
      await chooseMethod('All Payment Methods')
      expect(lastRowsArgs()).not.toHaveProperty('paymentMethodId')
      expect(methodFilter()).toHaveTextContent('All Payment Methods')
      expect(screen.getByText('SO-26-008')).toBeInTheDocument()
      expect(screen.getByText('SO-26-005')).toBeInTheDocument()
    })

    it('sends the filter together with search, date and pagination', async () => {
      render(<Harness />)
      await chooseMethod('TikTok')
      await userEvent.type(screen.getByLabelText('Search'), 'TT-1')
      await vi.waitFor(() => expect(lastRowsArgs()).toEqual({
        settlementDate: '2026-09-20', search: 'TT-1', paymentMethodId: 'pm-tt', page: 1, limit: 25,
      }))
    })

    it('returns to page 1 when the filter changes', async () => {
      serveRows([TIKTOK, DEDUCTION, ATOME], 60)
      render(<Harness />)
      await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
      expect(lastRowsArgs()).toMatchObject({ page: 2 })
      await chooseMethod('TikTok')
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({ paymentMethodId: 'pm-tt', page: 1 }))
    })

    it('returns to page 1 when the settlement date changes, keeping the filter', async () => {
      serveRows([TIKTOK, DEDUCTION, ATOME], 60)
      const { rerender } = render(<Harness />)
      await chooseMethod('TikTok')
      await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
      expect(lastRowsArgs()).toMatchObject({ page: 2 })
      rerender(<Harness settlementDate="2026-09-10" />)
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({
        settlementDate: '2026-09-10', paymentMethodId: 'pm-tt', page: 1,
      }))
    })

    it('keeps selections, count, total and difference when the filter hides the selected rows', async () => {
      const onSelectionChange = vi.fn()
      render(<Harness entered="40" onSelectionChange={onSelectionChange} />)
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-009 TikTok/ }))
      onSelectionChange.mockClear()

      await chooseMethod('Atome')
      expect(screen.queryByText('SO-26-008')).not.toBeInTheDocument()
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
      expect(screen.getByTestId('selected-total')).toHaveTextContent('40.00')
      expect(screen.getByTestId('difference')).toHaveTextContent('0.00')

      await chooseMethod('All Payment Methods')
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
      expect(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /SO-26-009 TikTok/ })).toBeChecked()
      // Filtering is a view change: it never writes the selection.
      expect(onSelectionChange).not.toHaveBeenCalled()
    })

    it('still warns on mixed methods when one of them is hidden by the filter', async () => {
      render(<Harness />)
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ }))
      await chooseMethod('Atome')
      expect(screen.queryByTestId('mixed-methods-warning')).not.toBeInTheDocument()
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-005 Atome/ }))
      const alert = screen.getByTestId('mixed-methods-warning')
      expect(alert).toHaveTextContent('TikTok (1)')
      expect(alert).toHaveTextContent('Atome (1)')
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
    })

    it('keeps the chosen method selected and listed when a date change drops it from the options', async () => {
      const { rerender } = render(<Harness />)
      await chooseMethod('TikTok')
      // The earlier date has no eligible TikTok rows.
      mockMethods.mockReturnValue({ data: [METHODS[1]], isLoading: false, isError: false })
      serveRows([ATOME])
      rerender(<Harness settlementDate="2026-09-10" />)

      expect(methodFilter()).toHaveTextContent('TikTok')
      expect(lastRowsArgs()).toMatchObject({ settlementDate: '2026-09-10', paymentMethodId: 'pm-tt' })
      expect(screen.getByText('No eligible payments match the current filters.')).toBeInTheDocument()
      await userEvent.click(methodFilter())
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
        'All Payment Methods', 'Atome', 'TikTok',
      ])
      // All Payment Methods is still there to broaden the view.
      await userEvent.click(screen.getByRole('option', { name: 'All Payment Methods' }))
      expect(screen.getByText('SO-26-005')).toBeInTheDocument()
    })

    it('drops a stale option once the user moves off it', async () => {
      const { rerender } = render(<Harness />)
      await chooseMethod('TikTok')
      mockMethods.mockReturnValue({ data: [METHODS[1]], isLoading: false, isError: false })
      rerender(<Harness settlementDate="2026-09-10" />)
      await chooseMethod('Atome')
      await userEvent.click(methodFilter())
      expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['All Payment Methods', 'Atome'])
    })

    it('names the filters in the empty row when a method is chosen, with or without a search', async () => {
      serveRows([TIKTOK])
      render(<Harness />)
      await chooseMethod('Atome')
      expect(screen.getByText('No eligible payments match the current filters.')).toBeInTheDocument()
      await userEvent.type(screen.getByLabelText('Search'), 'zzz')
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({ search: 'zzz' }))
      expect(screen.getByText('No eligible payments match the current filters.')).toBeInTheDocument()
      expect(screen.queryByText('No payments match your search.')).not.toBeInTheDocument()
    })

    it('disables the filter while its options load', () => {
      mockMethods.mockReturnValue({ data: undefined, isLoading: true, isError: false })
      render(<Harness />)
      expect(methodFilter()).toHaveAttribute('aria-disabled', 'true')
    })

    it('leaves the filter usable, showing every row, when its options fail to load', async () => {
      mockMethods.mockReturnValue({ data: undefined, isLoading: false, isError: true })
      render(<Harness />)
      expect(methodFilter()).not.toHaveAttribute('aria-disabled', 'true')
      expect(methodFilter()).toHaveTextContent('All Payment Methods')
      expect(screen.getByText('SO-26-008')).toBeInTheDocument()
    })
  })

  describe('Search clear control (#1338)', () => {
    it('offers no clear control while Search is empty', () => {
      render(<Harness />)
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('offers the clear control once Search has text, and removes it again after clearing', async () => {
      render(<Harness />)
      await userEvent.type(searchInput(), 'SO-26-005')
      await userEvent.click(clearSearch())
      expect(searchInput()).toHaveValue('')
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
    })

    it('restores the rows the search hid', async () => {
      render(<Harness />)
      await userEvent.type(searchInput(), 'SO-26-005')
      await vi.waitFor(() => expect(screen.queryByText('SO-26-008')).not.toBeInTheDocument())

      await userEvent.click(clearSearch())
      expect(await screen.findByText('SO-26-008')).toBeInTheDocument()
      expect(lastRowsArgs()).toEqual({ settlementDate: '2026-09-20', search: undefined, page: 1, limit: 25 })
    })

    it('returns to page 1 when Search clears', async () => {
      serveRows([TIKTOK, DEDUCTION, ATOME], 60)
      render(<Harness />)
      await userEvent.type(searchInput(), 'SO-26')
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({ search: 'SO-26', page: 1 }))
      await userEvent.click(screen.getByRole('button', { name: 'Go to page 2' }))
      expect(lastRowsArgs()).toMatchObject({ search: 'SO-26', page: 2 })

      await userEvent.click(clearSearch())
      await vi.waitFor(() => expect(lastRowsArgs()).toMatchObject({ search: undefined, page: 1 }))
    })

    it('keeps the Payment Method filter when Search clears', async () => {
      render(<Harness />)
      await chooseMethod('TikTok')
      await userEvent.type(searchInput(), 'SO-26-009')
      await vi.waitFor(() => expect(screen.queryByText('SO-26-008')).not.toBeInTheDocument())

      await userEvent.click(clearSearch())
      expect(await screen.findByText('SO-26-008')).toBeInTheDocument()
      expect(lastRowsArgs()).toMatchObject({ search: undefined, paymentMethodId: 'pm-tt' })
      expect(methodFilter()).toHaveTextContent('TikTok')
      expect(screen.queryByText('SO-26-005')).not.toBeInTheDocument()
    })

    it('keeps selections, count, total and difference when Search clears', async () => {
      const onSelectionChange = vi.fn()
      render(<Harness entered="40" onSelectionChange={onSelectionChange} />)
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-008 TikTok/ }))
      await userEvent.click(screen.getByRole('checkbox', { name: /SO-26-009 TikTok/ }))
      onSelectionChange.mockClear()

      await userEvent.type(searchInput(), 'SO-26-005')
      await vi.waitFor(() => expect(screen.queryByText('SO-26-008')).not.toBeInTheDocument())
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')

      await userEvent.click(clearSearch())
      expect(await screen.findByRole('checkbox', { name: /SO-26-008 TikTok/ })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: /SO-26-009 TikTok/ })).toBeChecked()
      expect(screen.getByTestId('selected-count')).toHaveTextContent('2')
      expect(screen.getByTestId('selected-total')).toHaveTextContent('40.00')
      expect(screen.getByTestId('entered-amount')).toHaveTextContent('40.00')
      expect(screen.getByTestId('difference')).toHaveTextContent('0.00')
      // Clearing Search is a view change: it never writes the selection.
      expect(onSelectionChange).not.toHaveBeenCalled()
    })

    it('returns focus to Search after a click', async () => {
      render(<Harness />)
      await userEvent.type(searchInput(), 'SO-26-005')
      await userEvent.click(clearSearch())
      expect(searchInput()).toHaveFocus()
    })

    it.each([
      ['Enter', '{Enter}'],
      ['Space', ' '],
    ])('is reachable by Tab from Search and clears on %s, returning focus to Search', async (_key, press) => {
      render(<Harness />)
      await userEvent.type(searchInput(), 'SO-26-005')
      await userEvent.tab()
      expect(clearSearch()).toHaveFocus()

      await userEvent.keyboard(press)
      expect(searchInput()).toHaveValue('')
      expect(searchInput()).toHaveFocus()
    })
  })
})
