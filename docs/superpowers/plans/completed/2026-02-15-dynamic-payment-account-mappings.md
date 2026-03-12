# Dynamic Payment Account Mappings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make payment account mappings entirely data-driven from payment methods, including vendor payment entity migration to use payment method FK.

**Architecture:** Remove hardcoded payment enum values (PAYMENT_CASH, VENDOR_PAYMENT_CASH). Keep global PAYMENT_AR and VENDOR_PAYMENT_AP. Payment method CRUD auto-creates/syncs/removes dynamic mapping rows (`payment_{code}`, `vendor_payment_{code}`, `payment_{code}_settlement`). VendorPayment entity migrated from string paymentMethod to paymentMethodId FK.

**Tech Stack:** NestJS + TypeORM (backend), React + Redux Toolkit + MUI (frontend), PostgreSQL migrations

**Design doc:** `docs/plans/completed/2026-02-15-dynamic-payment-account-mappings-design.md`

---

### Task 1: Remove Hardcoded Payment Enum Values (Backend)

**Files:**
- Modify: `backend/src/database/entities/account-mapping.entity.ts:17-31`

**Step 1: Remove PAYMENT_CASH and VENDOR_PAYMENT_CASH from MappingType enum**

In `backend/src/database/entities/account-mapping.entity.ts`, change the enum from:

```typescript
export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_CASH = 'payment_cash',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_CASH = 'vendor_payment_cash',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
}
```

To:

```typescript
export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
}
```

**Step 2: Verify no compile errors**

Run: `cd /home/blur/erp2/backend && npx tsc --noEmit 2>&1 | head -30`
Expected: May show errors in accounting.service.ts and spec files referencing removed enum values — these will be fixed in subsequent tasks.

**Step 3: Commit**

```bash
git add backend/src/database/entities/account-mapping.entity.ts
git commit -m "refactor: remove PAYMENT_CASH and VENDOR_PAYMENT_CASH from MappingType enum"
```

---

### Task 2: Remove Hardcoded Payment Enum Values (Frontend)

**Files:**
- Modify: `frontend/src/types/accountMapping.ts:17-31`

**Step 1: Remove PAYMENT_CASH and VENDOR_PAYMENT_CASH from frontend MappingType enum**

In `frontend/src/types/accountMapping.ts`, change:

```typescript
export enum MappingType {
  SALES_REVENUE = 'sales_revenue',
  SALES_AR = 'sales_ar',
  SALES_COGS = 'sales_cogs',
  SALES_INVENTORY = 'sales_inventory',
  PURCHASE_INVENTORY = 'purchase_inventory',
  PURCHASE_AP = 'purchase_ap',
  PAYMENT_AR = 'payment_ar',
  VENDOR_PAYMENT_AP = 'vendor_payment_ap',
  INVENTORY_ASSET = 'inventory_asset',
  INVENTORY_ADJUSTMENT_GAIN = 'inventory_adjustment_gain',
  INVENTORY_ADJUSTMENT_LOSS = 'inventory_adjustment_loss',
}
```

**Step 2: Commit**

```bash
git add frontend/src/types/accountMapping.ts
git commit -m "refactor: remove PAYMENT_CASH and VENDOR_PAYMENT_CASH from frontend MappingType enum"
```

---

### Task 3: Add vendor_payment_{code} Mapping to Payment Method Create

**Files:**
- Modify: `backend/src/modules/settings/services/payment-method.service.ts:216-264`

**Step 1: Update createAccountMappings() to also create vendor_payment_{code}**

In `payment-method.service.ts`, modify the `createAccountMappings()` method. After the existing `payment_{code}` and `payment_{code}_settlement` creation logic (around line 264), add vendor mapping creation:

