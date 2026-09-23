import { toMinorUnits, sumMinor } from '../../../common/utils/money';

export interface EligiblePayment {
  id: string;
  salesOrderId: string;
  paymentMethodId: string;
  paymentDate: string;
  amount: string;
  referenceNumber: string | null;
}

export interface SettlementGroupKey {
  salesOrderId: string;
  paymentMethodId: string;
}

export type ClaimedRowState = 'current' | 'changed' | 'zero' | 'ineligible';

export function groupKey(k: SettlementGroupKey): string {
  return `${k.salesOrderId}:${k.paymentMethodId}`;
}

export function groupPayments<T extends SettlementGroupKey>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupKey(row);
    const bucket = out.get(key) ?? [];
    bucket.push(row);
    out.set(key, bucket);
  }
  return out;
}

/**
 * `current` requires the SAME payment-id set AND every snapshot equal to its
 * live amount. Equal nets are not enough: a payment and a refund of the same
 * size can be added without moving the net, and the group has still changed.
 */
export function classifyClaimedGroup(
  saved: Array<{ id: string; amount: string }>,
  current: Array<{ id: string; amount: string }>,
): ClaimedRowState {
  if (current.length === 0) return 'ineligible';
  const live = new Map(current.map((c) => [c.id, toMinorUnits(c.amount)]));
  const sameSet = saved.length === current.length && saved.every((s) => live.has(s.id));
  if (sameSet && saved.every((s) => toMinorUnits(s.amount) === live.get(s.id))) {
    return 'current';
  }
  return sumMinor(current.map((c) => c.amount)) === 0n ? 'zero' : 'changed';
}
