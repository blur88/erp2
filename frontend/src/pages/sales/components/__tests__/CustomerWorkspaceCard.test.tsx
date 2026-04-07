import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import CustomerWorkspaceCard from '../CustomerWorkspaceCard'
import { CustomerType } from '@/types'

const mockedApi = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: mockedApi,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

describe('CustomerWorkspaceCard', () => {
  beforeEach(() => {
    mockedApi.get.mockReset()
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/sales-history')) {
        return Promise.resolve({ data: { orders: [] } })
      }

      return Promise.resolve({
        data: {
          data: {
            invoices: [],
            totalOutstanding: 0,
          },
        },
      })
    })
  })

  it('renders only the orders and invoices tabs and lazy-loads each tab once', async () => {
    render(
      <CustomerWorkspaceCard
        selectedCustomer={{
          id: 'customer-1',
          type: CustomerType.BUSINESS,
          name: 'Acme Supplies',
          isActive: true,
          totalSales: 0,
          totalOrders: 0,
          averageOrderValue: 0,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        }}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /invoices/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /overview/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
    expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/sales-history')
    expect(mockedApi.get).not.toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')

    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')
    })

    fireEvent.click(screen.getByRole('tab', { name: /orders/i }))
    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    expect(
      mockedApi.get.mock.calls.filter(
        ([url]) => url === '/customers/customer-1/outstanding-invoices',
      ),
    ).toHaveLength(1)
  })
})
