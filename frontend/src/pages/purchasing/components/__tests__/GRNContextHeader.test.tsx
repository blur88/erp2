import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import GRNContextHeader from '../GRNContextHeader'

const baseGRN = {
  id: 'grn-1',
  grnNumber: 'GRN-1001',
  status: 'received' as const,
  receivedDate: new Date('2026-04-10T00:00:00.000Z'),
  supplier: { id: 'sup-1', companyName: 'Acme Supplies' },
  purchaseOrder: { id: 'po-1', orderNumber: 'PO-1001' },
  items: [],
  totalQuantityReceived: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any

describe('GRNContextHeader', () => {
  it('shows empty state when no GRN selected', () => {
    render(
      <MemoryRouter>
        <GRNContextHeader
          selectedGRN={null}
          journalEntryRef={null}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Select a goods received note to view details')).toBeInTheDocument()
  })

  it('renders GRN number in header', () => {
    render(
      <MemoryRouter>
        <GRNContextHeader
          selectedGRN={baseGRN}
          journalEntryRef={null}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/GRN Details - GRN-1001/i)).toBeInTheDocument()
  })

  it('renders a labeled Print action button', () => {
    render(
      <MemoryRouter>
        <GRNContextHeader
          selectedGRN={baseGRN}
          journalEntryRef={null}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTitle('Print GRN')).toBeInTheDocument()
    expect(screen.getByText('Print')).toBeInTheDocument()
  })
})
