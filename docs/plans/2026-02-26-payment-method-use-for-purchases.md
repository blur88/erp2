# Payment Method: useForPurchases Flag Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `useForPurchases` boolean flag to payment methods so only flagged methods generate vendor payment account mappings and appear in purchase order payment dropdowns.

**Architecture:** Add a single `useForPurchases` column (default `true`) to `payment_methods` table. The service respects this flag when creating/syncing `vendor_payment_{code}` account mappings. The `GET /active` endpoint accepts an optional `?forPurchases=true` query param. Frontend filters the Vendor Payment Mappings section and the VendorPaymentDialog dropdown.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL migrations, React 18, Material-UI v7, TypeScript

---

### Task 1: Database migration — add `use_for_purchases` column

**Files:**
- Create: `backend/src/database/migrations/1772000000000-AddUseForPurchasesToPaymentMethods.ts`

**Step 1: Write the migration**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUseForPurchasesToPaymentMethods1772000000000 implements MigrationInterface {
  name = 'AddUseForPurchasesToPaymentMethods1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_methods"
      ADD COLUMN "useForPurchases" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_methods"
      DROP COLUMN "useForPurchases"
    `);
  }
}
```

**Step 2: Run the migration**

```bash
cd /home/blur/erp2/backend
npm run migration:run
```

Expected: `AddUseForPurchasesToPaymentMethods1772000000000 has been executed successfully.`

**Step 3: Verify the column exists**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "\d payment_methods" | grep useForPurchases
```

Expected: a row showing `useForPurchases | boolean | not null | true`

**Step 4: Commit**

```bash
git add backend/src/database/migrations/1772000000000-AddUseForPurchasesToPaymentMethods.ts
git commit -m "feat: add useForPurchases migration for payment_methods"
```

---

### Task 2: Backend entity — add `useForPurchases` field

**Files:**
- Modify: `backend/src/database/entities/payment-method.entity.ts`

**Step 1: Write the failing test**

Open `backend/src/modules/settings/services/payment-method.service.spec.ts`. Find the `describe('create')` block. Add this test:

```typescript
it('should NOT create vendor_payment mapping when useForPurchases is false', async () => {
  const dto = {
    code: 'TESTPM',
    name: 'Test PM',
    requiresSettlement: false,
    useForPurchases: false,
  };
  const savedPm = { id: 'pm-1', ...dto, sortOrder: 0, isActive: true, deletedAt: null };

  (paymentMethodRepository.findOne as jest.Mock).mockResolvedValueOnce(null); // no existing
  (paymentMethodRepository.create as jest.Mock).mockReturnValue(savedPm);
  (paymentMethodRepository.save as jest.Mock).mockResolvedValue(savedPm);
  (accountMappingRepository.findOne as jest.Mock).mockResolvedValue(null); // no existing mapping
  (accountRepository.findOne as jest.Mock).mockResolvedValue(null);
  (accountMappingRepository.create as jest.Mock).mockReturnValue({});
  (accountMappingRepository.save as jest.Mock).mockResolvedValue({});

  await service.create(dto as any);

  const savedCalls = (accountMappingRepository.save as jest.Mock).mock.calls;
  const vendorMappingSaved = savedCalls.some(
    ([arg]: any) => arg.mappingType === 'vendor_payment_testpm',
  );
  expect(vendorMappingSaved).toBe(false);
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/blur/erp2/backend
npm run test -- --testPathPattern="payment-method.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL (the service currently always creates vendor mappings regardless of flag)

**Step 3: Add the field to the entity**

In `backend/src/database/entities/payment-method.entity.ts`, add after the `sortOrder` column:

```typescript
@Column({
  type: 'boolean',
  default: true,
  comment: 'Whether this method is used for purchase order payments',
})
@IsBoolean()
useForPurchases: boolean;
```

Also add `IsBoolean` to the imports from `class-validator` if not already present (it already is).

**Step 4: Run test again**

Still fails — we haven't changed the service yet. This is expected.

**Step 5: Commit entity change**

```bash
git add backend/src/database/entities/payment-method.entity.ts
git commit -m "feat: add useForPurchases field to PaymentMethodEntity"
```

---

### Task 3: Backend DTOs — add `useForPurchases` to request/response DTOs

**Files:**
- Modify: `backend/src/modules/settings/dto/payment-method.dto.ts`

**Step 1: Update `CreatePaymentMethodDto`**

Add after the `requiresSettlement` field:

```typescript
@ApiPropertyOptional({ description: 'Whether this method is used for purchase orders', default: true })
@IsOptional()
@IsBoolean()
useForPurchases?: boolean;
```

**Step 2: Update `PaymentMethodResponseDto`**

Add:

```typescript
@ApiProperty() useForPurchases: boolean;
```

**Step 3: Update `QueryPaymentMethodsDto`**

Add:

```typescript
@ApiPropertyOptional({ description: 'Filter by useForPurchases' })
@IsOptional()
@Type(() => Boolean)
@IsBoolean()
forPurchases?: boolean;
```

**Step 4: No test needed for DTOs** — compile-time only. Verify no TypeScript errors:

```bash
cd /home/blur/erp2/backend
npm run build 2>&1 | grep -i error | head -20
```

Expected: no errors (or pre-existing unrelated ones)

**Step 5: Commit**

```bash
git add backend/src/modules/settings/dto/payment-method.dto.ts
git commit -m "feat: add useForPurchases to payment method DTOs"
```

---

### Task 4: Backend service — respect `useForPurchases` in mapping logic

**Files:**
- Modify: `backend/src/modules/settings/services/payment-method.service.ts`

**Step 1: Update `createAccountMappings` to check `useForPurchases`**

Find the `createAccountMappings` method (line ~222). The current code at line 271 unconditionally creates `vendor_payment_*`. Change the vendor mapping block:

Replace:
```typescript
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
```

With:
```typescript
if (pm.useForPurchases !== false) {
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

**Step 2: Update `syncAccountMappings` to handle `useForPurchases` toggle**

In the `syncAccountMappings` method (line ~293), after the `requiresSettlement` toggle block (around line 360), add:

```typescript
// Handle useForPurchases toggle
if (newPm.useForPurchases && !oldPm.useForPurchases) {
  // toggled ON: find existing mapping and activate it, or create fresh
  const vendorKey = `vendor_payment_${newCode}`;
  const existing = await this.accountMappingRepository.findOne({
    where: { mappingType: vendorKey },
  });
  if (existing) {
    existing.isActive = true;
    await this.accountMappingRepository.save(existing);
  } else {
    const account = await this.findMatchingAccount(newPm);
    const mapping = this.accountMappingRepository.create({
      mappingType: vendorKey,
      accountId: account ? account.id : null,
      description: `${newPm.name} vendor payment account`,
      isActive: true,
    });
    await this.accountMappingRepository.save(mapping);
  }
} else if (!newPm.useForPurchases && oldPm.useForPurchases) {
  // toggled OFF: deactivate mapping (preserve GL assignment)
  const vendorKey = `vendor_payment_${newCode}`;
  const existing = await this.accountMappingRepository.findOne({
    where: { mappingType: vendorKey },
  });
  if (existing) {
    existing.isActive = false;
    await this.accountMappingRepository.save(existing);
  }
}
```

**Step 3: Update `toResponseDto` to include `useForPurchases`**

Find the `toResponseDto` method (line ~398). Add:

```typescript
useForPurchases: pm.useForPurchases,
```

**Step 4: Update `getActiveList` to support `forPurchases` filter**

The current `getActiveList` takes no params. Update it to accept an optional filter:

Replace:
```typescript
async getActiveList(): Promise<PaymentMethodResponseDto[]> {
  const methods = await this.paymentMethodRepository.find({
    where: { isActive: true },
    order: { sortOrder: 'ASC', name: 'ASC' },
  });

  return methods
    .filter((pm) => !pm.deletedAt)
    .map((pm) => this.toResponseDto(pm));
}
```

With:
```typescript
async getActiveList(forPurchases?: boolean): Promise<PaymentMethodResponseDto[]> {
  const where: any = { isActive: true };
  if (forPurchases === true) {
    where.useForPurchases = true;
  }

  const methods = await this.paymentMethodRepository.find({
    where,
    order: { sortOrder: 'ASC', name: 'ASC' },
  });

  return methods
    .filter((pm) => !pm.deletedAt)
    .map((pm) => this.toResponseDto(pm));
}
```

**Step 5: Run tests**

```bash
cd /home/blur/erp2/backend
npm run test -- --testPathPattern="payment-method.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: the new test from Task 2 now passes. All other tests still pass.

**Step 6: Commit**

```bash
git add backend/src/modules/settings/services/payment-method.service.ts
git commit -m "feat: respect useForPurchases flag in payment method mapping logic"
```

---

### Task 5: Backend controller — expose `forPurchases` query param

**Files:**
- Modify: `backend/src/modules/settings/controllers/payment-method.controller.ts`

**Step 1: Update the `getActiveList` endpoint**

Find the `getActiveList` method (line ~38). Update it to accept and forward the `forPurchases` param:

Replace:
```typescript
@Get('active')
@ApiOperation({ summary: 'Get all active payment methods (for dropdowns)' })
@ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
async getActiveList(): Promise<PaymentMethodResponseDto[]> {
  return this.paymentMethodService.getActiveList();
}
```

With:
```typescript
@Get('active')
@ApiOperation({ summary: 'Get all active payment methods (for dropdowns)' })
@ApiResponse({ status: 200, type: [PaymentMethodResponseDto] })
async getActiveList(
  @Query('forPurchases') forPurchasesRaw?: string,
): Promise<PaymentMethodResponseDto[]> {
  const forPurchases = forPurchasesRaw === 'true' ? true : undefined;
  return this.paymentMethodService.getActiveList(forPurchases);
}
```

**Step 2: Verify build**

```bash
cd /home/blur/erp2/backend
npm run build 2>&1 | grep -i error | head -10
```

Expected: no new errors

**Step 3: Commit**

```bash
git add backend/src/modules/settings/controllers/payment-method.controller.ts
git commit -m "feat: add forPurchases query param to GET /active endpoint"
```

---

### Task 6: Frontend types — add `useForPurchases` to `PaymentMethodConfig`

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Update `PaymentMethodConfig` interface**

Find the `PaymentMethodConfig` interface (around line 437). Add `useForPurchases`:

```typescript
export interface PaymentMethodConfig {
  id: string;
  code: string;
  name: string;
  requiresSettlement: boolean;
  useForPurchases: boolean;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no new errors (the field is additive)

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add useForPurchases to PaymentMethodConfig type"
```

---

### Task 7: Frontend form dialog — add `useForPurchases` toggle

**Files:**
- Modify: `frontend/src/components/settings/PaymentMethodFormDialog.tsx`

**Step 1: Add state and populate from `initialData`**

In the state declarations (around line 32), add:
```typescript
const [useForPurchases, setUseForPurchases] = useState(true);
```

In the `useEffect` that populates from `initialData` (around line 36), add:
```typescript
setUseForPurchases(initialData?.useForPurchases ?? true);
```

**Step 2: Include in `handleSubmit`**

In `handleSubmit` (around line 50), add `useForPurchases` to the payload:
```typescript
await onSubmit({
  code: code.trim().toUpperCase(),
  name: name.trim(),
  requiresSettlement,
  useForPurchases,
  sortOrder,
});
```

**Step 3: Add the toggle to the form**

After the `Requires Settlement` `FormControlLabel` (around line 93), add:

```tsx
<FormControlLabel
  control={
    <Switch
      checked={useForPurchases}
      onChange={(e) => setUseForPurchases(e.target.checked)}
    />
  }
  label="Use for Purchase Orders"
/>
```

**Step 4: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no errors

**Step 5: Commit**

```bash
git add frontend/src/components/settings/PaymentMethodFormDialog.tsx
git commit -m "feat: add useForPurchases toggle to PaymentMethodFormDialog"
```

---

### Task 8: Frontend list page — add "For Purchases" column

**Files:**
- Modify: `frontend/src/pages/settings/PaymentMethodsPage.tsx`

**Step 1: Add column header**

Find the `<TableHead>` section (around line 119). Add a new `<TableCell>` after "Requires Settlement":

```tsx
<TableCell>For Purchases</TableCell>
```

**Step 2: Add column data**

Find the `<TableBody>` row mapping (around line 130). Add a new `<TableCell>` after the `requiresSettlement` cell:

```tsx
<TableCell>
  <Chip
    size="small"
    color={m.useForPurchases ? 'primary' : 'default'}
    label={m.useForPurchases ? 'Yes' : 'No'}
  />
</TableCell>
```

**Step 3: Update the empty-row colspan**

Find `colSpan={6}` (line ~168) and change to `colSpan={7}`.

**Step 4: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no errors

**Step 5: Commit**

```bash
git add frontend/src/pages/settings/PaymentMethodsPage.tsx
git commit -m "feat: add For Purchases column to PaymentMethodsPage"
```

---

### Task 9: Frontend Account Mappings — filter vendor payment methods

**Files:**
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`

**Step 1: Separate state for purchase-filtered payment methods**

The page currently has one `paymentMethods` state. The Vendor Payment Mappings section should only use methods where `useForPurchases === true`.

Find the `useEffect` that calls `paymentMethodsApi.getActive()` (around line 150). Change the call to fetch with the `forPurchases` param:

The existing fetch already gets all active methods (for the Payments section). We need a second fetch for vendor-only, or we can filter client-side since we already have all active methods.

The simplest approach: filter client-side from the already-fetched list. Find `getVendorPaymentMappingTypes` (around line 251):

```typescript
const getVendorPaymentMappingTypes = (): Array<...> => {
  const items: Array<...> = [
    {
      type: MappingType.VENDOR_PAYMENT_AP,
      // ...
    },
  ]

  for (const pm of paymentMethods) {
    // ADD THIS FILTER:
    if (!pm.useForPurchases) continue;
    // ...existing push logic
  }

  return items
}
```

**Step 2: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no errors

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/AccountMappingsPage.tsx
git commit -m "feat: filter vendor payment mappings by useForPurchases flag"
```

---

### Task 10: Frontend VendorPaymentDialog — use filtered active endpoint

**Files:**
- Modify: `frontend/src/services/paymentMethodsApi.ts`
- Modify: `frontend/src/components/purchasing/VendorPaymentDialog.tsx`

**Step 1: Add `getActiveForPurchases` to the API service**

In `frontend/src/services/paymentMethodsApi.ts`, add after `getActive`:

```typescript
getActiveForPurchases: (): Promise<PaymentMethodConfig[]> =>
  ApiService.get(`${BASE_URL}/active`, { params: { forPurchases: true } }),
```

**Step 2: Update `VendorPaymentDialog` to use the filtered endpoint**

In `frontend/src/components/purchasing/VendorPaymentDialog.tsx`, find the `useEffect` that calls `paymentMethodsApi.getActive()` (around line 59):

Replace:
```typescript
paymentMethodsApi.getActive().then((methods: any) => {
```

With:
```typescript
paymentMethodsApi.getActiveForPurchases().then((methods: any) => {
```

**Step 3: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i error | head -20
```

Expected: no errors

**Step 4: Commit**

```bash
git add frontend/src/services/paymentMethodsApi.ts frontend/src/components/purchasing/VendorPaymentDialog.tsx
git commit -m "feat: use forPurchases-filtered endpoint in VendorPaymentDialog"
```

---

### Task 11: Add backend unit tests for `useForPurchases` toggle in `syncAccountMappings`

**Files:**
- Modify: `backend/src/modules/settings/services/payment-method.service.spec.ts`

**Step 1: Write two failing tests**

Find the `describe('update')` or `describe('syncAccountMappings')` block. Add:

```typescript
it('should deactivate vendor_payment mapping when useForPurchases toggled OFF', async () => {
  const id = 'pm-1';
  const oldPm: any = {
    id, code: 'BANK', name: 'Bank', requiresSettlement: false, useForPurchases: true, deletedAt: null, sortOrder: 0, isActive: true,
  };
  const dto = { useForPurchases: false };

  (paymentMethodRepository.findOne as jest.Mock).mockResolvedValue(oldPm);
  (paymentMethodRepository.save as jest.Mock).mockResolvedValue({ ...oldPm, useForPurchases: false });

  const existingVendorMapping = { mappingType: 'vendor_payment_bank', isActive: true };
  (accountMappingRepository.findOne as jest.Mock).mockResolvedValue(existingVendorMapping);
  (accountMappingRepository.save as jest.Mock).mockResolvedValue({ ...existingVendorMapping, isActive: false });

  await service.update(id, dto as any);

  const savedCalls = (accountMappingRepository.save as jest.Mock).mock.calls;
  const deactivated = savedCalls.some(([arg]: any) => arg.mappingType === 'vendor_payment_bank' && arg.isActive === false);
  expect(deactivated).toBe(true);
});

it('should reactivate vendor_payment mapping when useForPurchases toggled ON', async () => {
  const id = 'pm-1';
  const oldPm: any = {
    id, code: 'BANK', name: 'Bank', requiresSettlement: false, useForPurchases: false, deletedAt: null, sortOrder: 0, isActive: true,
  };
  const dto = { useForPurchases: true };

  (paymentMethodRepository.findOne as jest.Mock).mockResolvedValue(oldPm);
  (paymentMethodRepository.save as jest.Mock).mockResolvedValue({ ...oldPm, useForPurchases: true });

  const existingVendorMapping = { mappingType: 'vendor_payment_bank', isActive: false };
  (accountMappingRepository.findOne as jest.Mock).mockResolvedValue(existingVendorMapping);
  (accountMappingRepository.save as jest.Mock).mockResolvedValue({ ...existingVendorMapping, isActive: true });

  await service.update(id, dto as any);

  const savedCalls = (accountMappingRepository.save as jest.Mock).mock.calls;
  const reactivated = savedCalls.some(([arg]: any) => arg.mappingType === 'vendor_payment_bank' && arg.isActive === true);
  expect(reactivated).toBe(true);
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /home/blur/erp2/backend
npm run test -- --testPathPattern="payment-method.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: 2 new failures (service doesn't have toggle logic yet — but wait, we added it in Task 4). If Task 4 was done correctly, these should already pass.

**Step 3: Run full test suite**

```bash
cd /home/blur/erp2/backend
npm run test -- --no-coverage 2>&1 | tail -10
```

Expected: all tests pass

**Step 4: Commit**

```bash
git add backend/src/modules/settings/services/payment-method.service.spec.ts
git commit -m "test: add useForPurchases toggle tests for payment method service"
```

---

### Task 12: Manual smoke test

**Verify end-to-end flow in the running app.**

**Step 1: Rebuild and start Docker**

```bash
cd /home/blur/erp2
docker compose build backend frontend && docker compose up -d
```

**Step 2: Login and navigate to Settings → Payment Methods**

- Open http://localhost:3000/settings/payment-methods
- Verify new "For Purchases" column appears for all existing methods (should all show "Yes" chip)

**Step 3: Edit a payment method (e.g., SHOPEE) and toggle "Use for Purchase Orders" OFF**

- Click edit on SHOPEE
- Toggle "Use for Purchase Orders" to OFF
- Save

**Step 4: Verify account mapping deactivated**

- Navigate to Accounting → Account Mappings
- Scroll to "Vendor Payments" section
- Verify `Shopee Pay Vendor Payment Account` no longer appears

**Step 5: Verify dropdown filtered**

- Navigate to Purchasing → Purchase Orders
- Open a purchase order and click "Record Payment"
- Verify SHOPEE is NOT in the payment method dropdown
- Verify CASH, BANK etc. (that have `useForPurchases: true`) ARE in the dropdown

**Step 6: Toggle SHOPEE back ON and verify mappings reappear**

---

### Task 13: Final commit summary

```bash
cd /home/blur/erp2
git log --oneline -10
```

Should show all tasks committed cleanly. All done.
