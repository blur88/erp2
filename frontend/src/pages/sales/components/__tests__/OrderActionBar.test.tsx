import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { SalesOrder } from '@/types'

import OrderActionBar from '../OrderActionBar'

function makeOrder(overrides: Partial<SalesOrder>): SalesOrder {
  return {
    id: 'o1',
    orderNumber: 'SO-26-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'c1',
    totalAmount: 100,
    orderDate: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as SalesOrder
}

function renderBar(order: SalesOrder, handlers = {}) {
  const defaults = {
    onPay: vi.fn(),
    onFulfill: vi.fn(),
    onUnfulfill: vi.fn(),
    onRefund: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
    onUncancel: vi.fn(),
    onDuplicate: vi.fn(),
    onPrint: vi.fn(),
  }

  return {
    ...render(
      <MemoryRouter>
        <OrderActionBar order={order} {...defaults} {...handlers} />
      </MemoryRouter>,
    ),
    handlers: { ...defaults, ...handlers },
  }
}

describe('OrderActionBar', () => {
  it('Draft+Unpaid shows Pay, Fulfill (disabled), Edit, Cancel, Print', () => {
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }))
    expect(screen.getByRole('button', { name: 'Pay' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unfulfill' })).not.toBeInTheDocument()
  })

  it('Draft+Partial shows Fulfill (enabled), Refund, Edit, Cancel, Print — no Pay', () => {
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'PARTIAL' }))
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
  })

  it('Draft+Paid shows Fulfill, Refund, Edit, Cancel, Print', () => {
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'PAID' }))
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unfulfill' })).not.toBeInTheDocument()
  })

  it('Draft+Overpaid shows Fulfill, Refund, Edit, Cancel, Print', () => {
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'OVERPAID' }))
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
  })

  it('Fulfilled shows Unfulfill, Refund, Print', () => {
    renderBar(makeOrder({ status: 'FULFILLED', paymentStatus: 'PAID' }))
    expect(screen.getByRole('button', { name: 'Unfulfill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refund' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fulfill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
  })

  it('Cancelled shows Uncancel and Print only', () => {
    renderBar(makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' }))
    expect(screen.getByRole('button', { name: 'Uncancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pay' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Fulfill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unfulfill' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Refund' })).not.toBeInTheDocument()
  })

  it('calls onPay when Pay is clicked', async () => {
    const onPay = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }), { onPay })
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }))
    expect(onPay).toHaveBeenCalledTimes(1)
  })

  it('calls onFulfill when Fulfill is clicked', async () => {
    const onFulfill = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'PAID' }), { onFulfill })
    await userEvent.click(screen.getByRole('button', { name: 'Fulfill' }))
    expect(onFulfill).toHaveBeenCalledTimes(1)
  })

  it('calls onUnfulfill when Unfulfill is clicked', async () => {
    const onUnfulfill = vi.fn()
    renderBar(makeOrder({ status: 'FULFILLED', paymentStatus: 'PAID' }), { onUnfulfill })
    await userEvent.click(screen.getByRole('button', { name: 'Unfulfill' }))
    expect(onUnfulfill).toHaveBeenCalledTimes(1)
  })

  it('calls onRefund when Refund is clicked', async () => {
    const onRefund = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'PAID' }), { onRefund })
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    expect(onRefund).toHaveBeenCalledTimes(1)
  })

  it('calls onEdit when Edit is clicked', async () => {
    const onEdit = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }), { onEdit })
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }), { onCancel })
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onPrint when Print is clicked', async () => {
    const onPrint = vi.fn()
    renderBar(makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' }), { onPrint })
    await userEvent.click(screen.getByRole('button', { name: 'Print' }))
    expect(onPrint).toHaveBeenCalledTimes(1)
  })

  it('calls onUncancel when Uncancel is clicked', async () => {
    const onUncancel = vi.fn()
    renderBar(makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' }), { onUncancel })
    await userEvent.click(screen.getByRole('button', { name: 'Uncancel' }))
    expect(onUncancel).toHaveBeenCalledTimes(1)
  })

  it('calls onDuplicate when Duplicate is clicked', async () => {
    const onDuplicate = vi.fn()
    renderBar(makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }), { onDuplicate })
    await userEvent.click(screen.getByRole('button', { name: 'Duplicate' }))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })
})
