import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

const makeEntry = (overrides = {}) => ({
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test entry',
  status: JournalEntryStatus.DRAFT,
  totalDebits: 100,
  totalCredits: 100,
  isBalanced: true,
  sourceType: 'manual',
  sourceId: null,
  lines: [],
  ...overrides,
})

const listRef = createRef<HTMLDivElement>()

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    total: 0,
    selectedEntryId: null,
    focusedIndex: -1,
    onSelect: vi.fn(),
    listRef,
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText(/No Journal Entries found/i)).toBeInTheDocument()
  })

  it('renders entry reference number', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })

  it('does not render checkboxes', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('does not render source link, type chip, debits, credits, or status columns', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry({ sourceType: 'sales_order', sourceId: 'so-1' })]} total={1} />)
    expect(screen.queryByText('View Source')).not.toBeInTheDocument()
    expect(screen.queryByText('Sales Order')).not.toBeInTheDocument()
    expect(screen.queryByText('$100')).not.toBeInTheDocument()
  })
})
