import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { JournalEntriesTable } from './JournalEntriesTable'
import { JournalEntryStatus } from '@/types'

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value}`,
  formatDate: (date: string) => date,
}))

vi.mock('@/components/common/AppButton', () => ({
  AppButton: ({ onClick, children, startIcon }: any) => <button onClick={onClick}>{children}{startIcon}</button>,
}))

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
  ...overrides,
})

describe('JournalEntriesTable', () => {
  const defaultProps = {
    entries: [],
    loading: false,
    total: 0,
    selectedEntryId: null,
    selectedIds: new Set<string>(),
    onSelect: vi.fn(),
    onToggleCheck: vi.fn(),
    onSelectAll: vi.fn(),
    onPost: vi.fn(),
    onDelete: vi.fn(),
  }

  it('shows empty state when no entries', () => {
    render(<JournalEntriesTable {...defaultProps} />)
    expect(screen.getByText('No journal entries found')).toBeInTheDocument()
  })

  it('renders entry rows', () => {
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} />)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('calls onSelect when row is clicked', () => {
    const onSelect = vi.fn()
    render(<JournalEntriesTable {...defaultProps} entries={[makeEntry()]} total={1} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('JE-001'))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }))
  })
})
