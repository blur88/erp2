import { describe, it, expect } from 'vitest'
import {
  selectPendingSummary,
  selectPendingPayments,
  selectSettlements,
} from '../settlementsSlice'

describe('settlementsSlice selectors', () => {
  it('returns stable empty references when settlements slice is missing', () => {
    const state = {} as any

    const pendingSummaryFirst = selectPendingSummary(state)
    const pendingSummarySecond = selectPendingSummary(state)
    expect(pendingSummaryFirst).toBe(pendingSummarySecond)

    const pendingPaymentsFirst = selectPendingPayments(state)
    const pendingPaymentsSecond = selectPendingPayments(state)
    expect(pendingPaymentsFirst).toBe(pendingPaymentsSecond)

    const settlementsFirst = selectSettlements(state)
    const settlementsSecond = selectSettlements(state)
    expect(settlementsFirst).toBe(settlementsSecond)
  })
})
