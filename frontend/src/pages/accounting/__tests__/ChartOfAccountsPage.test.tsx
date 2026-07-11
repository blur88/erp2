import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockTree, mockUpdateAccount } = vi.hoisted(() => ({
  mockTree: [
    {
      id: 'asset-group',
      code: '1000',
      name: 'Current Assets',
      type: 'Asset' as const,
      parentId: null,
      description: null,
      isActive: true,
      isSystem: false,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      balance: '5000.0000',
      children: [
        {
          id: 'cash',
          code: '1100',
          name: 'Cash',
          type: 'Asset' as const,
          parentId: 'asset-group',
          description: null,
          isActive: true,
          isSystem: false,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          balance: '5000.0000',
          children: [],
        },
        {
          id: 'bank',
          code: '1200',
          name: 'Bank Account',
          type: 'Asset' as const,
          parentId: 'asset-group',
          description: null,
          isActive: true,
          isSystem: false,
          isPostable: true,
          openingBalance: '1000.0000',
          createdAt: '',
          updatedAt: '',
          balance: '1000.0000',
          children: [],
        },
      ],
    },
    {
      id: 'equity-group',
      code: '3000',
      name: 'Equity',
      type: 'Equity' as const,
      parentId: null,
      description: null,
      isActive: true,
      isSystem: true,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      balance: '0.0000',
      children: [
        {
          id: 'obe',
          code: '3100',
          name: 'Opening Balance Equity',
          type: 'Equity' as const,
          parentId: 'equity-group',
          description: null,
          isActive: true,
          isSystem: true,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          balance: '0.0000',
          children: [],
        },
      ],
    },
  ],
  mockUpdateAccount: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountTreeQuery: vi.fn().mockReturnValue({ data: mockTree, isFetching: false, error: undefined }),
  useCreateAccountMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateAccountMutation: vi.fn().mockReturnValue([mockUpdateAccount, { isLoading: false }]),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import ChartOfAccountsPage from '../ChartOfAccountsPage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <ChartOfAccountsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('ChartOfAccountsPage', () => {
  it('renders the tree with hierarchical indentation', () => {
    renderPage()
    expect(screen.getByText('Current Assets')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('Bank Account')).toBeInTheDocument()
    expect(screen.getAllByText('Equity').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Opening Balance Equity')).toBeInTheDocument()
  })

  it('group row shows only "Add Child Account" in row actions', async () => {
    renderPage()
    const user = userEvent.setup()
    const groupRow = screen.getByText('Current Assets').closest('tr')!
    const menuButton = groupRow.querySelector('button[aria-label="row actions"]')!
    await user.click(menuButton)
    expect(screen.getByText('Add Child Account')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Set Inactive')).not.toBeInTheDocument()
  })

  it('leaf row shows Edit + Set Inactive actions', async () => {
    renderPage()
    const user = userEvent.setup()
    const leafRow = screen.getByText('Cash').closest('tr')!
    const menuButton = leafRow.querySelector('button[aria-label="row actions"]')!
    await user.click(menuButton)
    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Set Inactive')).toBeInTheDocument()
  })

  it('no Delete or View action appears in any row menu', async () => {
    renderPage()
    const user = userEvent.setup()
    const leafRow = screen.getByText('Cash').closest('tr')!
    await user.click(leafRow.querySelector('button[aria-label="row actions"]')!)
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByText('View')).not.toBeInTheDocument()
  })
})
