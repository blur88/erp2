# Bank Reconciliation draft storage: CodeQL alert assessment

Status: **CodeQL alert 46 dismissed as a false positive on 2026-10-05**, on the
repository owner's decision, for the traced value only (Question 1). The
approved `sessionStorage` design (spec D9) is retained.

The dismissal does **not** cover the two risks below, which are real and remain
open: the financial data held in the draft (Question 2, Residual risk) and
cross-tab sign-out (tracked in #1345).

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

Each row below was exercised in Chromium 153 by the scripted browser QA at
`bc9e8c6cf` (record and screenshots: `BANK_RECONCILIATION_QA.md`, scenarios
Sign-out A/B and Session restore A/B), in addition to the unit tests.

| Situation | Observed in the browser |
|---|---|
| Sign-out in the tab that holds the draft | Draft removed from that tab's `sessionStorage`. |
| Browser closed and relaunched with session restore, session still valid | Tab restored with its `sessionStorage` (a marker written before the close survived, so this was a real restore, not a reload). Still signed in; the draft is kept and offered back to the same user. By design (spec D9). |
| Browser closed after a sign-out in another tab, then relaunched with session restore | Tab restored with its `sessionStorage` marker; the app loaded signed-out and the reconciliation draft was removed on load, while the unrelated marker remained. |
| **Sign-out in a different tab, the first tab left open** | **Not cleaned up.** The first tab kept its draft. In one run a later reload of that tab found it signed out and removed the draft; in the recorded run the reload found the tab **still signed in** and the draft still stored. |

The last row is wider than this feature. `sessionStorage` is per tab, auth state
is persisted to shared `localStorage` by redux-persist, and nothing synchronises
sign-out between tabs (`frontend/src` has no `storage` listener or
`BroadcastChannel`). An open tab can write its own in-memory session back to
shared storage after another tab has signed out, so whether it is later found
signed out depends on timing. While that tab stays signed in, its draft stays. Tracked in #1345.

Not exercised: a restored tab whose JavaScript never runs (offline or crashed
page); browsers other than Chromium.

## Residual risk

- While a tab is signed in, unsaved balances and selected amounts are held in
  clear text in that tab's `sessionStorage`. This is inherent to the approved
  design (spec D9) and is retained.
- After a sign-out in one tab, another open tab keeps its drafts, and can remain
  signed in. Closing that gap means synchronising sign-out across tabs, which is
  a change to authentication behaviour for the whole application and has not
  been made here.
- A restored tab that cannot run the application keeps its stored values.

## Disposition

- **Traced value (`bankAccountId`):** false positive, for the reason in
  Question 1.
- **Financial data in the draft:** not a false positive. It is an accepted,
  recorded residual risk of the approved `sessionStorage` design, with the
  multi-tab gap above stated rather than closed.

Alert 46 was dismissed as a false positive on 2026-10-05, citing this document,
after the owner reviewed the browser evidence. The dismissal applies to the
traced value. The retention of financial data in the draft and the cross-tab
sign-out behaviour are not false positives; they stay recorded here, and the
second is tracked in #1345.
