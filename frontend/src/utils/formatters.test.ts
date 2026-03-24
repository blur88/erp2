// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { formatDate, formatDateTime, formatWholeQuantity } from './formatters'

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
