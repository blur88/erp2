# Issue #395 — Accounting Module Modernization

**Date:** 2026-04-19
**Issue:** [#395](https://github.com/blur88/erp2/issues/395)
**Approach:** All 9 pages in one PR (Option A)

---

## Goal

Refactor all 9 accounting pages to use the same `GenericListPage` + `useFilterBar` + master-detail workspace pattern established in the Sales and Purchasing modules. Remove the two standalone detail pages (`JournalEntryDetailsPage`, `BankReconciliationDetailsPage`) by absorbing their functionality into workspace components.

---

## File Structure

Each page follows the Sales/Purchasing convention:

```
frontend/src/pages/accounting/
├── JournalEntriesPage.tsx               ← thin orchestrator (refactored)
├── BankReconciliationsPage.tsx          ← thin orchestrator (refactored)
├── ExpensesPage.tsx                     ← thin orchestrator (refactored)
├── FundTransfersPage.tsx                ← thin orchestrator (refactored)
├── SettlementsPage.tsx                  ← thin orchestrator (refactored)
├── OwnerEquityPage.tsx                  ← thin orchestrator (refactored)
├── FiscalPeriodsPage.tsx                ← thin orchestrator (refactored)
├── ChartOfAccountsPage.tsx              ← thin orchestrator (refactored)
├── AccountMappingsPage.tsx              ← thin orchestrator (refactored)
├── JournalEntryDetailsPage.tsx          ← DELETED
├── BankReconciliationDetailsPage.tsx    ← DELETED
│
├── components/
│   ├── JournalEntriesTable.tsx
│   ├── JournalEntryContextHeader.tsx
│   ├── JournalEntryWorkspaceCard.tsx
│   ├── JournalEntriesDialogs.tsx
│   ├── BankReconciliationsTable.tsx
│   ├── BankReconciliationContextHeader.tsx
│   ├── BankReconciliationWorkspaceCard.tsx
│   ├── BankReconciliationsDialogs.tsx
│   ├── ExpensesTable.tsx
│   ├── ExpenseContextHeader.tsx
│   ├── ExpenseWorkspaceCard.tsx
│   ├── ExpensesDialogs.tsx
│   ├── FundTransfersTable.tsx
│   ├── FundTransferContextHeader.tsx
│   ├── FundTransferWorkspaceCard.tsx
│   ├── FundTransfersDialogs.tsx
│   ├── SettlementsTable.tsx
│   ├── SettlementContextHeader.tsx
│   ├── SettlementWorkspaceCard.tsx
│   ├── SettlementsDialogs.tsx
│   ├── OwnerEquityTable.tsx
│   ├── OwnerEquityContextHeader.tsx
│   ├── OwnerEquityWorkspaceCard.tsx
│   ├── OwnerEquityDialogs.tsx
│   ├── FiscalPeriodsTable.tsx
│   ├── FiscalPeriodContextHeader.tsx
│   ├── FiscalPeriodWorkspaceCard.tsx
│   ├── FiscalPeriodsDialogs.tsx
│   ├── ChartOfAccountsTable.tsx
│   ├── ChartOfAccountContextHeader.tsx
│   ├── ChartOfAccountWorkspaceCard.tsx
│   ├── ChartOfAccountsDialogs.tsx
│   ├── AccountMappingsTable.tsx
│   ├── AccountMappingContextHeader.tsx
│   ├── AccountMappingWorkspaceCard.tsx
│   └── AccountMappingsDialogs.tsx
│
└── hooks/
    ├── useJournalEntriesWorkspace.ts
    ├── useBankReconciliationsWorkspace.ts
    ├── useExpensesWorkspace.ts
    ├── useFundTransfersWorkspace.ts
    ├── useSettlementsWorkspace.ts
    ├── useOwnerEquityWorkspace.ts
    ├── useFiscalPeriodsWorkspace.ts
    ├── useChartOfAccountsWorkspace.ts
    └── useAccountMappingsWorkspace.ts
```

---

## New FilterFieldTypes

Add to `frontend/src/types/filterBar.types.ts` `FilterFieldType` union and implement cases in `frontend/src/components/filters/FilterBar.tsx`:

| Type key | Options | Used by |
|---|---|---|
| `journal-entry-status` | draft, posted, reversed | Journal Entries |
| `journal-entry-type` | manual, sales_order, payment, settlement, goods_received_note, vendor_payment, stock_adjustment, owner_equity_transaction, expense, opening_balance, fund_transfer | Journal Entries |
| `expense-status` | draft, posted | Expenses |
| `owner-equity-type` | deposit, withdrawal | Owner Equity |
| `fiscal-period-status` | open, closed | Fiscal Periods |
| `bank-reconciliation-status` | in_progress, completed | Bank Reconciliations |
| `settlement-status` | pending, completed, cancelled | Settlements |
| `fund-transfer-status` | pending, completed, cancelled | Fund Transfers |
| `account` | dynamic — fetched from `useGetChartOfAccountsQuery`, bank accounts only where relevant | Bank Reconciliations, Fund Transfers |

All types follow the same pattern as `transaction-status` (existing): a `Select` with `MenuItem` options, renders as a chip when active.

---

## Filter Configurations per Page

All pages include `search` + `period`. Additional fields:

| Page | Extra filter fields |
|---|---|
| Journal Entries | `journal-entry-status`, `journal-entry-type` |
| Bank Reconciliations | `bank-reconciliation-status`, `account` |
| Expenses | `expense-status` |
| Fund Transfers | `fund-transfer-status` |
| Settlements | `settlement-status` |
| Owner Equity | `owner-equity-type` |
| Fiscal Periods | `fiscal-period-status` |
| Chart of Accounts | _(search only, no period — accounts are not time-scoped)_ |
| Account Mappings | _(search only — small static list, no pagination needed)_ |

---

## Workspace Content per Page

### Journal Entries
- **headerSlot (`JournalEntryContextHeader`):** Reference number, entry date, status chip, entry type chip, total debits/credits. Action buttons: Edit (draft only), Post (draft only), Reverse (posted only), Delete (draft only). Source transaction link if applicable.
- **workspaceSlot (`JournalEntryWorkspaceCard`):** Ledger lines table (account, description, debit, credit columns). Balance indicator (debits === credits ✓ / ✗). Notes field if present.

### Bank Reconciliations
- **headerSlot (`BankReconciliationContextHeader`):** Account name, period label, status chip, statement balance. Action buttons: Complete (in_progress only), Reopen (completed only), Delete.
- **workspaceSlot (`BankReconciliationWorkspaceCard`):** Transaction matching table — each row shows date, description, amount, cleared checkbox. Running cleared balance vs statement balance. Difference indicator (green when zero).

### Expenses
- **headerSlot (`ExpenseContextHeader`):** Reference number, date, amount, status chip. Action buttons: Edit (draft only), Post (draft only), Delete (draft only).
- **workspaceSlot (`ExpenseWorkspaceCard`):** Expense account, payment method, description, journal entry link (if posted).

### Fund Transfers
- **headerSlot (`FundTransferContextHeader`):** Reference number, date, amount, status chip. Action buttons: Cancel (pending only).
- **workspaceSlot (`FundTransferWorkspaceCard`):** From account, to account, description, journal entry link.

### Settlements
- **headerSlot (`SettlementContextHeader`):** Settlement date, total amount, status chip. Action buttons: Cancel (pending/completed only).
- **workspaceSlot (`SettlementWorkspaceCard`):** Settlement breakdown — linked invoices/payments, amounts matched.

### Owner Equity
- **headerSlot (`OwnerEquityContextHeader`):** Reference number, type chip (deposit/withdrawal), date, amount, status chip. Action buttons: Edit (draft only), Post (draft only), Delete (draft only).
- **workspaceSlot (`OwnerEquityWorkspaceCard`):** Account, payment method, description, journal entry link.

### Fiscal Periods
- **headerSlot (`FiscalPeriodContextHeader`):** Period name, fiscal year, date range, status chip. Action buttons: Close (open only), Reopen (closed only), Delete.
- **workspaceSlot (`FiscalPeriodWorkspaceCard`):** Period start/end dates, number of journal entries in period (fetched lazily on selection).

### Chart of Accounts
- **headerSlot (`ChartOfAccountContextHeader`):** Account code, name, account type chip. Action buttons: Edit, Delete (only if no transactions).
- **workspaceSlot (`ChartOfAccountWorkspaceCard`):** Account type, parent account, description. Current balance rendered if the `balance` field is present on the returned entity (no separate API call).

### Account Mappings
- **headerSlot (`AccountMappingContextHeader`):** Mapping type label, category. Action buttons: Edit, Delete.
- **workspaceSlot (`AccountMappingWorkspaceCard`):** Mapped account name, mapping description, usage hint.

---

## State Management

No new Redux slice. Each page uses local state (via `use*Workspace` hook) for:
- `selectedId: string | null`
- Dialog open/close booleans
- Action loading state

This matches the simpler pages in Purchasing (e.g., `VendorPaymentsPage`) which also use local state rather than a Redux slice.

---

## Router Changes

In `frontend/src/router.tsx`:

1. Remove lazy imports for `JournalEntryDetailsPage` and `BankReconciliationDetailsPage`.
2. Replace route `/accounting/journal-entries/:id` with a redirect to `/accounting/journal-entries`.
3. Replace route `/accounting/bank-reconciliations/:id` with a redirect to `/accounting/bank-reconciliations`.
4. Keep `/accounting/journal-entries/new` and `/accounting/journal-entries/:id/edit` pointing to `JournalEntryFormPage` (unchanged).

---

## Tests

- Each new `*Table.tsx` gets a Vitest unit test covering: renders list, shows empty state, row click fires `onSelect`.
- Each `*ContextHeader.tsx` gets a test covering: renders null state gracefully, renders selected item details, action buttons render correctly per status.
- Existing page-level tests (`JournalEntriesPage.test.tsx`, etc.) are updated to remove navigation assertions (row click no longer navigates) and add workspace selection assertions.
- `JournalEntryDetailsPage.test.tsx` and `BankReconciliationDetailsPage.test.tsx` are deleted.

---

## Out of Scope

- No changes to backend API endpoints.
- No changes to `JournalEntryFormPage` (create/edit form stays as a full page).
- Report pages (`TrialBalancePage`, `BalanceSheetPage`, etc.) are not affected.
- `AccountingDashboardPage` is not affected.
