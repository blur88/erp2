# Bank Reconciliation Manual QA Procedure (#1342)

## Preconditions
- **Environment**: A disposable copy of the local database (`pg_dump` clone or freshly seeded test database) and a development stack pointed at it.
- **Safety Rule**: **NEVER** run these destructive QA scenarios against the real local primary or production database.
- **Default User**: Admin credentials (`admin` / `Admin@123!`).

## Execution record

| Field | Value |
|---|---|
| Kind of run | **Scripted browser QA** (Playwright driving a real browser). Not a manual run by a person. |
| Date (UTC) | 2026-10-04T17:13:01Z to 2026-10-04T17:18:10Z |
| Run by | Claude Code, scripted, at the repository owner's request |
| Commit under test | `bc9e8c6cf` (branch `feat/1342-bank-reconciliation`) |
| Database | Disposable PostgreSQL 18.3 container `qa1342_pg`, database `erp_qa_1342`, RAM-backed storage, port 127.0.0.1:55432. Built empty by `migration:run` (22 migrations), admin and chart of accounts from the boot seeders, then 43 QA journal entries inserted by SQL on bank accounts 1200 CIMB and 1210 Maybank. No copy of real data. Dropped after the run. |
| Stack | Backend started from source (`nest start`) on port 3101 against that database and a disposable Redis 8.6.2 container `qa1342_redis` (127.0.0.1:56379). Frontend: Vite dev server on port 3100 proxying `/api` to 3101. The development stack on ports 3000/3001/5432/6379 was not used; its backend log shows no reconciliation requests during the run. |
| Browser | Chromium 153.0.8010.12 via Playwright 1.63.0, headless. Cases 1–14 and sign-out: headless shell. Session restore: full Chromium with a persistent profile, closed and relaunched with `--restore-last-session`. |
| Viewport | 1440×900 for all cases; case 14 also at 375×812 |
| Assertions | 120 of 121 passed |
| Ledger check | Count and MD5 fingerprint of every journal entry and line were identical before and after the run |
| Evidence | Screenshots and the raw `results.json` are on branch `screenshots/1342` |

**Failures and limits of this run**

- **Cross-tab sign-out is not clean-up, and the final check failed.** After Tab B signed out, Tab A kept its stored draft (expected, recorded limitation). When Tab A was then reloaded it was *still signed in* and still held the draft. The same step passed in the previous run of this script, so the outcome is timing-dependent: an open tab can write its own in-memory session back to shared storage after another tab signs out. This is behaviour of the application's sign-out across tabs, not something this feature controls, and it is wider than the reconciliation form.
- **Not judged by the script:** visual quality in case 14 (spacing, overlap, alignment). The script measured overflow, the fixed header, the scroll container and the background against the Provider Settlements pages; the screenshots need a human look.
- **Not covered:** printing (the feature has no print path), and behaviour in browsers other than Chromium.
- Case 6's classification recovery is exercised in case 10 (first-time form), because the reconciliation used in case 6 is a later one and has no setup section.

**Defects this run found, all fixed before the recorded run** (each has an automated test that failed first):

