import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatCurrency } from '../currency'

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
