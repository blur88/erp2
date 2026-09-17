/**
 * Currency formatting utilities with dynamic currency from settings
 */

/**
 * Get currency symbol from localStorage cache
 * Falls back to 'RM' if not found
 */
export const getCurrencySymbol = (): string => {
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

  // Regional Settings controls grouping while the locale supplies the configured
  // en-MY separators. The supported setting currently distinguishes grouped
  // `1,234.56` from ungrouped `1234.56` output.
  const numberFormat = localStorage.getItem('numberFormat') || '1,234.56'
  const useGrouping = numberFormat !== '1234.56'

  // Intl renders "-0.00" for values like -0.001 when both fraction-digit
  // options are 2 — which is this function's default (#1241). Collapse a value
  // that rounds to zero at the requested precision onto positive zero. A real
  // negative cent (-0.01) is untouched because it does not round to zero.
  const roundsToZero =
    Number(value) > -0.5 / 10 ** maximumFractionDigits &&
    Number(value) < 0.5 / 10 ** maximumFractionDigits
  const displayValue: string | number = roundsToZero ? 0 : value

  const formatted = new Intl.NumberFormat('en-MY', {
    minimumFractionDigits,
    maximumFractionDigits,
    useGrouping,
  }).format(displayValue as any)

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
 * Repairs a trailing decimal point in a user-typed amount.
 *
 * The Expense form's Yup schema enforces the backend DTO grammar
 * (^\d+(\.\d{1,4})?$) verbatim, which rejects '1000.' — a shape users
 * legitimately produce mid-typing (issue #1001). Appending '00' makes it
 * canonical without changing its value.
 *
 * The repair is deliberately narrow: only /^\d+\.$/ is touched. Whitespace,
 * signs, leading decimals ('.5'), exponent notation ('1e3') and excess
 * precision are returned unchanged so the schema reports them, because
 * silently repairing them could conceal unintended input.
 *
 * Purely lexical — the value is never parsed into a JS number, matching the
 * money contract documented above.
 */
const TRAILING_DECIMAL_POINT = /^\d+\.$/

export const normalizeAmountInput = (value: string): string =>
  TRAILING_DECIMAL_POINT.test(value) ? `${value}00` : value

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

  // The signature is string-only on purpose — a number here has already lost
  // precision. But untyped runtime data (legacy API shapes, `as` casts) can
  // still reach this, and a thrown TypeError in a print or dialog render is
  // worse than returning null: guard rather than assume.
  if (typeof value !== 'string') return null

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
 * Distributes `targetMinor` across `weightsMinor` proportionally, in minor units,
 * so the allocations sum to **exactly** the target.
 *
 * Largest-remainder (Hare quota) method:
 *   1. floor each proportional share,
 *   2. rank sources by the remainder they gave up,
 *   3. hand the leftover units to the largest remainders, breaking ties by the
 *      caller's source order so the result is stable across renders.
 *
 * Rounding each share half-up independently and then patching the largest line
 * does not work: with three equal sources sharing 50.0000, half-up yields three
 * 16.6667 seeds summing to 50.0001, and patching hides the error in one line
 * rather than distributing it. Flooring first can only under-distribute, and the
 * leftover is then handed out one unit at a time, so the sum is exact by
 * construction and no allocation ever exceeds its own weight (its cap).
 *
 * Every allocation is capped at its weight, so a source can never be assigned
 * more than it has available. Returns all zeros when the weights sum to zero.
 *
 * Negative targets (refunds, credit notes) allocate the magnitude and take the
 * sign back at the end, instead of silently returning zeros (#1241). A target
 * exceeding the total capacity is rejected rather than silently truncated: it
 * always signals a caller bug, and truncation hid it.
 */
export const allocateByLargestRemainder = (
  weightsMinor: bigint[],
  targetMinor: bigint
): bigint[] => {
  const weightTotal = weightsMinor.reduce((sum, w) => sum + w, 0n)
  if (weightTotal <= 0n || targetMinor === 0n) return weightsMinor.map(() => 0n)

  // Negative settlement targets allocate the magnitude and take the sign back
  // at the end. Returning zeros here silently lost the entire amount (#1241).
  const negative = targetMinor < 0n
  const absTarget = negative ? -targetMinor : targetMinor

  // Silently truncating an over-capacity target hid a caller bug. Reject it.
  if (absTarget > weightTotal) {
    throw new Error(
      `allocateByLargestRemainder: target ${absTarget} exceeds total capacity ${weightTotal}`
    )
  }

  const floored = weightsMinor.map((weight) => (weight * absTarget) / weightTotal)
  const remainders = weightsMinor.map(
    (weight, index) => weight * absTarget - floored[index] * weightTotal
  )

  let leftover = absTarget - floored.reduce((sum, share) => sum + share, 0n)

  // Largest remainder first; equal remainders keep the caller's source order.
  const order = weightsMinor
    .map((_, index) => index)
    .sort((a, b) => {
      if (remainders[a] === remainders[b]) return a - b
      return remainders[a] > remainders[b] ? -1 : 1
    })

  const allocations = [...floored]
  for (const index of order) {
    if (leftover <= 0n) break
    // Respect each source's cap; skip any already at its weight.
    if (allocations[index] >= weightsMinor[index]) continue
    allocations[index] += 1n
    leftover -= 1n
  }

  return negative ? allocations.map((allocation) => -allocation) : allocations
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

/**
 * Scale-4 cent quantization, mirroring backend/src/common/utils/money.ts (#1241).
 * HALF-UP away from zero for both signs. Result stays scale-4, divisible by 100.
 */
const CENT_UNITS = 100n

export const quantizeToCents = (minor: bigint): bigint => {
  const neg = minor < 0n
  const abs = neg ? -minor : minor
  const rounded = ((abs + CENT_UNITS / 2n) / CENT_UNITS) * CENT_UNITS
  return neg ? -rounded : rounded
}

/** Exactly two fraction digits, no symbol, never "-0.00". */
export const formatMoney = (minor: bigint): string => {
  const cents = quantizeToCents(minor)
  const neg = cents < 0n
  const abs = neg ? -cents : cents
  const whole = abs / 10000n
  const frac = ((abs % 10000n) / CENT_UNITS).toString().padStart(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/** Uncapped proportional spread; residual to the last line. See backend docs. */
export const allocate = (
  targetMinor: bigint,
  weightsMinor: readonly bigint[]
): bigint[] => {
  for (const w of weightsMinor) {
    if (w < 0n) throw new Error(`allocate: negative weight is not allowed: ${w}`)
  }
  if (targetMinor === 0n) return weightsMinor.map(() => 0n)

  const weightTotal = weightsMinor.reduce((sum, w) => sum + w, 0n)
  if (weightTotal === 0n) {
    throw new Error('allocate: no positive weights to receive a non-zero target')
  }

  const neg = targetMinor < 0n
  const absTarget = neg ? -targetMinor : targetMinor
  const shares = weightsMinor.map((w) => (w * absTarget) / weightTotal)
  const distributed = shares.reduce((sum, s) => sum + s, 0n)
  shares[shares.length - 1] += absTarget - distributed

  return neg ? shares.map((s) => -s) : shares
}

/** Cent-level second pass; see backend/src/common/utils/money.ts. */
export const reconcileToCents = (
  sharesMinor: readonly bigint[],
  targetCentsMinor: bigint
): bigint[] => {
  const target = quantizeToCents(targetCentsMinor)
  const rounded = sharesMinor.map((s) => quantizeToCents(s))
  let drift = rounded.reduce((sum, s) => sum + s, 0n) - target

  for (let i = rounded.length - 1; i >= 0 && drift !== 0n; i -= 1) {
    const adjusted = rounded[i] - drift
    const sameSign =
      (adjusted >= 0n && rounded[i] >= 0n) || (adjusted <= 0n && rounded[i] <= 0n)
    if (sameSign) {
      rounded[i] = adjusted
      drift = 0n
    }
  }

  if (drift !== 0n) {
    throw new Error(
      `reconcileToCents: could not absorb drift of ${drift} without flipping a sign`
    )
  }

  return rounded
}