1. A stale form could overwrite another session's change by pressing Save a second time (`8cdd053dc`).
2. A Draft's Matched and Cleared-at-setup tabs were always empty; the request failed with a database error (`1b95ea30c`).
3. A classification cleared in the invalid-entries panel was still reported invalid, so the save could never go through (`1b95ea30c`).
4. A draft was written back to `sessionStorage` right after a successful Create (`1b95ea30c`).
5. Saving a later reconciliation with ticked lines was rejected; a regression from fix 3, caught before it was pushed (`bc9e8c6cf`).

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 3. Unticked entries carry forward to the next period
- **Steps**:
  1. In Case 2, leave at least one transaction in January unticked (remains in `OUTSTANDING`).
  2. Create a new reconciliation for the same bank account for February (`2026-02-01` to `2026-02-28`).
  3. Observe the read-only Period From (`2026-02-01`) and Opening Balance (matches January's Closing Balance).
  4. Open the Transactions list in the picker.
- **Expected Result**:
  - The unticked January transaction appears in the eligible transactions list for February.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 4. An original and its reversal are separate rows
- **Steps**:
  1. Create a journal entry affecting the bank account, and subsequently reverse it.
  2. Open the reconciliation picker covering the dates of both entries.
- **Expected Result**:
  - Both the original entry and the reversal entry appear as two distinct selectable lines in the picker table.
  - Ticking only one updates the total; ticking both nets them out in `moneyIn` and `moneyOut`.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 6. Refresh and re-open persistence
- **Steps**:
  1. On a Draft reconciliation form, make changes (e.g. tick lines, enter amounts).
  2. Hard refresh the browser (`Ctrl+F5`).
  3. Navigate away to another page (e.g. Dashboard) and return via the URL or browser back button.
- **Expected Result**:
  - All form fields, ticked lines, and setup classifications are restored from `sessionStorage` draft recovery without loss.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 10. Unsaved-form recovery through a Journal No link on create and on edit
- **Steps**:
  1. On `/accounting/bank-reconciliations/create` or edit, make unsaved changes.
  2. Click a `Journal No` link in the transactions picker table (opens `/accounting/journal-entries/:id` in same tab).
  3. Click browser "Back" button to return to the reconciliation form.
- **Expected Result**:
  - Form state, selections, and classifications are fully restored from the session draft.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

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
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 13. A ticked but unclassified entry blocks Complete
- **Steps**:
  1. In a sequence 1 reconciliation, select a pre-period transaction in the checklist without classifying it in the setup section (`UNCLASSIFIED`).
  2. Attempt to complete.
- **Expected Result**:
  - `Complete` button is disabled with blocker message: `<n> entries are unclassified`.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record").

---

### 14. Browser pass at desktop and narrow width
- **Steps**:
  1. Test the List, Form, and Detail pages at desktop width (1440px) and mobile width (375px).
  2. Verify dark theme rendering, table responsive overflow, fixed headers, and pagination controls.
- **Expected Result**:
  - Clean layout, no overlapping text, body-only scrolling, and single dark theme aesthetics consistent with ERP design system.
- **Result**: PASS — scripted browser QA at `bc9e8c6cf` (see "Scripted browser QA record"). Layout quality in the screenshots still needs a human look.

---

## Scripted browser QA record

Generated from `results.json` of the run above. "Actual" is what the script read from the page or the database.

### Case 1: First-time setup with an opening mismatch blocks Complete while Draft saves

**Result: PASS**

Steps:

1. Open /accounting/bank-reconciliations/create, choose 1200 CIMB (no previous reconciliation)
2. Period 2026-01-01 to 2026-01-31, Opening 1000.00, Closing 1200.00
3. Classify all three pre-period entries as Outstanding (cleared net 0.00, so opening does not agree)
4. Tick JE-QA-J1 (in 500.00) and JE-QA-J2 (out 300.00)

| Assertion | Result | Actual |
|---|---|---|
| First-time setup section is shown with "3 unclassified" | PASS |  |
| Opening Balance Difference shows 1,000.00 | PASS | `0 unclassifiedOpening Balance Difference: MYR 1,000.00` |
| Summary: Money In 500.00, Money Out 300.00, Calculated Closing 1,200.00 | PASS | `{"moneyIn":"MYR 500.00","moneyOut":"MYR 300.00","calculated":"MYR 1,200.00"}` |
| Create is enabled although the opening gate fails | PASS |  |
| Database: saved as DRAFT, sequence 1, with a BR number | PASS | `DRAFT\|BR-26-001\|1\|1` |
| Detail page: Complete is disabled | PASS |  |
| Detail page shows the blocker "Opening Balance Difference is <amount>" | PASS | `Opening Balance Difference is 1000.00` |

Screenshots: [case01-form-before-create.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case01-form-before-create.png), [case01-detail-blocked.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case01-detail-blocked.png)

### Case 2: Exact closing match completes

**Result: PASS**

Steps:

1. Open the Draft from case 1 and check the Matched tab lists the two ticked entries
2. Edit: reclassify JE-QA-P1 (in 1,000.00) as Already cleared
3. Click Complete and confirm

| Assertion | Result | Actual |
|---|---|---|
| Draft detail: the Matched tab lists JE-QA-J1 and JE-QA-J2 | PASS | `05/01/2026JE-QA-J1ExpenseQA January receiptMYR 500.00MYR 0.0012/01/2026JE-QA-J2ExpenseQA January paymentMYR 0.00MYR 300.00` |
| Draft detail: Cleared at setup is empty before P1 is reclassified | PASS |  |
| Draft detail: the Outstanding tab lists unticked entries (JE-QA-R1 shown) | PASS |  |
| Opening Balance Difference becomes 0.00 and 0 unclassified | PASS |  |
| Detail page: Complete is enabled with no blockers | PASS |  |
| Confirmation states the lock and that no journal entries are changed | PASS | `Complete reconciliation?This locks the reconciliation and records the matched and outstanding entries as they are now. No journal entries are changed.CancelComplete` |
| Database: status COMPLETED with currentVersionNo 1 | PASS | `COMPLETED\|1\|3` |
| Database: one sealed version, totals 500/300, difference 0, completedBy admin | PASS | `1\|t\|500.0000\|300.0000\|0.0000\|admin` |
| Version lines: 2 MATCHED, 1 OPENING_CLEARED, the rest OUTSTANDING | PASS | `MATCHED\|2 OUTSTANDING\|35 OPENING_CLEARED\|1` |
| Page shows "Completed by admin on <date>" | PASS | `Completed by admin on 05/10/2026SummaryTotal Money InMYR 500` |
| No reconciliation draft remains in sessionStorage | PASS | `[]` |

Screenshots: [case02-form-balanced.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case02-form-balanced.png), [case02-confirm-complete.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case02-confirm-complete.png), [case02-detail-completed.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case02-detail-completed.png)

### Case 3: Unticked entries carry forward to the next period

**Result: PASS**

Steps:

1. New reconciliation for 1200 CIMB after January was completed with JE-QA-J3 unticked

| Assertion | Result | Actual |
|---|---|---|
| Period From is read-only and 2026-02-01 | PASS | `2026-02-01` |
| Opening Balance is read-only and equals January closing 1200.00 | PASS | `1200.00` |
| No first-time setup section on a later reconciliation | PASS |  |
| The unticked January entry JE-QA-J3 (25/01/2026) is listed for February | PASS |  |
| JE-QA-J1, matched in January, is not offered again | PASS |  |

Screenshots: [case03-carry-forward.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case03-carry-forward.png)

### Case 4: An original and its reversal are separate rows

**Result: PASS**

Steps:

1. Search JE-QA-R on the same form: JE-QA-R1 (in 200.00, 15/01) and its reversal JE-QA-R2 (out 200.00, 16/01)

| Assertion | Result | Actual |
|---|---|---|
| Both rows are present and separately selectable | PASS |  |
| Ticking only the original: Money In 200.00, Money Out 0.00, Calculated 1,400.00 | PASS | `{"moneyIn":"MYR 200.00","moneyOut":"MYR 0.00","calculated":"MYR 1,400.00"}` |
| Ticking both: Money In 200.00 and Money Out 200.00 shown separately, Calculated back to 1,200.00 | PASS | `{"moneyIn":"MYR 200.00","moneyOut":"MYR 200.00","calculated":"MYR 1,200.00"}` |

Screenshots: [case04-original-and-reversal.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case04-original-and-reversal.png)

### Case 5: Hidden selections survive search and paging and stay in the totals

**Result: PASS**

Steps:

1. Tick JE-QA-P2 (out 150.00) on page 1
2. Search for "zzzz", which matches nothing
3. Clear the search with the "Clear search" control and go to page 2
4. Untick JE-QA-P2, tick JE-QA-FEB1 (in 60.00) and Create the February draft for the following cases

| Assertion | Result | Actual |
|---|---|---|
| Summary Money Out 150.00, Calculated 1,050.00 | PASS | `{"moneyIn":"MYR 0.00","moneyOut":"MYR 150.00","calculated":"MYR 1,050.00"}` |
| With no rows shown, the totals are unchanged | PASS | `{"moneyIn":"MYR 0.00","moneyOut":"MYR 150.00","calculated":"MYR 1,050.00"}` |
| Page 2 does not show JE-QA-P2 | PASS |  |
| On page 2 the totals still include the hidden selection | PASS | `{"moneyIn":"MYR 0.00","moneyOut":"MYR 150.00","calculated":"MYR 1,050.00"}` |
| Back on page 1 the row is still ticked | PASS |  |
| Database: February draft is sequence 2, From 2026-02-01, Opening 1200.0000 | PASS | `DRAFT\|2\|2026-02-01\|1200.0000\|BR-26-002` |

Screenshots: [case05-page2-totals.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case05-page2-totals.png)

### Case 6: Refresh and re-open persistence

**Result: PASS**

Steps:

1. Edit the February draft: Closing 1300.00, tick JE-QA-J3; do not save
2. Hard reload the page
3. Navigate to the dashboard and come back with the browser Back button

| Assertion | Result | Actual |
|---|---|---|
| After reload: Closing Balance is 1300.00 | PASS | `1300.00` |
| After reload: search text "JE-QA-J3" is restored | PASS | `JE-QA-J3` |
| After reload: JE-QA-J3 is still ticked | PASS |  |
| After leaving and returning: Closing 1300.00 and JE-QA-J3 ticked | PASS | `1300.00` |

Note: This reconciliation is sequence 2, so it has no setup classifications; classification recovery is exercised on the Maybank first-time form in case 10.

Screenshots: [case06-after-reload.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case06-after-reload.png)

### Case 7: Discard

**Result: PASS**

Steps:

1. Open the February draft BR-26-002 (holds 2 reserved line(s)) and click Discard

| Assertion | Result | Actual |
|---|---|---|
| Confirmation explains the effect: deletes the draft, releases entries, number not reused, no journals changed | PASS | `Discard draft?This deletes the draft reconciliation and releases the entries it had ticked or classified. Its number will not be reused. No journal entries are changed. This cannot be undone.CancelDiscard` |
| Redirected to the list | PASS | `/accounting/bank-reconciliations` |
| Notification "Draft discarded" appears | PASS |  |
| Database: the draft row is gone | PASS |  |
| Database: its reservations are released | PASS | `before 2, after 0` |
| Database: the number counter did not go back (next is 3) | PASS | `3` |

Screenshots: [case07-confirm-discard.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case07-confirm-discard.png), [case07-list-after-discard.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case07-list-after-discard.png)

### Case 8: Cancel Reopen

**Result: PASS**

Steps:

1. Open completed January (latest on the account, no draft exists) and Reopen
2. Edit: Closing 999.00, untick JE-QA-J2, reclassify JE-QA-P2 to Already cleared, Save
3. Cancel Reopen and confirm

| Assertion | Result | Actual |
|---|---|---|
| Status is Draft and the reopened banner names the completion date | PASS | `Reopened. Cancel Reopen restores the version completed on 05/10/2026.` |
| Reservations are kept while reopened | PASS |  |
| The edits are saved to the working set (it now differs from the completed state) | PASS | `2026-01-01\|2026-01-31\|1000.0000\|999.0000\|DRAFT\|1` |
| Confirmation explains the effect: discards changes since reopening, restores exactly, no journals changed | PASS | `Cancel reopen?This discards every change made since reopening and restores the reconciliation exactly as it was last completed, including its balances and matched entries. No journal entries are changed.CancelCancel Reopen` |
| Header business fields equal the pre-reopen capture | PASS | `2026-01-01\|2026-01-31\|1000.0000\|1200.0000\|COMPLETED\|1` |
| Working lines (journal no, kind, original addedBy/addedAt) equal the pre-reopen capture | PASS | `JE-QA-J1:MATCHED:admin:2026-10-04 17:13:21.688+00 JE-QA-J2:MATCHED:admin:2026-10-04 17:13:21.695+00 JE-QA-P1:OPENING_CLEARED:admin:2026-10-04 17:13:41.871+00` |
| Setup marks (journal no, original markedBy/markedAt) equal the pre-reopen capture | PASS | `JE-QA-P2:admin:2026-10-04 17:13:21.702+00 JE-QA-P3:admin:2026-10-04 17:13:21.713+00` |
| lockVersion advanced and was not restored | PASS | `3 -> 6` |
| No version was appended (still 1) | PASS |  |
| Audit history keeps REOPEN and CANCEL_REOPEN | PASS | `CREATE,UPDATE,COMPLETE,REOPEN,UPDATE,CANCEL_REOPEN` |
| No stored draft remains | PASS |  |

Screenshots: [case08-reopened.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case08-reopened.png), [case08-confirm-cancel-reopen.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case08-confirm-cancel-reopen.png), [case08-restored-completed.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case08-restored-completed.png)

### Case 9: Two-tab concurrency

**Result: PASS**

Steps:

1. Tab B opens the same draft in Edit (lockVersion 1); Tab A already has it open
2. Tab A: Closing 500.00, Save Changes
3. Tab B: Closing 777.00, Save Changes with stale lockVersion 1

| Assertion | Result | Actual |
|---|---|---|
| Tab B starts from server state (Closing 1260.00), not Tab A's unsaved draft: sessionStorage is per tab | PASS | `1260.00` |
| Tab A saved: Closing 500.0000, lockVersion 2 | PASS | `500.0000\|2` |
| Tab B shows the server's conflict message | PASS | `["This reconciliation was changed elsewhere after you opened it. Reload the page to load the current version. Your unsaved changes cannot be saved over it.","This reconciliation was changed by someone else. Reload to continue."]` |
| Tab B stays on the edit form with 777.00 intact | PASS | `777.00` |
| Server state not overwritten: still 500.0000, lockVersion 2 | PASS | `500.0000\|2` |
| Tab B explains that the record changed elsewhere and must be reloaded | PASS |  |
| Tab B cannot save again over the newer version: Save Changes is disabled | PASS |  |
| Tab B keeps its unsaved draft, still at the lockVersion it was loaded from (1) | PASS | `{"lockVersion":1,"closing":"777.00"}` |
| Server state still 500.0000 at lockVersion 2 after Tab B's attempt | PASS | `500.0000\|2` |

Screenshots: [case09-tabB-conflict.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case09-tabB-conflict.png)

### Case 10: Unsaved-form recovery through a Journal No link on create and on edit

**Result: PASS**

Steps:

1. EDIT: with Closing 1300.00 and JE-QA-J3 ticked unsaved, click the Journal No link JE-QA-J3 (same tab)

| Assertion | Result | Actual |
|---|---|---|
| EDIT: navigated to the journal entry page in the same tab | PASS | `/accounting/journal-entries/6330dc5c-6bde-4d9d-a41d-4642eb057ae5` |
| EDIT: back on the form, Closing 1300.00, JE-QA-J3 ticked, search text kept | PASS |  |

Screenshots: [case10-edit-journal-page.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case10-edit-journal-page.png), [case10-edit-restored.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case10-edit-restored.png)

### Case 10 (create): Unsaved-form recovery through a Journal No link on create (first-time form, with a classification)

**Result: PASS**

Steps:

1. CREATE on 1210 Maybank: 2026-01-01 to 2026-01-31, Opening 0.00, Closing 10.00; classify JE-QA-MP1 Outstanding; tick JE-QA-M1
2. Click the Journal No link JE-QA-M1, then browser Back

| Assertion | Result | Actual |
|---|---|---|
| The create URL carries a draft token | PASS | `2d0f72bd-5efc-4048-b778-532c2c45316e` |
| Same draft token after returning | PASS |  |
| Statement fields restored (From 2026-01-01, To 2026-01-31, Opening 0.00, Closing 10.00) | PASS |  |
| JE-QA-M1 is still ticked | PASS |  |
| JE-QA-MP1 is still classified Outstanding | PASS | `true` |

Screenshots: [case10b-create-restored.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case10b-create-restored.png)

### Case 11: Stale-version recovery

**Result: PASS**

Steps:

1. Tab B holds a stored draft at lockVersion 1 (Closing 777.00); the server is now at lockVersion 2. Reload Tab B's edit page

| Assertion | Result | Actual |
|---|---|---|
| The exact warning text is shown | PASS |  |
| The current server state is loaded (Closing 500.00) | PASS | `500.00` |
| The stale stored draft is gone (none stored, or re-stored at lockVersion 2 with server values) | PASS | `none` |

Screenshots: [case11-stale-warning.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case11-stale-warning.png)

### Case 12: Shortening To and moving From earlier

**Result: PASS**

Steps:

1. Tick JE-QA-M3 (25/01/2026), then change Period To to 2026-01-20
2. Move Period From from 2026-01-01 to 2025-12-01 while JE-QA-MP1 (15/12/2025) is classified Outstanding

| Assertion | Result | Actual |
|---|---|---|
| Invalid-entries panel lists JE-QA-M3 | PASS | `The following selections are no longer eligible and must be resolved before saving:Matched entries dated after the statement period or no longer eligible:JE-QA-M3 (25/01/2026) — QA Maybank late receip` |
| The row is gone from the checklist but nothing was unticked automatically (still in the stored selection) | PASS |  |
| Create is disabled while the panel is non-empty | PASS |  |
| After Untick the entry leaves the panel and Create is enabled | PASS |  |
| Invalid-entries panel lists the classification on JE-QA-MP1 | PASS | `The following selections are no longer eligible and must be resolved before saving:Classified setup entries that are no longer before the period start date:JE-QA-MP1 (15/12/2025) — QA Maybank pre-peri` |
| Create is disabled; the classification was not removed automatically | PASS |  |
| After Clear classification the panel is empty and Create is enabled | PASS |  |

Screenshots: [case12-invalid-matched.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case12-invalid-matched.png), [case12-invalid-classification.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case12-invalid-classification.png)

### Case 13: A ticked but unclassified entry blocks Complete

**Result: PASS**

Steps:

1. JE-QA-MP1 (pre-period, 10.00 in) is now Unclassified. Untick JE-QA-M1, tick JE-QA-MP1 in the checklist, Closing 10.00, Create
2. Attempt Complete through the API as well (the server is the real guard)

| Assertion | Result | Actual |
|---|---|---|
| The form counts the ticked entry as "1 unclassified" | PASS |  |
| Closing gate would pass: Calculated Closing 10.00 equals statement Closing 10.00 | PASS | `{"moneyIn":"MYR 10.00","moneyOut":"MYR 0.00","calculated":"MYR 10.00"}` |
| Detail: Complete is disabled | PASS |  |
| Blocker shown: "1 entry is unclassified" | PASS | `1 entry is unclassified` |
| It is the only blocker (no Difference or Opening Balance Difference blocker) | PASS |  |
| Draft detail: the Matched tab lists JE-QA-MP1 | PASS |  |
| Server rejects Complete with 409 and names the gate | PASS | `409 {"text":"Cannot complete: 1 entry is unclassified.","gates":{"unclassifiedCount":1}}` |

Screenshots: [case13-form-ticked-unclassified.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case13-form-ticked-unclassified.png), [case13-detail-blocked.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case13-detail-blocked.png)

### Case 14: Browser pass at desktop and narrow width

**Result: PASS**

Assertions: 22 of 22 passed. For the list, form and detail pages at 1440×900 and 375×812: no horizontal page scroll; the header stays at the top after scrolling the content; the background equals the Provider Settlements sibling; the list and form scroll the same container as their siblings.

- desktop-1440 measurements: {"list":{"innerWidth":1440,"pageScrollWidth":1440,"horizontalOverflow":false,"scroller":"div.MuiBox-root","scrolledTo":274,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"form":{"innerWidth":1440,"pageScrollWidth":1440,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":670,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"detail":{"innerWidth":1440,"pageScrollWidth":1440,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":244,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"sibling-list":{"innerWidth":1440,"pageScrollWidth":1440,"horizontalOverflow":false,"scroller":"div.MuiBox-root","scrolledTo":274,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"sibling-form":{"innerWidth":1440,"pageScrollWidth":1440,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":6,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0}}
- narrow-375 measurements: {"list":{"innerWidth":375,"pageScrollWidth":375,"horizontalOverflow":false,"scroller":"none (content fits)","scrolledTo":0,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"form":{"innerWidth":375,"pageScrollWidth":375,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":1322,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":1},"detail":{"innerWidth":375,"pageScrollWidth":375,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":709,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":1},"sibling-list":{"innerWidth":375,"pageScrollWidth":375,"horizontalOverflow":false,"scroller":"none (content fits)","scrolledTo":0,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0},"sibling-form":{"innerWidth":375,"pageScrollWidth":375,"horizontalOverflow":false,"scroller":"main.MuiBox-root","scrolledTo":470,"headerTopAfterScroll":0,"bodyBackground":"rgb(18, 18, 18)","elementsPastRightEdgeOutsideTables":0}}
- Not judged by this script: visual quality such as spacing, overlap and alignment. The screenshots are the evidence for those and need a human look.

Screenshots: [case14-desktop-1440-list-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-list-top.png), [case14-desktop-1440-list-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-list-scrolled.png), [case14-desktop-1440-form-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-form-top.png), [case14-desktop-1440-form-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-form-scrolled.png), [case14-desktop-1440-detail-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-detail-top.png), [case14-desktop-1440-detail-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-detail-scrolled.png), [case14-desktop-1440-sibling-list-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-sibling-list-top.png), [case14-desktop-1440-sibling-list-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-sibling-list-scrolled.png), [case14-desktop-1440-sibling-form-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-sibling-form-top.png), [case14-desktop-1440-sibling-form-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-desktop-1440-sibling-form-scrolled.png), [case14-narrow-375-list-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-list-top.png), [case14-narrow-375-list-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-list-scrolled.png), [case14-narrow-375-form-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-form-top.png), [case14-narrow-375-form-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-form-scrolled.png), [case14-narrow-375-detail-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-detail-top.png), [case14-narrow-375-detail-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-detail-scrolled.png), [case14-narrow-375-sibling-list-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-sibling-list-top.png), [case14-narrow-375-sibling-list-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-sibling-list-scrolled.png), [case14-narrow-375-sibling-form-top.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-sibling-form-top.png), [case14-narrow-375-sibling-form-scrolled.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/case14-narrow-375-sibling-form-scrolled.png)

### Sign-out A: Sign-out in the tab that holds the draft

**Result: PASS**

Steps:

1. Edit the Maybank draft, change Closing to 11.00 (unsaved), confirm a draft is stored, then sign out from the user menu

| Assertion | Result | Actual |
|---|---|---|
| A draft is stored before sign-out | PASS | `["erp:bank-reconciliation-draft:40a64555-f9d0-4ea5-bda8-98581983053d:8217c798-8c32-4dcb-8a2b-e740f76943a2"]` |
| After sign-out in the same tab, no reconciliation draft remains in that tab's sessionStorage | PASS | `[]` |

Note: Stored value fields: v, lockVersion, form, picker, savedAt; form fields: bankAccountId, periodFrom, periodTo, openingBalance, closingBalance, matched, setupChanges

Screenshots: [signout1-after-signout.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/signout1-after-signout.png)

### Sign-out B: Sign-out in a different tab (known retention)

**Result: FAIL**

Steps:

1. Tab A: edit the Maybank draft with an unsaved change (draft stored in Tab A). Tab B: open the list in the same browser profile
2. Sign out in Tab B
3. Tab A reloads (first action after the other tab signed out)

| Assertion | Result | Actual |
|---|---|---|
| Tab A holds a stored draft; Tab B holds none | PASS |  |
| KNOWN LIMITATION OBSERVED: Tab A still holds its draft after Tab B signed out (retention, not cleanup) | PASS | `["erp:bank-reconciliation-draft:40a64555-f9d0-4ea5-bda8-98581983053d:8217c798-8c32-4dcb-8a2b-e740f76943a2"]` |
| After Tab A reloads it is signed out and its draft is removed | **FAIL** | `/accounting/bank-reconciliations/8217c798-8c32-4dcb-8a2b-e740f76943a2/edit ["erp:bank-reconciliation-draft:40a64555-f9d0-4ea5-bda8-98581983053d:8217c798-8c32-4dcb-8a2b-e740f76943a2"]` |

Note: Tab A still displays the form after Tab B signed out: true. Tab A URL: /accounting/bank-reconciliations/8217c798-8c32-4dcb-8a2b-e740f76943a2/edit

Screenshots: [signout2-tabA-after-tabB-signout.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/signout2-tabA-after-tabB-signout.png)

### Session restore A: Browser session restored while still signed in

**Result: PASS**

Steps:

1. Edit the Maybank draft, change Closing to 21.00 (unsaved); write a marker to sessionStorage; close the whole browser without signing out
2. Relaunch the browser on the same profile with session restore

| Assertion | Result | Actual |
|---|---|---|
| Before close: one draft is stored | PASS |  |
| The tab is restored at the edit URL | PASS | `/accounting/bank-reconciliations/8217c798-8c32-4dcb-8a2b-e740f76943a2/edit` |
| The sessionStorage marker survived: this is a restored session, not a fresh load | PASS | `r1` |
| Still signed in, and the unsaved draft is offered back (Closing 21.00): retained by design | PASS | `21.00` |

Note: Browser: 153.0.8010.12 (full Chromium, new headless), persistent profile

Screenshots: [restore1-restored-signed-in.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/restore1-restored-signed-in.png)

### Session restore B: Browser session restored after sign-out in another tab

**Result: PASS**

Steps:

1. Tab A: edit the Maybank draft with an unsaved change (Closing 22.00) and a sessionStorage marker
2. Tab B: sign out. Then close the whole browser
3. Relaunch the browser on the same profile with session restore

| Assertion | Result | Actual |
|---|---|---|
| KNOWN LIMITATION OBSERVED: before the close, Tab A still holds its draft although Tab B signed out | PASS |  |
| Tab A is restored with its sessionStorage marker (a real session restore) | PASS |  |
| The restored tab is signed out (login page) | PASS | `/login` |
| The restored tab's reconciliation draft was removed on load, while the unrelated marker remains | PASS | `[]` |

Note: Restored tabs: /login, /login

Screenshots: [restore2-restored-signed-out.png](https://raw.githubusercontent.com/blur88/erp2/screenshots/1342/shots/restore2-restored-signed-out.png)
