import type { ReactNode, RefObject } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'

import { FilterBar } from '@/components/filters'
import type {
  FilterBarConfig,
  FilterBarHandlers,
  FilterBarSortConfig,
} from '@/types/filterBar.types'

import MasterDetailWorkspace from './MasterDetailWorkspace'
import PageHeader from './PageHeader'

interface GenericListPageProps<F extends object> {
  title: string
  subtitle: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction: { label: string; onClick: () => void }
  filterConfig: FilterBarConfig<F>
  draftFilters: F
  handlers: FilterBarHandlers<F>
  hasActiveFilters: boolean
  searchInputRef: RefObject<HTMLInputElement | null>
  sort: FilterBarSortConfig
  error?: string | null
  onErrorClose?: () => void
  listSlot: ReactNode
  headerSlot: ReactNode
  workspaceSlot: ReactNode
  dialogs?: ReactNode
}

export default function GenericListPage<F extends object>({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  filterConfig,
  draftFilters,
  handlers,
  hasActiveFilters,
  searchInputRef,
  sort,
  error,
  onErrorClose,
  listSlot,
  headerSlot,
  workspaceSlot,
  dialogs,
}: GenericListPageProps<F>) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        variant="workflow"
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
            sort={sort}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={onErrorClose}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={listSlot}
        headerSlot={headerSlot}
        workspaceSlot={workspaceSlot}
      />

      {dialogs}
    </Box>
  )
}
