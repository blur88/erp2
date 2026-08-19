import { describe, it, expect } from 'vitest'
import { buildPoRefundSeed, poNetPaidMinor, toPoRefundPayload } from '../poRefund'

describe('buildPoRefundSeed', () => {
  it('groups gross payments by method', () => {
    const seed = buildPoRefundSeed([
      { id: 'p1', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: '100.0000' },
      { id: 'p3', paymentMethodId: 'm2', paymentMethodEntity: { name: 'Bank' }, amount: '50.0000' },
    ] as any)

    expect(seed).toEqual([
      { methodId: 'm1', amount: '100.0000' },
      { methodId: 'm2', amount: '50.0000' },
    ])
  })

  it('excludes refund rows from the seed instead of netting them (#1096)', () => {
    // Pre-#1096 this returned paid 100 / refunded 25.50 for m1. Seeds are gross
    // weights now: a prior refund reduces only the aggregate cap.
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '100.0000', paymentMethodEntity: { name: 'Cash' } },
      { paymentMethodId: 'pm-1', amount: '-25.5000', paymentMethodEntity: { name: 'Cash' } },
    ] as any)

    expect(seed).toEqual([{ methodId: 'pm-1', amount: '100.0000' }])
  })

  it('skips payments with a falsy paymentMethodId (legacy null-method rows)', () => {
    const seed = buildPoRefundSeed([
      { id: 'p1', paymentMethodId: null, paymentMethodEntity: undefined, amount: '100.0000' },
      { id: 'p2', paymentMethodId: 'm1', paymentMethodEntity: { name: 'Cash' }, amount: '40.0000' },
    ] as any)
    expect(seed.map((s) => s.methodId)).toEqual(['m1'])
  })

  it('aggregates exactly at scale 4', () => {
    // 0.1 + 0.2 !== 0.3 under Number().
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '0.1000', paymentMethodEntity: { name: 'Cash' } },
      { paymentMethodId: 'pm-1', amount: '0.2000', paymentMethodEntity: { name: 'Cash' } },
    ] as any)

    expect(seed).toEqual([{ methodId: 'pm-1', amount: '0.3000' }])
  })
})

describe('poNetPaidMinor', () => {
  it('nets refunds against payments for the aggregate cap', () => {
    expect(poNetPaidMinor([
      { paymentMethodId: 'pm-1', amount: '100.0000' },
      { paymentMethodId: 'pm-2', amount: '-25.5000' },
    ] as any)).toBe(745000n)   // 74.5000 at scale 4
  })
})

describe('toPoRefundPayload', () => {
  it('passes the method id and reference through (no vendorPaymentId/reason)', () => {
    expect(toPoRefundPayload([{ paymentMethodId: 'm1', amount: '40.0000', reference: 'damaged' }]))
      .toEqual([{ paymentMethodId: 'm1', amount: '40.0000', reference: 'damaged' }])
  })

  it('passes the refund amount through as a string', () => {
    expect(toPoRefundPayload([{ paymentMethodId: 'pm-1', amount: '1000.0001', reference: 'r' }]))
      .toEqual([{ paymentMethodId: 'pm-1', amount: '1000.0001', reference: 'r' }])
  })
})