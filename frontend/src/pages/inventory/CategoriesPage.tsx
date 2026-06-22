import { useCallback, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetCategoriesQuery } from '@/store/api/inventoryApi'
import type { Category } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import CategoryList from './components/CategoryList'

interface CategoryFilters {
  search: string
  status: 'active' | 'inactive' | null
}

function filterWithAncestors(all: Category[], match: (c: Category) => boolean): Category[] {
  const byId = new Map(all.map((c) => [c.id, c]))
  const keep = new Set<string>()
  for (const c of all) {
    if (!match(c)) continue
    keep.add(c.id)
    let pid = c.parentId ?? null
    while (pid && byId.has(pid)) { keep.add(pid); pid = byId.get(pid)!.parentId ?? null }
  }
  return all.filter((c) => keep.has(c.id))
}

const filterConfig: FilterBarConfig<CategoryFilters> = {
  search: { placeholder: 'Search categories by name...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
  ],
  defaults: { search: '', status: null },
}

export default function CategoriesPage() {
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const { data: categories = [], isFetching, error } = useGetCategoriesQuery({
    includeProductCount: true,
  })

  const visibleCategories = useMemo(() => {
    return filterWithAncestors(categories, (c) => {
      if (appliedFilters.search && !c.name.toLowerCase().includes(appliedFilters.search.toLowerCase())) return false
      if (appliedFilters.status === 'active' && !c.isEnabled) return false
      if (appliedFilters.status === 'inactive' && c.isEnabled) return false
      return true
    })
  }, [categories, appliedFilters])

  return (
    <SimpleListPage
      title="Categories"
      subtitle="Organize your product categories."
      primaryAction={{ label: 'New Category', onClick: () => navigate('/inventory/categories/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      isFetching={isFetching}
      error={error ? 'Failed to load categories.' : null}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <CategoryList
            categories={visibleCategories}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
          />
        </Box>
      )}
    />
  )
}
