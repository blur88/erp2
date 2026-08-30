import { describe, expect, it } from 'vitest'

import { parseFilters, serializeFilters } from '@/utils/filterBar.url'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface F { asOfDate: string | null }

const config: FilterBarConfig<F> = {
  fields: [{ field: 'asOfDate', label: 'As of Date', type: 'date' }],
  defaults: { asOfDate: null },
}

describe('filterBar.url date field', () => {
  it('serializes a non-default date', () => {
    const params = serializeFilters({ asOfDate: '2026-03-15' }, config, new URLSearchParams())
    expect(params.get('asOfDate')).toBe('2026-03-15')
  })

  it('omits a date equal to the default', () => {
    const params = serializeFilters({ asOfDate: null }, config, new URLSearchParams())
    expect(params.has('asOfDate')).toBe(false)
  })

  it('parses a valid date', () => {
    expect(parseFilters(new URLSearchParams('asOfDate=2026-03-15'), config)).toEqual({
      asOfDate: '2026-03-15',
    })
  })

  it('falls back to the default for a malformed date', () => {
    expect(parseFilters(new URLSearchParams('asOfDate=nonsense'), config)).toEqual({
      asOfDate: null,
    })
    expect(parseFilters(new URLSearchParams('asOfDate=2026-13-45'), config)).toEqual({
      asOfDate: null,
    })
  })

  it('falls back to the default for a real but implausible year', () => {
    expect(parseFilters(new URLSearchParams('asOfDate=0202-08-15'), config)).toEqual({
      asOfDate: null,
    })
  })
})
