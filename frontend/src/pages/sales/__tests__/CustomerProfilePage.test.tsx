import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import salesReducer from '@/store/slices/salesSlice'
import { salesApiSlice } from '@/store/api/salesApi'
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

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn((url: string) => {
      if (url.includes('/statistics')) {
        return Promise.resolve({
          data: {
            data: {
              orders: {
                totalOrders: 5,
                totalSales: 15000,
                averageOrderValue: 3000,
                firstOrderDate: '2025-06-01',
                lastOrderDate: '2026-01-15',
              },
            },
          },
        })
      }
      if (url.includes('/sales-history')) {
        return Promise.resolve({ data: { data: { orders: [] } } })
      }
      if (url.includes('/outstanding-invoices')) {
        return Promise.resolve({ data: { data: { invoices: [], totalOutstanding: 0 } } })
      }
      // Default: customer profile
      return Promise.resolve({ data: { data: mockCustomer } })
    }),
  },
}))

function makeStore() {
  return configureStore({
    reducer: {
      sales: salesReducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(salesApiSlice.middleware),
  })
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
