/**
 * Currency formatting utilities for Malaysian Ringgit (RM)
 */

/**
 * Formats a number as Malaysian Ringgit (RM) currency
 * @param amount - The amount to format
 * @param options - Optional formatting options
 * @returns Formatted currency string in "RM 0,000,000.00" format
 */
export const formatCurrency = (
  amount: number | string | null | undefined, 
  options: {
    minimumFractionDigits?: number
    maximumFractionDigits?: number
    showSymbol?: boolean
  } = {}
): string => {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    showSymbol = true
  } = options

  // Handle null/undefined/empty values
  const numericAmount = typeof amount === 'string' ? parseFloat(amount) : (amount ?? 0)
  
  // Handle invalid numbers
  if (isNaN(numericAmount)) {
    return showSymbol ? 'RM 0.00' : '0.00'
  }

  // Format the number with thousand separators and decimal places
  const formatted = numericAmount.toLocaleString('en-MY', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping: true
  })

  return showSymbol ? `RM ${formatted}` : formatted
}

/**
 * Formats currency for input fields (without symbol)
 */
export const formatCurrencyInput = (amount: number | string | null | undefined): string => {
  return formatCurrency(amount, { showSymbol: false })
}

/**
 * Formats currency with no decimals for display (e.g., large numbers)
 */
export const formatCurrencyWhole = (amount: number | string | null | undefined): string => {
  return formatCurrency(amount, { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  })
}