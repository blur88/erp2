# Document Numbers Settings Overhaul — Design

**Date:** 2026-03-03
**Status:** Approved

## Summary

Overhaul the document numbering system to:
1. Replace the single-row JSONB `document_number_settings` table with a normalized per-row table
2. Adopt a unified `PREFIX-YY-NNN` format across all modules
3. Add accounting module documents (Journal Entries, Expenses, Settlements) to the settings
4. Fix inconsistencies in Sales, Purchasing, and Inventory modules

## Number Format

All documents use: `PREFIX-YY-NNN`

- `PREFIX` — user-configurable (e.g. `SO`, `JE`, `EXP`)
- `YY` — auto-injected 2-digit current year (e.g. `26`), not user-configurable
- `NNN` — minimum 3-digit zero-padded sequence, auto-expands past 999 (e.g. `001`, `999`, `1000`)
- Sequence resets to `1` at the start of each new calendar year

**Examples:** `SO-26-001`, `JE-26-042`, `EXP-26-1001`

## Document Types (10 total)

| Module      | Document Name    | Default Prefix |
|-------------|------------------|----------------|
| Sales       | Sales Orders     | `SO`           |
| Sales       | Invoices         | `INV`          |
| Sales       | Payments         | `PAY`          |
| Purchasing  | Purchase Orders  | `PO`           |
| Purchasing  | Goods Received   | `GRN`          |
| Purchasing  | Vendor Payments  | `VP`           |
| Inventory   | Stock Adjustment | `SA`           |
| Accounting  | Journal Entries  | `JE`           |
| Accounting  | Expenses         | `EXP`          |
| Accounting  | Settlements      | `STL`          |

## Database Schema

### New Table: `document_number_settings`

```sql
CREATE TABLE document_number_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name   VARCHAR(50) NOT NULL UNIQUE,
  prefix          VARCHAR(10) NOT NULL,
  padding_digits  SMALLINT NOT NULL DEFAULT 3,
  next_number     INTEGER NOT NULL DEFAULT 1,
  last_reset_year SMALLINT NOT NULL,
  created_at      TIMESTAMP DEFAULT now(),
  updated_at      TIMESTAMP DEFAULT now()
);
```

One row per document type. Replaces the old single-row JSONB `configurations` column design.

### Entity: `DocumentNumberSetting`

```typescript
@Entity('document_number_settings')
@Index(['documentName'], { unique: true })
export class DocumentNumberSetting extends BaseEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  documentName: string;

  @Column({ type: 'varchar', length: 10 })
  prefix: string;

  @Column({ type: 'smallint', default: 3 })
  paddingDigits: number;

  @Column({ type: 'int', default: 1 })
  nextNumber: number;

  @Column({ type: 'smallint' })
  lastResetYear: number;
}
```

## Number Generation Logic

In `SettingsService.generateDocumentNumber(documentName)`:

1. Find row by `documentName` — throw `NotFoundException` if not found
2. Get current 2-digit year: `new Date().getFullYear() % 100`
3. If `lastResetYear !== currentYY`: set `nextNumber = 1`, `lastResetYear = currentYY`
4. Generate: `` `${prefix}-${String(yy).padStart(2, '0')}-${String(nextNumber).padStart(paddingDigits, '0')}` ``
5. Increment `nextNumber`, save row
6. Return generated number

Sequence auto-expands past 999 — no upper limit enforced.

## Migration Strategy

TypeORM migration file that:
1. Drops the old `document_number_settings` table
2. Creates the new normalized table
3. Seeds all 10 default rows with `nextNumber: 1` and `lastResetYear: currentYY`

Existing document numbers in other tables (e.g. `sales_orders.order_number`) are unaffected. The sync endpoint `POST /settings/document-numbers/sync` can be called post-deploy to align `nextNumber` from existing records.

## Backend Changes

### `document-number-settings.entity.ts`
- Full rewrite: normalized entity, one row per document type
- Remove `isActive` and `configurations` (JSONB) fields
- Add `documentName`, `prefix`, `paddingDigits`, `nextNumber`, `lastResetYear`

### `settings.service.ts`
- `generateDocumentNumber()`: year-reset logic + `PREFIX-YY-NNN` format
- `previewDocumentNumber()`: same format, no increment
- `createDefaultDocumentNumberSettings()`: seed 10 rows
- `syncDocumentNumbersWithDatabase()`: simplified per-row updates, add cases for Journal Entries, Expenses, Settlements
- Remove JSONB array manipulation throughout

### `document-number-settings.dto.ts`
- Replace `numberFormat: string` with `paddingDigits: number`
- Add `lastResetYear: number` to response DTO
- Remove `UpdateDocumentNumberSettingsDto` array wrapper — replace with per-item update

### `settings.controller.ts`
- Endpoints unchanged: `GET`, `PUT`, `POST /generate`, `POST /sync`
- DTOs updated

### `journal-entry.service.ts`
- Remove `generateReferenceNumber()` private method
- Inject `SettingsService`
- Call `settingsService.generateDocumentNumber('Journal Entries')` on create
- Reversal entries also use `generateDocumentNumber('Journal Entries')` (no separate type)

### `expense.entity.ts`
- Remove `@BeforeInsert() generateReferenceNumber()` hook

### `expense.service.ts`
- Inject `SettingsService`
- Call `settingsService.generateDocumentNumber('Expenses')` on create

### `settlement.entity.ts`
- Remove `@BeforeInsert() generateSettlementNumber()` hook

### `settlement.service.ts`
- Inject `SettingsService`
- Call `settingsService.generateDocumentNumber('Settlements')` on create

### `vendor-payment.service.ts`
- Remove hardcoded `generatePaymentNumber()` method
- Call `settingsService.generateDocumentNumber('Vendor Payments')` on create

### `accounting.module.ts`
- Import `SettingsModule` to make `SettingsService` injectable

## Frontend Changes

### `DocumentNumbersPage.tsx`
- Remove **Number Format** column (padding fixed at 3, not user-editable)
- Update **Preview** column: shows `PREFIX-YY-NNN` using current year
- Add module section headers: Sales, Purchasing, Inventory, Accounting
- Update description text to explain `PREFIX-YY-NNN` format

### `settingsApi.ts`
- Update `DocumentNumberConfig` type:
  - Remove `numberFormat: string`
  - Add `paddingDigits: number`
  - Add `lastResetYear: number`

## Files Affected

| File | Change Type |
|------|-------------|
| `backend/src/database/entities/document-number-settings.entity.ts` | Full rewrite |
| `backend/src/modules/settings/settings.service.ts` | Major update |
| `backend/src/modules/settings/settings.controller.ts` | Minor update |
| `backend/src/modules/settings/dto/document-number-settings.dto.ts` | Update fields |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Remove hardcoded numbering |
| `backend/src/modules/accounting/services/expense.service.ts` | Add SettingsService |
| `backend/src/database/entities/expense.entity.ts` | Remove BeforeInsert hook |
| `backend/src/modules/accounting/services/settlement.service.ts` | Add SettingsService |
| `backend/src/database/entities/settlement.entity.ts` | Remove BeforeInsert hook |
| `backend/src/modules/purchasing/services/vendor-payment.service.ts` | Remove hardcoded numbering |
| `backend/src/modules/accounting/accounting.module.ts` | Import SettingsModule |
| `backend/src/database/migrations/XXXXXX-NormalizeDocumentNumberSettings.ts` | New migration |
| `frontend/src/pages/settings/DocumentNumbersPage.tsx` | Update UI |
| `frontend/src/services/settingsApi.ts` | Update types |
