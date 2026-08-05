import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  formatCurrency,
  toAmountInputValue,
  toScaledAmount,
  fromScaledAmount,
  sumScaledAmounts,
  allocateByLargestRemainder,
} from '../currency'

describe('formatCurrency', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    localStorage.clear()
  })

  it('defaults to the RM symbol when no currency is cached', () => {
    expect(formatCurrency('1000.0000')).toBe('RM 1,000.00')
  })

  it('uses the cached defaultCurrency symbol', () => {
    localStorage.setItem('defaultCurrency', 'USD')
    expect(formatCurrency('1000.0000')).toBe('USD 1,000.00')
  })

  it('honors a currency override', () => {
    expect(formatCurrency('1000.0000', { currency: 'EUR' })).toBe('EUR 1,000.00')
  })

  it('formats NUMERIC(18,4) strings with grouping and 2dp', () => {
    expect(formatCurrency('5000.0000')).toBe('RM 5,000.00')
    expect(formatCurrency('100.0000')).toBe('RM 100.00')
    expect(formatCurrency('1234.5')).toBe('RM 1,234.50')
  })

  // The core precision guarantee: on large NUMERIC(18,4) values, binary64 spacing
  // (ULP) exceeds one cent — the value here is below 2^53, yet a Number/parseFloat
  // round-trip cannot represent the fractional cent (parseFloat('99999999999999.9900')
  // yields ...99.98). Formatting from the string preserves the exact cents.
  it('preserves cents for large NUMERIC(18,4) values beyond Number precision', () => {
    expect(formatCurrency('99999999999999.9900')).toBe('RM 99,999,999,999,999.99')
  })

  it('formats negative amounts', () => {
    expect(formatCurrency('-9999.99')).toBe('RM -9,999.99')
    expect(formatCurrency(-1234.5)).toBe('RM -1,234.50')
  })

  it('treats null/undefined/zero as RM 0.00', () => {
    expect(formatCurrency(null)).toBe('RM 0.00')
    expect(formatCurrency(undefined)).toBe('RM 0.00')
    expect(formatCurrency(0)).toBe('RM 0.00')
    expect(formatCurrency('0.0000')).toBe('RM 0.00')
  })

  it('falls back to 0.00 for invalid and non-finite input', () => {
    expect(formatCurrency('abc')).toBe('RM 0.00')
    expect(formatCurrency('')).toBe('RM 0.00')
    expect(formatCurrency(NaN)).toBe('RM 0.00')
    expect(formatCurrency(Infinity)).toBe('RM 0.00')
    expect(formatCurrency(-Infinity)).toBe('RM 0.00')
  })

  it('omits the symbol when showSymbol is false', () => {
    expect(formatCurrency('1000.0000', { showSymbol: false })).toBe('1,000.00')
    expect(formatCurrency('abc', { showSymbol: false })).toBe('0.00')
  })

  it('respects fraction-digit options', () => {
    expect(
      formatCurrency('5000.0000', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    ).toBe('RM 5,000')
  })
})

