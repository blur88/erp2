/**
 * Currency formatting utilities with dynamic currency from settings
 */

/**
 * Get currency symbol from localStorage cache
 * Falls back to 'RM' if not found
 */
const getCurrencySymbol = (): string => {
  return localStorage.getItem('defaultCurrency') || 'RM'
}

/**
 * Formats a number as currency using the currency from settings
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string in "CURRENCY 0,000,000.00" format
 */
export const formatCurrency = (
  amount: number | string | null | undefined,
  options: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    showSymbol?: boolean
    currency?: string // Optional override currency
  } = {}
): string => {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSymbol = true,
    currency
  } = options

  // Get currency symbol (use override or cached value)
  const currencySymbol = currency || getCurrencySymbol()

  // Handle null/undefined by treating as zero.
  // Keep string amounts as strings: Intl.NumberFormat.format() parses a decimal
  // string losslessly, whereas Number()/parseFloat() would lose cents on large
  // NUMERIC(18,4) values. Once the magnitude is large enough that binary64
  // spacing (ULP) exceeds 0.01, a fractional cent can no longer be represented
  // (e.g. '99999999999999.9900' -> ...99.98), even though the value is below 2^53.
  const value: string | number = amount ?? 0

  // Validate without losing precision — Number() is only used for the NaN check,
  // never for formatting. Finite values (even oversized ones) pass and are
  // formatted from the original string.
  if (!Number.isFinite(Number(value))) {
    return showSymbol ? `${currencySymbol} 0.00` : '0.00'
  }

  // Format with thousand separators and decimal places. Passing the raw string
  // (not a coerced Number) preserves all significant digits.
  const formatted = new Intl.NumberFormat('en-MY', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true
  }).format(value as any)

  return showSymbol ? `${currencySymbol} ${formatted}` : formatted
}

/**
 * Formats currency for input fields (without symbol)
 */
const formatCurrencyInput = (amount: number | string | null | undefined): string => {
  return formatCurrency(amount, { showSymbol: false })
}

/**
 * Formats currency with no decimals for display (e.g., large numbers)
 */
const formatCurrencyWhole = (amount: number | string | null | undefined): string => {
  return formatCurrency(amount, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })
}
