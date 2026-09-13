import { getCurrencySymbol } from '@/utils/currency'

/**
 * Column heads for the two-column statement layout, carrying the currency.
 *
 * The figures themselves are rendered with `showSymbol: false`, so without a
 * marker here a financial statement shows bare unlabelled numbers — the heads
 * are the ONLY place the currency appears on the page. Before #1235 that
 * marker was the single `['RM']` head, which the Amount/Total split dropped.
 *
 * Reads the configured symbol rather than hardcoding 'RM': `formatCurrency`
 * resolves it from `defaultCurrency` in localStorage, and a head that
 * disagreed with the figures would be worse than none at all.
 *
 * Called at render time, not memoized to a module constant — the symbol is a
 * user setting and a module constant would freeze whatever was configured when
 * the chunk first loaded.
 */
export const statementFigureHeads = (): [string, string] => {
  const symbol = getCurrencySymbol()
  return [`Amount (${symbol})`, `Total (${symbol})`]
}