describe('toAmountInputValue', () => {
  it('trims storage precision down to the two-decimal floor', () => {
    expect(toAmountInputValue('1000.0000')).toBe('1000.00')
  })

  it('keeps significant fractional digits, padded to the floor', () => {
    expect(toAmountInputValue('1000.5000')).toBe('1000.50')
    expect(toAmountInputValue('1000.1000')).toBe('1000.10')
  })

  it('preserves scale-4 values rather than rounding to the floor', () => {
    expect(toAmountInputValue('0.0001')).toBe('0.0001')
  })

  it('never truncates precision beyond two decimals', () => {
    expect(toAmountInputValue('1000.12345')).toBe('1000.12345')
  })

  it('pads bare integers up to the floor', () => {
    expect(toAmountInputValue('1000')).toBe('1000.00')
  })

  it('returns an empty string for empty, null and undefined', () => {
    expect(toAmountInputValue('')).toBe('')
    expect(toAmountInputValue(null)).toBe('')
    expect(toAmountInputValue(undefined)).toBe('')
  })

  it('passes non-numeric text through unchanged', () => {
    expect(toAmountInputValue('abc')).toBe('abc')
  })

  it('passes decimal-like non-numeric text through unchanged', () => {
    expect(toAmountInputValue('abc.0000')).toBe('abc.0000')
  })

  it('handles negative canonical decimals', () => {
    expect(toAmountInputValue('-25.5000')).toBe('-25.50')
  })

  it('handles an explicit positive sign', () => {
    expect(toAmountInputValue('+25.5000')).toBe('+25.50')
  })

  it('does not round or lose digits on large high-precision values', () => {
    expect(toAmountInputValue('99999999999999.9900')).toBe('99999999999999.99')
  })

  it('accepts numbers by converting through their string form', () => {
    expect(toAmountInputValue(1000)).toBe('1000.00')
  })
})

describe('toScaledAmount', () => {
  it('converts canonical decimals to scale-4 minor units', () => {
    expect(toScaledAmount('1000.0000')).toBe(10000000n)
    expect(toScaledAmount('1000')).toBe(10000000n)
    expect(toScaledAmount('0.0001')).toBe(1n)
    expect(toScaledAmount('1000.5')).toBe(10005000n)
  })

  it('does not lose digits on the largest decimal(15,4) value', () => {
    // 11 integer digits; Number() would drop the trailing cent.
    expect(toScaledAmount('99999999999.9900')).toBe(999999999999900n)
  })

  it('returns null for empty and nullish input', () => {
    expect(toScaledAmount('')).toBeNull()
    expect(toScaledAmount(null)).toBeNull()
    expect(toScaledAmount(undefined)).toBeNull()
  })

  it('returns null for malformed input', () => {
    expect(toScaledAmount('abc')).toBeNull()
    expect(toScaledAmount('1e3')).toBeNull()
    expect(toScaledAmount('1.2.3')).toBeNull()
    expect(toScaledAmount('1..2')).toBeNull()
  })

  it('returns null for more than 4 fractional digits', () => {
    expect(toScaledAmount('1.00001')).toBeNull()
  })

  it('handles negative values', () => {
    expect(toScaledAmount('-25.5000')).toBe(-255000n)
  })
})

describe('fromScaledAmount', () => {
  it('formats minor units as a scale-4 decimal string', () => {
    expect(fromScaledAmount(10000000n)).toBe('1000.0000')
    expect(fromScaledAmount(1n)).toBe('0.0001')
    expect(fromScaledAmount(0n)).toBe('0.0000')
    expect(fromScaledAmount(-255000n)).toBe('-25.5000')
  })

  it('round-trips with toScaledAmount', () => {
    expect(fromScaledAmount(toScaledAmount('1234.5678')!)).toBe('1234.5678')
  })
})

describe('sumScaledAmounts', () => {
  it('sums exactly where binary64 would drift', () => {
    // 0.1 + 0.2 === 0.30000000000000004 as JS numbers.
    expect(sumScaledAmounts(['0.1', '0.2'])).toBe(3000n)
    expect(fromScaledAmount(sumScaledAmounts(['0.1', '0.2'])!)).toBe('0.3000')
  })

  it('skips empty and nullish entries', () => {
    expect(sumScaledAmounts(['1.0000', '', null, undefined])).toBe(10000n)
  })

  it('returns 0n when no valid entries remain', () => {
    expect(sumScaledAmounts([])).toBe(0n)
    expect(sumScaledAmounts(['', null])).toBe(0n)
  })

  it('returns null when any non-empty value is malformed', () => {
    // Must never treat garbage as zero: that turns a typo into an under-total
    // that passes the balance check.
    expect(sumScaledAmounts(['1.0000', 'abc'])).toBeNull()
    expect(sumScaledAmounts(['1.0000', '1e3'])).toBeNull()
    expect(sumScaledAmounts(['1.0000', '1.00001'])).toBeNull()
  })
})

