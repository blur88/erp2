import { describe, it, expect } from 'vitest'
import { buildPoRefundSources, toPoRefundPayload } from '../poRefund'

describe('buildPoRefundSources', () => {
  it('groups by paymentMethodId, labels with method name, nets +/-', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: 100 },
      { id: 'p2', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: -30 },
      { id: 'p3', paymentMethodId: 'm2', paymentMethodEntity: { name: 'Bank' }, amount: 50 },
    ] as any)

    const cash = sources.find((s) => s.id === 'm1')!
    expect(cash.label).toBe('Cash')
    expect(cash.paidAmount).toBe(100)
    expect(cash.alreadyRefunded).toBe(30)
    const bank = sources.find((s) => s.id === 'm2')!
    expect(bank.paidAmount).toBe(50)
  })

  it('skips payments with a falsy paymentMethodId (legacy null-method rows)', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: null, paymentMethodEntity: undefined, amount: 100 },
      { id: 'p2', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: 40 },
    ] as any)
    expect(sources.map((s) => s.id)).toEqual(['m1'])
  })

  it('falls back to "Payment" label when method entity missing but id present', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: 'm1', paymentMethodEntity: undefined, amount: 10 },
    ] as any)
    expect(sources[0].label).toBe('Payment')
  })
})

describe('toPoRefundPayload', () => {
  it('maps sourceId -> paymentMethodId and keeps reference (no vendorPaymentId/reason)', () => {
    const payload = toPoRefundPayload([
      { sourceId: 'm1', amount: 40, reference: 'damaged' },
    ])
    expect(payload).toEqual([{ paymentMethodId: 'm1', amount: 40, reference: 'damaged' }])
  })
})
