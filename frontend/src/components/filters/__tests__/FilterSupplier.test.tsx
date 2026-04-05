import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterSupplier } from '../FilterSupplier'

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: vi.fn(() => ({
    data: {
      data: [
        { id: 's1', companyName: 'Anaheim Electronics' },
        { id: 's2', companyName: 'Zeonic' },
      ],
    },
  })),
}))

function renderWithStore(ui: ReactElement) {
  const store = configureStore({ reducer: {} })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('FilterSupplier', () => {
  it('renders with Supplier label', () => {
    renderWithStore(<FilterSupplier value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument()
  })

  it('shows supplier names as options', async () => {
    renderWithStore(<FilterSupplier value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Anaheim Electronics')).toBeInTheDocument()
    expect(await screen.findByText('Zeonic')).toBeInTheDocument()
  })
})