```typescript
private async createAccountMappings(pm: PaymentMethodEntity): Promise<void> {
    const mappingKey = `payment_${pm.code.toLowerCase()}`;

    const existingMapping = await this.accountMappingRepository.findOne({
      where: { mappingType: mappingKey },
    });

    if (!existingMapping) {
      const account = await this.findMatchingAccount(pm);
      if (!account) {
        this.logger.warn(
          `No matching GL account found for ${pm.code} — mapping created with null accountId`,
        );
      }
      const mapping = this.accountMappingRepository.create({
        mappingType: mappingKey,
        accountId: account ? account.id : null,
        description: `${pm.name} payment received account`,
        isActive: true,
      });
      await this.accountMappingRepository.save(mapping);
    }

    if (pm.requiresSettlement) {
      const settlementKey = `payment_${pm.code.toLowerCase()}_settlement`;
      const existingSettlement = await this.accountMappingRepository.findOne({
        where: { mappingType: settlementKey },
      });

      if (!existingSettlement) {
        const bankAccount = await this.accountRepository.findOne({
          where: { code: '1100', isActive: true },
        });

        if (!bankAccount) {
          this.logger.warn(
            `Bank account 1100 not found for ${pm.code} — settlement mapping created with null accountId`,
          );
        }
        const mapping = this.accountMappingRepository.create({
          mappingType: settlementKey,
          accountId: bankAccount ? bankAccount.id : null,
          description: `${pm.name} settlement to bank account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    }

    // Create vendor payment mapping
    const vendorKey = `vendor_payment_${pm.code.toLowerCase()}`;
    const existingVendorMapping = await this.accountMappingRepository.findOne({
      where: { mappingType: vendorKey },
    });

    if (!existingVendorMapping) {
      const account = await this.findMatchingAccount(pm);
      if (!account) {
        this.logger.warn(
          `No matching GL account found for vendor ${pm.code} — mapping created with null accountId`,
        );
      }
      const mapping = this.accountMappingRepository.create({
        mappingType: vendorKey,
        accountId: account ? account.id : null,
        description: `${pm.name} vendor payment account`,
        isActive: true,
      });
      await this.accountMappingRepository.save(mapping);
    }
  }
```

**Step 2: Commit**

```bash
git add backend/src/modules/settings/services/payment-method.service.ts
git commit -m "feat: create vendor_payment_{code} mapping on payment method creation"
```

---

### Task 4: Add Mapping Sync on Payment Method Update

**Files:**
- Modify: `backend/src/modules/settings/services/payment-method.service.ts:110-130`

**Step 1: Add syncAccountMappings() private method**

Add after the `createAccountMappings()` method:

```typescript
private async syncAccountMappings(
    oldPm: PaymentMethodEntity,
    newPm: PaymentMethodEntity,
  ): Promise<void> {
    const oldCode = oldPm.code.toLowerCase();
    const newCode = newPm.code.toLowerCase();

    // If code changed, rename all mapping types
    if (oldCode !== newCode) {
      const renamePairs = [
        [`payment_${oldCode}`, `payment_${newCode}`],
        [`vendor_payment_${oldCode}`, `vendor_payment_${newCode}`],
        [`payment_${oldCode}_settlement`, `payment_${newCode}_settlement`],
      ];

      for (const [oldKey, newKey] of renamePairs) {
        const mapping = await this.accountMappingRepository.findOne({
          where: { mappingType: oldKey },
        });
        if (mapping) {
          mapping.mappingType = newKey;
          await this.accountMappingRepository.save(mapping);
        }
      }
    }

    // If name changed, update descriptions
    if (oldPm.name !== newPm.name) {
      const code = newCode;
      const descriptionUpdates = [
        [`payment_${code}`, `${newPm.name} payment received account`],
        [`vendor_payment_${code}`, `${newPm.name} vendor payment account`],
        [`payment_${code}_settlement`, `${newPm.name} settlement to bank account`],
      ];

      for (const [key, description] of descriptionUpdates) {
        const mapping = await this.accountMappingRepository.findOne({
          where: { mappingType: key },
        });
        if (mapping) {
          mapping.description = description;
          await this.accountMappingRepository.save(mapping);
        }
      }
    }

    // If requiresSettlement toggled
    const code = newCode;
    if (newPm.requiresSettlement && !oldPm.requiresSettlement) {
      // Toggled ON — create settlement mapping
      const settlementKey = `payment_${code}_settlement`;
      const existing = await this.accountMappingRepository.findOne({
        where: { mappingType: settlementKey },
      });
      if (!existing) {
        const bankAccount = await this.accountRepository.findOne({
          where: { code: '1100', isActive: true },
        });
        const mapping = this.accountMappingRepository.create({
          mappingType: settlementKey,
          accountId: bankAccount ? bankAccount.id : null,
          description: `${newPm.name} settlement to bank account`,
          isActive: true,
        });
        await this.accountMappingRepository.save(mapping);
      }
    } else if (!newPm.requiresSettlement && oldPm.requiresSettlement) {
      // Toggled OFF — delete settlement mapping
      const settlementKey = `payment_${code}_settlement`;
      await this.accountMappingRepository.delete({ mappingType: settlementKey });
    }
  }
