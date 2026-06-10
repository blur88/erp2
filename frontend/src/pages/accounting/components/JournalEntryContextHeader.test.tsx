import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import { JournalEntryContextHeader } from './JournalEntryContextHeader'
import { JournalEntryStatus } from '@/types'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useLazyGetVendorPaymentQuery: () => [
    vi.fn(() => ({ unwrap: () => Promise.resolve({ purchaseOrder: { orderNumber: 'PO-1' } }) })),
  ],
}))

vi.mock('@/components/common/StatusChip', () => ({
  StatusChip: ({ status }: any) => <span>{status}</span>,
}))

vi.mock('@/components/common/EntityContextHeaderBar', () => ({
  EntityContextHeaderBar: ({ title, statusChip }: any) => (
    <div>
      <span>{title}</span>
      {statusChip}
    </div>
  ),
}))

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.POSTED,
  totalDebits: 500,
  totalCredits: 500,
  sourceType: 'manual',
  sourceId: null,
  sourceRefNumber: undefined,
  lines: [],
  ...overrides,
})

const renderHeader = (entry: any) =>
  render(
    <MemoryRouter>
      <JournalEntryContextHeader selectedEntry={entry} />
    </MemoryRouter>,
  )

describe('JournalEntryContextHeader', () => {
  it('renders empty state when no entry is selected', () => {
    renderHeader(null)
    expect(screen.getByText(/select a journal entry/i)).toBeInTheDocument()
  })

  it('renders title with reference number', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('Journal Entry Details - JE-001')).toBeInTheDocument()
  })

  it('renders left column section title', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('Entry Information')).toBeInTheDocument()
  })

  it('renders right column section title', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('References & Amounts')).toBeInTheDocument()
  })

  it('renders date and description in left column', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('2026-01-01')).toBeInTheDocument()
    expect(screen.getByText('Test entry')).toBeInTheDocument()
  })

  it('renders Entry Type row in left column', () => {
    renderHeader(makeEntry({ sourceType: 'sales_order' }))
    expect(screen.getByText('Entry Type')).toBeInTheDocument()
    expect(screen.getAllByText('Sales Order').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Manual Entry in Entry Type row for manual entries', () => {
    renderHeader(makeEntry())
    expect(screen.getByText('Entry Type')).toBeInTheDocument()
    expect(screen.getAllByText('Manual Entry').length).toBeGreaterThanOrEqual(1)
  })

  it('renders debits and credits in right column', () => {
    renderHeader(makeEntry())
    expect(screen.getAllByText('$500').length).toBe(2)
  })

  it('renders status chip', () => {
    renderHeader(makeEntry())
    expect(screen.getByText(JournalEntryStatus.POSTED)).toBeInTheDocument()
  })

  it('renders entry type chip in header bar', () => {
    renderHeader(makeEntry({ sourceType: 'sales_order' }))
    expect(screen.getAllByText('Sales Order').length).toBeGreaterThanOrEqual(1)
  })

  it('does not render source row for manual entries', () => {
    renderHeader(makeEntry({ sourceType: 'manual', sourceId: null }))
    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })

  it('does not render source row when sourceId is missing', () => {
    renderHeader(makeEntry({ sourceType: 'sales_order', sourceId: null }))
    expect(screen.queryByText('Source')).not.toBeInTheDocument()
  })

  it('renders clickable sourceRefNumber when present', () => {
    const { container } = renderHeader(
      makeEntry({ sourceType: 'sales_order', sourceId: 'so-1', sourceRefNumber: 'SO-0042' }),
    )
    expect(screen.getByText('SO-0042')).toBeInTheDocument()
    const btn = container.querySelector('button')
    expect(btn).toBeTruthy()
  })

  it('navigates to source on button click', () => {
    mockNavigate.mockClear()
    renderHeader(
      makeEntry({ sourceType: 'purchase_order', sourceId: 'po-1', sourceRefNumber: 'PO-0007' }),
    )
    fireEvent.click(screen.getByText('PO-0007'))
    // PO redesign routes to the detail page by order number, not the old highlight query.
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-0007/view')
  })

  it('does not render Edit, Post, Delete, or Reverse buttons', () => {
    renderHeader(makeEntry())
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^post$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reverse/i)).not.toBeInTheDocument()
  })
})
