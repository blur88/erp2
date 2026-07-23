import { describe, expect, it } from 'vitest'

import {
  ORDER_STATUS_OPTIONS,
  PURCHASE_ORDER_STATUS_OPTIONS,
  PURCHASING_ACTIVITY_STATUS_OPTIONS,
  STATUS_OPTIONS,
} from '@/constants/filterOptions'

describe('filterOptions', () => {
  it('exposes active/inactive for the shared status filter', () => {
    expect(STATUS_OPTIONS.map((o) => o.value)).toEqual(['active', 'inactive'])
  })

  it('keeps the two purchasing domains separate', () => {
    expect(PURCHASE_ORDER_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'DRAFT', 'READY', 'RECEIVED', 'CANCELLED',
    ])
    expect(PURCHASING_ACTIVITY_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'received', 'pending',
    ])
  })

  it('keeps sales order status uppercase', () => {
    expect(ORDER_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'DRAFT', 'READY', 'FULFILLED', 'CANCELLED',
    ])
  })
})