```

**Step 2: Call syncAccountMappings from update() method**

Modify the `update()` method (lines 110-130) to capture old state and call sync:

```typescript
async update(id: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodResponseDto> {
    const pm = await this.paymentMethodRepository.findOne({ where: { id } });
    if (!pm || pm.deletedAt) {
      throw new NotFoundException(`Payment method ${id} not found`);
    }

    // Capture old state before update
    const oldPm = { ...pm } as PaymentMethodEntity;

    if (dto.code) {
      dto.code = dto.code.toUpperCase().trim();
      if (dto.code !== pm.code) {
        const existing = await this.findByCode(dto.code);
        if (existing && existing.id !== id) {
          throw new ConflictException(`Payment method with code "${dto.code}" already exists`);
        }
      }
    }

    Object.assign(pm, dto);
    const saved = await this.paymentMethodRepository.save(pm);

    // Sync account mappings with changes
    await this.syncAccountMappings(oldPm, saved);

    return this.toResponseDto(saved);
  }
```

**Step 3: Commit**

```bash
git add backend/src/modules/settings/services/payment-method.service.ts
git commit -m "feat: sync account mappings on payment method update"
```

---

### Task 5: Add vendor_payment_{code} Deletion to permanentDelete and Re-creation on Restore

**Files:**
- Modify: `backend/src/modules/settings/services/payment-method.service.ts:165-214` (permanentDelete)
- Modify: `backend/src/modules/settings/services/payment-method.service.ts:152-163` (restore)

**Step 1: Update permanentDelete to include vendor mapping**

In `permanentDelete()`, change the mapping keys construction (lines 194-197):

```typescript
const mappingKeys = [
  `payment_${pm.code.toLowerCase()}`,
  `vendor_payment_${pm.code.toLowerCase()}`,
];
if (pm.requiresSettlement) {
  mappingKeys.push(`payment_${pm.code.toLowerCase()}_settlement`);
}
```

**Step 2: Update restore to re-create mappings**

Modify the `restore()` method to call `createAccountMappings()`:

```typescript
async restore(id: string): Promise<void> {
    const pm = await this.paymentMethodRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!pm || !pm.deletedAt) {
      throw new NotFoundException(`Deleted payment method ${id} not found`);
    }

    await this.paymentMethodRepository.restore(id);

    // Re-create account mappings if they were deleted
    await this.createAccountMappings(pm);
  }
```

**Step 3: Commit**

```bash
git add backend/src/modules/settings/services/payment-method.service.ts
git commit -m "feat: add vendor mapping to permanent delete and re-create mappings on restore"
```

---

### Task 6: VendorPayment Entity — Add paymentMethodId FK

**Files:**
- Modify: `backend/src/database/entities/vendor-payment.entity.ts`

**Step 1: Add paymentMethodId column and relation**

Add import for PaymentMethodEntity and add the new column/relation:

```typescript
import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { Supplier } from './supplier.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';
import { PaymentMethodEntity } from './payment-method.entity';

@Entity('vendor_payments')
@Index(['supplierId', 'status'])
@Index(['paymentDate'])
@Index(['grnId'])
export class VendorPayment extends BaseEntity {
  @Column({ length: 50, unique: true })
  paymentNumber: string;

  @Column({ type: 'uuid' })
  supplierId: string;

  @Column({ type: 'uuid', nullable: true })
  purchaseOrderId: string;

