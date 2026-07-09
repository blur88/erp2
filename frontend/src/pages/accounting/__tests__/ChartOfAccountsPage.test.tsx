import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

import ChartOfAccountsPage from '../ChartOfAccountsPage'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockedApi = vi.hoisted(() => ({
  useGetChartOfAccountsHierarchyQuery: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => mockedApi)
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))

const dialogProps = vi.hoisted(() => ({ last: null as { open: boolean; parent?: { id: string; type: string } | null } | null }))
vi.mock('@/components/accounting/ChartOfAccountFormDialog', () => ({
  default: (props: { open: boolean; parent?: { id: string; type: string } | null }) => {
    dialogProps.last = props
    return props.open ? <div>Form Dialog</div> : null
  },
}))

const mockAccount = {
  id: 'a1',
  code: '1000',
  name: 'Cash',
  type: 'ASSET',
  isActive: true,
  fullCode: '1000',
  isParent: false,
  currentBalance: 0,
  isCashEquivalent: false,
  children: [],
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ChartOfAccountsPage />
    </MemoryRouter>,
  )
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetChartOfAccountsHierarchyQuery.mockReturnValue({
      data: [mockAccount],
      isLoading: false,
      isFetching: false,
      error: undefined,
    })
  })

  it('renders the list page with accounts', () => {
    renderPage()
    expect(screen.getByText('1000')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('navigates to the detail page on row click', async () => {
    renderPage()
    await userEvent.click(screen.getByText('1000'))
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/chart-of-accounts/a1')
  })

  it('shows subtitle with account count', () => {
    renderPage()
    expect(screen.getByText(/1 total/)).toBeInTheDocument()
  })

  it('opens the create dialog with no parent from the primary action', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /add account/i }))
    expect(dialogProps.last).toMatchObject({ open: true, parent: null })
  })

  it('opens the create dialog pre-set with the row account (id + type) from Add child', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /add child account/i }))
    expect(dialogProps.last?.open).toBe(true)
    expect(dialogProps.last?.parent).toMatchObject({ id: 'a1', type: 'ASSET' })
  })
})