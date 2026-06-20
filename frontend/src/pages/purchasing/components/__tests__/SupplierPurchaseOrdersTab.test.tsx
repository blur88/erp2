import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import SupplierPurchaseOrdersTab from '../SupplierPurchaseOrdersTab'

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }))

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return { ...actual, useGetSupplierPurchaseOrdersQuery: mockQuery }
})

function renderTab(supplierId: string) {
  const store = configureStore({ reducer: { p: (s = {}) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter><SupplierPurchaseOrdersTab supplierId={supplierId} /></MemoryRouter>
    </Provider>,
  )
}

describe('SupplierPurchaseOrdersTab', () => {
  it('passes supplierId, page and limit to the query', () => {
    mockQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('sup-1')
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 'sup-1', page: 1, limit: expect.any(Number) }),
    )
  })

  it('renders rows and the footer total', () => {
    mockQuery.mockReturnValue({
      data: { data: [{ id: 'po1', orderNumber: 'PO-001', orderDate: '2026-01-01', status: 'pending', totalAmount: 500 }], meta: { total: 73 } },
      isLoading: false,
    })
    renderTab('sup-1')
    expect(screen.getByText('PO-001')).toBeInTheDocument()
    expect(screen.getByText(/of 73 records/)).toBeInTheDocument()
  })

  it('shows empty state', () => {
    mockQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('sup-1')
    expect(screen.getByText(/No purchase orders yet/)).toBeInTheDocument()
  })
})
