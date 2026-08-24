import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { PAGINATION } from '@/constants/tableStyles'

export type SortDirection = 'asc' | 'desc'

export interface ListSortConfig<TSortField extends string> {
  fields: readonly TSortField[]
  defaultField: TSortField
  /** Hydration/initial order only — never the order used when switching field. */
  defaultOrder: SortDirection
  /** Order applied when switching TO a different field. Defaults to 'desc'. */
  newFieldOrder?: SortDirection
}

export interface ListUrlStateOptions<TSortField extends string> {
  namespace?: string
  pagination?: false | { defaultLimit?: number }
  sort?: ListSortConfig<TSortField>
}

function prefixed(key: string, namespace?: string): string {
  return namespace ? `${namespace}_${key}` : key
}

/** Single source of truth for the params this hook owns, per enabled capability. */
export function getManagedListParamKeys<TSortField extends string>(
  options?: ListUrlStateOptions<TSortField>,
): string[] {
  const ns = options?.namespace
  const keys: string[] = []
  if (options?.pagination !== false) {
    keys.push(prefixed('page', ns), prefixed('limit', ns))
  }
  if (options?.sort) {
    keys.push(prefixed('sortBy', ns), prefixed('sortOrder', ns))
  }
  return keys
}

/**
 * Owns pagination/sort state in the URL so a list survives a round trip to a
 * Detail page.
 *
 * IMPORTANT — read-modify-write invariant. This hook reads LIVE
 * `window.location.search`, not React Router's `location.search`, and deletes
 * only its own declared keys before re-appending. `useFilterBar` does exactly
 * the same. Two independent writers are safe ONLY under that rule, and only
 * because `replaceState` updates `window.location` synchronously, so the second
 * writer reads the first's result. Refactoring either hook to `useSearchParams`
 * (a React-state snapshot, not the live DOM) would silently reintroduce mutual
 * clobbering.
 */
export function useListUrlState<const TSortField extends string = string>(
  options?: ListUrlStateOptions<TSortField>,
) {
  const location = useLocation()

  const paginationEnabled = options?.pagination !== false
  const defaultLimit =
    (options?.pagination === false ? undefined : options?.pagination?.defaultLimit) ??
    PAGINATION.defaultPageSize
  const sortConfig = options?.sort
  const ns = options?.namespace

  const pageKey = prefixed('page', ns)
  const limitKey = prefixed('limit', ns)
  const sortByKey = prefixed('sortBy', ns)
  const sortOrderKey = prefixed('sortOrder', ns)

  // Hydrate once, like useFilterBar — later URL rewrites must not re-trigger it.
  const mountSearchRef = useRef(window.location.search)

  const initial = useMemo(() => {
    const params = new URLSearchParams(mountSearchRef.current)

    // Parsing is gated by capability: a disabled capability must not read its
    // keys at all, so a foreign `page` on a sort-only page is never interpreted.
    let page = 1
    let limit = defaultLimit
    if (paginationEnabled) {
      const rawPage = Number(params.get(pageKey))
      page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1

      const rawLimit = Number(params.get(limitKey))
      limit = (PAGINATION.options as readonly number[]).includes(rawLimit)
        ? rawLimit
        : defaultLimit
    }

    let sortBy: TSortField | undefined
    let sortOrder: SortDirection = 'desc'
    if (sortConfig) {
      const rawSortBy = params.get(sortByKey)
      sortBy =
        rawSortBy && sortConfig.fields.includes(rawSortBy as TSortField)
          ? (rawSortBy as TSortField)
          : sortConfig.defaultField

      const rawSortOrder = params.get(sortOrderKey)
      sortOrder =
        rawSortOrder === 'asc' || rawSortOrder === 'desc'
          ? rawSortOrder
          : sortConfig.defaultOrder
    }

    return { page, limit, sortBy, sortOrder }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [page, setPageState] = useState(initial.page)
  const [limit, setLimitState] = useState(initial.limit)
  const [sortBy, setSortByState] = useState<TSortField | undefined>(initial.sortBy)
  const [sortOrder, setSortOrderState] = useState<SortDirection>(initial.sortOrder)

  // Every call site passes an inline options literal, so `options`, `options.sort`
  // and the fields array all change identity each render. Depending on them
  // directly would re-run the effect forever. Depend on stable primitives, and
  // memoize the key list on those primitives alone.
  const hasSort = Boolean(sortConfig)
  const sortDefaultField = sortConfig?.defaultField
  const sortDefaultOrder = sortConfig?.defaultOrder

  const managedKeys = useMemo(
    () =>
      getManagedListParamKeys({
        namespace: ns,
        pagination: paginationEnabled ? {} : false,
        sort: hasSort
          ? { fields: [], defaultField: '' as TSortField, defaultOrder: 'desc' }
          : undefined,
      }),
    [ns, paginationEnabled, hasSort],
  )

  // Serialize. Default values are omitted so a clean list keeps a clean URL,
  // which also means canonicalizing an invalid param removes it.
  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search)
    const next = new URLSearchParams(currentParams)

    // Delete ONLY our own declared keys — getManagedListParamKeys is the single
    // source of truth for that set, so a disabled capability's keys are never
    // touched. Everything else on the URL is preserved.
    for (const key of managedKeys) next.delete(key)

    if (paginationEnabled) {
      if (page !== 1) next.set(pageKey, String(page))
      if (limit !== defaultLimit) next.set(limitKey, String(limit))
    }

    if (hasSort) {
      if (sortBy && sortBy !== sortDefaultField) next.set(sortByKey, sortBy)
      if (sortOrder !== sortDefaultOrder) next.set(sortOrderKey, sortOrder)
    }

    const nextSearch = next.toString()
    if (nextSearch !== currentParams.toString()) {
      const nextUrl = nextSearch ? `${location.pathname}?${nextSearch}` : location.pathname
      // Preserve history state — React Router keeps key/usr/idx there.
      window.history.replaceState(window.history.state, '', nextUrl)
    }
  }, [
    page, limit, sortBy, sortOrder, location.pathname,
    paginationEnabled, defaultLimit,
    sortDefaultField, sortDefaultOrder, hasSort,
    managedKeys, pageKey, limitKey, sortByKey, sortOrderKey,
  ])

  const setPage = useCallback((next: number) => setPageState(next), [])
  const resetPage = useCallback(() => setPageState(1), [])

  const setLimit = useCallback((next: number) => {
    setLimitState(next)
    setPageState(1)
  }, [])

  // The ONLY sort mutation. There is deliberately no setSortOrder: page reset
  // must not be bypassable.
  const setSort = useCallback(
    (field?: TSortField) => {
      if (!sortConfig) return
      const target = field ?? sortBy ?? sortConfig.defaultField
      if (target === sortBy) {
        setSortOrderState((prev) => (prev === 'desc' ? 'asc' : 'desc'))
      } else {
        setSortByState(target)
        setSortOrderState(sortConfig.newFieldOrder ?? 'desc')
      }
      setPageState(1)
    },
    [sortConfig, sortBy],
  )

  return {
    page,
    limit,
    setPage,
    setLimit,
    resetPage,
    // `undefined` when no sort is configured — the contract says a disabled
    // capability's fields are inert, and a cast to TSortField would hide
    // accidental use behind a lie (#1131 review).
    sortBy,
    sortOrder,
    setSort,
  }
}
