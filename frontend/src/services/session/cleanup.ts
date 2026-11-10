import type { Dispatch, UnknownAction } from '@reduxjs/toolkit'
import { clearAuth } from '@/store/slices/authSlice'
import { clearAllDrafts } from '@/pages/accounting/bank-reconciliations/reconciliationDraftStorage'
import type { Session } from './storage'

export function createSessionCleanup(
  store: { dispatch: Dispatch },
  apiSlices: ReadonlyArray<{ util: { resetApiState: () => UnknownAction } }>,
) {
  return (next: Session | null) => {
    store.dispatch(clearAuth())
    clearAllDrafts()
    for (const api of apiSlices) store.dispatch(api.util.resetApiState())
    if (!next) window.location.assign('/login')
  }
}
