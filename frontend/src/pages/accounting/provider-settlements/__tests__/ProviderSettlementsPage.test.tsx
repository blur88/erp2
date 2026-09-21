import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProviderSettlementsPage, { HEADERS } from '../ProviderSettlementsPage'

const mockList = vi.fn()

// The page calls useNotification() on every render. Without this mock it is
// undefined and destructuring throws before any assertion runs.
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetProviderSettlementsQuery: (...args: unknown[]) => mockList(...args),
  useDiscardProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  usePostProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  useReverseProviderSettlementMutation: () => [vi.fn(), { isLoading: false }],
  useGetPaymentMethodMappingsQuery: () => ({ data: [], isLoading: false }),
}))

function row(over: Partial<any> = {}) {
  return {
    id: 'ps-1', referenceNumber: 'PS-26-001', settlementDate: '2026-09-20',
    providerPaymentMethod: { id: 'pm-1', name: 'Atome' },
    providerReference: 'ATM-9911',
    clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
    bankAccount: { id: 'b1', code: '1200', name: 'CIMB' },
    settlementAmount: '98.0000', status: 'DRAFT', ...over,
  }
}

function renderPage(rows: any[]) {
  mockList.mockReturnValue({
    data: { data: rows, meta: { total: rows.length, page: 1, limit: 25 } },
    isLoading: false, isError: false,
  })
  return render(
    <MemoryRouter>
      <ProviderSettlementsPage />
    </MemoryRouter>,
  )
}

describe('ProviderSettlementsPage', () => {
  beforeEach(() => {
    mockList.mockReset()
    // useFilterBar reads and writes the REAL window.location, which jsdom keeps
    // across tests — a filter written by one test would otherwise mount the next.
    window.history.replaceState(null, '', '/')
  })

  it('declares the eight headers in order', () => {
    // EntityTable takes `headers` as a string[] alongside `columns`, so the
    // header text and the column order are two separate declarations that can
    // drift apart. Assert the constant, which is what the component is given.
    expect(HEADERS).toEqual([
      'Settlement Date', 'Provider', 'Provider Reference',
      'Provider Clearing Account', 'Bank Account', 'Settlement Amount',
      'Status', 'Actions',
    ])
  })

  it('renders a row with its provider and amount', () => {
    renderPage([row()])
    // referenceNumber is NOT a column — the eight headers above are the whole
    // rendered set. Assert on values the table actually shows.
    expect(screen.getByText('Atome')).toBeInTheDocument()
    expect(screen.getByText('ATM-9911')).toBeInTheDocument()
    expect(screen.getByTestId('settlement-amount')).toHaveTextContent('98.00')
  })

  // #1267: the page passes showHeader={false}, so EntityTable's
  // `{label} ({total})` line must not render in either state. `label` itself
  // stays — it is the required prop and the fallback for the empty message.
  it('shows no count label above an empty table, but keeps the empty state', () => {
    renderPage([])
    expect(screen.queryByText('Provider Settlements (0)')).not.toBeInTheDocument()
    expect(screen.getByText(/No provider settlements found/i)).toBeInTheDocument()
  })

  it('shows no count label above a populated table', () => {
    renderPage([row()])
    expect(screen.queryByText(/Provider Settlements \(\d+\)/)).not.toBeInTheDocument()
    expect(screen.getByText('Atome')).toBeInTheDocument()
  })

  it('offers edit, post and discard on a draft row', async () => {
    renderPage([row({ status: 'DRAFT' })])
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText('Edit')).toBeInTheDocument()
    expect(menu.getByText('Post')).toBeInTheDocument()
    expect(menu.getByText('Discard')).toBeInTheDocument()
    expect(menu.queryByText('Reverse')).not.toBeInTheDocument()
  })

  it('offers only reverse on a posted row', async () => {
    renderPage([row({ id: 'ps-2', status: 'POSTED' })])
    await userEvent.click(screen.getByRole('button', { name: /actions/i }))
    const menu = within(screen.getByRole('menu'))
    expect(menu.getByText('Reverse')).toBeInTheDocument()
    expect(menu.queryByText('Edit')).not.toBeInTheDocument()
    expect(menu.queryByText('Discard')).not.toBeInTheDocument()
  })

  it('passes the status filter into the query once chosen', async () => {
    renderPage([row()])
    // The real FilterBar (not mocked here) has no global Apply button:
    // onQuickFilterChange promotes a select's draft value to applied state
    // immediately, so the query re-runs as soon as the option is clicked.
    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(screen.getByRole('option', { name: 'Posted' }))

    // One argument: the component calls useGetProviderSettlementsQuery(params)
    // with no options object. Asserting a second arg fails on the real call.
    await waitFor(() => {
      expect(mockList).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'POSTED' }),
      )
    })
  })
})
