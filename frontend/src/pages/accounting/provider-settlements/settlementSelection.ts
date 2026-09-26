import type { SettlementPaymentDetail, SettlementRowInput } from '@/types'
import { sumScaledAmounts, toAmountInputValue, toScaledAmount } from '@/utils/currency'

export interface SelectedRow {
  salesOrderId: string
  paymentMethodId: string
  paymentMethodName: string
  orderNumber: string
  /** Scale-4 as received from the API; the value the user accepted. */
  netAmount: string
}

export const groupKey = (k: { salesOrderId: string; paymentMethodId: string }) =>
  `${k.salesOrderId}:${k.paymentMethodId}`

/**
 * Scale-4 response → ≤ 2 dp request, lexically (never via Number). A genuine
 * sub-cent value survives normalization with > 2 fraction digits and is
 * refused (null) rather than rounded.
 */
export function toSubmittedAmount(scale4: string): string | null {
  const normalized = toAmountInputValue(scale4)
  const fraction = normalized.split('.')[1] ?? ''
  return fraction.length > 2 ? null : normalized
}

export function selectionTotals(selected: SelectedRow[], entered: string) {
  const selectedMinor = sumScaledAmounts(selected.map((s) => s.netAmount))
  const enteredMinor = entered.trim() === '' ? 0n : toScaledAmount(entered)
  const differenceMinor =
    selectedMinor !== null && enteredMinor !== null ? enteredMinor - selectedMinor : null
  return { selectedMinor, enteredMinor, differenceMinor }
}

export function methodsIn(selected: SelectedRow[]) {
  const out = new Map<string, { paymentMethodId: string; paymentMethodName: string; count: number }>()
  for (const s of selected) {
    const cur = out.get(s.paymentMethodId)
    if (cur) cur.count += 1
    else out.set(s.paymentMethodId, { paymentMethodId: s.paymentMethodId, paymentMethodName: s.paymentMethodName, count: 1 })
  }
  return [...out.values()]
}

export function saveBlockReason(input: {
  selected: SelectedRow[]; entered: string; unresolvedAttention: number; bankAccountBlock?: string | null
}): string | null {
  const { selected, entered, unresolvedAttention, bankAccountBlock } = input
  if (bankAccountBlock) return bankAccountBlock
  if (unresolvedAttention > 0) return 'Resolve the rows that need attention before saving.'
  if (selected.length === 0) return 'Select at least one row.'
  if (methodsIn(selected).length > 1) return 'Create a separate settlement for each Payment Method.'
  if (selected.some((s) => toSubmittedAmount(s.netAmount) === null)) return 'Sub-cent amount — cannot be settled.'
  const { selectedMinor, enteredMinor, differenceMinor } = selectionTotals(selected, entered)
  if (selectedMinor === null || selectedMinor <= 0n) return 'The selected total must be greater than zero.'
  if (enteredMinor === null) return 'Enter a valid amount received.'
  if (differenceMinor !== 0n) return 'Amount received must equal the selected total.'
  return null
}

export function changeReason(
  saved: SettlementPaymentDetail[], current: SettlementPaymentDetail[],
): 'Refund added' | 'Payments changed' {
  const live = new Map(current.map((c) => [c.id, toScaledAmount(c.amount)]))
  const unchanged = saved.every((s) => live.has(s.id) && live.get(s.id) === toScaledAmount(s.amount))
  const savedIds = new Set(saved.map((s) => s.id))
  const added = current.filter((c) => !savedIds.has(c.id))
  const addedMinor = added.length === 1 ? toScaledAmount(added[0].amount) : null
  return unchanged && addedMinor !== null && addedMinor < 0n ? 'Refund added' : 'Payments changed'
}

export function selectionFingerprint(selected: SelectedRow[], attentionKeys: string[]): string {
  const rows = selected
    .map((s) => `${groupKey(s)}=${toScaledAmount(s.netAmount)?.toString() ?? s.netAmount}`)
    .sort()
  return JSON.stringify({ rows, attention: [...attentionKeys].sort() })
}

export function toRowInputs(selected: SelectedRow[]): SettlementRowInput[] {
  return selected.map((s) => {
    const expectedNetAmount = toSubmittedAmount(s.netAmount)
    if (expectedNetAmount === null) throw new Error(`Sub-cent amount on ${s.orderNumber}`)
    return { salesOrderId: s.salesOrderId, paymentMethodId: s.paymentMethodId, expectedNetAmount }
  })
}
