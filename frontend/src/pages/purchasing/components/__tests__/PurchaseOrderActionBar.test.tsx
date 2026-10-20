import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { PurchaseOrder } from '@/types'

import PurchaseOrderActionBar from '../PurchaseOrderActionBar'

function renderBar(order: Partial<PurchaseOrder>, overrides = {}) {
  const handlers = {
    onPay: vi.fn(),
    onReceive: vi.fn(),
    onReturn: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onUncancel: vi.fn(),
    onDuplicate: vi.fn(),
    onRefund: vi.fn(),
    onPrint: vi.fn(),
  }
  const merged = { ...handlers, ...overrides }
  render(<PurchaseOrderActionBar order={order as PurchaseOrder} {...merged} />)
  return merged
}

describe('PurchaseOrderActionBar — received order', () => {
  it('calls onReturn when Return is clicked', async () => {
    const onReturn = vi.fn()
    const handlers = renderBar({ id: 'po-1', status: 'RECEIVED', paymentStatus: 'PAID' }, { onReturn })
    const ret = screen.getByRole('button', { name: 'Return' })
    expect(ret).toBeEnabled()
    await userEvent.click(ret)
    expect(handlers.onReturn).toHaveBeenCalledTimes(1)
  })

  it('refund is disabled and explains return eligibility', () => {
    renderBar({ id: 'po-1', status: 'RECEIVED', paymentStatus: 'PAID' })
    const refund = screen.getByRole('button', { name: 'Refund' })
    expect(refund).toBeDisabled()
    expect(refund).toHaveAccessibleDescription('Cannot refund a received order. Return it to Ready first, if it qualifies.')
  })
})
