import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import type { FilterBarConfig, FilterBarHandlers, PeriodValue } from '@/types/filterBar.types'
import { parseFilters, serializeFilters } from '@/utils/filterBar.url'

function getDefaults<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
): TFilters {
  const defaults: Record<string, unknown> = {}

  if (config.search) defaults.search = ''

  for (const field of config.fields) {
    const key = String(field.field)
    const configuredDefault = config.defaults?.[field.field]
    if (configuredDefault !== undefined) {
      defaults[key] = configuredDefault
      continue
    }

    if (
      field.type === 'select' ||
      field.type === 'customer' ||
      field.type === 'payment-status' ||
      field.type === 'supplier' ||
      field.type === 'category' ||
      field.type === 'price-list'
    ) {
      defaults[key] = null
    }
    else if (field.type === 'period') {
      defaults[key] = { key: null, from: null, to: null } satisfies PeriodValue
    }
  }

  return defaults as TFilters
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function useFilterBar<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
  options?: { onApply?: () => void },
): {
  appliedFilters: TFilters
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  hasActiveFilters: boolean
} {
  const location = useLocation()
  const debounceMs = config.search?.debounceMs ?? 400

  const defaults = useMemo(() => getDefaults(config), [config])

  const mountSearchRef = useRef(location.search)

  const initialFilters = useMemo(() => {
    const parsed = parseFilters(new URLSearchParams(mountSearchRef.current), config)
    return { ...defaults, ...parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [appliedFilters, setAppliedFilters] = useState<TFilters>(initialFilters)
  const [draftFilters, setDraftFilters] = useState<TFilters>(initialFilters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchDraftRef = useRef<string>(((initialFilters as Record<string, unknown>).search as string | undefined) ?? '')
  const onApplyRef = useRef(options?.onApply)
  onApplyRef.current = options?.onApply

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search)
    const nextParams = serializeFilters(appliedFilters, config, currentParams)
    const nextSearch = nextParams.toString()
    const currentSearch = currentParams.toString()

    if (nextSearch !== currentSearch) {
      const nextUrl = nextSearch
        ? `${location.pathname}?${nextSearch}`
        : location.pathname
      window.history.replaceState(null, '', nextUrl)
    }
  }, [appliedFilters, config, location.pathname])

  // Revalidate select values once their options become authoritative.
  //
  // parseFilters deliberately lets a URL value through while a field's options are
  // unresolved (#1017) — an in-flight query yields `[]`, and allow-listing against
  // an empty array silently dropped valid filters. That preserved value has to be
  // judged once the real option set lands, and dropped if it is not in it.
  //
  // Dependency-driven, not edge-triggered on a false -> true transition: because it
  // also depends on the option arrays and the current values, it equally covers a
  // value that becomes ineligible mid-session (an account deactivated, or an admin
  // repointing cogsAccountId). That is why consumers do not need their own clearing
  // effect.
  //
  // `optionsReady === false` means "not authoritative", which includes an errored
  // query — never clear then, an error is not evidence the value is invalid. An
  // authoritative EMPTY array, by contrast, does clear the value.
  useEffect(() => {
    const stale: string[] = []

    for (const field of config.fields) {
      if (field.type !== 'select') continue
      if (field.optionsReady === false) continue

      const fieldKey = String(field.field)
      const allowed = field.options.map((option) => option.value)
      const defaultValue = (defaults as Record<string, unknown>)[fieldKey] ?? null

      for (const source of [appliedFilters, draftFilters]) {
        const value = (source as Record<string, unknown>)[fieldKey]
        // Null/default values need no validation.
        if (value === null || value === undefined) continue
        if (value === defaultValue) continue
        if (allowed.includes(value as string)) continue
        if (!stale.includes(fieldKey)) stale.push(fieldKey)
      }
    }

    if (stale.length === 0) return

    // The same state transition `onClearField` performs — reset to default in both
    // applied and draft state, then notify — but applied to every stale field in one
    // atomic update rather than one call (and one onApply) per field. The URL-sync
    // effect above then drops the params.
    setAppliedFilters((prev) => {
      const next = { ...prev } as Record<string, unknown>
      for (const key of stale) next[key] = (defaults as Record<string, unknown>)[key] ?? null
      return next as TFilters
    })
    setDraftFilters((prev) => {
      const next = { ...prev } as Record<string, unknown>
      for (const key of stale) next[key] = (defaults as Record<string, unknown>)[key] ?? null
      return next as TFilters
    })
    onApplyRef.current?.()
  }, [config, defaults, appliedFilters, draftFilters])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [])

  const onSearchChange = useCallback((value: string) => {
    searchDraftRef.current = value
    setDraftFilters((prev) => ({ ...prev, search: value }))

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (value === '') {
      setAppliedFilters((prev) => ({ ...prev, search: '' }))
      onApplyRef.current?.()
      return
    }

    debounceRef.current = setTimeout(() => {
      setAppliedFilters((prev) => ({ ...prev, search: value }))
      onApplyRef.current?.()
    }, debounceMs)
  }, [debounceMs])

  const onSearchCommit = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    setAppliedFilters((prev) => ({
      ...prev,
      search: searchDraftRef.current,
    }))
    onApplyRef.current?.()
  }, [])

  const onQuickFilterChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
    setAppliedFilters((prev) => ({ ...prev, [field]: value }))
    onApplyRef.current?.()
  }, [])

  const onClearField = useCallback((field: keyof TFilters) => {
    const nextValue = (defaults as Record<string, unknown>)[String(field)]
    setDraftFilters((prev) => ({ ...prev, [field]: nextValue }))
    setAppliedFilters((prev) => ({ ...prev, [field]: nextValue }))
    onApplyRef.current?.()
    if (field === 'search') {
      searchDraftRef.current = String(nextValue ?? '')
    }
  }, [defaults])

  const onClearAll = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setDraftFilters(defaults)
    setAppliedFilters(defaults)
    onApplyRef.current?.()
    searchDraftRef.current = String((defaults as Record<string, unknown>).search ?? '')
  }, [defaults])

  const hasActiveFilters = useMemo(
    () => !isEqual(appliedFilters, defaults),
    [appliedFilters, defaults],
  )

  return {
    appliedFilters,
    draftFilters,
    handlers: {
      onSearchChange,
      onSearchCommit,
      onQuickFilterChange,
      onClearField,
      onClearAll,
    },
    hasActiveFilters,
  }
}
