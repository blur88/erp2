import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig, FilterOption } from '@/types/filterBar.types'

interface F { accountId: string | null }

const OPTIONS: FilterOption[] = [
  { value: 'acct-office', label: '5100 Office' },
  { value: 'acct-rent', label: '5200 Rent' },
]

function makeConfig(
  options: FilterOption[],
  optionsReady: boolean,
): FilterBarConfig<F> {
  return {
    fields: [
      { field: 'accountId', label: 'Account', type: 'select', options, optionsReady },
    ],
    defaults: { accountId: null },
  }
}

function makeWrapper(initialUrl: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
}

describe('useFilterBar with async select options', () => {
  it('applies a URL value that arrives before its options', () => {
    const { result } = renderHook(() => useFilterBar(makeConfig([], false)), {
      wrapper: makeWrapper('/?accountId=acct-office'),
    })
    expect(result.current.appliedFilters.accountId).toBe('acct-office')
    expect(result.current.draftFilters.accountId).toBe('acct-office')
  })

  it('keeps the value once options resolve and contain it', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/?accountId=acct-office'),
        initialProps: { config: makeConfig([], false) },
      },
    )

    rerender({ config: makeConfig(OPTIONS, true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBe('acct-office')
    })
    expect(result.current.draftFilters.accountId).toBe('acct-office')
  })

  it('clears the value once options resolve without it', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/?accountId=acct-cogs'),
        initialProps: { config: makeConfig([], false) },
      },
    )
    expect(result.current.appliedFilters.accountId).toBe('acct-cogs')

    rerender({ config: makeConfig(OPTIONS, true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBeNull()
    })
    expect(result.current.draftFilters.accountId).toBeNull()
  })

  it('clears the value when the authoritative option set is empty', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/?accountId=acct-office'),
        initialProps: { config: makeConfig([], false) },
      },
    )
    expect(result.current.appliedFilters.accountId).toBe('acct-office')

    rerender({ config: makeConfig([], true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBeNull()
    })
  })

  it('retains the value while not authoritative, then validates after a successful retry', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/?accountId=acct-office'),
        initialProps: { config: makeConfig([], false) },
      },
    )

    // Errored retry: still not authoritative, still empty. The value must survive.
    rerender({ config: makeConfig([], false) })
    expect(result.current.appliedFilters.accountId).toBe('acct-office')

    // Successful retry, resolving to a set that EXCLUDES the value. Asserting
    // against an option set that contained it would pass whether validation ran
    // or not — indistinguishable from the retention assertion above.
    rerender({ config: makeConfig([{ value: 'acct-rent', label: '5200 Rent' }], true) })
    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBeNull()
    })
  })

  it('clears a value that becomes ineligible mid-session', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/?accountId=acct-rent'),
        initialProps: { config: makeConfig(OPTIONS, true) },
      },
    )
    expect(result.current.appliedFilters.accountId).toBe('acct-rent')

    // acct-rent stops being eligible (deactivated, or repointed as COGS).
    rerender({ config: makeConfig([{ value: 'acct-office', label: '5100 Office' }], true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBeNull()
    })
  })

  it('fires onApply exactly once when revalidation clears a filter', async () => {
    const onApply = vi.fn()
    const { rerender } = renderHook(
      ({ config }) => useFilterBar(config, { onApply }),
      {
        wrapper: makeWrapper('/?accountId=acct-gone'),
        initialProps: { config: makeConfig([], false) },
      },
    )

    // Nothing judged yet, so nothing applied.
    expect(onApply).not.toHaveBeenCalled()

    rerender({ config: makeConfig(OPTIONS, true) })

    // Clearing a stale filter IS an applied-filter change: consumers reset
    // pagination off onApply, and a page-2 view must not survive it.
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledTimes(1)
    })

    // A further settled render must not re-fire it — the value is already at its
    // default, so the effect finds nothing stale.
    rerender({ config: makeConfig(OPTIONS, true) })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('does not fire onApply when a ready option set contains the value', async () => {
    const onApply = vi.fn()
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config, { onApply }),
      {
        wrapper: makeWrapper('/?accountId=acct-office'),
        initialProps: { config: makeConfig([], false) },
      },
    )

    rerender({ config: makeConfig(OPTIONS, true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBe('acct-office')
    })
    expect(onApply).not.toHaveBeenCalled()
  })

  it('leaves a null value alone when options resolve', async () => {
    const { result, rerender } = renderHook(
      ({ config }) => useFilterBar(config),
      {
        wrapper: makeWrapper('/'),
        initialProps: { config: makeConfig([], false) },
      },
    )

    rerender({ config: makeConfig(OPTIONS, true) })

    await waitFor(() => {
      expect(result.current.appliedFilters.accountId).toBeNull()
    })
    expect(result.current.hasActiveFilters).toBe(false)
  })
})
