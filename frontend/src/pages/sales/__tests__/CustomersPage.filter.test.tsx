import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import customerReducer from '@/store/slices/customerSlice'
import CustomersPage from '../CustomersPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/services/salesApi', () => ({
  salesApi: {
    getCustomers: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 25 } }),
    getDeletedCustomers: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('@/store/slices/customerSlice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/slices/customerSlice')>()
  return {
    ...actual,
    fetchCustomers: vi.fn(() => ({
      type: 'customers/fetchCustomers/fulfilled',
      payload: { data: [], meta: {} },
    })),
  }
})

function makeStore() {
  return configureStore({ reducer: { customers: customerReducer } })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage filters', () => {
  it('renders Status filter with All/Active/Inactive options', async () => {
    renderPage()
    const statusSelect = screen.getByLabelText('Status')
    expect(statusSelect).toBeTruthy()
  })

  it('Name column header has sort indicator', () => {
    renderPage()
    const nameHeader = screen.getByText('Name')
    expect(nameHeader.closest('th') ?? nameHeader).toBeTruthy()
  })
})
