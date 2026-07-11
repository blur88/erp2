import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, vi, expect } from 'vitest'

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

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
  useRevertStockAdjustmentMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import StockAdjustmentViewPage from '../StockAdjustmentViewPage'

describe('StockAdjustmentViewPage', () => {
  it('labels the historical column "Stock Before" and shows stockBefore/stockAfter for completed items', () => {
    render(
      <MemoryRouter initialEntries={['/inventory/stock-adjustments/a1/view']}>
        <Routes>
          <Route path="/inventory/stock-adjustments/:id/view" element={<StockAdjustmentViewPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Widget')).toBeInTheDocument()
    // completed view relabels "Current Stock" -> "Stock Before" so the historical
    // snapshot (stockBefore) is not mistaken for live stock (issue #873 follow-up)
    expect(screen.getByText('Stock Before')).toBeInTheDocument()
    expect(screen.queryByText('Current Stock')).not.toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
  })

  it('navigates to edit with ?from=view when editing a draft from the view page (#877)', async () => {
    const original = mockAdjustment.status
    mockAdjustment.status = 'draft'
    mockNavigate.mockClear()
    try {
      render(
        <MemoryRouter initialEntries={['/inventory/stock-adjustments/a1/view']}>
          <Routes>
            <Route path="/inventory/stock-adjustments/:id/view" element={<StockAdjustmentViewPage />} />
          </Routes>
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/stock-adjustments/a1/edit?from=view')
    } finally {
      mockAdjustment.status = original
    }
  })

  it('labels the column "Current Stock" and shows liveStock for a draft', () => {
    const original = mockAdjustment.status
    mockAdjustment.status = 'draft'
    try {
      render(
        <MemoryRouter initialEntries={['/inventory/stock-adjustments/a1/view']}>
          <Routes>
            <Route path="/inventory/stock-adjustments/:id/view" element={<StockAdjustmentViewPage />} />
          </Routes>
        </MemoryRouter>,
      )
      // draft view keeps live-stock semantics: header "Current Stock", value = liveStock (7)
      expect(screen.getByText('Current Stock')).toBeInTheDocument()
      expect(screen.queryByText('Stock Before')).not.toBeInTheDocument()
      expect(screen.getByText('7')).toBeInTheDocument()
    } finally {
      mockAdjustment.status = original
    }
  })
})
