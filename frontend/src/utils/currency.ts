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
 * Normalizes a persisted decimal string for display in a numeric text input.
 *
 * The backend stores money as NUMERIC(18,4) and serializes it as '1000.0000',
 * which would otherwise expose storage precision in the form field (issue #993).
 * Trailing fractional zeros are trimmed down to a floor of two decimals, so
 * money reads conventionally ('1000.00', '1000.10') without inventing a maximum
 * precision: significant digits beyond two are always kept, so a scale-4 value
 * like '0.0001' survives intact and nothing is ever rounded away.
 *
 * The transform is purely lexical — the value is never parsed into a JS number,
 * because binary64 spacing loses fractional cents on large NUMERIC(18,4) values
 * (see the note on formatCurrency above). Only canonical numeric strings are
 * normalized; anything else (including decimal-like text such as 'abc.0000') is
 * returned unchanged, so this can never mangle an unexpected value.
 */
const CANONICAL_NUMBER = /^[+-]?\d+(\.\d+)?$/
const MIN_FRACTION_DIGITS = 2

export const toAmountInputValue = (
  value: string | number | null | undefined
): string => {
  if (value === null || value === undefined) return ''

  const raw = String(value)
  if (!CANONICAL_NUMBER.test(raw)) return raw

  const [integerPart, fractionPart = ''] = raw.split('.')

  // Trim only the zeros past the floor, so '1000.0000' -> '1000.00' while
  // '0.0001' keeps every significant digit. Padding covers bare integers.
  const trimmed = fractionPart.replace(/0+$/, '')
  const fraction = trimmed.padEnd(MIN_FRACTION_DIGITS, '0')

  return `${integerPart}.${fraction}`
}

/**
 * Scale-4 money arithmetic, mirroring backend/src/common/utils/money.ts.
 *
 * Persisted money is NUMERIC(_,4). Parsing it into a JS number loses fractional
 * cents once binary64 spacing exceeds 0.0001 (see the note on formatCurrency),
 * so all arithmetic here runs on bigint minor units — 1 unit = 0.0001 — and only
 * ever converts back to a decimal string.
 *
 * These take `string`, never `number`: accepting a number would admit a value
 * that has already lost precision, defeating the lexical contract.
 *
 * decimal.js is deliberately not used: it is a transitive package, not a direct
 * frontend dependency.
 */
const AMOUNT_SCALE = 4
const AMOUNT_DIVISOR = 10n ** BigInt(AMOUNT_SCALE)
const CANONICAL_AMOUNT = /^[+-]?\d+(\.\d+)?$/

export const toScaledAmount = (
  value: string | null | undefined
): bigint | null => {
  if (value === null || value === undefined) return null

  const raw = value.trim()
  if (raw === '' || !CANONICAL_AMOUNT.test(raw)) return null

  const negative = raw.startsWith('-')
  const unsigned = raw.replace(/^[+-]/, '')
  const [integerPart, fractionPart = ''] = unsigned.split('.')

  // More precision than the column can hold would be silently truncated.
  if (fractionPart.length > AMOUNT_SCALE) return null

  const units =
    BigInt(integerPart) * AMOUNT_DIVISOR +
    BigInt(fractionPart.padEnd(AMOUNT_SCALE, '0'))

  return negative ? -units : units
}

export const fromScaledAmount = (units: bigint): string => {
  const negative = units < 0n
  const absolute = negative ? -units : units
  const integerPart = absolute / AMOUNT_DIVISOR
  const fractionPart = (absolute % AMOUNT_DIVISOR)
    .toString()
    .padStart(AMOUNT_SCALE, '0')

  return `${negative ? '-' : ''}${integerPart}.${fractionPart}`
}

/**
 * Sums amounts in minor units.
 *
 * Empty and nullish entries are skipped — an untouched payment line is not an
 * error. A malformed non-empty entry returns null rather than counting as zero,
 * so callers must treat "invalid" as its own state and block submission instead
 * of silently under-totalling.
 */
export const sumScaledAmounts = (
  values: (string | null | undefined)[]
): bigint | null => {
  let total = 0n

  for (const value of values) {
    if (value === null || value === undefined || value.trim() === '') continue

    const units = toScaledAmount(value)
    if (units === null) return null

    total += units
  }

  return total
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
