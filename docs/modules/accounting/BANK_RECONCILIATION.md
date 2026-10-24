# Bank Reconciliation

Current mechanics of bank reconciliation (#1342): when each action is allowed, how reservations and versions are stored and protected, and the rules code must follow. Vocabulary — Reconciliation, Working set, Journal line reservation, Version, Reopen and the rest — is defined in the [glossary](../../../GLOSSARY.md#bank-reconciliation).

Specialist docs:

- [Draft storage assessment](BANK_RECONCILIATION_DRAFT_STORAGE_ASSESSMENT.md) — unsaved form drafts in `sessionStorage`, cross-tab limits, CodeQL alert.
- [Browser QA record](BANK_RECONCILIATION_QA.md)
- [Deploy gate](../../deployment/BANK_RECONCILIATION_DEPLOY_GATE.md)

## When each action is allowed

| Action | Allowed when |
|---|---|
| Create | No other Draft exists for the bank account. |
| First-time setup changes | Only on the account's first reconciliation (sequence 1). |
| **Complete** | The reconciliation is a Draft and all of: the difference (statement closing balance minus calculated closing balance) is zero; on sequence 1, the opening balance difference is zero and no journal line is Unclassified; on later sequences, the previous reconciliation is Completed, this period starts the day after it ended, and this opening balance equals its closing balance; the working set agrees with the snapshot being sealed. |
| **Reopen** | The reconciliation is Completed, it is the latest in the account's sequence, and no Draft exists for the account. |
| **Cancel reopen** | The reconciliation is a reopened Draft (it has a current Version). Refused, changing nothing, if a journal line it would restore is now reserved by another reconciliation. |
| **Discard** | The reconciliation is a Draft that has never been Completed (no Version). |

Complete reports its failing conditions together rather than stopping at the first, except that continuity reports one problem at a time (an opening balance mismatch hides a period mismatch).

## Storage

Tables use the prefix `bank_statement_reconciliation`. `bank_reconciliations` and `reconciled_transactions` are *legacy* names from a removed implementation; the migration aborts if either exists, and nothing may create them.

| Table | Holds | Reserves journal lines |
|---|---|---|
| `bank_statement_reconciliations` | Working header, one per reconciliation | — |
| `bank_statement_reconciliation_lines` | Working set (`MATCHED`, `OPENING_CLEARED` = Already cleared) | **Yes — the only place** |
| `bank_statement_reconciliation_setup_marks` | First-time setup Outstanding classifications | No |
| `bank_statement_reconciliation_versions` | One immutable row per Complete | No |
| `bank_statement_reconciliation_version_lines` | Immutable line snapshot of a version | No |

**Reservations live in one place.** `UQ_bsr_line_journal_line`, a plain unique index on `bank_statement_reconciliation_lines."journalEntryLineId"`, is the only thing that reserves a journal line. Version lines are a snapshot and reserve nothing — the same journal line is legitimately `OUTSTANDING` in one reconciliation's version and `MATCHED` in a later one. Rows in `bank_statement_reconciliation_lines` and `bank_statement_reconciliation_setup_marks` are hard-deleted, never soft-deleted.

## Migration-only objects

Six functions, eight triggers and one foreign key exist only in `1791044381374-AddBankStatementReconciliations.ts`: the `bsr_*` functions, the `trg_bsr_*` triggers, and `FK_bsr_current_version` — `(id, "currentVersionNo")` → `bank_statement_reconciliation_versions ("reconciliationId", "versionNo")`, `ON DELETE RESTRICT`. TypeORM cannot express triggers; keeping the composite FK out of the entities was a choice.

`verify-baseline.sh` therefore sees them as differences. `ALLOWLIST=migration-indexes npm run verify:baseline` allows exactly those fifteen objects by name, then checks each in the catalog (trigger table, enabled state and deferrability; the FK's columns, referenced columns and delete rule). A new migration-only object needs both halves extended.

## Versions are immutable, with no bypass

`trg_bsr_version_guard` and `trg_bsr_version_line_guard` reject updates and deletes of version rows in every session. A version is writable only until `sealedAt` is set, and `trg_bsr_version_sealed_at_commit` (a deferred constraint trigger) fails any commit that leaves one unsealed. No session variable or role switch turns this off.

Tests remove their rows through `removeSuiteBankReconciliations` (`backend/test/utils/bank-reconciliation-fixture.ts`), which disables the eight triggers with `ALTER TABLE … DISABLE TRIGGER` inside one transaction and re-enables them before commit. **Nothing under `src/` may do this.** Call it *before* deleting journal rows: the journal-line FKs are `RESTRICT`.

## Lock order

Every reconciliation write first takes `FOR NO KEY UPDATE` on the bank account's `chart_of_account` row (`lockBankAccount`, `bank-reconciliation.locks.ts`), then the header row, then working set rows in ascending `journalEntryLineId`.

`FOR NO KEY UPDATE` is deliberate: it does not conflict with the key-share lock a `journal_entry_line` insert takes, so postings are not blocked. `FOR UPDATE` would block them.

No reconciliation path, including helpers it calls, may lock `accounting_settings` (`withBalanceSheetConfigLock`) after the account lock; the account update path takes those two in the opposite order.

## Error details ride inside `message`

Reconciliation conflicts with data use `ConflictException({ message: { text, ...details } })`, as in provider-settlement stale conflicts. This matches the shared [exception-payload rule](../../../CODING_STANDARDS.md#error-details-inside-message). The frontend reads `text` through `reconciliationErrorMessage`, because `rtkErrorMessage` only understands string messages.

## Unsaved form drafts

Statement balances and selected amounts are kept in `sessionStorage`, keyed by user and reconciliation.

- `applyPreview` must return the *same* state object when nothing changed. The form compares `matched` by reference to decide whether to preview again; a fresh-but-equal object re-requests forever.
- `useClearReconciliationDraftsOnSignOut` (in `RootLayout`) removes them from a tab whenever that tab is not signed in. It cannot reach other tabs; see the [draft storage assessment](BANK_RECONCILIATION_DRAFT_STORAGE_ASSESSMENT.md).

## Provider payouts are reconciled at their net amount

A Provider settlement moves the net of its selected customer payments (refunds included) from the clearing account to the bank account. Provider fees are **not modelled** — there is no fee field or fee journal line (an explicit non-goal of #1284). If a provider withholds a fee, the bank receives less than the settlement's journal line records, and the reconciliation's difference cannot reach zero from settlement lines alone; the fee has to reach the ledger some other way.
