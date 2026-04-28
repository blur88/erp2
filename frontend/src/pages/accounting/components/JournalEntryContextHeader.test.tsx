import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { JournalEntryContextHeader } from './JournalEntryContextHeader'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/EntityStatusChip', () => ({
  EntityStatusChip: ({ status }: any) => <span>{status}</span>,
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
  lines: [],
  ...overrides,
})

describe('JournalEntryContextHeader', () => {
  it('renders empty state when no entry is selected', () => {
    render(<JournalEntryContextHeader selectedEntry={null} onNavigateToSource={vi.fn()} />)
    expect(screen.getByText(/select a journal entry/i)).toBeInTheDocument()
  })

  it('renders reference number, date, description, debits, credits', () => {
    render(<JournalEntryContextHeader selectedEntry={makeEntry()} onNavigateToSource={vi.fn()} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
    expect(screen.getByText('2026-01-01')).toBeInTheDocument()
    expect(screen.getByText('Test entry')).toBeInTheDocument()
    expect(screen.getAllByText('$500').length).toBe(2)
  })

  it('renders status chip', () => {
    render(<JournalEntryContextHeader selectedEntry={makeEntry()} onNavigateToSource={vi.fn()} />)
    expect(screen.getByText(JournalEntryStatus.POSTED)).toBeInTheDocument()
  })

  it('does not render Edit, Post, Delete, or Reverse buttons', () => {
    render(<JournalEntryContextHeader selectedEntry={makeEntry()} onNavigateToSource={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^post$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/reverse/i)).not.toBeInTheDocument()
  })

  it('does not render source link for manual entries', () => {
    render(<JournalEntryContextHeader selectedEntry={makeEntry({ sourceType: 'manual', sourceId: null })} onNavigateToSource={vi.fn()} />)
    expect(screen.queryByText(/view/i)).not.toBeInTheDocument()
  })

  it('does not render source link when sourceId is missing', () => {
    render(<JournalEntryContextHeader selectedEntry={makeEntry({ sourceType: 'sales_order', sourceId: null })} onNavigateToSource={vi.fn()} />)
    expect(screen.queryByText(/view sales order/i)).not.toBeInTheDocument()
  })

  it('renders source link when sourceType and sourceId are present', () => {
    const onNavigateToSource = vi.fn()
    render(
      <JournalEntryContextHeader
        selectedEntry={makeEntry({ sourceType: 'sales_order', sourceId: 'so-1' })}
        onNavigateToSource={onNavigateToSource}
      />,
    )
    const link = screen.getByText(/view sales order/i)
    expect(link).toBeInTheDocument()
    fireEvent.click(link)
    expect(onNavigateToSource).toHaveBeenCalledWith('/sales/orders?highlight=so-1')
  })

  it('does not render source link for sourceType not in SOURCE_ROUTES', () => {
    render(
      <JournalEntryContextHeader
        selectedEntry={makeEntry({ sourceType: 'settlement', sourceId: 'x-1' })}
        onNavigateToSource={vi.fn()}
      />,
    )
    expect(screen.queryByText(/view/i)).not.toBeInTheDocument()
  })
})
