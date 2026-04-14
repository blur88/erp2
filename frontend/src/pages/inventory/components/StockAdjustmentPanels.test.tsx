import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import StockAdjustmentContextHeader from './StockAdjustmentContextHeader'
import StockAdjustmentWorkspaceCard from './StockAdjustmentWorkspaceCard'

import type { StockAdjustment } from '@/types'

const makeAdjustment = (overrides: Partial<StockAdjustment> = {}): StockAdjustment => ({
  id: 'adj-1',
  adjustmentNumber: 'SA-001',
  adjustmentDate: new Date('2026-03-01T00:00:00.000Z'),
  status: 'completed',
  notes: 'Cycle count variance',
  itemCount: 2,
  totalValue: 125.5,
  items: [
    {
      id: 'item-1',
      product: { id: 'prod-1', name: 'Widget A' },
      oldQuantity: 10,
      newQuantity: 13,
      difference: 3,
      totalValue: 37.5,
      isIncrease: true,
      isDecrease: false,
      absoluteDifference: 3,
    },
  ],
  createdAt: new Date('2026-03-02T00:00:00.000Z'),
  updatedAt: new Date('2026-03-03T00:00:00.000Z'),
  ...overrides,
})

describe('Stock adjustment detail panels', () => {
  it('renders the context header as an info grid with confirmation actions and journal entry link', () => {
    const onNavigateToJournalEntry = vi.fn()

    render(
      <StockAdjustmentContextHeader
        selectedAdjustment={makeAdjustment()}
        journalEntryRef={{ id: 'je-1', referenceNumber: 'JE-001' }}
        journalEntryRefLoading={false}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onComplete={vi.fn()}
        onRevert={vi.fn()}
        onNavigateToJournalEntry={onNavigateToJournalEntry}
      />,
    )

    expect(screen.getByText('SA Information')).toBeInTheDocument()
    expect(screen.getByText('SA Confirmation')).toBeInTheDocument()
    expect(screen.getByText('Total Value')).toBeInTheDocument()
    expect(screen.getByText('RM 125.50')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Revert to Draft' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'JE-001' }))
    expect(onNavigateToJournalEntry).toHaveBeenCalledTimes(1)
  })

  it('renders the workspace card with items first and notes only when present', () => {
    const { rerender } = render(<StockAdjustmentWorkspaceCard selectedAdjustment={makeAdjustment()} />)

    expect(screen.getByText('SA Items')).toBeInTheDocument()
    expect(screen.queryByText('SA Information')).not.toBeInTheDocument()
    expect(screen.queryByText('SA Confirmation')).not.toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('Cycle count variance')).toBeInTheDocument()

    const row = screen.getByText('Widget A').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row as HTMLTableRowElement).getByText('+3')).toBeInTheDocument()

    rerender(<StockAdjustmentWorkspaceCard selectedAdjustment={makeAdjustment({ notes: '' })} />)

    expect(screen.queryByText('Notes')).not.toBeInTheDocument()
    expect(screen.queryByText('Cycle count variance')).not.toBeInTheDocument()
  })
})
