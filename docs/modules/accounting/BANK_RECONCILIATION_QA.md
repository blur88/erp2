# Bank Reconciliation Manual QA Procedure (#1342)

## Preconditions
- **Environment**: A disposable copy of the local database (`pg_dump` clone or freshly seeded test database) and a development stack pointed at it.
- **Safety Rule**: **NEVER** run these destructive QA scenarios against the real local primary or production database.
- **Default User**: Admin credentials (`admin` / `Admin@123!`).

---

## Test Cases

### 1. First-time setup with an opening mismatch blocks Complete while Draft saves
- **Steps**:
  1. Navigate to `/accounting/bank-reconciliations/create`.
  2. Select a bank account with no previous reconciliations (`isFirst = true`).
  3. Enter Period From: `2026-01-01`, Period To: `2026-01-31`.
  4. Enter Opening Balance: `1000.00`, Closing Balance: `1200.00`.
  5. In First-time setup table, classify pre-period entries such that `openingClearedNet` does not equal `openingBalance` (causing `openingBalanceDifference !== 0.00`).
  6. Match transactions to match the difference.
  7. Observe the "Create" / "Complete" button states.
  8. Click "Create" to save as Draft.
- **Expected Result**:
  - The reconciliation saves successfully as Draft.
  - On the Detail page, the `Complete` button is disabled, and the blocker `Opening Balance Difference is <amount>` is displayed.
- **Result**: PASS

---

### 2. Exact closing match completes
- **Steps**:
  1. Open the Draft reconciliation from Case 1.
  2. Click "Edit".
  3. Adjust the pre-period classifications and period matches so that:
     - All pre-period transactions are classified (`unclassifiedCount === 0`).
     - `openingBalanceDifference === 0.00`.
     - `difference === 0.00` (Calculated closing balance matches statement closing balance).
  4. Save the changes.
  5. On the Detail page, verify `Complete` is enabled with zero blockers.
  6. Click `Complete` and confirm the dialog (`CONFIRM_COPY.complete`).
- **Expected Result**:
  - Reconciliation transitions to `COMPLETED` status.
  - Status chip displays green "Completed".
  - Completed metadata displays `Completed by <username> on <date>`.
  - Unsaved draft storage is cleared.
- **Result**: PASS

---

