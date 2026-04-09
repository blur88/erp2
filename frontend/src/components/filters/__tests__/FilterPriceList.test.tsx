import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import type { ReactElement } from 'react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { FilterPriceList } from '../FilterPriceList'

const { useGetPriceListsQuery } = vi.hoisted(() => ({
  useGetPriceListsQuery: vi.fn(() => ({
    data: {
      data: [
        { id: 'pl1', name: 'Retail' },
        { id: 'pl2', name: 'Wholesale' },
      ],
    },
  })),
}))

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery,
}))

function renderWithStore(ui: ReactElement) {
  const store = configureStore({ reducer: {} })
  return render(<Provider store={store}>{ui}</Provider>)
}

describe('FilterPriceList', () => {
  it('renders with Price List label', () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    expect(screen.getByLabelText(/price list/i)).toBeInTheDocument()
  })

  it('shows price list names as options', async () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('Retail')).toBeInTheDocument()
    expect(await screen.findByText('Wholesale')).toBeInTheDocument()
  })

  it('queries only active price lists', () => {
    renderWithStore(<FilterPriceList field="priceListId" value={null} onChange={vi.fn()} />)
    expect(useGetPriceListsQuery).toHaveBeenCalledWith({ page: 1, limit: 200, isActive: true })
  })
})
