import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/EntityTable', () => ({
  default: ({ rows, loading, label, onSelect, focusedIndex }: any) => (
    <div>
      {loading && <div>Loading...</div>}
      {rows.length === 0 && <div>No {label} found</div>}
      {rows.map((row: any, index: number) => (
        <div
          key={row.id}
          onClick={() => onSelect(row)}
          data-testid={`row-${row.id}`}
          data-focused={index === focusedIndex ? 'true' : 'false'}
        >
          {row.referenceNumber}
        </div>
      ))}
    </div>
  ),
}))

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.DRAFT,
  totalDebits: 100,
  totalCredits: 100,
  sourceType: 'manual',
  sourceId: null,
  lines: [],
  ...overrides,
})

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    total: 0,
    selectedEntryId: null,
    onSelect: vi.fn(),
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText('No Journal Entries found')).toBeInTheDocument()
  })

  it('renders entry rows', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('passes focusedIndex to EntityTable', () => {
    render(
      <JournalEntriesTable
        {...defaultProps}
        entries={[makeEntry()]}
        focusedIndex={0}
      />,
    )

    expect(screen.getByTestId('row-1')).toHaveAttribute('data-focused', 'true')
  })
})
