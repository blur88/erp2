import { describe, expect, it } from 'vitest'

import { PERIOD_GROUPS, PERIOD_KEYS } from './periods'

describe('PERIOD_GROUPS', () => {
  it('contains exactly four groups', () => {
    expect(PERIOD_GROUPS).toHaveLength(4)
  })

  it('covers every key in PERIOD_KEYS exactly once', () => {
    const flat = PERIOD_GROUPS.flat()

    expect(flat.slice().sort()).toEqual([...PERIOD_KEYS].sort())
    expect(flat).toHaveLength(PERIOD_KEYS.length)
  })

  it('has the correct group order', () => {
    expect(PERIOD_GROUPS[0]).toEqual(['today', 'this_week', 'this_month', 'this_year'])
    expect(PERIOD_GROUPS[1]).toEqual(['yesterday', 'last_week', 'last_month', 'last_year'])
    expect(PERIOD_GROUPS[2]).toEqual(['last_7_days', 'last_30_days', 'last_365_days'])
    expect(PERIOD_GROUPS[3]).toEqual(['custom'])
  })
})