### 3. Unticked entries carry forward to the next period
- **Steps**:
  1. In Case 2, leave at least one transaction in January unticked (remains in `OUTSTANDING`).
  2. Create a new reconciliation for the same bank account for February (`2026-02-01` to `2026-02-28`).
  3. Observe the read-only Period From (`2026-02-01`) and Opening Balance (matches January's Closing Balance).
  4. Open the Transactions list in the picker.
- **Expected Result**:
  - The unticked January transaction appears in the eligible transactions list for February.
- **Result**: PASS

---

### 4. An original and its reversal are separate rows
- **Steps**:
  1. Create a journal entry affecting the bank account, and subsequently reverse it.
  2. Open the reconciliation picker covering the dates of both entries.
- **Expected Result**:
  - Both the original entry and the reversal entry appear as two distinct selectable lines in the picker table.
  - Ticking only one updates the total; ticking both nets them out in `moneyIn` and `moneyOut`.
- **Result**: PASS

---

### 5. Hidden selections survive search and paging and stay in the totals
- **Steps**:
  1. In the reconciliation form, tick a transaction on page 1.
  2. Search for a term that does not match the ticked transaction.
  3. Navigate to page 2 or page 3.
  4. Observe the Reconciliation Summary at the bottom.
- **Expected Result**:
  - The matched transaction ticked on page 1 remains selected in state.
  - Its amount remains included in `Money In` / `Money Out` and the calculated closing balance.
  - Clearing the search shows the row still ticked.
- **Result**: PASS

---

### 6. Refresh and re-open persistence
- **Steps**:
  1. On a Draft reconciliation form, make changes (e.g. tick lines, enter amounts).
  2. Hard refresh the browser (`Ctrl+F5`).
  3. Navigate away to another page (e.g. Dashboard) and return via the URL or browser back button.
- **Expected Result**:
  - All form fields, ticked lines, and setup classifications are restored from `sessionStorage` draft recovery without loss.
- **Result**: PASS

---

### 7. Discard
- **Steps**:
  1. Open a clean Draft reconciliation detail page.
  2. Click "Discard".
  3. Confirm the dialog with `CONFIRM_COPY.discard`.
- **Expected Result**:
  - Draft is deleted from the database.
  - All reserved journal lines are unreserved.
  - Notification `Draft discarded` appears.
  - User is redirected to `/accounting/bank-reconciliations`.
- **Result**: PASS

---

### 8. Cancel Reopen
- **Steps**:
  1. Open a completed reconciliation that has no subsequent completed reconciliation.
  2. Click "Reopen" and confirm.
  3. Verify status becomes `Draft` with the banner `Reopened. Cancel Reopen restores the version completed on <date>.`
  4. Edit the reconciliation (change closing balance or untick lines).
  5. Return to detail view and click "Cancel Reopen".
  6. Confirm the dialog with `CONFIRM_COPY.cancelReopen`.
- **Expected Result**:
  - The reconciliation restores the previously completed snapshot verbatim.
  - Status returns to `Completed`.
  - Stored draft is cleared.
- **Result**: PASS

---

### 9. Two-tab concurrency
- **Steps**:
  1. Open the same reconciliation in Edit mode across two browser tabs (Tab A and Tab B).
  2. In Tab A, change closing balance to `500.00` and save successfully (`lockVersion` increments from 1 to 2).
  3. In Tab B, attempt to save changes with stale `lockVersion = 1`.
- **Expected Result**:
  - Tab B receives a 409 Conflict error with message indicating concurrency conflict.
  - The server state is not overwritten.
  - In Tab B, the form stays intact with user changes preserved.
- **Result**: PASS

---

### 10. Unsaved-form recovery through a Journal No link on create and on edit
- **Steps**:
  1. On `/accounting/bank-reconciliations/create` or edit, make unsaved changes.
  2. Click a `Journal No` link in the transactions picker table (opens `/accounting/journal-entries/:id` in same tab).
  3. Click browser "Back" button to return to the reconciliation form.
- **Expected Result**:
  - Form state, selections, and classifications are fully restored from the session draft.
- **Result**: PASS

---

### 11. Stale-version recovery
- **Steps**:
  1. Create a draft with `lockVersion: 1` stored in sessionStorage.
  2. Modify the reconciliation in the DB (or via API) so `lockVersion` becomes 2.
  3. Navigate to `/accounting/bank-reconciliations/:id/edit`.
- **Expected Result**:
  - A warning banner appears: `Your unsaved changes could not be restored because this reconciliation was changed elsewhere. The current saved version is shown.`
  - The latest server state is loaded.
  - The stale draft in sessionStorage is cleared.
- **Result**: PASS

---

### 12. Shortening To and moving From earlier
- **Steps**:
  1. Create or edit a reconciliation with lines matched on `2026-01-25`.
  2. Change Period To to `2026-01-20`.
  3. Observe preview and Save button.
  4. In a sequence 1 reconciliation, move Period From from `2026-01-01` to `2025-12-01` when classifications exist for December entries.
- **Expected Result**:
  - Invalid entries panel displays the out-of-range matched lines and classified setup entries.
  - Save button is disabled while invalid entries exist.
  - Clicking "Untick" or "Clear classification" in the panel removes each invalid entry.
  - Once resolved, Save button becomes enabled.
- **Result**: PASS

---

### 13. A ticked but unclassified entry blocks Complete
- **Steps**:
  1. In a sequence 1 reconciliation, select a pre-period transaction in the checklist without classifying it in the setup section (`UNCLASSIFIED`).
  2. Attempt to complete.
- **Expected Result**:
  - `Complete` button is disabled with blocker message: `<n> entries are unclassified`.
- **Result**: PASS

---

### 14. Browser pass at desktop and narrow width
- **Steps**:
  1. Test the List, Form, and Detail pages at desktop width (1440px) and mobile width (375px).
  2. Verify dark theme rendering, table responsive overflow, fixed headers, and pagination controls.
- **Expected Result**:
  - Clean layout, no overlapping text, body-only scrolling, and single dark theme aesthetics consistent with ERP design system.
- **Result**: PASS
