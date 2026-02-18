import { describe, expect, it } from 'vitest'

import { formatWholeQuantity } from './formatters'

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
