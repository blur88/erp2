import { describe, expect, it } from 'vitest'

import { parseFilters, serializeFilters } from '@/utils/filterBar.url'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface F { showZero: boolean }

const config: FilterBarConfig<F> = {
  fields: [{ field: 'showZero', label: 'Show zero', type: 'boolean' }],
  defaults: { showZero: false },
}

describe('filterBar.url boolean field', () => {
  it('serializes true', () => {
    const params = serializeFilters({ showZero: true }, config, new URLSearchParams())
    expect(params.get('showZero')).toBe('true')
  })

  it('omits false, which is the default', () => {
    const params = serializeFilters({ showZero: false }, config, new URLSearchParams())
    expect(params.has('showZero')).toBe(false)
  })

  it('parses the exact string true', () => {
    expect(parseFilters(new URLSearchParams('showZero=true'), config)).toEqual({ showZero: true })
  })

  it('treats any other value as false', () => {
    // Matches the page's previous behaviour: only "true" is truthy.
    for (const raw of ['1', 'TRUE', 'yes', '']) {
      expect(parseFilters(new URLSearchParams(`showZero=${raw}`), config)).toEqual({
        showZero: false,
      })
    }
  })

  it('defaults to false when absent', () => {
    expect(parseFilters(new URLSearchParams(''), config)).toEqual({ showZero: false })
  })
})
