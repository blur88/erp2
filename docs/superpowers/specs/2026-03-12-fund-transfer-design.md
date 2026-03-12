# Fund Transfer Module Design Spec
**Issue:** #79
**Date:** 2026-03-12
**Status:** Approved

## Overview

A dedicated Fund Transfer module within the Accounting section for recording inter-account movements of funds (e.g., Bank to Petty Cash). Transfers post a balanced journal entry immediately on creation and can be cancelled via reversal at any time.

---

## 1. Data Model

### New entity: `FundTransfer` (`fund_transfers` table)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | from BaseEntity |
| `referenceNumber` | varchar(50) | unique, not null | auto-generated via `settingsService.generateDocumentNumber('Fund Transfers')` e.g. `TRF-26-001` (2-digit year, matching all other document numbers) |
| `transferDate` | date | not null | user-supplied |
| `sourceAccountId` | uuid | FK → chart_of_accounts, not null | must have `isCashEquivalent = true` |
| `destinationAccountId` | uuid | FK → chart_of_accounts, not null | must have `isCashEquivalent = true` |
| `amount` | decimal(15,2) | not null, > 0 | transfer amount |
| `description` | text | nullable | memo/notes |
| `status` | enum | not null, default `ACTIVE` | `ACTIVE \| CANCELLED` |
| `journalEntryId` | uuid | FK → journal_entries, nullable | auto-posted JE linked to this transfer; nullable to allow saving transfer before JE is created |
| `fiscalPeriodId` | uuid | FK → fiscal_periods, not null | auto-detected from `transferDate` |
| `createdAt` | timestamp | | from BaseEntity |
| `updatedAt` | timestamp | | from BaseEntity |
| `deletedAt` | timestamp | nullable | from BaseEntity (soft delete) |

### Modified entity: `ChartOfAccount`

Add one column:

| Column | Type | Default | Notes |
|---|---|---|---|
| `isCashEquivalent` | boolean | `false` | Marks account as eligible for fund transfers |

All existing accounts default to `false` — no breaking changes. Admins check this box on accounts like "Cash on Hand", "Petty Cash", "Bank Account - BDO".

### Journal Entry auto-posting

On transfer creation, `AccountingService.postFundTransferEntry(transfer, userId, username)` (new method) is called. It follows the same internal pattern as other `post*Entry` methods in `AccountingService`:

1. Check for existing POSTED or DRAFT JE for this source via `journalEntryService.findBySource('fund_transfer', transfer.id)` — skip if already posted (idempotency guard)
2. Call `this.validatePeriodOpen(transfer.transferDate)` — consistent with all other `post*Entry` methods; period was already validated upstream in `FundTransferService.create` so this is a safety double-check, not redundant in the architectural sense
3. Call `this.fiscalPeriodService.validatePeriod({ date: transfer.transferDate })` to get the `periodId`
4. Call `journalEntryService.create()` with:
   - `entryDate = transfer.transferDate` (use the transfer date — same as expense uses `expenseDate`)
   - `fiscalPeriodId` from step 3
   - `sourceType = 'fund_transfer'`
   - `sourceId = transfer.id`
   - `description = "Fund Transfer: {referenceNumber} - {description}"`
   - Lines: Debit destination account, Credit source account (amount)
5. Call `journalEntryService.postEntry()` on the created JE
6. Return the posted `JournalEntry`

On cancellation, `journalEntryService.reverseEntryInPeriod(transfer.journalEntryId, currentPeriod.id, userId, username)` is called. The current open period is auto-detected via `fiscalPeriodService.getCurrentPeriod()` (returns `null` if no open period — not an exception) at cancellation time. This correctly handles the case where the original fiscal period has been closed since the transfer was created.

---

## 2. Backend

### New files

| File | Purpose |
|---|---|
| `backend/src/database/entities/fund-transfer.entity.ts` | `FundTransfer` TypeORM entity |
| `backend/src/modules/accounting/dto/fund-transfer.dto.ts` | `CreateFundTransferDto`, `QueryFundTransfersDto`, `FundTransferResponseDto`, `FundTransferListResponseDto` |
| `backend/src/modules/accounting/services/fund-transfer.service.ts` | Business logic |
| `backend/src/modules/accounting/services/fund-transfer.service.spec.ts` | Unit tests |
| `backend/src/modules/accounting/controllers/fund-transfer.controller.ts` | REST controller |
| `migrations/TIMESTAMP-AddFundTransferAndCashEquivalent.ts` | DB migration |

### Modified files

| File | Change |
|---|---|
| `backend/src/database/entities/chart-of-account.entity.ts` | Add `isCashEquivalent: boolean` column |
| `backend/src/modules/accounting/accounting.module.ts` | Register `FundTransfer` entity, `FundTransferService`, `FundTransferController` |
| `backend/src/modules/accounting/services/accounting.service.ts` | Add `postFundTransferEntry(transfer, userId, username)` method |
| `backend/src/modules/accounting/dto/chart-of-account.dto.ts` | Add `isCashEquivalent` to create/update DTOs and response DTO |

### API endpoints

Base path: `/accounting/fund-transfers`

