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
| `referenceNumber` | varchar(50) | unique, not null | auto-generated via `settingsService.generateDocumentNumber('Fund Transfers')` e.g. `TRF-2026-001` |
| `transferDate` | date | not null | user-supplied |
| `sourceAccountId` | uuid | FK → chart_of_accounts, not null | must have `isCashEquivalent = true` |
| `destinationAccountId` | uuid | FK → chart_of_accounts, not null | must have `isCashEquivalent = true` |
| `amount` | decimal(15,2) | not null, > 0 | transfer amount |
| `description` | text | nullable | memo/notes |
| `status` | enum | not null, default `ACTIVE` | `ACTIVE \| CANCELLED` |
| `journalEntryId` | uuid | FK → journal_entries, not null | auto-posted JE linked to this transfer |
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

On transfer creation, a `POSTED` journal entry is auto-created:
- **Debit** destination account (amount)
- **Credit** source account (amount)
- `sourceType = 'fund_transfer'`
- `sourceId = transfer.id`
- `description = "Fund Transfer: {referenceNumber} - {description}"`

On cancellation, `journalEntryService.reverseEntry()` is called on the linked JE, producing a mirror entry (Debit source, Credit destination).

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
| `backend/src/modules/accounting/dto/chart-of-account.dto.ts` | Add `isCashEquivalent` to create/update DTOs and response DTO |

### API endpoints

Base path: `/accounting/fund-transfers`

| Method | Path | RBAC | Action |
|---|---|---|---|
| `GET` | `/accounting/fund-transfers` | All authenticated | Paginated list with filters |
| `GET` | `/accounting/fund-transfers/:id` | All authenticated | Single transfer with relations |
| `POST` | `/accounting/fund-transfers` | Admin, Manager | Create transfer + auto-post JE |
| `POST` | `/accounting/fund-transfers/:id/cancel` | Admin, Manager | Cancel transfer + reverse JE |

Note: `/:id/cancel` must be declared **before** `/:id` in the controller to avoid NestJS treating `cancel` as a UUID.

### `FundTransferService` methods

**`create(dto, userId, username)`**
1. Validate `sourceAccountId !== destinationAccountId`
2. Validate both accounts exist, are active, and have `isCashEquivalent = true`
3. Validate `amount > 0`
4. Auto-detect fiscal period from `transferDate` via `fiscalPeriodService.validatePeriod()`; throw if no open period covers the date
5. Generate `referenceNumber` via `settingsService.generateDocumentNumber('Fund Transfers')`
6. Save `FundTransfer` entity (status `ACTIVE`)
7. Call `accountingService` to post JE (Debit destination, Credit source)
8. Update transfer with `journalEntryId` and `fiscalPeriodId`
9. Audit log `CREATE`
10. Return response DTO

**`cancel(id, userId, username)`**
1. Find transfer; throw `NotFoundException` if not found
2. Throw `BadRequestException` if status is already `CANCELLED`
3. Call `journalEntryService.reverseEntry(transfer.journalEntryId)` to post reversing JE
4. Set `transfer.status = CANCELLED`
5. Save
6. Audit log `CANCEL`
7. Return response DTO

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

### Validation rules (backend)

- `sourceAccountId !== destinationAccountId` — self-transfer not allowed
- Both accounts must be active
- Both accounts must have `isCashEquivalent = true`
- `amount > 0`
- Transfer date must fall within an open fiscal period
- Cannot cancel an already-cancelled transfer

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
| Account Activity | JE visible with `referenceType = 'fund_transfer'` |

The `FundTransfersPage` itself serves as the dedicated transfer history view.

---

## 5. Migration

One migration: `TIMESTAMP-AddFundTransferAndCashEquivalent.ts`

1. Add `is_cash_equivalent` boolean column to `chart_of_accounts` (default `false`)
2. Create `fund_transfers` table with all columns and FK constraints
3. Add indexes: `transferDate`, `status`, `sourceAccountId`, `destinationAccountId`, `referenceNumber` (unique)

---

## 6. Acceptance Criteria

- [ ] Users can create a fund transfer between two `isCashEquivalent` accounts
- [ ] Self-transfers (same account) are rejected
- [ ] Transfer to/from non-cash-equivalent accounts is rejected
- [ ] A corresponding POSTED journal entry is automatically created and linked
- [ ] Transfer date outside an open fiscal period is rejected
- [ ] Reference number is auto-generated (`TRF-YYYY-NNN`)
- [ ] Users can view paginated transfer history with date/account/status filters
- [ ] Cancellation posts a reversing journal entry and marks transfer CANCELLED
- [ ] Already-cancelled transfers cannot be cancelled again
- [ ] All accounting reports correctly reflect transfers via linked JE
- [ ] Admin can mark COA accounts as `isCashEquivalent` via the existing COA form
- [ ] Viewer role cannot create or cancel transfers
- [ ] Audit log entries created for create and cancel actions
