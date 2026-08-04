import type { RefundSource } from '@/components/common/RefundDialog'
import type { VendorPayment } from '@/types'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'

export function buildPoRefundSources(payments: VendorPayment[]): RefundSource[] {
  const netByMethod: Record<string, { paid: bigint; refunded: bigint; label: string }> = {}
  for (const p of payments ?? []) {
    if (!p.paymentMethodId) continue
    const key = p.paymentMethodId
    const entry = (netByMethod[key] ??= {
      paid: 0n,
      refunded: 0n,
      label: p.paymentMethodEntity?.name ?? 'Payment',
    })
    const amt = toScaledAmount(p.amount) ?? 0n
    if (amt >= 0n) entry.paid += amt
    else entry.refunded += -amt
  }
  return Object.entries(netByMethod).map(([id, v]) => ({
    id,
    label: v.label,
    paidAmount: fromScaledAmount(v.paid),
    alreadyRefunded: fromScaledAmount(v.refunded),
  }))
}

export function toPoRefundPayload(
  lines: { sourceId: string; amount: string; reference?: string }[],
): { paymentMethodId: string; amount: string; reference?: string }[] {
  return lines.map((l) => ({ paymentMethodId: l.sourceId, amount: l.amount, reference: l.reference }))
}