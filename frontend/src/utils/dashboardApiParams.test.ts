import { describe, expect, it } from 'vitest'

import { resolveApiParams } from '@/utils/dashboardApiParams'

describe('resolveApiParams', () => {
  it('maps this_month to dateRange=this_month with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('this_month')
    expect(result.groupBy).toBe('day')
    expect(result.compareWith).toBeUndefined()
    expect(result.startDate).toBeUndefined()
    expect(result.endDate).toBeUndefined()
  })

  it('maps last_month to dateRange=last_month with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'last_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('last_month')
    expect(result.groupBy).toBe('day')
  })

  it('maps this_week to explicit startDate/endDate with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'this_week', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBeUndefined()
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
    expect(result.groupBy).toBe('day')
  })

  it('maps yesterday to startDate === endDate with groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'yesterday', from: null, to: null },
      compareWith: null,
    })
    expect(result.startDate).toBeDefined()
    expect(result.endDate).toBeDefined()
    expect(result.startDate).toBe(result.endDate)
    expect(result.groupBy).toBe('day')
  })

  it('maps last_365_days to groupBy=month', () => {
    const result = resolveApiParams({
      period: { key: 'last_365_days', from: null, to: null },
      compareWith: null,
    })
    expect(result.groupBy).toBe('month')
  })

  it('maps last_30_days to groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'last_30_days', from: null, to: null },
      compareWith: null,
    })
    expect(result.groupBy).toBe('day')
  })

  it('maps custom range ≤31 days to groupBy=day', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2026-03-01', to: '2026-03-31' },
      compareWith: null,
    })
    expect(result.startDate).toBe('2026-03-01')
    expect(result.endDate).toBe('2026-03-31')
    expect(result.groupBy).toBe('day')
    expect(result.dateRange).toBeUndefined()
  })

  it('maps custom range 32–90 days to groupBy=week', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2026-01-01', to: '2026-03-10' },
      compareWith: null,
    })
    expect(result.groupBy).toBe('week')
  })

  it('maps custom range >90 days to groupBy=month', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: '2025-01-01', to: '2026-03-31' },
      compareWith: null,
    })
    expect(result.groupBy).toBe('month')
  })

  it('falls back to dateRange=this_month when custom has no from/to', () => {
    const result = resolveApiParams({
      period: { key: 'custom', from: null, to: null },
      compareWith: null,
    })
    expect(result.dateRange).toBe('this_month')
    expect(result.groupBy).toBe('day')
  })

  it('includes compareWith when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: 'previous_period',
    })
    expect(result.compareWith).toBe('previous_period')
  })

  it('omits compareWith when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
    })
    expect(result.compareWith).toBeUndefined()
  })

  it('passes through customerId when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      customerId: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.customerId).toBe('550e8400-e29b-41d4-a716-446655440000')
  })

  it('omits customerId when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      customerId: null,
    })
    expect(result.customerId).toBeUndefined()
  })

  it('passes through supplierId when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      supplierId: '550e8400-e29b-41d4-a716-446655440001',
    })
    expect(result.supplierId).toBe('550e8400-e29b-41d4-a716-446655440001')
  })

  it('passes through fulfillmentStatus=fulfilled when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      fulfillmentStatus: 'fulfilled',
    })
    expect(result.fulfillmentStatus).toBe('fulfilled')
  })

  it('passes through fulfillmentStatus=unfulfilled when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      fulfillmentStatus: 'unfulfilled',
    })
    expect(result.fulfillmentStatus).toBe('unfulfilled')
  })

  it('omits fulfillmentStatus when null', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      fulfillmentStatus: null,
    })
    expect(result.fulfillmentStatus).toBeUndefined()
  })

  it('passes through status when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      status: 'received',
    })
    expect(result.status).toBe('received')
  })

  it('passes through paymentStatus when set', () => {
    const result = resolveApiParams({
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      paymentStatus: 'paid',
    })
    expect(result.paymentStatus).toBe('paid')
  })
})
