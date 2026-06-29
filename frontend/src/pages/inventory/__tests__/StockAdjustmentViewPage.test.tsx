import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, vi, expect } from 'vitest'

const { mockAdjustment } = vi.hoisted(() => ({
  mockAdjustment: {
    id: 'a1',
    adjustmentNumber: 'SA-000001',
    adjustmentDate: '2026-06-29',
    status: 'completed',
    itemCount: 1,
    totalValue: 10,
    notes: 'Test notes',
    items: [
      {
        id: 'i1',
        product: { id: 'p1', name: 'Widget' },
        difference: 2,
        unitCost: 5,
        totalValue: 10,
        stockBefore: 5,
        stockAfter: 7,
        liveStock: 7,
        isIncrease: true,
        isDecrease: false,
        absoluteDifference: 2,
      },
    ],
  },
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetStockAdjustmentQuery: vi.fn().mockReturnValue({ data: mockAdjustment, isLoading: false, isError: false }),
  useUpdateStockAdjustmentNotesMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

import StockAdjustmentViewPage from '../StockAdjustmentViewPage'

describe('StockAdjustmentViewPage', () => {
  it('shows historical Current Stock and Stock After for completed items', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/stock-adjustments/a1/view']}>
        <Routes>
          <Route path="/inventory/stock-adjustments/:id/view" element={<StockAdjustmentViewPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Widget')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})
