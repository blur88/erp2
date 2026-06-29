import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import StockAdjustmentList from '../StockAdjustmentList'

const rows = [
  { id: 'a1', adjustmentNumber: 'SA-000001', adjustmentDate: '2026-06-29', status: 'draft', itemCount: 2, totalValue: 100 },
  { id: 'a2', adjustmentNumber: 'SA-000002', adjustmentDate: '2026-06-28', status: 'completed', itemCount: 1, totalValue: 50 },
]

it('renders adjustment numbers and status chips', () => {
  render(<MemoryRouter><StockAdjustmentList rows={rows as any} total={2} loading={false} paginationSlot={null} /></MemoryRouter>)
  expect(screen.getByText('SA-000001')).toBeInTheDocument()
  expect(screen.getByText('SA-000002')).toBeInTheDocument()
})
