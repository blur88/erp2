import { describe, expect, it } from 'vitest'

import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getManagedParamKeys, parseFilters, serializeFilters } from '@/utils/filterBar.url'

interface TestFilters {
  search: string
  status: string | null
}

const config: FilterBarConfig<TestFilters> = {
  search: { placeholder: 'Search...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
  ],
  defaults: {
    search: '',
    status: null,
  },
}

describe('serializeFilters', () => {
  it('omits default values', () => {
    const params = serializeFilters(
      { search: '', status: null },
      config,
      new URLSearchParams(),
    )
    expect(params.toString()).toBe('')
  })

  it('serializes search', () => {
    const params = serializeFilters(
      { search: 'gundam', status: null },
      config,
      new URLSearchParams(),
    )
    expect(params.get('search')).toBe('gundam')
  })

  it('serializes status value', () => {
    const params = serializeFilters(
      { search: '', status: 'active' },
      config,
      new URLSearchParams(),
    )
    expect(params.get('status')).toBe('active')
  })

  it('preserves unrelated params', () => {
    const params = serializeFilters(
      { search: 'x', status: null },
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
    })
  })

  it('drops invalid status values', () => {
    expect(parseFilters(new URLSearchParams('status=unknown'), config).status).toBeNull()
  })
})

describe('getManagedParamKeys', () => {
  it('returns all managed keys', () => {
    expect(getManagedParamKeys(config)).toEqual(
      expect.arrayContaining(['search', 'status']),
    )
  })
})

interface PeriodFilters {
  period: PeriodValue
}

const periodConfig: FilterBarConfig<PeriodFilters> = {
  fields: [
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

  it('serializes custom range even when default key is also custom', () => {
    const customDefaultConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
      defaults: {
        period: { key: 'custom', from: '2026-01-01', to: '2026-01-31' },
      },
    }
    // Same key ('custom') but different from/to — must NOT be omitted
    const params = serializeFilters(
      { period: { key: 'custom', from: '2026-03-01', to: '2026-03-31' } },
      customDefaultConfig,
      new URLSearchParams(),
    )
    expect(params.get('period')).toBe('custom')
    expect(params.get('period_from')).toBe('2026-03-01')
    expect(params.get('period_to')).toBe('2026-03-31')
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
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
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

interface PurchasingFilters {
  supplierId: string | null
  status: string | null
}

const purchasingConfig: FilterBarConfig<PurchasingFilters> = {
  fields: [
    { field: 'supplierId', label: 'Supplier', type: 'supplier', paramKey: 'supplier' },
    { field: 'status', label: 'Order Status', type: 'purchasing-status', paramKey: 'status' },
  ],
  defaults: {
    supplierId: null,
    status: null,
  },
  namespace: 'purchasing',
}

describe('serializeFilters — purchasing named types', () => {
  it('serializes supplier and purchasing-status filters like single-value fields', () => {
    const params = serializeFilters(
      {
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'received',
      },
      purchasingConfig,
      new URLSearchParams(),
    )

    expect(params.get('purchasing_supplier')).toBe('550e8400-e29b-41d4-a716-446655440001')
    expect(params.get('purchasing_status')).toBe('received')
  })
})

describe('parseFilters — purchasing named types', () => {
  it('parses supplier and purchasing-status filters from namespaced params', () => {
    const result = parseFilters(
      new URLSearchParams(
        'purchasing_supplier=550e8400-e29b-41d4-a716-446655440001&purchasing_status=received',
      ),
      purchasingConfig,
    )

    expect(result).toEqual({
      supplierId: '550e8400-e29b-41d4-a716-446655440001',
      status: 'received',
    })
  })

  it('rejects invalid purchasing-status value and falls back to null', () => {
    const result = parseFilters(
      new URLSearchParams('purchasing_status=shipped'),
      purchasingConfig,
    )
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

type CompareFilters = {
  period: PeriodValue
  compareWith: 'previous_period' | 'last_month' | 'last_year' | null
}

const compareConfig: FilterBarConfig<CompareFilters> = {
  namespace: 'sales',
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'compareWith', label: 'Compare', type: 'compare' },
  ],
  defaults: {
    period: { key: 'this_month', from: null, to: null },
    compareWith: null,
  },
}

describe('compare field type — serializeFilters', () => {
  it('omits compareWith when null', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null }, compareWith: null },
      compareConfig,
      new URLSearchParams(),
    )
    expect(params.get('sales_compareWith')).toBeNull()
  })

  it('serializes compareWith when set', () => {
    const params = serializeFilters(
      { period: { key: 'this_month', from: null, to: null }, compareWith: 'previous_period' },
      compareConfig,
      new URLSearchParams(),
    )
    expect(params.get('sales_compareWith')).toBe('previous_period')
  })
})

describe('compare field type — parseFilters', () => {
  it('returns null when param is absent', () => {
    const result = parseFilters<CompareFilters>(new URLSearchParams(), compareConfig)
    expect(result.compareWith).toBeNull()
  })

  it('parses valid compare value', () => {
    const result = parseFilters<CompareFilters>(
      new URLSearchParams('sales_compareWith=last_year'),
      compareConfig,
    )
    expect(result.compareWith).toBe('last_year')
  })

  it('rejects invalid compare value and returns null', () => {
    const result = parseFilters<CompareFilters>(
      new URLSearchParams('sales_compareWith=garbage'),
      compareConfig,
    )
    expect(result.compareWith).toBeNull()
  })
})

describe('compare field type — getManagedParamKeys', () => {
  it('includes compareWith as a single key (no _from/_to suffix)', () => {
    const keys = getManagedParamKeys(compareConfig)
    expect(keys).toContain('sales_compareWith')
    expect(keys.filter((k) => k.startsWith('sales_compareWith'))).toHaveLength(1)
  })
})

describe('parseFilters — stock-adjustment-status field', () => {
  interface SaFilters {
    search: string
    status: string | null
  }

  const saConfig: FilterBarConfig<SaFilters> = {
    search: { placeholder: 'Search...' },
    fields: [
      { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
    ],
    defaults: { search: '', status: null },
  }

  it('rejects cancelled and returns null', () => {
    expect(parseFilters(new URLSearchParams('status=cancelled'), saConfig).status).toBeNull()
  })

  it('accepts draft', () => {
    expect(parseFilters(new URLSearchParams('status=draft'), saConfig).status).toBe('draft')
  })

  it('accepts completed', () => {
    expect(parseFilters(new URLSearchParams('status=completed'), saConfig).status).toBe('completed')
  })
})
