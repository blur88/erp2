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

  it('nets prior refunds against the same method (#1107)', () => {
    // #1096 made seeds gross weights and excluded refund rows, which ignored a
    // prior refund when presetting. Seeds are per-method net capacity now.
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '100.0000', paymentMethodEntity: { name: 'Cash' } },
      { paymentMethodId: 'pm-1', amount: '-25.5000', paymentMethodEntity: { name: 'Cash' } },
    ] as any)

    expect(seed).toEqual([{ methodId: 'pm-1', amount: '74.5000' }])
  })

  it('omits a method a cross-method refund drove negative (#1107)', () => {
    // Paid Cash 100 / Bank 200, then refunded 250 through Cash (legal under
    // #1096): Cash net is -150, which is not a valid preset line.
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '100.0000' },
      { paymentMethodId: 'pm-2', amount: '200.0000' },
      { paymentMethodId: 'pm-1', amount: '-250.0000' },
    ] as any)

    expect(seed).toEqual([{ methodId: 'pm-2', amount: '200.0000' }])
  })

  it('omits a method refunded down to exactly zero (#1107)', () => {
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '100.0000' },
      { paymentMethodId: 'pm-1', amount: '-100.0000' },
      { paymentMethodId: 'pm-2', amount: '10.0000' },
    ] as any)

    expect(seed).toEqual([{ methodId: 'pm-2', amount: '10.0000' }])
  })

  it('groups the issue #1107 scenario into whole-cent capacities', () => {
    // Cash 100 + Bank 200, Cash 50 refunded => Cash 50 / Bank 200, which the
    // dialog fills in order for a 250 refund (never 83.3333 / 166.6667).
    const seed = buildPoRefundSeed([
      { paymentMethodId: 'pm-1', amount: '100.0000' },
      { paymentMethodId: 'pm-2', amount: '200.0000' },
      { paymentMethodId: 'pm-1', amount: '-50.0000' },
    ] as any)

    expect(seed).toEqual([
      { methodId: 'pm-1', amount: '50.0000' },
      { methodId: 'pm-2', amount: '200.0000' },
    ])
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