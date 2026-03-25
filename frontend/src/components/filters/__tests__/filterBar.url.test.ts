import { describe, expect, it } from 'vitest'

import type { DateRangeValue, FilterBarConfig, NumberRangeValue } from '../filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '../filterBar.url'

interface TestFilters {
  search: string
  status: string | null
  tags: string[]
  toggle: boolean | null
  dateRange: DateRangeValue
  amountRange: NumberRangeValue
}

const config: FilterBarConfig<TestFilters> = {
  search: { placeholder: 'Search...' },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
    { field: 'toggle', label: 'Toggle', type: 'toggle' },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { field: 'dateRange', label: 'Date', type: 'date-range', paramKey: 'created' },
    { field: 'amountRange', label: 'Amount', type: 'number-range', paramKey: 'amount' },
  ],
  defaults: {
    search: '',
    status: null,
    tags: [],
    toggle: null,
    dateRange: { from: null, to: null },
    amountRange: { min: null, max: null },
  },
}

describe('serializeFilters', () => {
  it('omits default values', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })

  it('serializes search', () => {
    const params = serializeFilters(
      { search: 'gundam', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('search')).toBe('gundam')
  })

  it('serializes select value', () => {
    const params = serializeFilters(
      { search: '', status: 'active', tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('status')).toBe('active')
  })

  it('serializes multi-select as repeated params', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: ['a', 'b'], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.getAll('tags')).toEqual(['a', 'b'])
  })

  it('serializes toggle true/false but omits null', () => {
    const trueParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: true, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(trueParams.get('toggle')).toBe('true')

    const falseParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: false, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(falseParams.get('toggle')).toBe('false')

    const nullParams = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(nullParams.has('toggle')).toBe(false)
  })

  it('serializes date range with paramKey prefix and suffixes', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: '2024-01-01', to: '2024-03-31' }, amountRange: { min: null, max: null } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('created_from')).toBe('2024-01-01')
    expect(params.get('created_to')).toBe('2024-03-31')
  })

  it('serializes number range with paramKey prefix and suffixes', () => {
    const params = serializeFilters(
      { search: '', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: 100, max: 500 } },
      config,
      new URLSearchParams(),
    )
    expect(params.get('amount_min')).toBe('100')
    expect(params.get('amount_max')).toBe('500')
  })

  it('preserves unrelated params', () => {
    const params = serializeFilters(
      { search: 'x', status: null, tags: [], toggle: null, dateRange: { from: null, to: null }, amountRange: { min: null, max: null } },
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
      toggle: null,
      dateRange: { from: null, to: null },
      amountRange: { min: null, max: null },
    })
  })

  it('drops invalid select values', () => {
    expect(parseFilters(new URLSearchParams('status=unknown'), config).status).toBeNull()
  })

  it('parses multi-select repeated params and drops invalid values', () => {
    expect(parseFilters(new URLSearchParams('tags=a&tags=b&tags=nope'), config).tags).toEqual(['a', 'b'])
  })

  it('parses toggles', () => {
    expect(parseFilters(new URLSearchParams('toggle=true'), config).toggle).toBe(true)
    expect(parseFilters(new URLSearchParams('toggle=false'), config).toggle).toBe(false)
    expect(parseFilters(new URLSearchParams('toggle=yes'), config).toggle).toBeNull()
  })

  it('parses ranges', () => {
    const parsed = parseFilters(new URLSearchParams('created_from=2024-01-01&amount_min=100'), config)
    expect(parsed.dateRange).toEqual({ from: '2024-01-01', to: null })
    expect(parsed.amountRange).toEqual({ min: 100, max: null })
  })
})

describe('getManagedParamKeys', () => {
  it('returns all managed keys', () => {
    expect(getManagedParamKeys(config)).toEqual(
      expect.arrayContaining(['search', 'status', 'tags', 'toggle', 'created_from', 'created_to', 'amount_min', 'amount_max']),
    )
  })
})
