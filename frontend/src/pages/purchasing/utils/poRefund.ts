import type { RefundSource } from '@/components/common/RefundDialog'
import type { VendorPayment } from '@/types'

export function buildPoRefundSources(payments: VendorPayment[]): RefundSource[] {
  const netByMethod: Record<string, { paid: number; refunded: number; label: string }> = {}
  for (const p of payments ?? []) {
    if (!p.paymentMethodId) continue
    const key = p.paymentMethodId
    const entry = (netByMethod[key] ??= {
      paid: 0,
      refunded: 0,
      label: p.paymentMethodEntity?.name ?? 'Payment',
    })
    const amt = Number(p.amount)
    if (amt >= 0) entry.paid += amt
    else entry.refunded += Math.abs(amt)
  }
  return Object.entries(netByMethod).map(([id, v]) => ({
    id,
    label: v.label,
    paidAmount: v.paid,
    alreadyRefunded: v.refunded,
  }))
}

export function toPoRefundPayload(
  lines: { sourceId: string; amount: number; reference?: string }[],
): { paymentMethodId: string; amount: number; reference?: string }[] {
  return lines.map((l) => ({ paymentMethodId: l.sourceId, amount: l.amount, reference: l.reference }))
}
