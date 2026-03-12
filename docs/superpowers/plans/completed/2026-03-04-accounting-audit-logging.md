# Accounting Audit Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `auditLogService.log()` calls to all 9 accounting services so every create, update, delete, post, reverse, and bulk operation is recorded in the audit log.

**Architecture:** `AuditLogsModule` is already `@Global()`, so `AuditLogService` is available everywhere. We add it to `accounting.module.ts` imports, then inject and call it in each service after each successful mutation. No schema changes, no frontend changes.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL. Pattern reference: `backend/src/modules/purchasing/services/purchase-order.service.ts`.

---

## Task 1: Add AuditLogsModule to accounting.module.ts

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`

**Step 1: Open the file and locate the imports array**

Read: `backend/src/modules/accounting/accounting.module.ts`

Current imports array only has `SettingsModule`. We need to add `AuditLogsModule`.

**Step 2: Add the import**

Add to the top of the file:
```typescript
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
```

Add `AuditLogsModule` to the `imports` array in `@Module({...})`:
```typescript
imports: [
  TypeOrmModule.forFeature([...]),
  SettingsModule,
  AuditLogsModule,  // ADD THIS
],
```

**Step 3: Verify TypeScript compiles**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```
Expected: No errors (or same errors as before — there are none currently).

**Step 4: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/accounting/accounting.module.ts
git commit -m "feat(accounting): import AuditLogsModule for audit logging"
```

---

## Task 2: Add audit logging to JournalEntryService

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

**Step 1: Add import and inject AuditLogService**

Add import at the top (after other imports):
```typescript
import { AuditLogService } from '../../audit-logs/services';
```

In the constructor, add:
```typescript
private readonly auditLogService: AuditLogService,
```

**Step 2: Add log call to `create()` method**

After `await this.journalEntryRepository.save(journalEntry)` (where `journalEntry` is the saved entity with `.id` and `.referenceNumber`), add:

```typescript
await this.auditLogService.log(
  'CREATE',
  'JournalEntry',
  `Created journal entry: ${savedEntry.referenceNumber}`,
  { entityId: savedEntry.id, userId: userId ?? 'system' }
);
```

Note: The variable name for the saved result may differ — check the existing code. Use whatever variable holds the saved `JournalEntry` entity after the `.save()` call.

**Step 3: Add log call to `update()` method**

After the entity is saved and before returning:
```typescript
await this.auditLogService.log(
  'UPDATE',
  'JournalEntry',
  `Updated journal entry: ${entry.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: Add log call to `remove()` method**

After `await this.journalEntryRepository.softDelete(id)`:
```typescript
await this.auditLogService.log(
  'DELETE',
  'JournalEntry',
  `Deleted journal entry: ${entry.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 5: Add log call to `postEntry()` method**

After the entry status is updated to POSTED and saved:
```typescript
await this.auditLogService.log(
  'POST',
  'JournalEntry',
  `Posted journal entry: ${entry.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 6: Add log call to `reverseEntry()` method**

After the reversal entry is saved (the NEW entry created by reversal):
```typescript
await this.auditLogService.log(
  'REVERSE',
  'JournalEntry',
  `Reversed journal entry: ${originalEntry.referenceNumber} → ${reversalEntry.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system', metadata: { reversalEntryId: reversalEntry.id } }
);
```

**Step 7: Add log calls to `bulkPost()` method**

Inside the loop where each entry is successfully posted, add per-entry logging:
```typescript
await this.auditLogService.log(
  'POST',
  'JournalEntry',
  `Bulk posted journal entry: ${entry.referenceNumber}`,
  { entityId: entry.id, userId: 'system' }
);
```

**Step 8: Add log calls to `bulkDelete()` method**

Inside the loop where each entry is successfully deleted:
```typescript
await this.auditLogService.log(
  'DELETE',
  'JournalEntry',
  `Bulk deleted journal entry: ${entry.referenceNumber}`,
  { entityId: entry.id, userId: 'system' }
);
```

**Step 9: Handle `reverseEntryInPeriod()` similarly to `reverseEntry()`**

After reversal entry saved:
```typescript
await this.auditLogService.log(
  'REVERSE',
  'JournalEntry',
  `Reversed journal entry: ${originalEntry.referenceNumber} (into period ${fiscalPeriodId})`,
  { entityId: id, userId: userId ?? 'system', metadata: { reversalEntryId: reversalEntry.id, fiscalPeriodId } }
);
```

**Step 10: Verify TypeScript**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```
Expected: No errors.

**Step 11: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(accounting): add audit logging to JournalEntryService"
```

---

## Task 3: Add audit logging to ChartOfAccountsService

**Files:**
- Modify: `backend/src/modules/accounting/services/chart-of-accounts.service.ts`

**Step 1: Add import and inject AuditLogService**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```

Add to constructor:
```typescript
private readonly auditLogService: AuditLogService,
```

**Step 2: `create()` — after save**

```typescript
await this.auditLogService.log(
  'CREATE',
  'Account',
  `Created account: ${account.code} - ${account.name}`,
  { entityId: account.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'Account',
  `Updated account: ${account.code} - ${account.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

```typescript
await this.auditLogService.log(
  'DELETE',
  'Account',
  `Deleted account: ${account.code} - ${account.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 5: `restore()` — after restore/save**

```typescript
await this.auditLogService.log(
  'RESTORE',
  'Account',
  `Restored account: ${account.code} - ${account.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 6: `bulkRestore()` — inside success loop**

```typescript
await this.auditLogService.log(
  'RESTORE',
  'Account',
  `Bulk restored account: ${account.code} - ${account.name}`,
  { entityId: account.id, userId: 'system' }
);
```

**Step 7: `permanentDelete()` — after hard delete**

```typescript
await this.auditLogService.log(
  'PERMANENT_DELETE',
  'Account',
  `Permanently deleted account: ${account.code} - ${account.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 8: `bulkPermanentDelete()` — inside success loop**

```typescript
await this.auditLogService.log(
  'PERMANENT_DELETE',
  'Account',
  `Bulk permanently deleted account: ${account.code} - ${account.name}`,
  { entityId: account.id, userId: 'system' }
);
```

**Step 9: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/chart-of-accounts.service.ts
git commit -m "feat(accounting): add audit logging to ChartOfAccountsService"
```

---

## Task 4: Add audit logging to FiscalPeriodService

**Files:**
- Modify: `backend/src/modules/accounting/services/fiscal-period.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after save**

```typescript
await this.auditLogService.log(
  'CREATE',
  'FiscalPeriod',
  `Created fiscal period: ${period.code} - ${period.name}`,
  { entityId: period.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'FiscalPeriod',
  `Updated fiscal period: ${period.code} - ${period.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

```typescript
await this.auditLogService.log(
  'DELETE',
  'FiscalPeriod',
  `Deleted fiscal period: ${period.code} - ${period.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 5: `restore()` — after restore**

```typescript
await this.auditLogService.log(
  'RESTORE',
  'FiscalPeriod',
  `Restored fiscal period: ${period.code} - ${period.name}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 6: `generateFiscalPeriods()` — after all periods saved, one log per period**

Inside the save loop:
```typescript
await this.auditLogService.log(
  'GENERATE',
  'FiscalPeriod',
  `Generated fiscal period: ${savedPeriod.code} - ${savedPeriod.name}`,
  { entityId: savedPeriod.id, userId: userId ?? 'system' }
);
```

**Step 7: `closePeriod()` — after status saved**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'FiscalPeriod',
  `Closed fiscal period: ${period.code} - ${period.name}`,
  { entityId: id, userId: userId ?? 'system', metadata: { status: 'CLOSED' } }
);
```

**Step 8: `reopenPeriod()` — after status saved**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'FiscalPeriod',
  `Reopened fiscal period: ${period.code} - ${period.name}`,
  { entityId: id, userId: userId ?? 'system', metadata: { status: 'OPEN' } }
);
```

**Step 9: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/fiscal-period.service.ts
git commit -m "feat(accounting): add audit logging to FiscalPeriodService"
```

---

## Task 5: Add audit logging to AccountMappingService

**Files:**
- Modify: `backend/src/modules/accounting/services/account-mapping.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after save/restore**

```typescript
await this.auditLogService.log(
  'CREATE',
  'AccountMapping',
  `Created account mapping: ${mapping.mappingType}`,
  { entityId: mapping.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'AccountMapping',
  `Updated account mapping: ${mapping.mappingType}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

```typescript
await this.auditLogService.log(
  'DELETE',
  'AccountMapping',
  `Deleted account mapping: ${mapping.mappingType}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 5: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/account-mapping.service.ts
git commit -m "feat(accounting): add audit logging to AccountMappingService"
```

---

## Task 6: Add audit logging to ReconciliationService

**Files:**
- Modify: `backend/src/modules/accounting/services/reconciliation.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after save**

```typescript
await this.auditLogService.log(
  'CREATE',
  'BankReconciliation',
  `Created bank reconciliation for account: ${reconciliation.accountId}`,
  { entityId: reconciliation.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'BankReconciliation',
  `Updated bank reconciliation`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

```typescript
await this.auditLogService.log(
  'DELETE',
  'BankReconciliation',
  `Deleted bank reconciliation`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 5: `complete()` — after status saved**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'BankReconciliation',
  `Completed bank reconciliation`,
  { entityId: id, userId: userId ?? 'system', metadata: { status: 'COMPLETED' } }
);
```

**Step 6: `reopen()` — after status saved**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'BankReconciliation',
  `Reopened bank reconciliation`,
  { entityId: id, userId: userId ?? 'system', metadata: { status: 'IN_PROGRESS' } }
);
```

**Step 7: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/reconciliation.service.ts
git commit -m "feat(accounting): add audit logging to ReconciliationService"
```

---

## Task 7: Add audit logging to SettlementService

**Files:**
- Modify: `backend/src/modules/accounting/services/settlement.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after settlement saved**

```typescript
await this.auditLogService.log(
  'CREATE',
  'Settlement',
  `Created settlement: ${settlement.settlementNumber}`,
  { entityId: settlement.id, userId: userId ?? 'system' }
);
```

**Step 3: `cancel()` — after status saved**

Note: `cancel()` may not have a `userId` parameter. Check the method signature. If not available, use `'system'`.

```typescript
await this.auditLogService.log(
  'UPDATE',
  'Settlement',
  `Cancelled settlement: ${settlement.settlementNumber}`,
  { entityId: id, userId: 'system', metadata: { status: 'CANCELLED' } }
);
```

**Step 4: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/settlement.service.ts
git commit -m "feat(accounting): add audit logging to SettlementService"
```

---

## Task 8: Add audit logging to OwnerEquityService

**Files:**
- Modify: `backend/src/modules/accounting/services/owner-equity.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after save**

```typescript
await this.auditLogService.log(
  'CREATE',
  'OwnerEquity',
  `Created owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: transaction.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'OwnerEquity',
  `Updated owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

Note: Check if `remove()` has `userId`. If not, use `'system'`.

```typescript
await this.auditLogService.log(
  'DELETE',
  'OwnerEquity',
  `Deleted owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: id, userId: 'system' }
);
```

**Step 5: `post()` — after posting**

```typescript
await this.auditLogService.log(
  'POST',
  'OwnerEquity',
  `Posted owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 6: `bulkPost()` — inside success loop**

```typescript
await this.auditLogService.log(
  'POST',
  'OwnerEquity',
  `Bulk posted owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: transaction.id, userId: userId ?? 'system' }
);
```

**Step 7: `bulkDelete()` — inside success loop**

```typescript
await this.auditLogService.log(
  'DELETE',
  'OwnerEquity',
  `Bulk deleted owner equity transaction: ${transaction.referenceNumber}`,
  { entityId: transaction.id, userId: 'system' }
);
```

**Step 8: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/owner-equity.service.ts
git commit -m "feat(accounting): add audit logging to OwnerEquityService"
```

---

## Task 9: Add audit logging to ExpenseService

**Files:**
- Modify: `backend/src/modules/accounting/services/expense.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `create()` — after save**

```typescript
await this.auditLogService.log(
  'CREATE',
  'Expense',
  `Created expense: ${expense.referenceNumber}`,
  { entityId: expense.id, userId: userId ?? 'system' }
);
```

**Step 3: `update()` — after save**

```typescript
await this.auditLogService.log(
  'UPDATE',
  'Expense',
  `Updated expense: ${expense.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 4: `remove()` — after softDelete**

```typescript
await this.auditLogService.log(
  'DELETE',
  'Expense',
  `Deleted expense: ${expense.referenceNumber}`,
  { entityId: id, userId: 'system' }
);
```

**Step 5: `post()` — after posting**

```typescript
await this.auditLogService.log(
  'POST',
  'Expense',
  `Posted expense: ${expense.referenceNumber}`,
  { entityId: id, userId: userId ?? 'system' }
);
```

**Step 6: `bulkPost()` — inside success loop**

```typescript
await this.auditLogService.log(
  'POST',
  'Expense',
  `Bulk posted expense: ${expense.referenceNumber}`,
  { entityId: expense.id, userId: userId ?? 'system' }
);
```

**Step 7: `bulkDelete()` — inside success loop**

```typescript
await this.auditLogService.log(
  'DELETE',
  'Expense',
  `Bulk deleted expense: ${expense.referenceNumber}`,
  { entityId: expense.id, userId: 'system' }
);
```

**Step 8: Verify and commit**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/expense.service.ts
git commit -m "feat(accounting): add audit logging to ExpenseService"
```

---

## Task 10: Add audit logging to AccountingService (auto-posts)

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`

**Step 1: Add import and inject**

```typescript
import { AuditLogService } from '../../audit-logs/services';
```
Add to constructor: `private readonly auditLogService: AuditLogService,`

**Step 2: `postSalesOrderEntry()` — after journal entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted sales order journal entry for order: ${salesOrder.orderNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'sales_order', sourceId: salesOrder.id } }
);
```

**Step 3: `postCustomerPaymentEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted customer payment journal entry: ${payment.paymentNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'payment', sourceId: payment.id } }
);
```

**Step 4: `postSettlementEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted settlement journal entry: ${settlement.settlementNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'settlement', sourceId: settlement.id } }
);
```

**Step 5: `postGoodsReceivedEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted goods received journal entry: ${grn.grnNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'goods_received_note', sourceId: grn.id } }
);
```

**Step 6: `postVendorPaymentEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted vendor payment journal entry: ${vendorPayment.paymentNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'vendor_payment', sourceId: vendorPayment.id } }
);
```

**Step 7: `postStockAdjustmentEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted stock adjustment journal entry: ${adjustment.adjustmentNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'stock_adjustment', sourceId: adjustment.id } }
);
```

**Step 8: `postOwnerEquityEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted owner equity journal entry: ${transaction.referenceNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'owner_equity', sourceId: transaction.id } }
);
```

**Step 9: `postExpenseEntry()` — after entry created**

```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted expense journal entry: ${expense.referenceNumber}`,
  { entityId: createdEntry.id, userId: userId ?? 'system', metadata: { sourceType: 'expense', sourceId: expense.id } }
);
```

**Step 10: Note on `reverseSourceEntries()` and `reversePaymentEntry()`**

These call `journalEntryService.reverseEntry()` internally, which already logs as `REVERSE` after Task 2. No duplicate logging needed here.

**Step 11: Note on `postOpeningBalances()`**

After opening balance entry created:
```typescript
await this.auditLogService.log(
  'AUTO_POST',
  'JournalEntry',
  `Auto-posted opening balance entry`,
  { entityId: createdEntry.id, userId: 'system', metadata: { sourceType: 'opening_balance' } }
);
```

**Step 12: Verify TypeScript**

```bash
cd /home/blur/erp2/backend && npx tsc --noEmit
```
Expected: No errors.

**Step 13: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/accounting.service.ts
git commit -m "feat(accounting): add audit logging to AccountingService auto-posts"
```

---

## Task 11: Update LogRow entity type mapping for new entity types

**Files:**
- Modify: `frontend/src/pages/audit-logs/components/LogRow.tsx`

The `getEntityLink()` function currently only maps `Account` and `JournalEntry` from accounting. Add the remaining entity types so the "Go to entity" link in audit log rows works correctly.

**Step 1: Read the current mapping**

Read: `frontend/src/pages/audit-logs/components/LogRow.tsx`

Find the `getEntityLink()` function and the `map` object inside it.

**Step 2: Add missing accounting entity types**

Add these entries to the map:
```typescript
FiscalPeriod: '/accounting/fiscal-periods',
AccountMapping: '/accounting/account-mappings',
BankReconciliation: '/accounting/bank-reconciliations',
Settlement: '/accounting/settlements',
OwnerEquity: '/accounting/owner-equity',
Expense: '/accounting/expenses',
```

Note: These entity types don't have individual detail pages — they link to the list page. This is the same pattern used for `Account` and `Category` already.

**Step 3: Verify TypeScript (frontend)**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```
Expected: No errors.

**Step 4: Commit**

```bash
cd /home/blur/erp2 && git add frontend/src/pages/audit-logs/components/LogRow.tsx
git commit -m "feat(audit-logs): add entity links for accounting entity types"
```

---

## Task 12: Manual verification

**Step 1: Start backend**

```bash
cd /home/blur/erp2/backend && npm run start:dev
```

**Step 2: Create a journal entry via the UI or API**

Navigate to `/accounting/journal-entries` and create a journal entry.

**Step 3: Verify audit log entry appears**

Navigate to `/audit-logs`, filter by `Entity Type = JournalEntry`. Verify:
- A `CREATE` entry appears with the correct `referenceNumber` in the description
- `entityId` is populated
- Clicking "Go to entity" navigates to the correct journal entry page

**Step 4: Test post and reverse**

Post the journal entry. Verify a `POST` entry appears in the audit log.
Reverse it. Verify a `REVERSE` entry appears.

**Step 5: Test other entities**

Repeat for at least:
- Chart of Accounts: create an account → `CREATE` entry appears
- Fiscal Periods: close a period → `UPDATE` with `status: CLOSED` metadata
- Expenses: post an expense → `POST` entry appears

**Step 6: Verify entity type links in audit log rows**

Expand an `AccountMapping` audit log entry. Verify the "Go to AccountMapping" link navigates to `/accounting/account-mappings`.
