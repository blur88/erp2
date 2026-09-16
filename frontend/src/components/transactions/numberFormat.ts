import { formatCurrency } from '@/utils/currency'

/**
 * Display formatter for transaction amounts (#1241).
 *
 * Routes through the shared `formatCurrency` (symbol off) so amounts are always
 * exactly two decimals, never render `-0.00`, and agree with every other
 * surface. Decimal strings are kept as strings so large NUMERIC(18,4) values
 * do not lose a cent through binary64.
 */
export function formatNum(value: number | string): string {
  if (value === '' || value === null || value === undefined) return ''
  return formatCurrency(value, { showSymbol: false })
}

export function parseNum(value: string): number {
  return parseFloat(value.replace(/,/g, '')) || 0
}