  @Column({ type: 'uuid', nullable: true })
  grnId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 0 })
  amount: number;

  @Column({ type: 'date' })
  paymentDate: Date;

  @Column({ type: 'uuid', nullable: true })
  paymentMethodId: string;

  @Column({ length: 100, nullable: true })
  referenceNumber: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ length: 20, default: 'pending' })
  status: string; // 'pending', 'completed', 'cancelled'

  // Relations
  @ManyToOne(() => Supplier, { eager: true })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => GoodsReceivedNote, { nullable: true, eager: true })
  @JoinColumn({ name: 'grnId' })
  grn: GoodsReceivedNote;

  @ManyToOne(() => PaymentMethodEntity, { nullable: true, eager: true })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethodEntity: PaymentMethodEntity;
}
```

Note: The old `paymentMethod: string` column is removed from the entity. The database column will be dropped in the migration (Task 7).

**Step 2: Commit**

```bash
git add backend/src/database/entities/vendor-payment.entity.ts
git commit -m "feat: replace paymentMethod string with paymentMethodId FK on VendorPayment entity"
```

---

### Task 7: Database Migration — VendorPayment paymentMethodId

**Files:**
- Create: `backend/src/database/migrations/1771200000000-AddPaymentMethodIdToVendorPayments.ts`

**Step 1: Create the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentMethodIdToVendorPayments1771200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add paymentMethodId column
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      ADD COLUMN IF NOT EXISTS "paymentMethodId" uuid
    `);

    // Migrate existing data: map old string values to payment method IDs
    await queryRunner.query(`
      UPDATE vendor_payments vp
      SET "paymentMethodId" = pm.id
      FROM payment_methods pm
      WHERE (
        (vp."paymentMethod" = 'cash' AND pm.code = 'CASH')
        OR (vp."paymentMethod" = 'bank_transfer' AND pm.code = 'BANK')
        OR (vp."paymentMethod" = 'check' AND pm.code = 'BANK')
        OR (vp."paymentMethod" = 'card' AND pm.code = 'CC')
      )
      AND vp."paymentMethodId" IS NULL
    `);

    // Drop old paymentMethod string column
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      DROP COLUMN IF EXISTS "paymentMethod"
    `);

    // Add FK constraint
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      ADD CONSTRAINT "FK_vendor_payments_paymentMethodId"
      FOREIGN KEY ("paymentMethodId") REFERENCES payment_methods(id)
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK constraint
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      DROP CONSTRAINT IF EXISTS "FK_vendor_payments_paymentMethodId"
    `);

    // Re-add old paymentMethod string column
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(50)
    `);

    // Reverse migrate data
    await queryRunner.query(`
      UPDATE vendor_payments vp
      SET "paymentMethod" = CASE
        WHEN pm.code = 'CASH' THEN 'cash'
        WHEN pm.code = 'BANK' THEN 'bank_transfer'
        WHEN pm.code = 'CC' THEN 'card'
        ELSE 'cash'
      END
      FROM payment_methods pm
      WHERE vp."paymentMethodId" = pm.id
    `);

    -- Drop paymentMethodId column
    await queryRunner.query(`
      ALTER TABLE vendor_payments
      DROP COLUMN IF EXISTS "paymentMethodId"
    `);
  }
}
```

**Step 2: Run the migration manually against Docker PostgreSQL**

Run:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS \"paymentMethodId\" uuid;
  UPDATE vendor_payments vp SET \"paymentMethodId\" = pm.id FROM payment_methods pm WHERE (vp.\"paymentMethod\" = 'cash' AND pm.code = 'CASH') OR (vp.\"paymentMethod\" = 'bank_transfer' AND pm.code = 'BANK') OR (vp.\"paymentMethod\" = 'check' AND pm.code = 'BANK') OR (vp.\"paymentMethod\" = 'card' AND pm.code = 'CC');
  ALTER TABLE vendor_payments DROP COLUMN IF EXISTS \"paymentMethod\";
  ALTER TABLE vendor_payments ADD CONSTRAINT \"FK_vendor_payments_paymentMethodId\" FOREIGN KEY (\"paymentMethodId\") REFERENCES payment_methods(id) ON DELETE SET NULL;
"
```

**Step 3: Verify migration**

Run:
```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT id, \"paymentNumber\", \"paymentMethodId\" FROM vendor_payments LIMIT 5;"
```

**Step 4: Commit**

```bash
git add backend/src/database/migrations/1771200000000-AddPaymentMethodIdToVendorPayments.ts
git commit -m "feat: add migration for vendor payment paymentMethodId FK"
```

---

### Task 8: Update VendorPayment DTOs and Service

**Files:**
- Modify: `backend/src/modules/purchasing/dto/vendor-payment.dto.ts`
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts`

**Step 1: Update CreateVendorPaymentDto**

Replace the `paymentMethod` string field with `paymentMethodId` UUID field:

In `CreateVendorPaymentDto` (lines 38-45), change:

```typescript
  @ApiProperty({
    description: 'Payment method',
    enum: ['cash', 'bank_transfer', 'check', 'card'],
    example: 'bank_transfer'
  })
  @IsString()
  @IsIn(['cash', 'bank_transfer', 'check', 'card'])
  paymentMethod: string;
```

To:

```typescript
  @ApiProperty({ description: 'Payment method ID', example: 'uuid' })
  @IsUUID()
  paymentMethodId: string;
```

**Step 2: Update UpdateVendorPaymentDto**

Replace (lines 97-105):

