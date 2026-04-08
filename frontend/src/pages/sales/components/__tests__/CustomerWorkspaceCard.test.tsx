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

const mockUseGetCustomerPaymentsQuery = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomerPaymentsQuery: mockUseGetCustomerPaymentsQuery,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

const mockCustomer = {
  id: 'customer-1',
  type: CustomerType.BUSINESS,
  name: 'Acme Supplies',
  isActive: true,
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('CustomerWorkspaceCard', () => {
  beforeEach(() => {
    mockedApi.get.mockReset()
    mockUseGetCustomerPaymentsQuery.mockReset()

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

    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('renders Orders, Invoices, and Payments tabs', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /invoices/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('lazy-loads orders on initial render and invoices only when tab clicked', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/sales-history')
    })

    expect(mockedApi.get).not.toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')

    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')
    })

    fireEvent.click(screen.getByRole('tab', { name: /orders/i }))
    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    expect(
      mockedApi.get.mock.calls.filter(([url]) => url === '/customers/customer-1/outstanding-invoices'),
    ).toHaveLength(1)
  })

  it('does not fetch payments until Payments tab is clicked', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    })

    expect(mockUseGetCustomerPaymentsQuery).toHaveBeenCalledWith('customer-1', { skip: true })

    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: [], isLoading: false })

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('No payments found.')).toBeInTheDocument()
    })
  })

  it('renders payment rows when payments data is available', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: '2026-01-15',
          status: 'completed',
          amount: 1500,
        },
      ],
      isLoading: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('PAY-001')).toBeInTheDocument()
    })

    expect(screen.getByText('completed')).toBeInTheDocument()
  })
})
