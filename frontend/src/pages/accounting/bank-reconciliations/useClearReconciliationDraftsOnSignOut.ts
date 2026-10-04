import { useEffect, useRef } from 'react'

import { clearAllDrafts } from './reconciliationDraftStorage'

/**
 * Clears stored reconciliation drafts when the session ends. Only the
 * signed-in → signed-out transition clears: a page reload starts signed-out
 * and becomes signed-in, and must keep the draft it is about to restore.
 */
export function useClearReconciliationDraftsOnSignOut(isAuthenticated: boolean): void {
  const wasAuthenticated = useRef(isAuthenticated)
  useEffect(() => {
    if (wasAuthenticated.current && !isAuthenticated) clearAllDrafts()
    wasAuthenticated.current = isAuthenticated
  }, [isAuthenticated])
}