describe('allocateByLargestRemainder', () => {
  const sum = (values: bigint[]) => values.reduce((total, v) => total + v, 0n)

  it('distributes an indivisible surplus so the parts sum to exactly the target', () => {
    // Three payments of 100.0000 sharing a 50.0000 surplus. Half-up rounding
    // would give three 16.6667 seeds summing to 50.0001 — one unit over.
    const weights = [1000000n, 1000000n, 1000000n]
    const allocations = allocateByLargestRemainder(weights, 500000n)

    expect(allocations).toEqual([166667n, 166667n, 166666n])
    expect(sum(allocations)).toBe(500000n)
    expect(allocations.map(fromScaledAmount)).toEqual(['16.6667', '16.6667', '16.6666'])
  })

  it('keeps the sum exact as the source count grows', () => {
    // 7 equal sources sharing 50.0000: half-up overshot by 0.0003 here.
    const weights = Array.from({ length: 7 }, () => 1000000n)
    const allocations = allocateByLargestRemainder(weights, 500000n)

    expect(sum(allocations)).toBe(500000n)
    // Leftover units land on the earliest sources — stable, not arbitrary.
    expect(allocations).toEqual([71429n, 71429n, 71429n, 71429n, 71428n, 71428n, 71428n])
  })

  it('breaks remainder ties by source order, so the result is stable', () => {
    const first = allocateByLargestRemainder([1000000n, 1000000n, 1000000n], 100n)
    const second = allocateByLargestRemainder([1000000n, 1000000n, 1000000n], 100n)

    // All remainders equal; the extra unit must always go to the same source.
    expect(first).toEqual([34n, 33n, 33n])
    expect(first).toEqual(second)
  })

  it('is exact when the target equals the weight total', () => {
    const weights = [1000000n, 500000n, 1n]
    const allocations = allocateByLargestRemainder(weights, sum(weights))

    // Full-available refunds must seed each source at its own amount.
    expect(allocations).toEqual(weights)
    expect(sum(allocations)).toBe(sum(weights))
  })

  it('never allocates a source more than its own available amount', () => {
    // A tiny source alongside a large one: its cap is 1 minor unit.
    const weights = [1n, 1000000n]
    const allocations = allocateByLargestRemainder(weights, 1000001n)

    expect(allocations[0]).toBeLessThanOrEqual(weights[0])
    expect(allocations[1]).toBeLessThanOrEqual(weights[1])
    expect(sum(allocations)).toBe(1000001n)
  })

  it('caps the total at the weight total when the target exceeds it', () => {
    const weights = [100n, 100n]
    const allocations = allocateByLargestRemainder(weights, 1000n)

    // Cannot distribute more than the sources hold.
    expect(allocations).toEqual([100n, 100n])
    expect(sum(allocations)).toBe(200n)
  })

  it('distributes proportionally across unequal weights', () => {
    // 300.0000 and 100.0000 sharing 100.0000 → 75.0000 / 25.0000.
    const allocations = allocateByLargestRemainder([3000000n, 1000000n], 1000000n)

    expect(allocations).toEqual([750000n, 250000n])
    expect(sum(allocations)).toBe(1000000n)
  })

  it('returns zeros for a zero target, zero weights, or an empty list', () => {
    expect(allocateByLargestRemainder([1000000n, 1000000n], 0n)).toEqual([0n, 0n])
    expect(allocateByLargestRemainder([0n, 0n], 500000n)).toEqual([0n, 0n])
    expect(allocateByLargestRemainder([], 500000n)).toEqual([])
  })

  it('does not lose units on large scale-4 values', () => {
    // 11 integer digits — the maximum decimal(15,4) allows.
    const weights = [999999999999900n, 1n]
    const allocations = allocateByLargestRemainder(weights, 999999999999901n)

    expect(sum(allocations)).toBe(999999999999901n)
  })
})