```typescript
  @ApiPropertyOptional({
    description: 'Payment method',
    enum: ['cash', 'bank_transfer', 'check', 'card'],
    example: 'bank_transfer'
  })
  @IsOptional()
  @IsString()
  @IsIn(['cash', 'bank_transfer', 'check', 'card'])
  paymentMethod?: string;
```

To:

```typescript
  @ApiPropertyOptional({ description: 'Payment method ID', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
```

**Step 3: Update QueryVendorPaymentsDto**

Replace the `paymentMethod` filter field (lines 141-145):

```typescript
  @ApiPropertyOptional({ description: 'Payment method filter', example: 'bank_transfer' })
  @IsOptional()
  @IsString()
  @IsIn(['cash', 'bank_transfer', 'check', 'card'])
  paymentMethod?: string;
```

To:

```typescript
  @ApiPropertyOptional({ description: 'Payment method ID filter', example: 'uuid' })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string;
```

**Step 4: Update VendorPaymentService**

In `vendor-payment.service.ts`, make these changes:

1. In `findAll()` (around line 104), replace:
```typescript
    if (paymentMethod) {
      queryBuilder.andWhere('vendorPayment.paymentMethod = :paymentMethod', {
        paymentMethod,
      });
    }
```
With:
```typescript
    if (paymentMethodId) {
      queryBuilder.andWhere('vendorPayment.paymentMethodId = :paymentMethodId', {
        paymentMethodId,
      });
    }
```
Also update the destructuring at the top of `findAll()` to use `paymentMethodId` instead of `paymentMethod`.

Also add `leftJoinAndSelect('vendorPayment.paymentMethodEntity', 'paymentMethodEntity')` to the query builder chain.

2. In `findOne()` (line 185), add `'paymentMethodEntity'` to the relations array.

3. In `createForPurchaseOrder()` (line 441), change:
```typescript
      paymentMethod: 'bank_transfer', // Default payment method
```
To look up BANK payment method:
```typescript
      // Note: paymentMethodId will be set by the caller or default to null
```
Actually, we need to find the BANK payment method. Inject the PaymentMethodEntity repository. Add to constructor:
```typescript
    @InjectRepository(PaymentMethodEntity)
    private paymentMethodRepository: Repository<PaymentMethodEntity>,
```

And in `createForPurchaseOrder()`, replace the paymentMethod line:
```typescript
    // Find default payment method (BANK)
    const defaultPaymentMethod = await this.paymentMethodRepository.findOne({
      where: { code: 'BANK', isActive: true },
    });
```
And in the create call:
```typescript
      paymentMethodId: defaultPaymentMethod?.id || null,
```

4. In `findDeleted()` (around line 270), same rename from `paymentMethod` to `paymentMethodId`.
Add `leftJoinAndSelect('vendorPayment.paymentMethodEntity', 'paymentMethodEntity')` to the query.

**Step 5: Update PurchasingModule to import PaymentMethodEntity**

In the purchasing module file, add `PaymentMethodEntity` to TypeOrmModule.forFeature imports.

**Step 6: Commit**

```bash
git add backend/src/modules/purchasing/dto/vendor-payment.dto.ts backend/src/modules/purchasing/services/vendor-payment.service.ts
git commit -m "feat: update vendor payment DTO and service to use paymentMethodId FK"
```

---

### Task 9: Update Accounting Service — Dynamic Vendor Payment Posting

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts:350-410`

**Step 1: Update postVendorPaymentEntry to use dynamic mapping key**

Change the method (lines 350-410):

Replace lines 357-361 (validation section):
```typescript
    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_AP, 'Accounts Payable');
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_CASH, 'Cash');
```

With:
```typescript
    // Get account mappings
    const mappings = await this.accountMappingService.getMappings();

    // Validate required mappings exist
    this.validateMapping(mappings, MappingType.VENDOR_PAYMENT_AP, 'Accounts Payable');

    // Dynamic credit mapping based on payment method
    const paymentMethodCode = vendorPayment.paymentMethodEntity?.code || 'CASH';
    const creditMappingKey = `vendor_payment_${paymentMethodCode.toLowerCase()}`;
    this.validateMappingByKey(
      mappings,
      creditMappingKey,
      `vendor payment method "${paymentMethodCode}"`,
    );
```

Replace line 388 (the credit line):
```typescript
      {
        accountId: mappings[MappingType.VENDOR_PAYMENT_CASH],
        debitAmount: 0,
        creditAmount: Number(vendorPayment.amount),
        memo: 'Cash paid',
      },
