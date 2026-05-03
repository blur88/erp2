import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpenseContextHeader } from '../ExpenseContextHeader'

vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatDate: (value: string) => value, formatCurrency: (value: number) => `$${value}` }
})

const mockNavigateToJournalEntry = vi.fn()
const mockUseJournalEntryRef = vi.fn(() => ({
  journalEntryRef: null,
  journalEntryRefLoading: false,
  navigateToJournalEntry: mockNavigateToJournalEntry,
}))

vi.mock('@/hooks/useJournalEntryRef', () => ({
  useJournalEntryRef: (...args: unknown[]) => mockUseJournalEntryRef(...args),
}))

const draftExpense = {
  id: 'ex-1',
  referenceNumber: 'EXP-001',
  expenseDate: '2026-02-15',
  expenseAccountId: 'coa-1',
  expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
  amount: 225.5,
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
  vendor: 'Stationery Hub',
  description: 'Printer paper',
  status: 'draft' as const,
  createdAt: '2026-02-15',
  updatedAt: '2026-02-15',
}

const renderHeader = (props: Partial<ComponentProps<typeof ExpenseContextHeader>> = {}) =>
  render(
    <BrowserRouter>
      <ExpenseContextHeader
        selected={null}
        onEdit={vi.fn()}
        onPost={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </BrowserRouter>,
  )

describe('ExpenseContextHeader', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows placeholder when no expense selected', () => {
    renderHeader()
    expect(screen.getByText('Select an expense to view details')).toBeInTheDocument()
  })

  it('shows reference number and status chip', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('EXP-001')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  it('shows Edit, Post, Delete buttons for draft expenses', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Post')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('does not show action buttons for posted expenses', () => {
    renderHeader({ selected: { ...draftExpense, status: 'posted' as const } })
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Post')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('calls onEdit when Edit button clicked', () => {
    const onEdit = vi.fn()
    renderHeader({ selected: draftExpense, onEdit })
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onPost when Post button clicked', () => {
    const onPost = vi.fn()
    renderHeader({ selected: draftExpense, onPost })
    fireEvent.click(screen.getByText('Post'))
    expect(onPost).toHaveBeenCalledOnce()
  })

  it('calls onDelete when Delete button clicked', () => {
    const onDelete = vi.fn()
    renderHeader({ selected: draftExpense, onDelete })
    fireEvent.click(screen.getByText('Delete'))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('displays vendor, account, amount and payment method', () => {
    renderHeader({ selected: draftExpense })
    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getByText('Office Supplies')).toBeInTheDocument()
    expect(screen.getByText('$225.5')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('renders journal entry ref link for posted expense and fires navigate on click', () => {
    mockUseJournalEntryRef.mockReturnValueOnce({
      journalEntryRef: { referenceNumber: 'JE-042', sourceType: 'expense', sourceId: 'ex-1' },
      journalEntryRefLoading: false,
      navigateToJournalEntry: mockNavigateToJournalEntry,
    })
    const postedExpense = { ...draftExpense, status: 'posted' as const, journalEntryId: 'je-42' }
    renderHeader({ selected: postedExpense })
    const link = screen.getByText('JE-042')
    expect(link).toBeInTheDocument()
    fireEvent.click(link)
    expect(mockNavigateToJournalEntry).toHaveBeenCalledOnce()
  })
})
