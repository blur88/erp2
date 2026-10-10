import { useEffect } from 'react'

import { clearAllDrafts } from './reconciliationDraftStorage'

/**
 * Removes stored reconciliation drafts from THIS tab whenever it is signed-out:
 * on sign-out (manual, idle or forced), and on load when the persisted session
 * is already gone — which is how a browser-restored tab arrives after the user
 * signed out elsewhere or the session expired.
 *
 * Safe to run on mount: every route's loader awaits `sessionReady()`, so the
 * session runtime has already mirrored what storage said into the store before
 * the caller first renders. A reload of a signed-in tab is then either signed in
 * or, when the start-up read timed out, waiting (`storageWaiting`).
 *
 * A waiting tab is not signed in and not signed-out: storage has not said
 * whether its session is still stored (spec B3), so its drafts are kept. They
 * are cleared when the wait ends without a session, whether a retry finds none
 * stored or finds storage unusable, as a start in either state clears them.
 * "Unusable" includes a read that fails with an error of no known class: the
 * tab fails closed there, and the drafts are lost with it.
 *
 * `storageWaiting` is required: a caller that left it out would clear the
 * drafts of a waiting tab.
 *
 * It cannot reach other tabs. sessionStorage is per tab, so another open tab
 * keeps its drafts until that tab itself becomes signed-out or is closed.
 */
export function useClearReconciliationDraftsOnSignOut(isAuthenticated: boolean, storageWaiting: boolean): void {
  useEffect(() => {
    if (!isAuthenticated && !storageWaiting) clearAllDrafts()
  }, [isAuthenticated, storageWaiting])
}
