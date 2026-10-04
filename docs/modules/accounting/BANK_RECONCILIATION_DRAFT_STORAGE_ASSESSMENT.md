# Bank Reconciliation draft storage: CodeQL alert assessment

Status: **open merge gate for PR #1343.** This records the assessment the alert
must be judged against. The approved `sessionStorage` design (spec D9) is
retained. The alert is not dismissed here.

## The alert

- Rule: clear-text storage of sensitive information (CodeQL, high).
- Location: `frontend/src/pages/accounting/bank-reconciliations/reconciliationDraftStorage.ts`,
  the `sessionStorage.setItem` call in `saveDraft`.
- Traced value: `bankAccountId`.

## Question 1: is the traced value sensitive?

`bankAccountId` is the primary key (a UUID) of a `chart_of_account` row. It is
not a bank account number, IBAN, card number, credential or token, and the
application stores no bank account numbers at all. The same id appears in
request URLs and API responses for every authenticated user. The alert's
specific trace is most likely a name-based match on "bank account".

This supports treating the *traced value* as a false positive. It does not
settle whether the stored draft as a whole is acceptable, which is question 2.

## Question 2: what else does the draft hold, and who can read it?

What is written (`StoredDraft`):

| Field | Content |
|---|---|
| key | user id, and the reconciliation id or a random create token |
| `form.bankAccountId` | chart-of-account UUID |
| `form.periodFrom`, `form.periodTo` | statement period |
| `form.openingBalance`, `form.closingBalance` | statement balances as typed |
| `form.matched` | journal line ids with their Money In / Money Out amounts |
| `form.setupChanges` | journal line ids with a classification |
| `picker` | page numbers, search text, filter |
| `lockVersion`, `savedAt` | concurrency and time metadata |

No credential, token, personal data or bank account number is included. The
financial content is business data: statement balances and transaction
amounts.

Exposure of `sessionStorage`:

- It is scoped to one browser tab and one origin and is discarded when the tab
  closes. It is never sent to the server.
- Any script running on the application origin can read it. A script injection
  flaw would therefore expose it — but the same script could read the same
  figures from the page and from the authenticated API.
- Someone with access to the unlocked browser can read it through developer
  tools while the tab is open.

## Sign-out cleanup: what is and is not covered

`useClearReconciliationDraftsOnSignOut` (mounted in `RootLayout`, which renders
inside redux-persist's `PersistGate`) removes every draft from **the tab it
runs in** whenever that tab is not signed in.

| Situation | Outcome | How it was checked |
|---|---|---|
| Sign-out in the tab that holds the draft (manual, idle timeout, or a forced `clearAuth` after a failed token refresh) | Drafts removed | Unit test: signed-in → signed-out transition |
| Reload of a signed-in tab | Drafts kept, by design (spec D9) | Unit test: mounted signed-in. Relies on `PersistGate` rehydrating auth before first render |
| Browser restores a closed tab or session **after** the user signed out or the persisted session is gone | Drafts removed when the app loads | Unit test: mounted signed-out |
| Browser restores a tab while the persisted session is still valid (for example "remember me") | Drafts kept and offered back to the same user | By design; same as a reload |
| **Sign-out in a different tab** | **Not covered.** `sessionStorage` is per tab and auth state is not synchronised between tabs, so the other tab stays signed in in memory and keeps its drafts. They are removed only when that tab itself signs out, is forced out by a failed request, or is closed | Code reading: no `storage` listener or `BroadcastChannel` exists in `frontend/src` |
| Restored tab whose JavaScript never runs (offline, crashed page) | Not covered; the raw values stay until the tab is closed | Inherent to client-side cleanup |

None of these rows has been exercised in a real browser. The unit tests cover
the hook's logic only; multi-tab and session-restore behaviour belong in the
manual QA run.

## Residual risk

- While a tab is signed in, unsaved balances and selected amounts are held in
  clear text in that tab's `sessionStorage`. This is inherent to the approved
  design (spec D9) and is retained.
- After a sign-out in one tab, another open tab keeps its drafts for as long as
  it stays open and signed in. Closing that gap means synchronising sign-out
  across tabs, which is a change to authentication behaviour for the whole
  application and has not been made.
- A restored tab that cannot run the application keeps its stored values.

## Disposition

- **Traced value (`bankAccountId`):** false positive, for the reason in
  Question 1.
- **Financial data in the draft:** not a false positive. It is an accepted,
  recorded residual risk of the approved `sessionStorage` design, with the
  multi-tab gap above stated rather than closed.

The alert has **not** been dismissed. Dismissal is for the repository owner,
after the multi-tab and session-restore rows have been exercised in a browser.
