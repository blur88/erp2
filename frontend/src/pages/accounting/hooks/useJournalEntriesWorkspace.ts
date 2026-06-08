import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntryQuery } from '@/store/api/accountingApi'
import { setSelectedJournalEntry } from '@/store/slices/accountingSlice'
import type { JournalEntry } from '@/types'

interface UseJournalEntriesWorkspaceConfig {
  entries: JournalEntry[]
  refetch: () => void
  dispatch: AppDispatch
  selectedEntry: JournalEntry | null
}

export function useJournalEntriesWorkspace({ entries, refetch, dispatch, selectedEntry }: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const [fetchEntry] = useLazyGetJournalEntryQuery()

  const workspace = useEntityWorkspace<JournalEntry>({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: (entry) => dispatch(setSelectedJournalEntry(entry)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/journal-entries',
      edit: () => '/accounting/journal-entries',
    },
    onEnter: () => {},
    onEscape: () => {
      dispatch(setSelectedJournalEntry(null))
    },
  })

  const { handleSelect: workspaceHandleSelect } = workspace

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    workspaceHandleSelect(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      dispatch(setSelectedJournalEntry(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchEntry, workspaceHandleSelect, dispatch])

  const navigateToSource = useCallback((sourceType: string, sourceId: string) => {
    const routes: Record<string, (id: string) => string> = {
      sales_order: (id) => `/sales/orders?highlight=${id}`,
      goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
      vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
      expense: () => `/accounting/expenses`,
      owner_equity_transaction: () => `/accounting/owner-equity`,
      fund_transfer: () => `/accounting/fund-transfers`,
      stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
    }
    const route = routes[sourceType]
    if (route) navigate(route(sourceId))
  }, [navigate])

  return {
    ...workspace,
    handleSelect,
    navigateToSource,
  }
}
