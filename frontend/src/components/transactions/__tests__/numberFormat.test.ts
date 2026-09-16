import { describe, expect, it } from 'vitest'

import { formatNum } from '../numberFormat'

describe('formatNum (#1241)', () => {
  it('renders exactly two decimals, including zero', () => {
    expect(formatNum('100')).toBe('100.00')
    expect(formatNum(0)).toBe('0.00')
    expect(formatNum('0.5')).toBe('0.50')
  })

  it('keeps grouping for large values', () => {
    expect(formatNum('1000')).toBe('1,000.00')
  })

  it('never renders negative zero', () => {
    expect(formatNum('-0.0032')).toBe('0.00')
    expect(formatNum(-0.001)).toBe('0.00')
  })

  it('keeps a real negative cent negative', () => {
    expect(formatNum('-0.01')).toBe('-0.01')
  })

  it('returns an empty string for empty or nullish input', () => {
    expect(formatNum('')).toBe('')
    // @ts-expect-error runtime nullish guard
    expect(formatNum(null)).toBe('')
    // @ts-expect-error runtime nullish guard
    expect(formatNum(undefined)).toBe('')
  })
})
