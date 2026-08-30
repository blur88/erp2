import type { ReactNode, RefObject } from 'react'
import { Alert, Box } from '@mui/material'

import { FilterBar } from '@/components/filters'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
} from '@/types/filterBar.types'

import PageHeader from './PageHeader'

interface SimpleListPageProps<F extends object> {
  title: string
  subtitle: string
  // Optional trailing node beside the title (e.g. General Ledger's selected
  // account chip). Forwarded verbatim to PageHeader.
  titleBadge?: ReactNode
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  filterConfig: FilterBarConfig<F>
  draftFilters: F
  handlers: FilterBarHandlers<F>
  hasActiveFilters: boolean
  // Optional: a list with no search field (General Ledger) omits this.
  searchInputRef?: RefObject<HTMLInputElement | null>
  // Optional: a list with no user-selectable sort order omits this so FilterBar
  // does not render a Sort button that cannot do anything.
  sort?: FilterBarSortConfig
  isFetching?: boolean
  error?: string | null
  onErrorClose?: () => void
  tableSlot: ReactNode
  paginationSlot?: ReactNode
  dialogs?: ReactNode
  hideHeaderOnPrint?: boolean
}

export default function SimpleListPage<F extends object>({
  title,
  subtitle,
  titleBadge,
  primaryAction,
  secondaryAction,
  filterConfig,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  isFetching,
  error,
  onErrorClose,
  tableSlot,
  paginationSlot,
  dialogs,
  hideHeaderOnPrint,
}: SimpleListPageProps<F>) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        titleBadge={titleBadge}
        variant="workflow"
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        hideOnPrint={hideHeaderOnPrint}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
            sort={sort}
            isFetching={isFetching}
          />
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={onErrorClose}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tableSlot}
      </Box>

      {paginationSlot}

      {dialogs}
    </Box>
  )
}
