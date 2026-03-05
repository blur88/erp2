import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import customerReducer from '@/store/slices/customerSlice'
import CustomerProfilePage from '../CustomerProfilePage'

const mockCustomer = vi.hoisted(() => ({
  id: 'test-uuid-1',
  name: 'Acme Corp',
  type: 'business',
  phone: '+1 234 567 890',
  isActive: true,
  totalOrders: 5,
  totalSales: 15000,
  averageOrderValue: 3000,
  lastPurchaseDate: '2026-01-15T00:00:00Z',
  firstPurchaseDate: '2025-06-01T00:00:00Z',
  notes: 'VIP customer',
  streetAddress: '123 Main St',
  city: 'New York',
  state: 'NY',
  postalCode: '10001',
  country: 'USA',
  priceList: null,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/services/salesApi', () => ({
  salesApi: {
    getCustomer: vi.fn().mockResolvedValue(mockCustomer),
    getCustomerStatistics: vi.fn().mockResolvedValue({
      orders: {
        totalOrders: 5,
        totalSales: 15000,
        averageOrderValue: 3000,
        firstOrderDate: '2025-06-01',
        lastOrderDate: '2026-01-15',
      },
    }),
    getCustomerSalesHistory: vi.fn().mockResolvedValue({ orders: [] }),
    getOutstandingInvoices: vi.fn().mockResolvedValue({ invoices: [], totalOutstanding: 0 }),
    deleteCustomer: vi.fn(),
  },
}))

function makeStore() {
  return configureStore({ reducer: { customers: customerReducer } })
}

function renderPage(customerId = 'test-uuid-1') {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[`/sales/customers/${customerId}`]}>
        <Routes>
          <Route path="/sales/customers/:id" element={<CustomerProfilePage />} />
          <Route path="/sales/customers" element={<div>Customers List</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerProfilePage', () => {
  it('renders customer name after loading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeTruthy()
    })
  })

  it('shows Overview tab by default', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Total Orders')).toBeTruthy()
    })
  })

  it('shows back button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Back to Customers/i)).toBeTruthy()
    })
  })
})
