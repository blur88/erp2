import { describe, expect, it } from 'vitest'
import {
  changeReason, methodsIn, saveBlockReason, selectionFingerprint, selectionTotals,
  toRowInputs, toSubmittedAmount, type SelectedRow,
} from '../settlementSelection'

const row = (over: Partial<SelectedRow> = {}): SelectedRow => ({
  salesOrderId: 'so-1', paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok',
  orderNumber: 'SO-26-008', netAmount: '70.0000', ...over,
})
const pd = (id: string, amount: string) => ({ id, amount, paymentDate: '2026-09-01', referenceNumber: null })

describe('toSubmittedAmount', () => {
  it.each([
    ['70.0000', '70.00'], ['-30.0000', '-30.00'], ['0.5000', '0.50'], ['1000.1000', '1000.10'],
  ])('%s → %s', (input, out) => expect(toSubmittedAmount(input)).toBe(out))
  it('never rounds a genuine sub-cent value', () => {
    expect(toSubmittedAmount('70.0050')).toBeNull()
    expect(toSubmittedAmount('70.0001')).toBeNull()
  })
})

describe('selectionTotals', () => {
  it('sums in minor units and computes entered − selected', () => {
    const t = selectionTotals([row(), row({ salesOrderId: 'so-2', netAmount: '-30.0000' })], '40')
    expect(t.selectedMinor).toBe(400000n)
    expect(t.differenceMinor).toBe(0n)
  })
  it('treats 70 and 70.00 as equal and 0.01 as a difference', () => {
    expect(selectionTotals([row()], '70').differenceMinor).toBe(0n)
    expect(selectionTotals([row()], '70.01').differenceMinor).toBe(100n)
  })
  it('reports an unparseable amount as null, not zero', () => {
    expect(selectionTotals([row()], '1,000.00').enteredMinor).toBeNull()
    expect(selectionTotals([row()], '1,000.00').differenceMinor).toBeNull()
  })
})

describe('methodsIn / saveBlockReason', () => {
  it('lists each method with its row count', () => {
    expect(methodsIn([row(), row({ salesOrderId: 'so-2' }), row({ salesOrderId: 'so-3', paymentMethodId: 'pm-at', paymentMethodName: 'Atome' })]))
      .toEqual([
        { paymentMethodId: 'pm-tt', paymentMethodName: 'TikTok', count: 2 },
        { paymentMethodId: 'pm-at', paymentMethodName: 'Atome', count: 1 },
      ])
  })
  it.each([
    [{ selected: [], entered: '0', unresolvedAttention: 0 }, 'Select at least one row'],
    [{ selected: [row(), row({ paymentMethodId: 'pm-at', paymentMethodName: 'Atome', salesOrderId: 'so-2' })], entered: '140', unresolvedAttention: 0 }, 'Create a separate settlement for each Payment Method'],
    [{ selected: [row({ netAmount: '-30.0000' })], entered: '0', unresolvedAttention: 0 }, 'The selected total must be greater than zero'],
    [{ selected: [row()], entered: '1,000.00', unresolvedAttention: 0 }, 'Enter a valid amount received'],
    [{ selected: [row()], entered: '69.99', unresolvedAttention: 0 }, 'Amount received must equal the selected total'],
    [{ selected: [row()], entered: '70', unresolvedAttention: 1 }, 'Resolve the rows that need attention'],
    [{ selected: [row({ netAmount: '70.0050' })], entered: '70.005', unresolvedAttention: 0 }, 'Sub-cent amount — cannot be settled'],
  ])('%#: blocks with a reason', (input, reason) => {
    expect(saveBlockReason(input)).toContain(reason)
  })
  it('allows save when everything reconciles', () => {
    expect(saveBlockReason({ selected: [row()], entered: '70.00', unresolvedAttention: 0 })).toBeNull()
  })
})

describe('changeReason', () => {
  it('says "Refund added" only for exactly one added negative row and no other change', () => {
    expect(changeReason([pd('a', '100.0000')], [pd('a', '100.0000'), pd('r', '-30.0000')])).toBe('Refund added')
  })
  it.each([
    [[pd('a', '100.0000')], [pd('a', '100.0000'), pd('p', '30.0000')]],                         // added a payment
    [[pd('a', '100.0000')], [pd('a', '100.0000'), pd('r', '-10.0000'), pd('s', '-20.0000')]],  // two refunds
    [[pd('a', '100.0000')], [pd('a', '90.0000'), pd('r', '-30.0000')]],                         // drift + refund
    [[pd('a', '100.0000'), pd('b', '5.0000')], [pd('a', '100.0000'), pd('r', '-30.0000')]],    // one removed
  ])('%#: otherwise the generic reason', (saved, current) => {
    expect(changeReason(saved, current)).toBe('Payments changed')
  })
})

describe('selectionFingerprint / toRowInputs', () => {
  it('is order-independent and normalises amounts', () => {
    const a = selectionFingerprint([row(), row({ salesOrderId: 'so-2', netAmount: '5.0000' })], ['x'])
    const b = selectionFingerprint([row({ salesOrderId: 'so-2', netAmount: '5.00' }), row({ netAmount: '70.00' })], ['x'])
    expect(a).toBe(b)
  })
  it('changes when an attention key is removed', () => {
    expect(selectionFingerprint([row()], ['k'])).not.toBe(selectionFingerprint([row()], []))
  })
  it('builds submit rows with 2-dp amounts', () => {
    expect(toRowInputs([row()])).toEqual([{ salesOrderId: 'so-1', paymentMethodId: 'pm-tt', expectedNetAmount: '70.00' }])
  })
})
