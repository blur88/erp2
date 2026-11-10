import { useEffect } from 'react'

import { clearAllDrafts } from './reconciliationDraftStorage'

/**
 * Removes stored reconciliation drafts from THIS tab whenever it is not signed
 * in: on sign-out (manual, idle or forced), and on load when the persisted
 * session is already gone — which is how a browser-restored tab arrives after
 * the user signed out elsewhere or the session expired.
 *
 * Safe to run on mount: the app awaits shared Session startup,
 * so `isAuthenticated` is already restored on first render and a reload of a
 * signed-in tab never passes through a signed-out state.
 *
 * It cannot reach other tabs. sessionStorage is per tab, so another open tab
 * keeps its drafts until that tab itself becomes signed-out or is closed.
 */
export function useClearReconciliationDraftsOnSignOut(isAuthenticated: boolean): void {
  useEffect(() => {
    if (!isAuthenticated) clearAllDrafts()
  }, [isAuthenticated])
}
