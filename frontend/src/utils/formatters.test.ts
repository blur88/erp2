// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatQuantity, formatSalesPeriodLabel, formatWholeQuantity, isValidIsoDate, toDateInputValue, toMuiDatePickerFormat } from './formatters'

describe('formatWholeQuantity', () => {
  it('removes decimal places from numeric quantities', () => {
    expect(formatWholeQuantity(3.75)).toBe('3')
    expect(formatWholeQuantity('12.00')).toBe('12')
  })

  it('returns whole-number quantities unchanged', () => {
    expect(formatWholeQuantity(5)).toBe('5')
    expect(formatWholeQuantity('0')).toBe('0')
  })
})

describe('formatQuantity', () => {
  it('drops insignificant trailing zeros', () => {
    expect(formatQuantity('1.0000')).toBe('1')
    expect(formatQuantity('1.5000')).toBe('1.5')
    expect(formatQuantity('1.2500')).toBe('1.25')
  })

  it('preserves significant four-decimal precision', () => {
    expect(formatQuantity('1.0001')).toBe('1.0001')
    expect(formatQuantity('0.0001')).toBe('0.0001')
  })

  it('returns integer quantities unchanged', () => {
    expect(formatQuantity('7')).toBe('7')
    expect(formatQuantity(7)).toBe('7')
  })

  it('handles negative quantities', () => {
    expect(formatQuantity('-2.5000')).toBe('-2.5')
  })

  it('keeps a zero integer part when all decimals are dropped', () => {
    expect(formatQuantity('0.0000')).toBe('0')
  })

  it('returns an em dash for empty input', () => {
    expect(formatQuantity(null)).toBe('\u2014')
    expect(formatQuantity(undefined)).toBe('\u2014')
    expect(formatQuantity('')).toBe('\u2014')
    expect(formatQuantity('   ')).toBe('\u2014')
  })

  it('passes non-numeric input through untouched', () => {
    expect(formatQuantity('N/A')).toBe('N/A')
  })
})

describe('formatDate', () => {
  it('supports abbreviated month tokens with MMM', () => {
    localStorage.setItem('dateFormat', 'DD MMM YYYY')

    expect(formatDate(new Date(2026, 1, 22, 14, 30))).toBe('22 Feb 2026')
  })

  it('supports full month tokens with MMMM', () => {
    localStorage.setItem('dateFormat', 'MMMM DD, YYYY')

    expect(formatDate(new Date(2026, 1, 22, 14, 30))).toBe('February 22, 2026')
  })
})

describe('formatDateTime', () => {
  it('formats month-word date and 24h time together', () => {
    localStorage.setItem('dateFormat', 'DD MMMM YYYY')
    localStorage.setItem('timeFormat', '24h')

    expect(formatDateTime(new Date(2026, 1, 22, 14, 30))).toBe('22 February 2026 14:30')
  })
})

describe('toMuiDatePickerFormat', () => {
  it('maps saved regional date tokens to date-fns picker tokens', () => {
    expect(toMuiDatePickerFormat('DD/MM/YYYY')).toBe('dd/MM/yyyy')
    expect(toMuiDatePickerFormat('MMMM DD, YYYY')).toBe('MMMM dd, yyyy')
  })
})

describe('formatSalesPeriodLabel', () => {
  it('formats daily sales period labels using the saved regional date format', () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')

    expect(formatSalesPeriodLabel('2026-03-27')).toBe('27/03/2026')
  })
})

describe('toDateInputValue', () => {
  it('passes a date-only string through unchanged', () => {
    expect(toDateInputValue('2026-07-20')).toBe('2026-07-20')
  })

  it('returns empty string for nullish input', () => {
    expect(toDateInputValue(null)).toBe('')
    expect(toDateInputValue(undefined)).toBe('')
    expect(toDateInputValue('')).toBe('')
  })

  it('extracts the UTC calendar date from a UTC-midnight timestamp (no local shift)', () => {
    expect(toDateInputValue('2026-07-20T00:00:00.000Z')).toBe('2026-07-20')
    expect(toDateInputValue(new Date('2026-07-20T00:00:00.000Z'))).toBe('2026-07-20')
  })

  it('extracts the UTC calendar date from a non-midnight timestamp', () => {
    expect(toDateInputValue('2026-07-20T18:30:00.000Z')).toBe('2026-07-20')
  })
})

describe('isValidIsoDate', () => {
  it('accepts a real calendar date', () => {
    expect(isValidIsoDate('2026-03-01')).toBe(true)
    expect(isValidIsoDate('2026-12-31')).toBe(true)
  })

  it('rejects a date that does not exist', () => {
    expect(isValidIsoDate('2026-02-31')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('2025-02-29')).toBe(false)
  })

  it('accepts a leap day in a leap year', () => {
    expect(isValidIsoDate('2024-02-29')).toBe(true)
  })

  it('rejects malformed strings', () => {
    expect(isValidIsoDate('')).toBe(false)
    expect(isValidIsoDate('2026-3-1')).toBe(false)
    expect(isValidIsoDate('03/01/2026')).toBe(false)
    expect(isValidIsoDate('2026-03-01T00:00:00Z')).toBe(false)
    expect(isValidIsoDate('not-a-date')).toBe(false)
  })
})
