import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockCreateAccount, mockUpdateAccount, mockTree } = vi.hoisted(() => ({
  mockTree: [
    {
      id: 'asset-1',
      code: '1000',
      name: 'Assets',
      type: 'Asset' as const,
      parentId: null,
      description: null,
      isActive: true,
      createdBy: null,
      isSystem: false,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      children: [
        {
          id: 'cash-1',
          code: '1100',
          name: 'Cash on Hand',
          type: 'Asset' as const,
          parentId: 'asset-1',
          description: null,
          isActive: true,
          createdBy: null,
          isSystem: false,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          children: [],
        },
      ],
    },
    {
      id: 'expense-1',
      code: '5000',
      name: 'Expenses',
      type: 'Expense' as const,
      parentId: null,
      description: null,
      isActive: true,
      createdBy: null,
      isSystem: false,
      isPostable: false,
      openingBalance: '0.0000',
      createdAt: '',
      updatedAt: '',
      children: [
        {
          id: 'rent-1',
          code: '6100',
          name: 'Rent',
          type: 'Expense' as const,
          parentId: 'expense-1',
          description: null,
          isActive: true,
          createdBy: null,
          isSystem: false,
          isPostable: true,
          openingBalance: '0.0000',
          createdAt: '',
          updatedAt: '',
          children: [],
        },
      ],
    },
  ],
  mockCreateAccount: vi.fn(() => ({
    unwrap: () => Promise.resolve(undefined),
  })),
  mockUpdateAccount: vi.fn(() => ({
    unwrap: () => Promise.resolve(undefined),
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useCreateAccountMutation: vi
    .fn()
    .mockReturnValue([mockCreateAccount, { isLoading: false }]),
  useUpdateAccountMutation: vi
    .fn()
    .mockReturnValue([mockUpdateAccount, { isLoading: false }]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showError: vi.fn() }),
}))

import AccountFormDialog from '../AccountFormDialog'

function renderDialog(props: {
  open: boolean
  account?: any
  parent?: any
  onClose: () => void
  onSuccess: () => void
}) {
  const store = configureStore({
    reducer: { auth: (s = { user: { role: 'admin' }, isAuthenticated: true }) => s } as any,
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <AccountFormDialog {...props} tree={mockTree} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('AccountFormDialog', () => {
  beforeEach(() => {
    mockCreateAccount.mockClear()
    mockUpdateAccount.mockClear()
  })

  it('no longer renders an opening balance field', () => {
    renderDialog({ open: true, onClose: vi.fn(), onSuccess: vi.fn() })
    expect(screen.queryByLabelText(/Opening Balance/)).not.toBeInTheDocument()
  })

  it('omits openingBalance from the create payload', async () => {
    renderDialog({ open: true, onClose: vi.fn(), onSuccess: vi.fn() })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Code'), '6100')
    await user.type(screen.getByLabelText('Name'), 'Rent')
    await user.click(screen.getByLabelText('Type'))
    await user.click(screen.getByRole('option', { name: 'Expense' }))
    await user.click(screen.getByRole('button', { name: /Create Account/ }))

    await waitFor(() => {
      expect(mockCreateAccount).toHaveBeenCalledWith(
        expect.not.objectContaining({ openingBalance: expect.anything() }),
      )
    })
  })
})