| Method | Path | RBAC | Action |
|---|---|---|---|
| `GET` | `/accounting/fund-transfers` | All authenticated | Paginated list with filters |
| `GET` | `/accounting/fund-transfers/:id` | All authenticated | Single transfer with relations |
| `POST` | `/accounting/fund-transfers` | Admin, Manager | Create transfer + auto-post JE |
| `POST` | `/accounting/fund-transfers/:id/cancel` | Admin, Manager | Cancel transfer + reverse JE |

Note: Route order follows standard NestJS conventions. `/:id/cancel` is a distinct sub-path and does not conflict with `/:id`.

No DELETE endpoint — transfers are permanent records. Use cancellation to void a transfer. The `deletedAt` column on the entity is reserved for future admin use only.

### `FundTransferService` methods

**`FundTransferService` constructor dependencies:** `FundTransfer` repository, `ChartOfAccount` repository, `AccountingService`, `SettingsService`, `AuditLogService`, `FiscalPeriodService`. (`FiscalPeriodService` is needed directly — unlike `ExpenseService` which delegates period validation entirely to `AccountingService`, `FundTransferService` must validate the period before saving the entity since `fiscalPeriodId` is stored on the transfer record.)

**`create(dto, userId, username)`**
1. Validate `sourceAccountId !== destinationAccountId`
2. Validate both accounts exist, have `isActive = true` AND `deletedAt IS NULL`, and have `isCashEquivalent = true`
3. Validate `amount > 0`
4. Auto-detect fiscal period from `transferDate` via `fiscalPeriodService.validatePeriod({ date: transferDate })`; throw `BadRequestException` if `!result.isValid || !result.period`
5. Generate `referenceNumber` via `settingsService.generateDocumentNumber('Fund Transfers')`
6. Wrap steps 6a–6c in a `DataSource` transaction to prevent orphaned records:
   - 6a. Save `FundTransfer` entity (status `ACTIVE`, `fiscalPeriodId` set, `journalEntryId = null`)
   - 6b. Call `accountingService.postFundTransferEntry(savedTransfer, userId, username)` to create and post the JE
   - 6c. Update `transfer.journalEntryId` with the returned JE id; save transfer again
   - If any step fails, the transaction rolls back — no orphaned transfer or JE records
9. Audit log `CREATE`
10. Return response DTO

**`cancel(id, userId, username)`**
1. Find transfer; throw `NotFoundException` if not found
2. Throw `BadRequestException` if status is already `CANCELLED`
3. If `transfer.journalEntryId` is null: throw `BadRequestException("Cannot cancel transfer — journal entry was not posted. This should not happen if transaction wrapping is in place.")`
4. Auto-detect current open period via `fiscalPeriodService.getCurrentPeriod()`; if it returns `null`, throw `BadRequestException("Cannot cancel transfer — no open fiscal period exists for today's date")`
5. Call `journalEntryService.reverseEntryInPeriod(transfer.journalEntryId, currentPeriod.id, userId, username)` to post reversing JE into the current open period (handles the case where the original period is now closed); if this throws because the JE was already reversed outside this flow, let the error propagate as-is
6. Set `transfer.status = CANCELLED`
7. Save
8. Audit log `CANCEL`
9. Return response DTO

**`findAll(query)`**
- Filters: `startDate`, `endDate`, `sourceAccountId`, `destinationAccountId`, `status`, `search` (reference number)
- Pagination: `page`, `limit`
- Sort: `transferDate DESC` default
- Load relations: `sourceAccount`, `destinationAccount`, `journalEntry`

**`findOne(id)`**
- Load with all relations; throw `NotFoundException` if not found

### `CreateFundTransferDto` fields

```typescript
sourceAccountId: string      // UUID, required
destinationAccountId: string // UUID, required
amount: number               // > 0, required
transferDate: Date           // required
description?: string         // optional
```

### `FundTransferResponseDto` shape

```typescript
{
  id: string
  referenceNumber: string
  transferDate: Date
  amount: number
  description?: string
  status: 'ACTIVE' | 'CANCELLED'
  fiscalPeriodId: string
  journalEntryId?: string        // nullable — may be null if JE posting failed
  sourceAccount: {
    id: string
    code: string
    name: string
    type: string
  }
  destinationAccount: {
    id: string
    code: string
    name: string
    type: string
  }
  journalEntry?: {               // optional — omitted if journalEntryId is null
    id: string
    referenceNumber: string
    status: string
  }
  createdAt: Date
  updatedAt: Date
}
```

`FundTransferListResponseDto` wraps `FundTransferResponseDto[]` with the standard `{ data, meta }` pagination shape used by all other list endpoints.

### Validation rules (backend)

- `sourceAccountId !== destinationAccountId` — self-transfer not allowed
- Both accounts must exist, have `isActive = true` AND `deletedAt IS NULL`, and have `isCashEquivalent = true`
- `amount > 0`
- Transfer date must fall within an open fiscal period
- Cannot cancel an already-cancelled transfer
- Cannot cancel a transfer with no linked journal entry (`journalEntryId` is null)

---

## 3. Frontend

### New files

