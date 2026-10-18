import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PurchaseOrder } from '@/types'

import PurchaseOrderList from '../PurchaseOrderList'

describe('PurchaseOrderList received row actions', () => {
  it('enables Return and invokes the row handler', async () => {
    const onReturn = vi.fn()
    const order = {
      id: 'po-1',
      orderNumber: 'PO-26-001',
      status: 'RECEIVED',
      paymentStatus: 'PAID',
      totalAmount: '100.0000',
      orderDate: new Date('2026-01-15'),
    } as PurchaseOrder

    render(
      <PurchaseOrderList
        orders={[order]}
        loading={false}
        total={1}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onPay={vi.fn()}
        onReceive={vi.fn()}
        onReturn={onReturn}
        onCancel={vi.fn()}
        onUncancel={vi.fn()}
        onDuplicate={vi.fn()}
        onRefund={vi.fn()}
        onPrint={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /row actions/i }))
    const action = screen.getByRole('menuitem', { name: /^return$/i })
    expect(action).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(action)
    expect(onReturn).toHaveBeenCalledWith(order)
  })
})
