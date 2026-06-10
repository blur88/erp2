import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
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
  const [fetchVendorPayment] = useLazyGetVendorPaymentQuery()

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

  const navigateToSource = useCallback(async (sourceType: string, sourceId: string, sourceRefNumber?: string) => {
    const routes: Record<string, (id: string) => string> = {
      sales_order: (_id) => `/sales/orders/${sourceRefNumber ?? sourceId}/view`,
      purchase_order: (_id) => `/purchasing/orders/${sourceRefNumber ?? sourceId}/view`,
      expense: () => `/accounting/expenses`,
      owner_equity_transaction: () => `/accounting/owner-equity`,
      fund_transfer: () => `/accounting/fund-transfers`,
      stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
    }
    if (sourceType === 'vendor_payment') {
      try {
        const payment = await fetchVendorPayment(sourceId).unwrap()
        const orderNumber = payment.purchaseOrder?.orderNumber
        if (orderNumber) {
          navigate(`/purchasing/orders/${orderNumber}/view`)
        }
      } catch {
        // Legacy entries may not resolve to a live PO any more.
      }
      return
    }

    const route = routes[sourceType]
    if (route) navigate(route(sourceId))
  }, [fetchVendorPayment, navigate])

  return {
    ...workspace,
    handleSelect,
    navigateToSource,
  }
}
