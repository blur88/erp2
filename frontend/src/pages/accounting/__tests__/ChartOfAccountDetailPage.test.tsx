import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import ChartOfAccountDetailPage from '../ChartOfAccountDetailPage'
import { AccountType } from '@/types'

const mockAccount = {
  id: 'a1',
  code: '1000',
  name: 'Cash',
  type: AccountType.ASSET,
  fullCode: '1000',
  isActive: true,
  isCashEquivalent: true,
  isParent: false,
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  parent: null,
}

let mockQueryResult: any = { data: mockAccount, isLoading: false }
let mockRecentActivityResult: any = { data: [], isLoading: false, isError: false }

vi.mock('@/store/api/accountingApi', () => ({
  useGetChartOfAccountQuery: vi.fn(() => mockQueryResult),
  useGetChartOfAccountRecentActivityQuery: vi.fn(() => mockRecentActivityResult),
}))

vi.mock('@/components/accounting/ChartOfAccountFormDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div>Form Dialog</div> : null),
}))

function renderPage(id = 'a1') {
  return render(
    <MemoryRouter initialEntries={[`/accounting/chart-of-accounts/${id}`]}>
      <Routes>
        <Route path="/accounting/chart-of-accounts/:id" element={<ChartOfAccountDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ChartOfAccountDetailPage', () => {
  beforeEach(() => {
    mockQueryResult = { data: mockAccount, isLoading: false }
    mockRecentActivityResult = { data: [], isLoading: false, isError: false }
  })

  it('renders Overview and Journal Entries tabs', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /journal entries/i })).toBeInTheDocument()
  })

  it('renders account code and name in header', () => {
    renderPage()
    expect(screen.getByText('1000 — Cash')).toBeInTheDocument()
  })

  it('renders edit button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument()
  })

  it('shows account details in overview tab', () => {
    renderPage()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText(AccountType.ASSET)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows empty journal entries message on Journal Entries tab', () => {
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /journal entries/i }))
    expect(screen.getByText('No posted journal entries for this account.')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockQueryResult = { data: null, isLoading: true }
    const { container } = renderPage()
    expect(container.innerHTML).toBe('')
  })
})