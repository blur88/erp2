import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '@/types/filterBar.types'
import { parseFilters, serializeFilters } from '@/utils/filterBar.url'

interface TestFilters { status: string | null }

const config: FilterBarConfig<TestFilters> = {
  fields: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'inactive', label: 'Inactive' },
      ],
    },
  ],
  defaults: { status: null },
}

describe('filterBar.url select handling', () => {
  it('parses a value present in options', () => {
    const parsed = parseFilters(new URLSearchParams('status=active'), config)
    expect(parsed.status).toBe('active')
  })

  it('drops a value absent from options', () => {
    const parsed = parseFilters(new URLSearchParams('status=bogus'), config)
    expect(parsed.status).toBeNull()
  })

  it('defaults to null when the param is absent', () => {
    const parsed = parseFilters(new URLSearchParams(''), config)
    expect(parsed.status).toBeNull()
  })

  it('serializes a non-default value', () => {
    const params = serializeFilters({ status: 'inactive' }, config, new URLSearchParams())
    expect(params.get('status')).toBe('inactive')
  })

  it('omits the default value', () => {
    const params = serializeFilters({ status: null }, config, new URLSearchParams())
    expect(params.get('status')).toBeNull()
  })

  it('round-trips through serialize then parse', () => {
    const params = serializeFilters({ status: 'active' }, config, new URLSearchParams())
    expect(parseFilters(params, config).status).toBe('active')
  })
})

describe('filterBar.url select with async options', () => {
  const notReady: FilterBarConfig<TestFilters> = {
    fields: [
      {
        field: 'status',
        label: 'Status',
        type: 'select',
        options: [],
        optionsReady: false,
      },
    ],
    defaults: { status: null },
  }

  const readyEmpty: FilterBarConfig<TestFilters> = {
    fields: [
      {
        field: 'status',
        label: 'Status',
        type: 'select',
        options: [],
        optionsReady: true,
      },
    ],
    defaults: { status: null },
  }

  it('preserves a non-empty value while options are not ready', () => {
    const parsed = parseFilters(new URLSearchParams('status=acct-1'), notReady)
    expect(parsed.status).toBe('acct-1')
  })

  it('normalizes an explicitly empty param even while not ready', () => {
    const parsed = parseFilters(new URLSearchParams('status='), notReady)
    expect(parsed.status).toBeNull()
  })

  it('rejects a value when ready with an authoritative empty option set', () => {
    const parsed = parseFilters(new URLSearchParams('status=acct-1'), readyEmpty)
    expect(parsed.status).toBeNull()
  })

  it('still rejects an invalid value when options are ready', () => {
    const parsed = parseFilters(new URLSearchParams('status=bogus'), config)
    expect(parsed.status).toBeNull()
  })

  it('treats an omitted optionsReady as ready (static-option default)', () => {
    const parsed = parseFilters(new URLSearchParams('status=bogus'), config)
    expect(parsed.status).toBeNull()
  })
})
