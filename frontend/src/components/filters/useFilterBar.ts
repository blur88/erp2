import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { deriveChips } from './filterBar.chips'
import type { ActiveChip, FilterBarConfig, FilterBarHandlers } from './filterBar.types'
import { parseFilters, serializeFilters } from './filterBar.url'

function getDefaults<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
): TFilters {
  const defaults: Record<string, unknown> = {}

  if (config.search) defaults.search = ''

  for (const field of [...config.quick, ...config.advanced]) {
    const key = String(field.field)
    const configuredDefault = config.defaults?.[field.field]
    if (configuredDefault !== undefined) {
      defaults[key] = configuredDefault
      continue
    }

    if (field.type === 'select') defaults[key] = null
    else if (field.type === 'multi-select') defaults[key] = []
    else if (field.type === 'toggle') defaults[key] = null
    else if (field.type === 'date-range') defaults[key] = { from: null, to: null }
    else defaults[key] = { min: null, max: null }
  }

  return defaults as TFilters
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function useFilterBar<TFilters extends object>(
  config: FilterBarConfig<TFilters>,
): {
  appliedFilters: TFilters
  draftFilters: TFilters
  handlers: FilterBarHandlers<TFilters>
  activeChips: ActiveChip<keyof TFilters>[]
  hasActiveFilters: boolean
  hasUnappliedChanges: boolean
} {
  const location = useLocation()
  const debounceMs = config.search?.debounceMs ?? 400

  const defaults = useMemo(() => getDefaults(config), [config])

  // Capture location.search once on mount into a ref so we can read it
  // in the initialFilters memo without making it a reactive dependency.
  // This prevents the location → initialFilters → setState → URL sync → location loop.
  const mountSearchRef = useRef(location.search)

  // Read URL once on mount — intentionally NOT reactive on location.search
  const initialFilters = useMemo(() => {
    const parsed = parseFilters(new URLSearchParams(mountSearchRef.current), config)
    return { ...defaults, ...parsed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount-only: config and defaults are stable at mount

  const [appliedFilters, setAppliedFilters] = useState<TFilters>(initialFilters)
  const [draftFilters, setDraftFilters] = useState<TFilters>(initialFilters)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchDraftRef = useRef<string>(((initialFilters as Record<string, unknown>).search as string | undefined) ?? '')

  // Sync appliedFilters → URL via replaceState.
  // Using replaceState directly (not navigate) avoids triggering a React Router
  // location update, which would re-run this effect and create a reset loop.
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
      return
    }

    debounceRef.current = setTimeout(() => {
      setAppliedFilters((prev) => ({ ...prev, search: value }))
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
  }, [])

  const onQuickFilterChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
    setAppliedFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const onAdvancedDraftChange = useCallback((field: keyof TFilters, value: unknown) => {
    setDraftFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  const onAdvancedApply = useCallback(() => {
    setAppliedFilters((prev) => ({ ...prev, ...draftFilters }))
  }, [draftFilters])

  const onAdvancedCancel = useCallback(() => {
    const advancedFields = new Set(config.advanced.map((field) => String(field.field)))
    setDraftFilters((prev) => {
      const next = { ...prev }
      for (const field of advancedFields) {
        ;(next as Record<string, unknown>)[field] = (appliedFilters as Record<string, unknown>)[field]
      }
      return next
    })
  }, [appliedFilters, config.advanced])

  const onClearField = useCallback((field: keyof TFilters) => {
    const nextValue = (defaults as Record<string, unknown>)[String(field)]
    setDraftFilters((prev) => ({ ...prev, [field]: nextValue }))
    setAppliedFilters((prev) => ({ ...prev, [field]: nextValue }))
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
    searchDraftRef.current = String((defaults as Record<string, unknown>).search ?? '')
  }, [defaults])

  const activeChips = useMemo(
    () => deriveChips(appliedFilters, config),
    [appliedFilters, config],
  )

  const hasActiveFilters = useMemo(
    () => !isEqual(appliedFilters, defaults),
    [appliedFilters, defaults],
  )

  const hasUnappliedChanges = useMemo(() => {
    return config.advanced.some((field) => !isEqual(draftFilters[field.field], appliedFilters[field.field]))
  }, [appliedFilters, config.advanced, draftFilters])

  return {
    appliedFilters,
    draftFilters,
    handlers: {
      onSearchChange,
      onSearchCommit,
      onQuickFilterChange,
      onAdvancedDraftChange,
      onAdvancedApply,
      onAdvancedCancel,
      onClearField,
      onClearAll,
    },
    activeChips,
    hasActiveFilters,
    hasUnappliedChanges,
  }
}
