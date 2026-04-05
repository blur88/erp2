import { describe, expect, it } from 'vitest'

import { resolveApiParams } from '../dashboardApiParams'
import type { DashboardFilterBase } from '../dashboardApiParams'

const baseFilter = (): DashboardFilterBase => ({
  period: { key: 'this_month', from: null, to: null },
  compareWith: null,
})

describe('resolveApiParams', () => {
  it('passes fulfillmentStatus=fulfilled as-is (not as isFulfilled boolean)', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: 'fulfilled',
    })
    expect(result.fulfillmentStatus).toBe('fulfilled')
    expect((result as { isFulfilled?: boolean }).isFulfilled).toBeUndefined()
  })

  it('passes fulfillmentStatus=unfulfilled as-is', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: 'unfulfilled',
    })
    expect(result.fulfillmentStatus).toBe('unfulfilled')
  })

  it('omits fulfillmentStatus when null', () => {
    const result = resolveApiParams({
      ...baseFilter(),
      fulfillmentStatus: null,
    })
    expect(result.fulfillmentStatus).toBeUndefined()
  })
})