```

With:
```typescript
      {
        accountId: mappings[creditMappingKey],
        debitAmount: 0,
        creditAmount: Number(vendorPayment.amount),
        memo: 'Cash paid',
      },
```

**Step 2: Commit**

```bash
git add backend/src/modules/accounting/services/accounting.service.ts
git commit -m "feat: use dynamic vendor_payment_{code} mapping in vendor payment posting"
```

---

### Task 10: Update Account Mapping Validation to Include Dynamic Payment Methods

**Files:**
- Modify: `backend/src/modules/accounting/services/account-mapping.service.ts:56-78`

**Step 1: Inject PaymentMethodEntity repository**

Add import and inject:

```typescript
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
```

Add to constructor:
```typescript
    @InjectRepository(PaymentMethodEntity)
    private readonly paymentMethodRepository: Repository<PaymentMethodEntity>,
```

**Step 2: Update validateMappings() to check dynamic payment method mappings**

Replace the `validateMappings()` method:

```typescript
  async validateMappings(): Promise<MappingValidationResponseDto> {
    this.logger.log('Validating account mappings');

    // Static enum-based required types
    const allRequiredTypes: string[] = Object.values(MappingType);

    // Add dynamic payment method mapping types
    const paymentMethods = await this.paymentMethodRepository.find({
      where: { isActive: true },
    });

    for (const pm of paymentMethods) {
      const code = pm.code.toLowerCase();
      allRequiredTypes.push(`payment_${code}`);
      allRequiredTypes.push(`vendor_payment_${code}`);
      if (pm.requiresSettlement) {
        allRequiredTypes.push(`payment_${code}_settlement`);
      }
    }

    const configuredMappings = await this.mappingRepository.find({
      where: { isActive: true },
    });

    // A mapping is configured if it exists AND has a non-null accountId
    const configuredTypes = configuredMappings
      .filter((m) => m.accountId !== null)
      .map((m) => m.mappingType);

    const missingTypes = allRequiredTypes.filter(
      (type) => !configuredTypes.includes(type),
    );

    const isValid = missingTypes.length === 0;

    return {
      isValid,
      missingMappings: missingTypes,
      configuredMappings: configuredTypes as MappingType[],
      totalRequired: allRequiredTypes.length,
      totalConfigured: configuredTypes.length,
    };
  }
```

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/account-mapping.service.ts
git commit -m "feat: validate dynamic payment method mappings in account mapping validation"
```

---

### Task 11: Update Backend Tests

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.spec.ts`

**Step 1: Update mock mappings and vendor payment tests**

In the spec file, find the mock account mappings (around lines 16-30) and update:

1. Remove `VENDOR_PAYMENT_CASH` from mock mappings
2. Add dynamic `vendor_payment_cash` key instead
3. Update the vendor payment mock object to include `paymentMethodEntity: { code: 'CASH' }`
4. Update assertions in vendor payment tests to expect `vendor_payment_cash` mapping key

Key changes to mock mappings:
```typescript
const mockMappings = {
  [MappingType.SALES_REVENUE]: 'revenue-id',
  [MappingType.SALES_AR]: 'ar-id',
  [MappingType.SALES_COGS]: 'cogs-id',
  [MappingType.SALES_INVENTORY]: 'sales-inv-id',
  [MappingType.PURCHASE_INVENTORY]: 'purchase-inv-id',
  [MappingType.PURCHASE_AP]: 'purchase-ap-id',
  [MappingType.PAYMENT_AR]: 'payment-ar-id',
  [MappingType.VENDOR_PAYMENT_AP]: 'vendor-ap-id',
  [MappingType.INVENTORY_ASSET]: 'inv-asset-id',
  [MappingType.INVENTORY_ADJUSTMENT_GAIN]: 'inv-gain-id',
  [MappingType.INVENTORY_ADJUSTMENT_LOSS]: 'inv-loss-id',
  // Dynamic payment method mappings
  payment_cash: 'payment-cash-id',
  vendor_payment_cash: 'vendor-cash-id',
};
```

Update mock vendor payment to include `paymentMethodEntity`:
```typescript
const mockVendorPayment = {
  // ... existing fields ...
  paymentMethodEntity: { code: 'CASH' },
};
```

**Step 2: Run tests to verify**

Run: `cd /home/blur/erp2/backend && npx jest --testPathPattern=accounting.service.spec --no-coverage 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/accounting.service.spec.ts
git commit -m "test: update accounting service tests for dynamic payment method mappings"
```

---

### Task 12: Update Frontend Account Mappings Page — Dynamic Payment Sections

**Files:**
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`

