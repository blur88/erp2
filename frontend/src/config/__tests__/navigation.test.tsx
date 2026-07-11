import { describe, it, expect } from 'vitest'
import { menuSections } from '../navigation'

describe('navigation order', () => {
  it('places Accounting before Administration', () => {
    const ids = menuSections.map((s) => s.id)
    expect(ids.indexOf('accounting')).toBeGreaterThan(-1)
    expect(ids.indexOf('administration')).toBeGreaterThan(-1)
    expect(ids.indexOf('accounting')).toBeLessThan(ids.indexOf('administration'))
  })
})