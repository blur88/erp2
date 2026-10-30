# Bank Reconciliation draft storage: CodeQL alert assessment

Status: **CodeQL alert 46 dismissed as a false positive on 2026-10-05**, on the
repository owner's decision, for the traced value only (Question 1). The
approved `sessionStorage` design (spec D9) is retained.

The dismissal does **not** cover financial data held in the draft or cross-tab
sign-out. The financial-data risk remains accepted below. The historical
cross-tab failure motivated #1345; see the [current coordination behavior and
accepted limits](../../frontend/session-coordination.md). Its browser verification
is still pending.

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

`useClearReconciliationDraftsOnSignOut`, mounted in `RootLayout` after shared
Session startup, removes every draft from **the tab it runs in** whenever that
tab is not signed in. The Session coordinator also clears drafts before
replacing an existing Session or applying an observed sign-out.

Each row below was exercised in Chromium 153 by the scripted browser QA at
`bc9e8c6cf` (record and screenshots: `BANK_RECONCILIATION_QA.md`, scenarios
Sign-out A/B and Session restore A/B), in addition to the unit tests.

| Situation | Observed in the browser |
|---|---|
| Sign-out in the tab that holds the draft | Draft removed from that tab's `sessionStorage`. |
| Browser closed and relaunched with session restore, session still valid | Tab restored with its `sessionStorage` (a marker written before the close survived, so this was a real restore, not a reload). Still signed in; the draft is kept and offered back to the same user. By design (spec D9). |
| Browser closed after a sign-out in another tab, then relaunched with session restore | Tab restored with its `sessionStorage` marker; the app loaded signed-out and the reconciliation draft was removed on load, while the unrelated marker remained. |
| **Sign-out in a different tab, the first tab left open** | **Not cleaned up.** The first tab kept its draft. In one run a later reload of that tab found it signed out and removed the draft; in the recorded run the reload found the tab **still signed in** and the draft still stored. |

At the recorded commit, the last row was wider than this feature.
`sessionStorage` was per tab, auth state was persisted to shared `localStorage` by redux-persist, and nothing synchronised sign-out between tabs (there was no
`storage` listener or `BroadcastChannel`). An open tab could write its in-memory
session back after another tab signed out. This describes the historical
failure, not the current coordinator; #1345 tracks the rebuild and browser
verification. See the [current limits](../../frontend/session-coordination.md).

Not exercised: a restored tab whose JavaScript never runs (offline or crashed
page); browsers other than Chromium.

## Residual risk

- While a tab is signed in, unsaved balances and selected amounts are held in
  clear text in that tab's `sessionStorage`. This is inherent to the approved
  design (spec D9) and is retained.
- Cross-tab cleanup now follows the [Session coordinator and its accepted
  limits](../../frontend/session-coordination.md). The recorded browser run above
  predates that implementation; it does not verify the new behavior.
- A restored tab that cannot run the application keeps its stored values.

## Disposition

- **Traced value (`bankAccountId`):** false positive, for the reason in
  Question 1.
- **Financial data in the draft:** not a false positive. It is an accepted,
  recorded residual risk of the approved `sessionStorage` design, with cross-tab
  verification tracked separately in #1345.

Alert 46 was dismissed as a false positive on 2026-10-05, citing this document,
after the owner reviewed the browser evidence. The dismissal applies to the
traced value. The retention of financial data in the draft and the cross-tab
sign-out behaviour are not false positives; they stay recorded here, and the
second motivated the coordination work in #1345, whose browser verification
is pending.
