import { describe, expect, it } from 'vitest'

import { deriveChips } from '../filterBar.chips'
import type { FilterBarConfig } from '../filterBar.types'

interface Filters {
  search: string
  status: string | null
  tags: string[]
  toggle: boolean | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: '' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
    { field: 'toggle', label: 'Feature', type: 'toggle' },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: { search: '', status: null, tags: [], toggle: null },
}

describe('deriveChips', () => {
  it('returns no chips for defaults', () => {
    expect(deriveChips({ search: '', status: null, tags: [], toggle: null }, config)).toHaveLength(0)
  })

  it('formats select, multi-select, and toggle chips', () => {
    expect(deriveChips({ search: '', status: 'active', tags: [], toggle: null }, config)).toEqual([{ field: 'status', label: 'Status: Active' }])
    expect(deriveChips({ search: '', status: null, tags: ['a'], toggle: null }, config)).toEqual([{ field: 'tags', label: 'Tags: A' }])
    expect(deriveChips({ search: '', status: null, tags: ['a', 'b'], toggle: null }, config)).toEqual([{ field: 'tags', label: 'Tags: 2 selected' }])
    expect(deriveChips({ search: '', status: null, tags: [], toggle: true }, config)).toEqual([{ field: 'toggle', label: 'Feature: On' }])
  })

  it('uses chip formatter when provided', () => {
    const customConfig: FilterBarConfig<Filters> = {
      ...config,
      quick: [
        { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }], chipFormatter: (value) => `custom:${value}` },
        { field: 'toggle', label: 'Feature', type: 'toggle' },
      ],
    }
    expect(deriveChips({ search: '', status: 'active', tags: [], toggle: null }, customConfig)[0].label).toBe('custom:active')
  })
})
