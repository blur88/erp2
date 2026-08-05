import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { describe, expect, it, vi } from 'vitest'

import { darkTheme } from '@/styles/theme'

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }))

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return { ...actual, useGetPurchaseOrderPaymentsQuery: mockQuery }
})

import PurchaseOrderPaymentsTab from '../PurchaseOrderPaymentsTab'

function renderTab(totalAmount = '500.0000') {
  return render(
    <ThemeProvider theme={darkTheme}>
      <PurchaseOrderPaymentsTab orderId="o1" totalAmount={totalAmount} />
    </ThemeProvider>,
  )
}

describe('PurchaseOrderPaymentsTab', () => {
  it('renders status as a StatusChip (not raw text) and totals footer', () => {
    mockQuery.mockReturnValue({
      data: [
        { id: 'pp1', paymentDate: '2026-01-01', referenceNumber: 'R1', status: 'completed', amount: '200.0000' },
      ],
      isLoading: false,
      isError: false,
    })
    const { container } = renderTab()
    const chipLabel = container.querySelector('.MuiChip-root .MuiChip-label')
    expect(chipLabel).not.toBeNull()
    expect(chipLabel).toHaveTextContent('Completed')
    expect(screen.queryByText('completed')).not.toBeInTheDocument()
    expect(screen.getByText('Total Paid')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
  })

  it('keeps the negative-amount data-testid and error.main color', () => {
    mockQuery.mockReturnValue({
      data: [
        { id: 'pp2', paymentDate: '2026-01-02', status: 'completed', amount: '-50.0000' },
      ],
      isLoading: false,
      isError: false,
    })
    renderTab()
    const amount = screen.getByTestId('payment-amount-pp2')
    expect(amount).toBeInTheDocument()
    expect(amount).toHaveStyle({ color: 'rgb(239, 83, 80)' })
  })
})