| File | Purpose |
|---|---|
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | List page + inline create dialog |
| `frontend/src/pages/accounting/__tests__/FundTransfersPage.test.tsx` | Vitest tests |

### Modified files

| File | Change |
|---|---|
| `frontend/src/store/api/accountingApi.ts` | Add `FundTransfer` type, RTK Query endpoints |
| `frontend/src/router.tsx` | Add `/accounting/fund-transfers` route |
| `frontend/src/components/common/Sidebar.tsx` | Add "Fund Transfers" nav item under Accounting |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Add `isCashEquivalent` checkbox to COA inline form (if form is inline) |
| `frontend/src/components/accounting/ChartOfAccountFormDialog.tsx` | Add `isCashEquivalent` checkbox field |
| `frontend/src/types/index.ts` (or types file) | Add `FundTransfer` type |

### RTK Query endpoints

```typescript
getTransfers(query)           // useGetFundTransfersQuery
getTransfer(id)               // useGetFundTransferQuery
createTransfer(dto)           // useCreateFundTransferMutation
cancelTransfer(id)            // useCancelFundTransferMutation
```

### `FundTransfersPage` layout

**Toolbar:**
- Page title: "Fund Transfers"
- "New Transfer" button (hidden for Viewer role)
- Date range filter (start/end date)
- Status filter (All / Active / Cancelled)
- Refresh button

**Table columns:**
| Column | Notes |
|---|---|
| Reference | e.g. `TRF-2026-001` |
| Date | formatted date |
| From Account | account code + name |
| To Account | account code + name |
| Amount | formatted currency |
| Status | Chip: green `ACTIVE`, red `CANCELLED` |
| Actions | Cancel button (hidden for Viewer, disabled if already CANCELLED) |

**Create dialog fields:**
- From Account — searchable dropdown, only `isCashEquivalent = true` accounts
- To Account — searchable dropdown, only `isCashEquivalent = true` accounts (excludes selected From Account)
- Amount — numeric input, > 0
- Date — date picker, defaults to today
- Description — optional text field

**Cancel flow:**
- Cancel button → confirmation dialog: "Are you sure you want to cancel transfer {ref}? This will post a reversing journal entry."
- On confirm → `useCancelFundTransferMutation` → table refresh → success notification

### RBAC on frontend

- "New Transfer" button: hidden for Viewer role
- "Cancel" action: hidden for Viewer role
- Consistent with `ExpensesPage` pattern

---

## 4. Audit Trail & Reports

### Audit logging

`FundTransferService` calls `auditLogService.log()` on:
- `CREATE` — "Created fund transfer: TRF-2026-001"
- `CANCEL` — "Cancelled fund transfer: TRF-2026-001"

`AuditLogsModule` is already imported in `AccountingModule` — no infrastructure changes needed.

### Reports

No report changes required. Transfers appear automatically in existing reports via the linked journal entry:

| Report | How transfers appear |
|---|---|
| General Ledger | Line items on both source and destination accounts |
| Trial Balance | Asset account balances reflect transfer |
| Balance Sheet | Asset section updated correctly |
| Account Activity | JE visible with `sourceType = 'fund_transfer'` (matches JE entity field name) |

The `FundTransfersPage` itself serves as the dedicated transfer history view.

---

## 5. Migration

One migration: `TIMESTAMP-AddFundTransferAndCashEquivalent.ts`

1. Add `is_cash_equivalent` boolean column to `chart_of_accounts` (default `false`)
2. Create PostgreSQL enum type `fund_transfer_status` with values `ACTIVE`, `CANCELLED`
3. Create `fund_transfers` table with all columns and FK constraints; `journal_entry_id` is nullable
4. Add indexes: `transfer_date`, `status`, `source_account_id`, `destination_account_id`, `reference_number` (unique), `fiscal_period_id`
5. Insert document number settings seed row: `('Fund Transfers', 'TRF', paddingDigits=3, nextNumber=1, lastResetYear=currentYear%100)` — `lastResetYear` must be a 2-digit year (`% 100`) matching the `smallint` schema and the year-reset logic in `generateDocumentNumber`. Required so the first `create` call does not throw `NotFoundException`.

---

## 6. Acceptance Criteria

- [ ] Users can create a fund transfer between two `isCashEquivalent` accounts
- [ ] Self-transfers (same account) are rejected
- [ ] Transfer to/from non-cash-equivalent accounts is rejected
- [ ] A corresponding POSTED journal entry is automatically created and linked
- [ ] Transfer date outside an open fiscal period is rejected
- [ ] Reference number is auto-generated (`TRF-YY-NNN`, 2-digit year e.g. `TRF-26-001`)
- [ ] Users can view paginated transfer history with date/account/status filters
- [ ] Cancellation posts a reversing journal entry and marks transfer CANCELLED
- [ ] Already-cancelled transfers cannot be cancelled again
- [ ] All accounting reports correctly reflect transfers via linked JE
- [ ] Admin can mark COA accounts as `isCashEquivalent` via the existing COA form
- [ ] Viewer role cannot create or cancel transfers
- [ ] Audit log entries created for create and cancel actions
