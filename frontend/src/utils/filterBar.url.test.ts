import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '@/types/filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '@/utils/filterBar.url'

interface TestFilters {
  search: string
  status: string | null
  tags: string[]
}

const config: FilterBarConfig<TestFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: {
    search: '',
    status: null,
    tags: [],
  },
}

describe('serializeFilters', () => {
  it('omits default values', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })

  it('serializes search', () => {
    const params = serializeFilters(
      { search: 'gundam', status: null, tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.get('search')).toBe('gundam')
  })

  it('serializes select value', () => {
    const params = serializeFilters(
      { search: '', status: 'active', tags: [] },
      config,
      new URLSearchParams(),
    )
    expect(params.get('status')).toBe('active')
  })

  it('serializes multi-select as repeated params', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: ['a', 'b'] },
      config,
      new URLSearchParams(),
    )
    expect(params.getAll('tags')).toEqual(['a', 'b'])
  })

  it('preserves unrelated params', () => {
    const params = serializeFilters(
      { search: 'x', status: null, tags: [] },
      config,
      new URLSearchParams('tab=archived&sort=desc'),
    )
    expect(params.get('tab')).toBe('archived')
    expect(params.get('sort')).toBe('desc')
    expect(params.get('search')).toBe('x')
  })
})

describe('parseFilters', () => {
  it('returns defaults when URL is empty', () => {
    expect(parseFilters(new URLSearchParams(), config)).toEqual({
      search: '',
      status: null,
      tags: [],
    })
  })

  it('drops invalid select values', () => {
    expect(parseFilters(new URLSearchParams('status=unknown'), config).status).toBeNull()
  })

  it('parses multi-select repeated params and drops invalid values', () => {
    expect(parseFilters(new URLSearchParams('tags=a&tags=b&tags=nope'), config).tags).toEqual(['a', 'b'])
  })
})

describe('getManagedParamKeys', () => {
  it('returns all managed keys', () => {
    expect(getManagedParamKeys(config)).toEqual(
      expect.arrayContaining(['search', 'status', 'tags']),
    )
  })
})