**Step 1: Import payment methods API and add state**

Add imports at top of file:
```typescript
import { paymentMethodsApi } from '@/services/paymentMethodsApi'
```

Add state for payment methods:
```typescript
const [paymentMethods, setPaymentMethods] = useState<Array<{ code: string; name: string; requiresSettlement: boolean }>>([])
```

Add useEffect to fetch payment methods:
```typescript
useEffect(() => {
  paymentMethodsApi.getActive().then((response: any) => {
    const methods = response.data?.data || response.data || []
    setPaymentMethods(methods)
  }).catch(() => {
    // Silently fail — payment methods are optional for display
  })
}, [])
```

**Step 2: Update MAPPING_TYPE_LABELS — remove payment-method-specific entries**

Remove from `MAPPING_TYPE_LABELS`:
- `[MappingType.PAYMENT_CASH]` entry (was "Cash (Customer Payments)")
- `[MappingType.VENDOR_PAYMENT_CASH]` entry (was "Cash (Vendor Payments)")

Keep:
- `[MappingType.PAYMENT_AR]` entry
- `[MappingType.VENDOR_PAYMENT_AP]` entry

**Step 3: Build dynamic payment sections**

Replace the `categories` array and the rendering logic. Instead of hardcoded categories, use:

```typescript
const staticCategories = ['Sales', 'Purchasing', 'Inventory']
```

For the Payment sections, build mapping info dynamically from payment methods:

```typescript
const getPaymentMappingTypes = () => {
  const items: Array<{ type: string; label: string; category: string; description: string }> = []

  // Global AR mapping
  items.push({
    type: MappingType.PAYMENT_AR,
    label: 'Accounts Receivable (Payments)',
    category: 'Payments',
    description: 'Asset account credited when customer payments are received',
  })

  // Dynamic per-method mappings
  for (const pm of paymentMethods) {
    const code = pm.code.toLowerCase()
    items.push({
      type: `payment_${code}`,
      label: `${pm.name} Payment Account`,
      category: 'Payments',
      description: `Account debited when ${pm.name} payments are received`,
    })
    if (pm.requiresSettlement) {
      items.push({
        type: `payment_${code}_settlement`,
        label: `${pm.name} Settlement Account`,
        category: 'Payments',
        description: `Bank account debited when ${pm.name} payments are settled`,
      })
    }
  }

  return items
}

const getVendorPaymentMappingTypes = () => {
  const items: Array<{ type: string; label: string; category: string; description: string }> = []

  // Global AP mapping
  items.push({
    type: MappingType.VENDOR_PAYMENT_AP,
    label: 'Accounts Payable (Vendor Payments)',
    category: 'Vendor Payments',
    description: 'Liability account debited when vendor payments are made',
  })

  // Dynamic per-method mappings
  for (const pm of paymentMethods) {
    const code = pm.code.toLowerCase()
    items.push({
      type: `vendor_payment_${code}`,
      label: `${pm.name} Vendor Payment Account`,
      category: 'Vendor Payments',
      description: `Account credited when ${pm.name} vendor payments are made`,
    })
  }

  return items
}
```

**Step 4: Update rendering to use combined mapping types**

Replace the `categories.map(...)` rendering block with a unified approach that uses static categories for Sales/Purchasing/Inventory and dynamic builders for Payments/Vendor Payments:

```typescript
const allSections = [
  ...staticCategories.map(category => ({
    category,
    items: getAllMappingTypes().filter(m => m.category === category),
  })),
  { category: 'Payments', items: getPaymentMappingTypes() },
  { category: 'Vendor Payments', items: getVendorPaymentMappingTypes() },
]
```

Then render:
```typescript
{allSections.map(({ category, items }) =>
  items.map((mappingInfo, index) => {
    const mapping = mappings.find(m => m.mappingType === mappingInfo.type)
    const isFirstInCategory = index === 0
    // ... same row rendering as before
  })
)}
```

**Step 5: Remove the old "Dynamic" mappings section**

Remove the `dynamicMappings` variable and the `{dynamicMappings.map(...)}` block entirely (lines 502-592). All payment mappings are now shown in their proper categories.

Also remove `const knownMappingTypes = new Set(Object.values(MappingType))` and the `dynamicMappings` filter (lines 209-210).

**Step 6: Commit**

