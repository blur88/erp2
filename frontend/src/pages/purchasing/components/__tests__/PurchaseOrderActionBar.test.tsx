import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { PurchaseOrder } from '@/types'

import PurchaseOrderActionBar from '../PurchaseOrderActionBar'

function renderBar(order: Partial<PurchaseOrder>) {
  const handlers = {
    onPay: vi.fn(),
    onReceive: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onUncancel: vi.fn(),
    onDuplicate: vi.fn(),
    onRefund: vi.fn(),
    onPrint: vi.fn(),
  }
  render(<PurchaseOrderActionBar order={order as PurchaseOrder} {...handlers} />)
  return handlers
}

describe('PurchaseOrderActionBar — received order', () => {
  it('Return is disabled, explains why to mouse and screen-reader users, and calls nothing', () => {
    const handlers = renderBar({ id: 'po-1', status: 'RECEIVED', paymentStatus: 'PAID' })
    const ret = screen.getByRole('button', { name: 'Return' })
    expect(ret).toBeDisabled()
    expect(ret).toHaveAccessibleDescription("Returning a received purchase order to Ready is unavailable: it would erase its stock and cost history. It will return once stock reversals keep that history.")
    expect(ret.closest('span[title]')).toHaveAttribute('title', "Returning a received purchase order to Ready is unavailable: it would erase its stock and cost history. It will return once stock reversals keep that history.")
    fireEvent.click(ret)
    for (const handler of Object.values(handlers)) expect(handler).not.toHaveBeenCalled()
  })

  it('Refund is disabled and explains why', () => {
    renderBar({ id: 'po-1', status: 'RECEIVED', paymentStatus: 'PAID' })
    const refund = screen.getByRole('button', { name: 'Refund' })
    expect(refund).toBeDisabled()
    expect(refund).toHaveAccessibleDescription('Cannot refund a received order.')
  })
})
