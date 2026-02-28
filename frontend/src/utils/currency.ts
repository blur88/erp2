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

  // Handle null/undefined/empty values
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)

  // Handle invalid numbers
  if (isNaN(numericAmount)) {
    return showSymbol ? `${currencySymbol} 0.00` : '0.00'
  }

  // Format the number with thousand separators and decimal places
  const formatted = numericAmount.toLocaleString('en-MY', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true
  })

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