```bash
git add frontend/src/pages/accounting/AccountMappingsPage.tsx
git commit -m "feat: render payment account mappings dynamically from payment methods"
```

---

### Task 13: Update Frontend VendorPayment Type and Pages

**Files:**
- Modify: `frontend/src/types/index.ts:416-434`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` (filter references)

**Step 1: Update VendorPayment interface**

Replace:
```typescript
export interface VendorPayment {
  id: string;
  paymentNumber: string;
  supplier: Supplier;
  supplierId: string;
  purchaseOrder?: PurchaseOrder;
  purchaseOrderId?: string;
  amount: number;
  paymentDate: Date | string;
  paymentMethod: 'cash' | 'bank_transfer' | 'check' | 'card';
  referenceNumber?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}
```

With:
```typescript
export interface VendorPayment {
  id: string;
  paymentNumber: string;
  supplier: Supplier;
  supplierId: string;
  purchaseOrder?: PurchaseOrder;
  purchaseOrderId?: string;
  amount: number;
  paymentDate: Date | string;
  paymentMethodId?: string;
  paymentMethodEntity?: PaymentMethodConfig;
  referenceNumber?: string;
  notes?: string;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date | string;
  updatedAt: Date | string;
  deletedAt?: Date | string;
  createdBy?: string;
  updatedBy?: string;
}
```

**Step 2: Update VendorPaymentsPage filter**

In `VendorPaymentsPage.tsx`, update the payment method filter. The `paymentMethod` filter in state and the dropdown should now use payment method IDs instead of hardcoded strings. Fetch active payment methods and populate the dropdown:

Change the filter state type from `paymentMethod: string` to `paymentMethodId: string`.

Update the filter dropdown to show payment method names fetched from API.

Update anywhere the page displays `paymentMethod` to show `paymentMethodEntity?.name` instead.

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "feat: update VendorPayment type and page to use paymentMethodId"
```

---

### Task 14: Create vendor_payment_{code} Mappings for Existing Payment Methods

**Files:** None (database operation)

**Step 1: Run SQL to create missing vendor payment mappings**

Existing payment methods have `payment_{code}` mappings but not `vendor_payment_{code}` mappings. Create them:

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "
  INSERT INTO account_mappings (id, \"mappingKey\", \"accountId\", description, \"isActive\", \"createdAt\", \"updatedAt\")
  SELECT
    gen_random_uuid(),
    'vendor_payment_' || LOWER(pm.code),
    am.\"accountId\",
    pm.name || ' vendor payment account',
    true,
    NOW(),
    NOW()
  FROM payment_methods pm
  LEFT JOIN account_mappings am ON am.\"mappingKey\" = 'payment_' || LOWER(pm.code)
  WHERE NOT EXISTS (
    SELECT 1 FROM account_mappings am2
    WHERE am2.\"mappingKey\" = 'vendor_payment_' || LOWER(pm.code)
  )
  AND pm.\"deletedAt\" IS NULL;
"
```

**Step 2: Verify mappings**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "SELECT \"mappingKey\", \"accountId\", description FROM account_mappings WHERE \"mappingKey\" LIKE 'vendor_payment_%' OR \"mappingKey\" LIKE 'payment_%' ORDER BY \"mappingKey\";"
```

**Step 3: No code commit needed** — this is a one-time data operation.

---

### Task 15: Rebuild and Verify

**Step 1: Rebuild backend**

```bash
docker compose build backend && docker compose up -d backend
```

**Step 2: Check backend logs for errors**

```bash
docker compose logs backend --tail=30
```

**Step 3: Rebuild frontend**

```bash
docker compose build frontend && docker compose up -d frontend
```

**Step 4: Verify Account Mappings page**

Open http://localhost:3000/accounting/account-mappings and verify:
- Sales, Purchasing, Inventory categories show as before
- Payments section shows: payment_ar (global), then per-method entries (Cash, Bank, TnG, etc.)
- Vendor Payments section shows: vendor_payment_ap (global), then per-method entries
- No "Dynamic" section exists
- All mappings show configured/unconfigured status correctly

**Step 5: Verify payment method CRUD propagation**

1. Create a new payment method (e.g., "BOOST") and verify new mapping rows appear
2. Edit the payment method name and verify mapping descriptions update
3. Delete and permanently delete a test payment method and verify mappings are removed

**Step 6: Final commit with all remaining files**

```bash
git add -A && git status
git commit -m "feat: complete dynamic payment account mappings implementation"
```
