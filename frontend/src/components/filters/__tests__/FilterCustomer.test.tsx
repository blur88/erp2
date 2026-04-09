import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterCustomer } from '../FilterCustomer'

const { useGetCustomersQuery } = vi.hoisted(() => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: {
      data: [
        { id: 'c1', name: 'Amuro Ray' },
        { id: 'c2', name: 'Char Aznable' },
      ],
    },
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery,
}))

function renderWithStore(ui: ReactElement) {
  const store = configureStore({ reducer: {} })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('FilterCustomer', () => {
  it('renders with Customer label', () => {
    renderWithStore(<FilterCustomer field="customerId" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/customer/i)).toBeInTheDocument()
  })

  it('shows customer names as options', async () => {
    renderWithStore(<FilterCustomer field="customerId" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Amuro Ray')).toBeInTheDocument()
    expect(await screen.findByText('Char Aznable')).toBeInTheDocument()
  })

  it('requests customers without a limit override', () => {
    renderWithStore(<FilterCustomer field="customerId" value={null} onChange={vi.fn()} />)
    expect(useGetCustomersQuery).toHaveBeenCalledWith({})
  })
})
