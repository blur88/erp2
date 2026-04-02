import { describe, expect, it } from 'vitest'

import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
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

interface PeriodFilters {
  period: PeriodValue
}

const periodConfig: FilterBarConfig<PeriodFilters> = {
  quick: [
    { field: 'period', label: 'Period', type: 'period' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
  },
}

describe('serializeFilters — period field', () => {
  it('serializes a preset period key as a single param', () => {
    const params = serializeFilters(
      { period: { key: 'last_week', from: null, to: null } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.get('period')).toBe('last_week')
    expect(params.get('period_from')).toBeNull()
    expect(params.get('period_to')).toBeNull()
  })

  it('serializes custom range as three params', () => {
    const params = serializeFilters(
      { period: { key: 'custom', from: '2026-01-01', to: '2026-03-31' } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.get('period')).toBe('custom')
    expect(params.get('period_from')).toBe('2026-01-01')
    expect(params.get('period_to')).toBe('2026-03-31')
  })

  it('omits period params when value equals default', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null } },
      periodConfig,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })
})

describe('parseFilters — period field', () => {
  it('parses a valid preset period key', () => {
    const result = parseFilters(
      new URLSearchParams('period=last_year'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'last_year', from: null, to: null })
  })

  it('parses custom range', () => {
    const result = parseFilters(
      new URLSearchParams('period=custom&period_from=2026-01-01&period_to=2026-03-31'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'custom', from: '2026-01-01', to: '2026-03-31' })
  })

  it('falls back to default on invalid period key', () => {
    const result = parseFilters(
      new URLSearchParams('period=not_a_real_period'),
      periodConfig,
    )
    expect(result.period).toEqual({ key: 'this_month', from: null, to: null })
  })

  it('falls back to default when period param is absent', () => {
    const result = parseFilters(new URLSearchParams(), periodConfig)
    expect(result.period).toEqual({ key: 'this_month', from: null, to: null })
  })
})

describe('getManagedParamKeys — period field', () => {
  it('includes period key and its from/to companions', () => {
    const keys = getManagedParamKeys(periodConfig)
    expect(keys).toEqual(expect.arrayContaining(['period', 'period_from', 'period_to']))
  })
})

interface NamespacedFilters {
  search: string
  status: string | null
}

const namespacedConfig: FilterBarConfig<NamespacedFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  defaults: { search: '', status: null },
  namespace: 'orders',
}

describe('serializeFilters — namespace', () => {
  it('prefixes all params with namespace', () => {
    const params = serializeFilters(
      { search: 'foo', status: 'active' },
      namespacedConfig,
      new URLSearchParams(),
    )
    expect(params.get('orders_search')).toBe('foo')
    expect(params.get('orders_status')).toBe('active')
    expect(params.get('search')).toBeNull()
    expect(params.get('status')).toBeNull()
  })

  it('preserves unrelated params when namespace is set', () => {
    const params = serializeFilters(
      { search: 'foo', status: null },
      namespacedConfig,
      new URLSearchParams('tab=archived'),
    )
    expect(params.get('tab')).toBe('archived')
    expect(params.get('orders_search')).toBe('foo')
  })
})

describe('parseFilters — namespace', () => {
  it('reads params using namespace prefix', () => {
    const result = parseFilters(
      new URLSearchParams('orders_search=foo&orders_status=active'),
      namespacedConfig,
    )
    expect(result.search).toBe('foo')
    expect(result.status).toBe('active')
  })

  it('does not read unprefixed params when namespace is set', () => {
    const result = parseFilters(
      new URLSearchParams('search=foo&status=active'),
      namespacedConfig,
    )
    expect(result.search).toBe('')
    expect(result.status).toBeNull()
  })
})

describe('getManagedParamKeys — namespace', () => {
  it('returns prefixed keys', () => {
    const keys = getManagedParamKeys(namespacedConfig)
    expect(keys).toEqual(expect.arrayContaining(['orders_search', 'orders_status']))
    expect(keys).not.toContain('search')
    expect(keys).not.toContain('status')
  })
})
