# Bank Reconciliation draft storage: CodeQL alert assessment

Status: **open merge gate for PR #1343.** This records the assessment the alert
must be judged against. It does not dismiss the alert; dismissal, or a change
to what is stored, is a decision for the repository owner.

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

One exposure was specific to this feature and has been closed: drafts were not
removed at sign-out, so the previous user's balances and amounts stayed
readable in the tab's storage after they signed out (the app would not load
them, since keys are scoped by user id, but the raw values remained). Since
this change, `useClearReconciliationDraftsOnSignOut` (mounted in `RootLayout`)
removes every draft when the session ends, including idle and forced sign-out.

## Residual risk

- While signed in, unsaved balances and selected amounts are held in clear text
  in the tab's `sessionStorage`. This is inherent to the approved design
  (spec D9: keep the whole unsaved form across same-tab navigation).
- A tab that is closed or crashes without a sign-out relies on the browser
  discarding `sessionStorage`; a browser's "restore session" feature can bring
  it back.

## Options

1. Accept the residual risk and dismiss the alert, citing this document.
2. Reduce what is stored (for example ids only, re-fetching amounts on
   restore). The statement balances the user typed would still need storing
   to honour D9.
3. Stop storing drafts, and replace D9 with a different way of keeping
   context, such as opening Journal No and Source links in a new tab.

No option has been chosen.
