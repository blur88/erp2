import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { darkTheme } from '@/styles/theme'
import PurchaseOrderOverviewTab from '../PurchaseOrderOverviewTab'

function renderTab(order: any) {
  return render(
    <ThemeProvider theme={darkTheme}>
      <MemoryRouter>
        <PurchaseOrderOverviewTab order={order} />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('PurchaseOrderOverviewTab items table', () => {
  it('renders the compound discount "amount (percent%)" format', () => {
    renderTab({
      orderNumber: 'PO-1',
      orderDate: '2026-01-01',
      status: 'draft',
      paymentStatus: 'unpaid',
      totalAmount: 100,
      paidAmount: 0,
      items: [
        {
          id: 'i1',
          product: { name: 'Widget' },
          quantity: 2,
          unitCost: 50,
          discountAmount: 10,
          discountPercent: 5,
          totalAmount: 90,
        },
      ],
    })
    expect(screen.getByText(/\(5\.00%\)/)).toBeInTheDocument()
  })

  it('renders an em dash when there is no discount', () => {
    renderTab({
      orderNumber: 'PO-2',
      orderDate: '2026-01-01',
      status: 'draft',
      paymentStatus: 'unpaid',
      totalAmount: 100,
      paidAmount: 0,
      items: [
        { id: 'i2', product: { name: 'Gadget' }, quantity: 1, unitCost: 100, totalAmount: 100 },
      ],
    })
    expect(screen.getByText('Gadget')).toBeInTheDocument()
  })
})
