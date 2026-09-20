import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockDetail = vi.fn()

vi.mock('@/store/api/accountingApi', () => ({
  useGetProviderSettlementQuery: (...args: unknown[]) => mockDetail(...args),
}))

import ProviderSettlementDetailPage from '../ProviderSettlementDetailPage'

const settlement = {
  id: 'ps-1',
  referenceNumber: 'PS-26-001',
  settlementDate: '2026-09-20',
  providerPaymentMethodId: 'pm-1',
  providerPaymentMethod: { id: 'pm-1', name: 'Atome' },
  clearingAccountId: 'c1',
  clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
  bankAccountId: 'b1',
  bankAccount: { id: 'b1', code: '1200', name: 'CIMB' },
  providerReference: 'ATM-9911',
  settlementAmount: '98.0000',
  status: 'POSTED',
  journalEntryId: 'je-1',
  reversalJournalEntryId: null,
  postedAt: '2026-09-20T10:00:00Z',
  postedBy: 'user-1',
  reversedAt: null,
  reversedBy: null,
  lines: [],
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accounting/provider-settlements/ps-1/view']}>
      <Routes>
        <Route
          path="/accounting/provider-settlements/:id/view"
          element={<ProviderSettlementDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ProviderSettlementDetailPage', () => {
  beforeEach(() => mockDetail.mockReset())

  it('requests the settlement named by the route', () => {
    mockDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderPage()

    expect(mockDetail).toHaveBeenCalledWith('ps-1', { skip: false })
  })

  it('shows a loading state before the record arrives', () => {
    mockDetail.mockReturnValue({ data: undefined, isLoading: true, isError: false })
    renderPage()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows an error state when the record cannot be loaded', () => {
    mockDetail.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()

    expect(screen.getByText(/not found/i)).toBeInTheDocument()
  })

  it('renders the detail view once the record arrives', () => {
    mockDetail.mockReturnValue({ data: settlement, isLoading: false, isError: false })
    renderPage()

    expect(screen.getByText('PS-26-001')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^journal entry$/i })).toHaveAttribute(
      'href',
      '/accounting/journal-entries/je-1',
    )
  })
})
