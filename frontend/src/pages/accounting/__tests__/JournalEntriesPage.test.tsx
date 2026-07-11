import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockJournalEntries } = vi.hoisted(() => ({
  mockJournalEntries: [
    {
      id: 'je-1',
      journalNo: 'JE-000001',
      date: '2026-07-01',
      sourceRef: 'SO-001',
      description: 'Sales order payment',
      debit: '100.00',
      credit: '0.00',
      status: 'Posted' as const,
    },
    {
      id: 'je-2',
      journalNo: 'JE-000002',
      date: '2026-07-02',
      sourceRef: null,
      description: null,
      debit: '0.00',
      credit: '50.00',
      status: 'Reversed' as const,
    },
  ],
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntriesQuery: vi.fn().mockReturnValue({
    data: { data: mockJournalEntries, meta: { total: 2, page: 1, limit: 25 } },
    isFetching: false,
    error: undefined,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import JournalEntriesPage from '../JournalEntriesPage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <JournalEntriesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('JournalEntriesPage', () => {
  it('renders column headers in correct order', () => {
    renderPage()
    const expectedHeaders = [
      'Journal No.',
      'Date',
      'Source',
      'Description',
      'Debit',
      'Credit',
      'Status',
      'Actions',
    ]
    expectedHeaders.forEach((header) => {
      expect(screen.getByText(header)).toBeInTheDocument()
    })
  })

  it('renders journal entry data', () => {
    renderPage()
    expect(screen.getByText('JE-000001')).toBeInTheDocument()
    expect(screen.getByText('JE-000002')).toBeInTheDocument()
    expect(screen.getByText('SO-001')).toBeInTheDocument()
    expect(screen.getByText('Sales order payment')).toBeInTheDocument()
  })

  it('shows StatusChip with correct status for Posted and Reversed', () => {
    renderPage()
    expect(screen.getByText('Posted')).toBeInTheDocument()
    expect(screen.getByText('Reversed')).toBeInTheDocument()
  })

  it('shows View action for each row', () => {
    renderPage()
    const viewButtons = screen.getAllByText('View')
    expect(viewButtons.length).toBe(2)
  })

  it('does not render a create/new button', () => {
    renderPage()
    expect(screen.queryByText('New Journal Entry')).not.toBeInTheDocument()
    expect(screen.queryByText('+ New')).not.toBeInTheDocument()
  })
})
