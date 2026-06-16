import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { StockMovementType } from '@/types'

vi.mock('@/store/api/inventoryApi', async () => {
  const actual = await vi.importActual<typeof import('@/store/api/inventoryApi')>('@/store/api/inventoryApi')
  return {
    ...actual,
    useGetStockMovementsQuery: () => ({
      data: {
        data: [
          {
            id: 'm1',
            productId: 'p1',
            movementType: StockMovementType.PURCHASE_RECEIPT,
            movementDate: '2026-06-01',
            quantity: 10,
            previousBalance: 0,
            newBalance: 10,
            referenceType: 'purchase_order',
            referenceId: 'po-uuid',
            isInward: true,
            isOutward: false,
            description: 'Purchase',
            notes: 'first batch',
          },
        ],
        meta: { total: 1 },
      },
      isLoading: false,
      isFetching: false,
    }),
  }
})

import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { salesApiSlice } from '@/store/api/salesApi'
import { purchasingApiSlice } from '@/store/api/purchasingApi'

import StockMovementsTab from '../StockMovementsTab'

function renderTab() {
  const store = configureStore({
    reducer: {
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
      [purchasingApiSlice.reducerPath]: purchasingApiSlice.reducer,
    },
    middleware: (gdm) =>
      gdm().concat(inventoryApiSlice.middleware, salesApiSlice.middleware, purchasingApiSlice.middleware),
  })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <StockMovementsTab productId="p1" />
      </MemoryRouter>
    </Provider>,
  )
}

describe('StockMovementsTab', () => {
  it('renders a movement row with the consolidated label and notes', () => {
    renderTab()
    expect(screen.getByText('Purchase Receipt')).toBeInTheDocument()
    expect(screen.getByText('first batch')).toBeInTheDocument()
  })
})
