# Accounting Audit Logging — Design

**Date**: 2026-03-04
**Status**: Approved
**Scope**: Backend only

## Overview

Add audit logging to all accounting module services so that every create, update, delete, post, reverse, and bulk operation is recorded in the audit log. This brings accounting in line with the existing audit log coverage in the Sales, Purchasing, and Inventory modules.

## What's Not Changing

- No frontend changes — the global audit log page at `/audit-logs` already provides full filtering by entity type and entity ID, so users can find accounting logs through the existing UI.
- No new entity types or schema changes in the audit log system.
- No oldValues/newValues diffs — matching the simple description-based logging style used by other modules.

## Architecture

`AuditLogsModule` is already marked `@Global()`, so `AuditLogService` is available application-wide. The accounting module just needs to declare the import once and inject the service into each service file.

### Module Change

`accounting.module.ts` — add `AuditLogsModule` to the `imports` array.

## Services & Audited Events

| Service | Entity Type | Actions to Log |
|---|---|---|
| `JournalEntryService` | `JournalEntry` | CREATE, UPDATE, DELETE, BULK_DELETE, POST, BULK_POST, REVERSE |
| `ChartOfAccountsService` | `Account` | CREATE, UPDATE, DELETE, RESTORE, BULK_RESTORE |
| `FiscalPeriodService` | `FiscalPeriod` | CREATE, UPDATE, DELETE, RESTORE, GENERATE |
| `AccountMappingService` | `AccountMapping` | CREATE, UPDATE, DELETE |
| `ReconciliationService` | `BankReconciliation` | CREATE, UPDATE, DELETE |
| `SettlementService` | `Settlement` | CREATE |
| `OwnerEquityService` | `OwnerEquity` | CREATE, UPDATE, DELETE, BULK_DELETE, POST, BULK_POST |
| `ExpenseService` | `Expense` | CREATE, UPDATE, DELETE, BULK_DELETE, POST, BULK_POST |
| `AccountingService` | `JournalEntry` | AUTO_POST (system-generated entries for sales, payments, GRN, etc.) |

## Logging Pattern

Following the established pattern from the Purchasing module exactly:

```typescript
// Injection
constructor(
  private readonly auditLogService: AuditLogService,
) {}

// Per operation
await this.auditLogService.log(
  'CREATE',               // action string
  'JournalEntry',         // entityType
  `Created journal entry: ${entry.entryNumber}`,  // human-readable description
  {
    entityId: entry.id,
    userId: userId ?? 'system',
  }
);
```

Action strings used:
- `CREATE`, `UPDATE`, `DELETE`, `RESTORE` — standard CRUD
- `BULK_DELETE`, `BULK_POST` — batch operations
- `POST` — posting a draft entry/expense/equity transaction
- `REVERSE` — reversing a posted journal entry
- `GENERATE` — generating a batch of fiscal periods
- `AUTO_POST` — system-generated journal entries (posted by AccountingService on behalf of other modules)

## Files Changed

1. `backend/src/modules/accounting/accounting.module.ts`
2. `backend/src/modules/accounting/services/journal-entry.service.ts`
3. `backend/src/modules/accounting/services/chart-of-accounts.service.ts`
4. `backend/src/modules/accounting/services/fiscal-period.service.ts`
5. `backend/src/modules/accounting/services/account-mapping.service.ts`
6. `backend/src/modules/accounting/services/reconciliation.service.ts`
7. `backend/src/modules/accounting/services/settlement.service.ts`
8. `backend/src/modules/accounting/services/owner-equity.service.ts`
9. `backend/src/modules/accounting/services/expense.service.ts`
10. `backend/src/modules/accounting/services/accounting.service.ts`

## Testing

- Verify audit log entries appear in `/audit-logs` when filtering by each entity type
- Verify `entityId` is correctly populated so the log row's "Go to entity" link works
- Verify bulk operations create one log entry per entity (not one total)
- No unit test changes required — audit log service is a fire-and-forget side effect
