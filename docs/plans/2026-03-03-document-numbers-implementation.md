# Document Numbers Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the JSONB document number settings with a normalized per-row table, adopt `PREFIX-YY-NNN` format across all 10 document types, and integrate accounting module documents (Journal Entries, Expenses, Settlements).

**Architecture:** The `document_number_settings` table is rewritten from a single-row JSONB design to one row per document type. A TypeORM migration drops/recreates the table and seeds 10 default rows. All number generation goes through `SettingsService.generateDocumentNumber()` which auto-injects the current 2-digit year and resets sequence per-year. Accounting services import `SettingsModule` and call `generateDocumentNumber()` instead of their own hardcoded logic.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 18, Material-UI v7, Vitest (frontend tests), Jest (backend tests)

---

## Task 1: Rewrite the Entity

**Files:**
- Modify: `backend/src/database/entities/document-number-settings.entity.ts`

**Step 1: Replace the entity**

Replace the entire file with:

```typescript
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

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

Note: class name changes from `DocumentNumberSettings` (old JSONB wrapper) to `DocumentNumberSetting` (singular per-row).

**Step 2: Commit**

```bash
git add backend/src/database/entities/document-number-settings.entity.ts
git commit -m "feat(settings): normalize document-number-settings entity to per-row table"
```

---

## Task 2: Write the DB Migration

**Files:**
- Create: `backend/src/database/migrations/1772100000000-NormalizeDocumentNumberSettings.ts`

**Step 1: Create the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class NormalizeDocumentNumberSettings1772100000000 implements MigrationInterface {
  name = 'NormalizeDocumentNumberSettings1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old single-row JSONB table
    await queryRunner.query(`DROP TABLE IF EXISTS "document_number_settings"`);

    // Create normalized table
    await queryRunner.query(`
      CREATE TABLE "document_number_settings" (
        "id"              uuid              NOT NULL DEFAULT gen_random_uuid(),
        "document_name"   character varying(50)  NOT NULL,
        "prefix"          character varying(10)  NOT NULL,
        "padding_digits"  smallint          NOT NULL DEFAULT 3,
        "next_number"     integer           NOT NULL DEFAULT 1,
        "last_reset_year" smallint          NOT NULL,
        "created_at"      TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP         NOT NULL DEFAULT now(),
        "deleted_at"      TIMESTAMP,
        CONSTRAINT "PK_document_number_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_document_number_settings_name" UNIQUE ("document_name")
      )
    `);

    // Seed the 10 default rows — use current 2-digit year
    const currentYear = new Date().getFullYear() % 100;
    const defaults = [
      { name: 'Sales Orders',     prefix: 'SO'  },
      { name: 'Invoices',         prefix: 'INV' },
      { name: 'Payments',         prefix: 'PAY' },
      { name: 'Purchase Orders',  prefix: 'PO'  },
      { name: 'Goods Received',   prefix: 'GRN' },
      { name: 'Vendor Payments',  prefix: 'VP'  },
      { name: 'Stock Adjustment', prefix: 'SA'  },
      { name: 'Journal Entries',  prefix: 'JE'  },
      { name: 'Expenses',         prefix: 'EXP' },
      { name: 'Settlements',      prefix: 'STL' },
    ];

    for (const row of defaults) {
      await queryRunner.query(`
        INSERT INTO "document_number_settings"
          ("document_name", "prefix", "padding_digits", "next_number", "last_reset_year")
        VALUES ($1, $2, 3, 1, $3)
      `, [row.name, row.prefix, currentYear]);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "document_number_settings"`);

    // Recreate old single-row JSONB table
    await queryRunner.query(`
      CREATE TABLE "document_number_settings" (
        "id"            uuid      NOT NULL DEFAULT gen_random_uuid(),
        "configurations" jsonb    NOT NULL DEFAULT '[]',
        "is_active"     boolean   NOT NULL DEFAULT true,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMP,
        CONSTRAINT "PK_document_number_settings_old" PRIMARY KEY ("id")
      )
    `);
  }
}
```

**Step 2: Verify migration is picked up**

Check `backend/src/database/migrations/index.ts` (or wherever migrations are registered) — add the new migration class if needed.

```bash
# Find migration registration
grep -r "NormalizeDocumentNumber\|migrations" backend/src/database/data-source.ts
```

**Step 3: Commit**

```bash
git add backend/src/database/migrations/1772100000000-NormalizeDocumentNumberSettings.ts
git commit -m "feat(settings): add migration to normalize document_number_settings table"
```

---

## Task 3: Update the DTOs

**Files:**
- Modify: `backend/src/modules/settings/dto/document-number-settings.dto.ts`

**Step 1: Replace the file**

```typescript
import { IsString, IsInt, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Expose } from 'class-transformer';

