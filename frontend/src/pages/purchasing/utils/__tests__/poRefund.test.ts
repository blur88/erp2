import { describe, it, expect } from 'vitest'
import { buildPoRefundSources, toPoRefundPayload } from '../poRefund'

describe('buildPoRefundSources', () => {
  it('groups by paymentMethodId, labels with method name, nets +/-', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: '100.0000' },
      { id: 'p2', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: '-30.0000' },
      { id: 'p3', paymentMethodId: 'm2', paymentMethodEntity: { name: 'Bank' }, amount: '50.0000' },
    ] as any)

    const cash = sources.find((s) => s.id === 'm1')!
    expect(cash.label).toBe('Cash')
    expect(cash.paidAmount).toBe('100.0000')
    expect(cash.alreadyRefunded).toBe('30.0000')
    const bank = sources.find((s) => s.id === 'm2')!
    expect(bank.paidAmount).toBe('50.0000')
  })

  it('skips payments with a falsy paymentMethodId (legacy null-method rows)', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: null, paymentMethodEntity: undefined, amount: '100.0000' },
      { id: 'p2', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: '40.0000' },
    ] as any)
    expect(sources.map((s) => s.id)).toEqual(['m1'])
  })

  it('falls back to "Payment" label when method entity missing but id present', () => {
    const sources = buildPoRefundSources([
      { id: 'p1', paymentMethodId: 'm1', paymentMethodEntity: undefined, amount: '10.0000' },
    ] as any)
    expect(sources[0].label).toBe('Payment')
  })
})

describe('toPoRefundPayload', () => {
  it('maps sourceId -> paymentMethodId and keeps reference (no vendorPaymentId/reason)', () => {
    const payload = toPoRefundPayload([
      { sourceId: 'm1', amount: '40.0000', reference: 'damaged' },
    ])
    expect(payload).toEqual([{ paymentMethodId: 'm1', amount: '40.0000', reference: 'damaged' }])
  })
})

describe('exact money handling', () => {
  it('nets paid and refunded per method exactly', () => {
    // 0.1 + 0.2 !== 0.3 under Number().
    const sources = buildPoRefundSources([
      { paymentMethodId: 'pm-1', amount: '0.1000', paymentMethodEntity: { name: 'Cash' } },
      { paymentMethodId: 'pm-1', amount: '0.2000', paymentMethodEntity: { name: 'Cash' } },
    ] as any)

    expect(sources).toHaveLength(1)
    expect(sources[0].paidAmount).toBe('0.3000')
    expect(sources[0].alreadyRefunded).toBe('0.0000')
  })

  it('treats a negative amount as an existing refund', () => {
    const sources = buildPoRefundSources([
      { paymentMethodId: 'pm-1', amount: '100.0000', paymentMethodEntity: { name: 'Cash' } },
      { paymentMethodId: 'pm-1', amount: '-25.5000', paymentMethodEntity: { name: 'Cash' } },
    ] as any)

    expect(sources[0].paidAmount).toBe('100.0000')
    expect(sources[0].alreadyRefunded).toBe('25.5000')
  })

  it('passes the refund amount through as a string', () => {
    expect(
      toPoRefundPayload([{ sourceId: 'pm-1', amount: '1000.0001', reference: 'r' }]),
    ).toEqual([{ paymentMethodId: 'pm-1', amount: '1000.0001', reference: 'r' }])
  })
})
