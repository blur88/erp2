import type { RefundSeed } from '@/components/common/RefundDialog'
import type { VendorPayment } from '@/types'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'

/** Per-method NET capacity for the refund preset: gross payments minus prior
 *  refunds through the same method (refunds are negative rows on the same
 *  paymentMethodId). Sum ALL signed rows first, then emit only methods with a
 *  positive balance — a cross-method refund can drive one negative, which is
 *  not a valid preset line (#1107). Serves both PO pages. */
export function buildPoRefundSeed(payments: VendorPayment[]): RefundSeed[] {
  const netByMethod = new Map<string, bigint>()
  for (const p of payments ?? []) {
    if (!p.paymentMethodId) continue
    netByMethod.set(
      p.paymentMethodId,
      (netByMethod.get(p.paymentMethodId) ?? 0n) + (toScaledAmount(p.amount) ?? 0n),
    )
  }
  return [...netByMethod]
    .filter(([, amount]) => amount > 0n)
    .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
}

export function poNetPaidMinor(payments: VendorPayment[]): bigint {
  return (payments ?? []).reduce((s, p) => s + (toScaledAmount(p.amount) ?? 0n), 0n)
}

export function toPoRefundPayload(
  lines: { paymentMethodId: string; amount: string; reference?: string }[],
): { paymentMethodId: string; amount: string; reference?: string }[] {
  return lines.map((l) => ({ paymentMethodId: l.paymentMethodId, amount: l.amount, reference: l.reference }))
}