export class DocumentNumberConfigDto {
  @ApiProperty({ example: 'Sales Orders' })
  @IsString()
  @Expose()
  documentName: string;

  @ApiProperty({ example: 'SO' })
  @IsString()
  @Expose()
  prefix: string;

  @ApiProperty({ example: 3, description: 'Minimum digits for sequence padding' })
  @IsInt()
  @Min(1)
  @Max(10)
  @Expose()
  paddingDigits: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Expose()
  nextNumber: number;

  @ApiProperty({ example: 26, description: 'Last 2-digit year when sequence was reset' })
  @IsInt()
  @Expose()
  lastResetYear: number;
}

export class UpdateDocumentNumberSettingDto {
  @ApiProperty({ example: 'SO', description: 'New prefix for this document type' })
  @IsString()
  prefix: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  nextNumber: number;
}

export class UpdateDocumentNumberSettingsDto {
  @ApiProperty({ type: [DocumentNumberConfigDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocumentNumberConfigDto)
  configurations: DocumentNumberConfigDto[];
}

export class DocumentNumberSettingsResponseDto {
  @ApiProperty({ type: [DocumentNumberConfigDto] })
  @Expose()
  configurations: DocumentNumberConfigDto[];
}

export class GenerateDocumentNumberDto {
  @ApiProperty({ example: 'Sales Orders' })
  @IsString()
  documentName: string;
}

export class GenerateDocumentNumberResponseDto {
  @ApiProperty({ example: 'SO-26-001' })
  documentNumber: string;

  @ApiProperty({ example: 'Sales Orders' })
  documentName: string;
}
```

**Step 2: Commit**

```bash
git add backend/src/modules/settings/dto/document-number-settings.dto.ts
git commit -m "feat(settings): update document number DTOs for normalized schema"
```

---

## Task 4: Rewrite the SettingsService Document Number Methods

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`

This is the largest backend change. The service currently uses a single JSONB-row pattern. We replace it with per-row queries.

**Step 1: Update imports — replace `DocumentNumberSettings` with `DocumentNumberSetting`**

At line 11, change:
```typescript
// Before
import { DocumentNumberSettings } from '../../database/entities/document-number-settings.entity';

// After
import { DocumentNumberSetting } from '../../database/entities/document-number-settings.entity';
```

**Step 2: Update the constructor — replace the old repository injection**

At lines 45-46, change:
```typescript
// Before
@InjectRepository(DocumentNumberSettings)
private documentNumberSettingsRepository: Repository<DocumentNumberSettings>,

// After
@InjectRepository(DocumentNumberSetting)
private documentNumberSettingRepository: Repository<DocumentNumberSetting>,
```

Also remove these repository injections from the constructor (they are only needed for sync, which we'll handle differently — the sync method will use the repositories already injected for other purposes, but the entity repos for accounting docs need to be added):

Add new injections for accounting entities at end of constructor:
```typescript
@InjectRepository(JournalEntry)
private journalEntryRepository: Repository<JournalEntry>,
@InjectRepository(Expense)
private expenseRepository: Repository<Expense>,
@InjectRepository(Settlement)
private settlementRepository: Repository<Settlement>,
```

Add imports at top of file:
```typescript
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { Expense } from '../../database/entities/expense.entity';
import { Settlement } from '../../database/entities/settlement.entity';
```

**Step 3: Replace `getDocumentNumberSettings()` (lines 370-409)**

```typescript
async getDocumentNumberSettings(): Promise<DocumentNumberSettingsResponseDto> {
  try {
    let rows = await this.documentNumberSettingRepository.find({
      order: { documentName: 'ASC' },
    });

    if (!rows.length) {
      await this.createDefaultDocumentNumberSettings();
      rows = await this.documentNumberSettingRepository.find({
        order: { documentName: 'ASC' },
      });
    }

    return { configurations: rows };
  } catch (error) {
    this.logger.error(`Failed to get document number settings: ${error.message}`, error.stack);
    throw new InternalServerErrorException('Failed to retrieve document number settings');
  }
}
```

**Step 4: Replace `updateDocumentNumberSettings()` (lines 414-448)**

```typescript
async updateDocumentNumberSettings(
  updateDto: UpdateDocumentNumberSettingsDto,
  updatedBy = 'system',
): Promise<DocumentNumberSettingsResponseDto> {
  try {
    for (const cfg of updateDto.configurations) {
      await this.documentNumberSettingRepository.update(
        { documentName: cfg.documentName },
        { prefix: cfg.prefix, nextNumber: cfg.nextNumber },
      );
    }
    this.logger.log(`Document number settings updated by ${updatedBy}`);
    return this.getDocumentNumberSettings();
  } catch (error) {
    this.logger.error(`Failed to update document number settings: ${error.message}`, error.stack);
    throw new InternalServerErrorException('Failed to update document number settings');
  }
}
```

**Step 5: Replace `generateDocumentNumber()` (lines 453-495)**

```typescript
async generateDocumentNumber(documentName: string): Promise<string> {
  const row = await this.documentNumberSettingRepository.findOne({
    where: { documentName },
  });

  if (!row) {
    throw new NotFoundException(`Document number config for '${documentName}' not found`);
  }

  const currentYY = new Date().getFullYear() % 100;

  // Auto-reset sequence at start of new year
  if (row.lastResetYear !== currentYY) {
    row.nextNumber = 1;
    row.lastResetYear = currentYY;
  }

  const yy = String(currentYY).padStart(2, '0');
  const seq = String(row.nextNumber).padStart(row.paddingDigits, '0');
  const documentNumber = `${row.prefix}-${yy}-${seq}`;

  row.nextNumber += 1;
  await this.documentNumberSettingRepository.save(row);

  return documentNumber;
}
```

**Step 6: Replace `previewDocumentNumber()` (lines 500-527)**

```typescript
async previewDocumentNumber(documentName: string): Promise<string> {
  try {
    const row = await this.documentNumberSettingRepository.findOne({
      where: { documentName },
    });

    if (!row) return 'N/A';

    const currentYY = new Date().getFullYear() % 100;
    const nextNum = row.lastResetYear !== currentYY ? 1 : row.nextNumber;
    const yy = String(currentYY).padStart(2, '0');
    const seq = String(nextNum).padStart(row.paddingDigits, '0');
    return `${row.prefix}-${yy}-${seq}`;
  } catch {
    return 'N/A';
  }
}
```

**Step 7: Replace `createDefaultDocumentNumberSettings()` (lines 532-550)**

```typescript
private async createDefaultDocumentNumberSettings(): Promise<void> {
  const currentYY = new Date().getFullYear() % 100;
  const defaults = [
    { documentName: 'Sales Orders',     prefix: 'SO'  },
    { documentName: 'Invoices',         prefix: 'INV' },
    { documentName: 'Payments',         prefix: 'PAY' },
    { documentName: 'Purchase Orders',  prefix: 'PO'  },
    { documentName: 'Goods Received',   prefix: 'GRN' },
    { documentName: 'Vendor Payments',  prefix: 'VP'  },
    { documentName: 'Stock Adjustment', prefix: 'SA'  },
    { documentName: 'Journal Entries',  prefix: 'JE'  },
    { documentName: 'Expenses',         prefix: 'EXP' },
    { documentName: 'Settlements',      prefix: 'STL' },
  ];

  for (const d of defaults) {
    const exists = await this.documentNumberSettingRepository.findOne({
      where: { documentName: d.documentName },
    });
    if (!exists) {
      await this.documentNumberSettingRepository.save(
        this.documentNumberSettingRepository.create({
          ...d,
          paddingDigits: 3,
          nextNumber: 1,
          lastResetYear: currentYY,
        }),
      );
    }
  }
  this.logger.log('Default document number settings created');
}
```

**Step 8: Replace `syncDocumentNumbersWithDatabase()` (lines 565-732)**

```typescript
async syncDocumentNumbersWithDatabase(): Promise<void> {
  try {
    const rows = await this.documentNumberSettingRepository.find();
    if (!rows.length) {
      await this.createDefaultDocumentNumberSettings();
    }

    const currentYY = new Date().getFullYear() % 100;
    const pattern = (prefix: string) => `${prefix}-${String(currentYY).padStart(2, '0')}-%`;

    for (const row of rows) {
      let maxNumber = 0;
      try {
        switch (row.documentName) {
          case 'Sales Orders': {
            const r = await this.salesOrderRepository
              .createQueryBuilder('so')
              .select('so.orderNumber')
              .where('so.orderNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('so.orderNumber', 'DESC').limit(1).getOne();
            if (r?.orderNumber) maxNumber = parseInt(r.orderNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Invoices': {
            const r = await this.invoiceRepository
              .createQueryBuilder('inv')
              .select('inv.invoiceNumber')
              .where('inv.invoiceNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('inv.invoiceNumber', 'DESC').limit(1).getOne();
            if (r?.invoiceNumber) maxNumber = parseInt(r.invoiceNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Payments': {
            const r = await this.paymentRepository
              .createQueryBuilder('pay')
              .select('pay.paymentNumber')
              .where('pay.paymentNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('pay.paymentNumber', 'DESC').limit(1).getOne();
            if (r?.paymentNumber) maxNumber = parseInt(r.paymentNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Purchase Orders': {
            const r = await this.purchaseOrderRepository
              .createQueryBuilder('po')
              .select('po.orderNumber')
              .where('po.orderNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('po.orderNumber', 'DESC').limit(1).getOne();
            if (r?.orderNumber) maxNumber = parseInt(r.orderNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Goods Received': {
            const r = await this.goodsReceivedNoteRepository
              .createQueryBuilder('grn')
              .select('grn.grnNumber')
              .where('grn.grnNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('grn.grnNumber', 'DESC').limit(1).getOne();
            if (r?.grnNumber) maxNumber = parseInt(r.grnNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Vendor Payments': {
            const r = await this.vendorPaymentRepository
              .createQueryBuilder('vp')
              .select('vp.paymentNumber')
              .where('vp.paymentNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('vp.paymentNumber', 'DESC').limit(1).getOne();
            if (r?.paymentNumber) maxNumber = parseInt(r.paymentNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Stock Adjustment': {
            const r = await this.stockAdjustmentRepository
              .createQueryBuilder('sa')
              .select('sa.adjustmentNumber')
              .where('sa.adjustmentNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('sa.adjustmentNumber', 'DESC').limit(1).getOne();
            if (r?.adjustmentNumber) maxNumber = parseInt(r.adjustmentNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Journal Entries': {
            const r = await this.journalEntryRepository
              .createQueryBuilder('je')
              .select('je.referenceNumber')
              .where('je.referenceNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('je.referenceNumber', 'DESC').limit(1).getOne();
            if (r?.referenceNumber) maxNumber = parseInt(r.referenceNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Expenses': {
            const r = await this.expenseRepository
              .createQueryBuilder('exp')
              .select('exp.referenceNumber')
              .where('exp.referenceNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('exp.referenceNumber', 'DESC').limit(1).getOne();
            if (r?.referenceNumber) maxNumber = parseInt(r.referenceNumber.split('-')[2], 10) || 0;
            break;
          }
          case 'Settlements': {
            const r = await this.settlementRepository
              .createQueryBuilder('stl')
              .select('stl.settlementNumber')
              .where('stl.settlementNumber LIKE :p', { p: pattern(row.prefix) })
              .orderBy('stl.settlementNumber', 'DESC').limit(1).getOne();
            if (r?.settlementNumber) maxNumber = parseInt(r.settlementNumber.split('-')[2], 10) || 0;
            break;
          }
          default:
            this.logger.warn(`Unknown document type in sync: ${row.documentName}`);
        }

        await this.documentNumberSettingRepository.update(
          { documentName: row.documentName },
          { nextNumber: maxNumber + 1, lastResetYear: currentYY },
        );
        this.logger.log(`${row.documentName}: synced nextNumber to ${maxNumber + 1}`);
      } catch (err) {
        this.logger.error(`Failed to sync ${row.documentName}: ${err.message}`, err.stack);
      }
    }

    this.logger.log('Document number settings synchronized with database');
  } catch (error) {
    this.logger.error(`Failed to sync document numbers: ${error.message}`, error.stack);
    throw new InternalServerErrorException('Failed to sync document numbers');
  }
}
```

**Step 9: Commit**

```bash
git add backend/src/modules/settings/settings.service.ts
git commit -m "feat(settings): rewrite document number service for normalized table + PREFIX-YY-NNN format"
```

---

## Task 5: Update the SettingsModule

**Files:**
- Modify: `backend/src/modules/settings/settings.module.ts`

**Step 1: Replace `DocumentNumberSettings` import with `DocumentNumberSetting`**

Line 9, change:
```typescript
// Before
import { DocumentNumberSettings } from '../../database/entities/document-number-settings.entity';

// After
import { DocumentNumberSetting } from '../../database/entities/document-number-settings.entity';
```

**Step 2: Add JournalEntry, Expense, Settlement imports**

After line 20 (`Settlement` import), add:
```typescript
import { JournalEntry } from '../../database/entities/journal-entry.entity';
import { Expense } from '../../database/entities/expense.entity';
```

(Note: `Settlement` is already imported at line 20.)

**Step 3: Update `TypeOrmModule.forFeature([])` — replace `DocumentNumberSettings` with `DocumentNumberSetting` and add the 3 new entities**

```typescript
TypeOrmModule.forFeature([
  CompanySettings,
  PriceCostingSettings,
  DocumentNumberSetting,      // renamed
  SalesOrder,
  Invoice,
  Payment,
  PurchaseOrder,
  GoodsReceivedNote,
  VendorPayment,
  StockAdjustment,
  PaymentMethodEntity,
  Settlement,
  AccountMapping,
  ChartOfAccount,
  JournalEntry,               // new
  Expense,                    // new
]),
```

**Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.module.ts
git commit -m "feat(settings): update module to use normalized DocumentNumberSetting entity"
```

---

## Task 6: Update the SettingsController

**Files:**
- Modify: `backend/src/modules/settings/settings.controller.ts`

**Step 1: Find and update the `updateDocumentNumberSettings` endpoint response type**

The controller passes DTOs through as-is. The only change needed is updating the response shape comment/docs if present. Check that line 308-318 uses `UpdateDocumentNumberSettingsDto` — no structural change needed, just verify it compiles.

**Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -i "settings"
```

Fix any type errors reported.

**Step 3: Commit**

```bash
git add backend/src/modules/settings/settings.controller.ts
git commit -m "feat(settings): verify controller types compile after DTO update"
```

---

## Task 7: Remove Hardcoded Numbering from VendorPaymentService

**Files:**
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts`

**Step 1: Add SettingsService import**

At line 17, add:
```typescript
import { SettingsService } from '@modules/settings/settings.service';
```

**Step 2: Add SettingsService to constructor** (after `accountingService` at line 33)

```typescript
private readonly settingsService: SettingsService,
```

**Step 3: Update `create()` at line 43** — replace `this.generatePaymentNumber()`:

```typescript
// Before (line 43)
const paymentNumber = await this.generatePaymentNumber();

// After
const paymentNumber = await this.settingsService.generateDocumentNumber('Vendor Payments');
```

**Step 4: Delete `generatePaymentNumber()` method** (lines 571-595)

Remove the entire private method.

**Step 5: Commit**

```bash
git add backend/src/modules/purchasing/services/vendor-payment.service.ts
git commit -m "feat(purchasing): replace hardcoded VP numbering with SettingsService"
```

---

## Task 8: Check PurchasingModule imports SettingsModule

**Files:**
- Check/Modify: `backend/src/modules/purchasing/purchasing.module.ts`

**Step 1: Check if SettingsModule is already imported**

```bash
grep -n "SettingsModule" backend/src/modules/purchasing/purchasing.module.ts
```

**Step 2: If NOT present**, add the import:

At the top of the file add:
```typescript
import { SettingsModule } from '../settings/settings.module';
```

And in the `@Module` `imports` array, add `SettingsModule`.

**Step 3: Commit if changed**

```bash
git add backend/src/modules/purchasing/purchasing.module.ts
git commit -m "feat(purchasing): import SettingsModule for document number generation"
```

---

## Task 9: Remove Hardcoded Numbering from JournalEntryService

**Files:**
- Modify: `backend/src/modules/accounting/services/journal-entry.service.ts`

**Step 1: Add SettingsService import** (line 27, after FiscalPeriodService import)

```typescript
import { SettingsService } from '../../settings/settings.service';
```

Wait — accounting imports settings. Check for circular dependencies first:
```bash
grep -r "AccountingModule\|accounting.module" backend/src/modules/settings/
```
If settings doesn't import accounting, it's safe.

**Step 2: Add SettingsService to constructor** (after `fiscalPeriodService` at line 42)

```typescript
private readonly settingsService: SettingsService,
```

**Step 3: Update `create()` at line 64** — replace hardcoded reference number generation:

```typescript
// Before (line 64)
const referenceNumber = createDto.referenceNumber || await this.generateReferenceNumber(createDto.entryDate);

// After
const referenceNumber = createDto.referenceNumber || await this.settingsService.generateDocumentNumber('Journal Entries');
```

**Step 4: Delete `generateReferenceNumber()` private method** (lines 679-702)

Remove the entire private method.

**Step 5: Commit**

```bash
git add backend/src/modules/accounting/services/journal-entry.service.ts
git commit -m "feat(accounting): replace hardcoded JE numbering with SettingsService"
```

---

## Task 10: Remove Hardcoded Numbering from ExpenseService

**Files:**
- Modify: `backend/src/modules/accounting/services/expense.service.ts`
- Modify: `backend/src/database/entities/expense.entity.ts`

**Step 1: Add SettingsService import to expense.service.ts** (line 15, after AccountingService import)

```typescript
import { SettingsService } from '../../settings/settings.service';
```

**Step 2: Add to constructor** (after `accountingService` at line 36)

```typescript
private readonly settingsService: SettingsService,
```

**Step 3: Update `create()` at line 142** — add reference number generation before `expenseRepository.create()`:

```typescript
// Add before line 142
const referenceNumber = await this.settingsService.generateDocumentNumber('Expenses');

// Then in the create call, add referenceNumber:
const expense = this.expenseRepository.create({
  referenceNumber,              // add this line
  expenseDate: new Date(dto.expenseDate),
  expenseAccountId: dto.expenseAccountId,
  amount: dto.amount,
  paymentMethodId: dto.paymentMethodId,
  description: dto.description,
  vendor: dto.vendor,
  status: ExpenseStatus.DRAFT,
});
```

**Step 4: Remove `@BeforeInsert` hook from expense.entity.ts**

In `backend/src/database/entities/expense.entity.ts`, remove lines 88-94:
```typescript
// Remove this entire block
@BeforeInsert()
generateReferenceNumber() {
  if (!this.referenceNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    this.referenceNumber = `EXP-${timestamp}`;
  }
}
```

Also remove `BeforeInsert` from the typeorm imports on line 1 if it's no longer used.

**Step 5: Commit**

```bash
git add backend/src/modules/accounting/services/expense.service.ts
git add backend/src/database/entities/expense.entity.ts
git commit -m "feat(accounting): replace hardcoded EXP numbering with SettingsService"
```

---

## Task 11: Remove Hardcoded Numbering from SettlementService

**Files:**
- Modify: `backend/src/modules/accounting/services/settlement.service.ts`
- Modify: `backend/src/database/entities/settlement.entity.ts`

**Step 1: Add SettingsService import to settlement.service.ts** (line 19, after AccountingService import)

```typescript
import { SettingsService } from '../../settings/settings.service';
```

**Step 2: Add to constructor** (after `accountingService` at line 32)

```typescript
private readonly settingsService: SettingsService,
```

**Step 3: Update `create()` — find where the settlement entity is created** (around line 133-140)

Read settlement.service.ts lines 133-145 to find the `settlementRepository.create()` call. Before it, add:

```typescript
const settlementNumber = await this.settingsService.generateDocumentNumber('Settlements');
```

Then pass `settlementNumber` into the create call:
```typescript
const settlement = this.settlementRepository.create({
  settlementNumber,    // add this
  paymentMethodId: dto.paymentMethodId,
  settlementDate: dto.settlementDate ? new Date(dto.settlementDate) : new Date(),
  // ... rest of fields
});
```

**Step 4: Remove `@BeforeInsert` hook from settlement.entity.ts**

In `backend/src/database/entities/settlement.entity.ts`, remove lines 100-106:
```typescript
// Remove this entire block
@BeforeInsert()
generateSettlementNumber() {
  if (!this.settlementNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    this.settlementNumber = `STL-${timestamp}`;
  }
}
```

Remove `BeforeInsert` from typeorm imports if no longer used.

**Step 5: Commit**

```bash
git add backend/src/modules/accounting/services/settlement.service.ts
git add backend/src/database/entities/settlement.entity.ts
git commit -m "feat(accounting): replace hardcoded STL numbering with SettingsService"
```

---

## Task 12: Import SettingsModule into AccountingModule

**Files:**
- Modify: `backend/src/modules/accounting/accounting.module.ts`

**Step 1: Add SettingsModule import**

Add at top of file:
```typescript
import { SettingsModule } from '../settings/settings.module';
```

**Step 2: Add to `imports` array** (line 42, after `TypeOrmModule.forFeature([...])`)

```typescript
imports: [
  TypeOrmModule.forFeature([...]),
  SettingsModule,    // add this
],
```

**Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Fix any errors.

**Step 4: Commit**

```bash
git add backend/src/modules/accounting/accounting.module.ts
git commit -m "feat(accounting): import SettingsModule for document number generation"
```

---

## Task 13: Backend Integration — Run Tests

**Step 1: Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -40
```

Expected: all tests pass. If failures occur, read the specific test file and fix.

**Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1
```

Expected: no errors.

**Step 3: Commit any fixes**

```bash
git add -p
git commit -m "fix(settings): resolve type errors after document number refactor"
```

---

## Task 14: Update Frontend Types

**Files:**
- Modify: `frontend/src/services/settingsApi.ts`

**Step 1: Update `DocumentNumberConfig` interface** (lines 53-58)

```typescript
// Before
export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  numberFormat: string
  nextNumber: number
}

// After
export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  paddingDigits: number
  nextNumber: number
  lastResetYear: number
}
```

**Step 2: Update `DocumentNumberSettings` interface** (lines 60-65)

The old interface wraps a `configurations` array. The new API response still returns `{ configurations: DocumentNumberConfig[] }` (from `DocumentNumberSettingsResponseDto`), so the shape stays the same — just the inner type changed.

**Step 3: Update `UpdateDocumentNumberSettingsDto`** (lines 67-69) — no structural change needed, still `configurations: DocumentNumberConfig[]`.

**Step 4: Commit**

```bash
git add frontend/src/services/settingsApi.ts
git commit -m "feat(frontend): update DocumentNumberConfig type for normalized schema"
```

---

## Task 15: Update DocumentNumbersPage

**Files:**
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx`

**Step 1: Update preview logic** (lines 37-45)

```typescript
// Before
useEffect(() => {
  const newPreviews: Record<string, string> = {}
  configurations.forEach((config) => {
    const paddedNumber = String(config.nextNumber).padStart(config.numberFormat.length, '0')
    newPreviews[config.documentName] = `${config.prefix}-${paddedNumber}`
  })
  setPreviews(newPreviews)
}, [configurations])

// After
useEffect(() => {
  const currentYY = String(new Date().getFullYear() % 100).padStart(2, '0')
  const newPreviews: Record<string, string> = {}
  configurations.forEach((config) => {
    const seq = String(config.nextNumber).padStart(config.paddingDigits, '0')
    newPreviews[config.documentName] = `${config.prefix}-${currentYY}-${seq}`
  })
  setPreviews(newPreviews)
}, [configurations])
```

**Step 2: Remove the "Number Format" column from the table**

In the `TableHead`, remove:
```typescript
<TableCell sx={{ fontWeight: 600, width: '20%' }}>Number Format</TableCell>
```

In the `TableBody`, remove the entire `<TableCell>` block containing the `numberFormat` TextField (lines 167-181).

Adjust column widths in the remaining headers accordingly:
```typescript
<TableCell sx={{ fontWeight: 600, width: '30%' }}>Document Name</TableCell>
<TableCell sx={{ fontWeight: 600, width: '25%' }}>Prefix</TableCell>
<TableCell sx={{ fontWeight: 600, width: '20%' }}>Next Number</TableCell>
<TableCell sx={{ fontWeight: 600, width: '25%' }}>Preview</TableCell>
```

**Step 3: Update `handleConfigChange`** — remove the `numberFormat` branch

```typescript
// Before (lines 72-77)
const handleConfigChange = (
  index: number,
  field: keyof DocumentNumberConfig,
  value: string | number
) => {
  const newConfigurations = [...configurations]
  if (field === 'nextNumber') {
    newConfigurations[index][field] = parseInt(value as string) || 1
  } else {
    newConfigurations[index][field] = value as any
  }
  setConfigurations(newConfigurations)
}

// After — same logic, numberFormat field simply won't be called anymore
// No change needed here
```

**Step 4: Update `handleSubmit` validation** — remove `numberFormat` check

```typescript
// Before (line 86)
if (!config.prefix || !config.numberFormat || config.nextNumber < 1) {

// After
if (!config.prefix || config.nextNumber < 1) {
```

**Step 5: Add module section headers to group documents**

Define a grouping map before the return statement:

```typescript
const MODULE_GROUPS: Record<string, string[]> = {
  Sales: ['Sales Orders', 'Invoices', 'Payments'],
  Purchasing: ['Purchase Orders', 'Goods Received', 'Vendor Payments'],
  Inventory: ['Stock Adjustment'],
  Accounting: ['Journal Entries', 'Expenses', 'Settlements'],
}
```

Then in the `TableBody`, replace the flat `.map()` with grouped rendering:

```typescript
{Object.entries(MODULE_GROUPS).map(([module, docNames]) => (
  <React.Fragment key={module}>
    <TableRow>
      <TableCell
        colSpan={4}
        sx={{ backgroundColor: 'action.hover', fontWeight: 700, py: 1, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: 1 }}
      >
        {module}
      </TableCell>
    </TableRow>
    {docNames.map((docName) => {
      const index = configurations.findIndex((c) => c.documentName === docName)
      if (index === -1) return null
      const config = configurations[index]
      return (
        <TableRow key={config.documentName}>
          <TableCell>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {config.documentName}
            </Typography>
          </TableCell>
          <TableCell>
            <TextField
              value={config.prefix}
              onChange={(e) => handleConfigChange(index, 'prefix', e.target.value.toUpperCase())}
              size="small"
              fullWidth
              inputProps={{ maxLength: 10 }}
            />
          </TableCell>
          <TableCell>
            <TextField
              type="number"
              value={config.nextNumber}
              onChange={(e) => handleConfigChange(index, 'nextNumber', e.target.value)}
              size="small"
              fullWidth
              inputProps={{ min: 1 }}
            />
          </TableCell>
          <TableCell>
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'monospace',
                color: 'primary.main',
                fontWeight: 600,
                backgroundColor: 'action.hover',
                px: 2, py: 1,
                borderRadius: 1,
              }}
            >
              {previews[config.documentName] || 'N/A'}
            </Typography>
          </TableCell>
        </TableRow>
      )
    })}
  </React.Fragment>
))}
```

**Step 6: Update description text** (lines 131-137)

```typescript
// Before
<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
  Configure document numbering patterns for various business documents. The system will automatically
  generate sequential document numbers based on your settings.
</Typography>
<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, fontStyle: 'italic' }}>
  Note: Use zeros to define the number format length (e.g., 000001 for 6-digit numbers).
</Typography>

// After
<Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
  Configure document number prefixes for all business documents. Numbers are generated in the format
  <strong> PREFIX-YY-NNN</strong> (e.g. SO-26-001), where YY is the current year and the sequence resets each year.
</Typography>
<Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, fontStyle: 'italic' }}>
  Note: The sequence auto-expands past 999 (e.g. SO-26-1000). Use the Sync button after changing prefixes.
</Typography>
```

**Step 7: Commit**

```bash
git add frontend/src/pages/settings/DocumentNumbersPage.tsx
git commit -m "feat(frontend): update DocumentNumbersPage for PREFIX-YY-NNN format with module grouping"
```

---

## Task 16: Frontend Tests

**Step 1: Run frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -40
```

**Step 2: Check for DocumentNumbersPage tests**

```bash
find frontend/src -name "*DocumentNumber*" -o -name "*document-number*"
```

If a test file exists, update it to use `paddingDigits` instead of `numberFormat` and update preview assertions to match `PREFIX-YY-NNN`.

**Step 3: Run type check**

```bash
cd frontend && npm run type-check
```

Fix any errors.

**Step 4: Commit any fixes**

```bash
git add -p
git commit -m "fix(frontend): update document number tests for new format"
```

---

## Task 17: End-to-End Verification

**Step 1: Start the backend in dev mode**

```bash
cd backend && npm run start:dev
```

Watch for any startup errors. The migration runs automatically on start.

**Step 2: Verify migration ran**

```bash
# Connect to DB and check new table structure
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "\d document_number_settings"
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "SELECT document_name, prefix, next_number, last_reset_year FROM document_number_settings ORDER BY document_name"
```

Expected: 10 rows with correct prefixes.

**Step 3: Test the GET endpoint**

```bash
curl -s -H "Authorization: Bearer <token>" http://localhost:3000/settings/document-numbers | jq .
```

Expected: array of 10 configs with `paddingDigits`, `nextNumber`, `lastResetYear`.

**Step 4: Test number generation**

```bash
curl -s -X POST -H "Content-Type: application/json" -H "Authorization: Bearer <token>" \
  -d '{"documentName":"Sales Orders"}' \
  http://localhost:3000/settings/document-numbers/generate | jq .
```

Expected: `{ "documentNumber": "SO-26-001", "documentName": "Sales Orders" }`

**Step 5: Run the sync endpoint**

```bash
curl -s -X POST -H "Authorization: Bearer <token>" \
  http://localhost:3000/settings/document-numbers/sync | jq .
```

**Step 6: Final backend test run**

```bash
cd backend && npm run test 2>&1 | tail -20
```

**Step 7: Final commit if needed**

```bash
git add -p
git commit -m "fix: resolve any remaining issues from e2e verification"
```
