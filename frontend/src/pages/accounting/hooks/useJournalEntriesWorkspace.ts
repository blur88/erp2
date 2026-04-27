import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useLazyGetJournalEntryQuery } from '@/store/api/accountingApi'
import { JournalEntry } from '@/types'

interface UseJournalEntriesWorkspaceConfig {
  entries: JournalEntry[]
  refetch: () => void
}

export function useJournalEntriesWorkspace({ entries, refetch }: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [fetchEntry] = useLazyGetJournalEntryQuery()

  const workspace = useEntityWorkspace<JournalEntry>({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: setSelectedEntry,
    refetch,
    navigate,
    routes: {
      create: '/accounting/journal-entries',
      edit: () => '/accounting/journal-entries',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEnter: () => {},
  })

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    workspace.handleSelect(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      setSelectedEntry(fresh)
    }
    catch { /* keep list-row data */ }
  }, [fetchEntry, workspace])

  const navigateToSource = useCallback((sourceType: string, sourceId: string) => {
    const routes: Record<string, (id: string) => string> = {
      sales_order: (id) => `/sales/orders?highlight=${id}`,
      payment: (id) => `/sales/payments?highlight=${id}`,
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
    selectedEntry,
    handleSelect,
    navigateToSource,
  }
}
