# Accounting Reports Service Refactor — Design

**Date:** 2026-03-09
**File:** `backend/src/modules/accounting/services/accounting-reports.service.ts`
**Approach:** Hybrid — extract shared query helper + Excel exporter + untangle Balance Sheet

---

## Problem

`accounting-reports.service.ts` is 2031 lines with three pain points:

1. The aggregate `SUM(debit)/SUM(credit)` query builder is copy-pasted ~6 times across report methods
2. Five `export*ToExcel` methods (~700 lines of ExcelJS boilerplate) drown out the report business logic
3. `generateBalanceSheet` does a second full account fetch + query inline mid-method to compute net income, making it hard to follow

---

## Solution: Approach 3 (Hybrid)

Split into three files without changing the public API of `AccountingReportsService`.

### New File Structure

```
services/
  accounting-reports.query-helper.ts          (new)
  accounting-reports.excel-export.service.ts  (new)
  accounting-reports.service.ts               (trimmed: ~600 lines)
```

---

## File Responsibilities

### `accounting-reports.query-helper.ts` — `AccountingReportsQueryHelper`

`@Injectable()` — owns the 3 TypeORM repositories.

**Exports:**
- `queryTransactionTotals(accountIds, dateFilter, statuses)` → `Map<string, {totalDebit, totalCredit}>`
- `calculateBalanceByAccountType(type, debit, credit)` → `number`
- `roundTo2Decimals(num)` → `number`

**Date filter discriminated union:**
```typescript
type DateFilter =
  | { type: 'asOf'; date: Date }
  | { type: 'range'; startDate: Date; endDate: Date }
  | { type: 'before'; date: Date }
```

Returns an empty Map for empty `accountIds` input. Never throws.

---

### `accounting-reports.excel-export.service.ts` — `AccountingExcelExportService`

`@Injectable()` — no repository dependencies.

**Exports:** `exportTrialBalanceToExcel`, `exportBalanceSheetToExcel`, `exportProfitAndLossToExcel`, `exportGeneralLedgerToExcel`, `exportAccountActivityToExcel`

Takes pre-computed report data as input. Never throws.

---

### `accounting-reports.service.ts` — `AccountingReportsService` (slimmed)

Injects `AccountingReportsQueryHelper` and `AccountingExcelExportService`.

**Keeps:** all 5 `generate*` methods, `getAccountsByType`, `getAccountsWithBalances`, `calculateAccountBalance`, `calculateAccountBalances`

**New private method:** `calculateNetIncome(asOfDate, includeInactive)` — extracted from the inline block in `generateBalanceSheet`

**Delegates:** raw aggregate queries → `AccountingReportsQueryHelper`; Excel exports → `AccountingExcelExportService`

**Does NOT move:** General Ledger and Account Activity individual-row transaction fetches — these select rows with running balance, not aggregates, and stay in the reports service.

---

## Data Flow

| Report method | queryTransactionTotals call |
|---|---|
| `generateTrialBalance` | `{ type: 'asOf', date: asOfDate }` |
| `generateBalanceSheet` (accounts) | `{ type: 'asOf', date: asOfDate }` |
| `calculateNetIncome` (extracted) | `{ type: 'asOf', date: asOfDate }` |
| `generateProfitAndLoss` | `{ type: 'range', startDate, endDate }` |
| `generateGeneralLedger` (opening) | `{ type: 'before', date: startDate }` |
| `generateAccountActivity` (opening) | `{ type: 'before', date: startDate }` |

---

## Error Handling

- All `NotFoundException` and `BadRequestException` throws remain in `AccountingReportsService`
- Query helper: returns empty Maps, never throws
- Excel exporter: receives validated data, never throws

---

## Module Registration

Add both new services to `providers` and `exports` in `accounting.module.ts`.

---

## Testing

- **Existing 6 spec files:** unchanged — public API of `AccountingReportsService` is identical
- **New:** `accounting-reports.query-helper.spec.ts` — tests `queryTransactionTotals` with all 3 date filter types + pure math helpers
- **New:** `accounting-reports.excel-export.service.spec.ts` — tests each export method produces a non-empty Buffer
