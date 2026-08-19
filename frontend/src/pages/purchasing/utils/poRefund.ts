import type { RefundSeed } from '@/components/common/RefundDialog'
import type { VendorPayment } from '@/types'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'

/** Gross payments grouped by method — seed weights only. Refund rows (negative)
 *  are excluded; prior refunds reduce the aggregate cap instead (#1096). */
export function buildPoRefundSeed(payments: VendorPayment[]): RefundSeed[] {
  const grossByMethod = new Map<string, bigint>()
  for (const p of payments ?? []) {
    if (!p.paymentMethodId) continue
    const amt = toScaledAmount(p.amount) ?? 0n
    if (amt <= 0n) continue
    grossByMethod.set(p.paymentMethodId, (grossByMethod.get(p.paymentMethodId) ?? 0n) + amt)
  }
  return [...grossByMethod].map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
}

export function poNetPaidMinor(payments: VendorPayment[]): bigint {
  return (payments ?? []).reduce((s, p) => s + (toScaledAmount(p.amount) ?? 0n), 0n)
}

export function toPoRefundPayload(
  lines: { paymentMethodId: string; amount: string; reference?: string }[],
): { paymentMethodId: string; amount: string; reference?: string }[] {
  return lines.map((l) => ({ paymentMethodId: l.paymentMethodId, amount: l.amount, reference: l.reference }))
}