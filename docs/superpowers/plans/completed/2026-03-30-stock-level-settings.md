# Stock Level Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all hardcoded `10` low-stock thresholds with a configurable `lowStockThreshold` field stored in `regional_settings`, exposed via a new Settings page.

**Architecture:** Add one column to `RegionalSettings` entity; update DTOs and `SettingsService`; inject the value into the four backend services that currently hardcode `10`; add a new `StockLevelSettingsPage` that reads/writes via the existing `/settings/regional` RTK Query hooks; update `exportUtils.ts` and `ProductDetailsTab.tsx` to use the dynamic value.

**Tech Stack:** NestJS 11 (TypeORM, class-validator), React 19, Material UI v7, react-hook-form + yup, RTK Query, Vitest (frontend tests), Jest (backend tests)

---

## File Map

**Create:**
- `frontend/src/pages/settings/StockLevelSettingsPage.tsx` — new settings page

**Modify (backend):**
- `backend/src/database/entities/regional-settings.entity.ts` — add `lowStockThreshold` column
- `backend/src/modules/settings/dto/regional-settings-response.dto.ts` — add `lowStockThreshold` field
- `backend/src/modules/settings/dto/update-regional-settings.dto.ts` — add `lowStockThreshold` field
- `backend/src/modules/inventory/services/inventory-analytics.service.ts` — replace 4 hardcoded `10`s
- `backend/src/modules/inventory/services/product.service.ts` — replace 5 hardcoded `10`s
- `backend/src/modules/inventory/services/integration.service.ts` — replace 2 hardcoded `10`s
- `backend/src/modules/sales/services/inventory-integration.service.ts` — replace 1 hardcoded `10`

**Modify (frontend):**
- `frontend/src/store/api/settingsApi.ts` — add `lowStockThreshold` to `RegionalSettings` and `UpdateRegionalSettingsDto` interfaces
- `frontend/src/pages/settings/StockLevelSettingsPage.tsx` — (created above)
- `frontend/src/router.tsx` — add `/settings/stock-levels` route
- `frontend/src/config/navigation.tsx` — add "Stock Levels" nav entry
- `frontend/src/utils/exportUtils.ts` — pass threshold into export functions
- `frontend/src/components/inventory/ProductDetailsTab.tsx` — use threshold from RTK Query

**Test:**
- `backend/src/modules/settings/settings.controller.spec.ts` — add `lowStockThreshold` test
- `frontend/src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx` — new frontend test

---

## Task 1: Add `lowStockThreshold` to backend entity, DTOs, and service

**Files:**
- Modify: `backend/src/database/entities/regional-settings.entity.ts`
- Modify: `backend/src/modules/settings/dto/regional-settings-response.dto.ts`
- Modify: `backend/src/modules/settings/dto/update-regional-settings.dto.ts`

- [ ] **Step 1: Add the column to the entity**

Open `backend/src/database/entities/regional-settings.entity.ts` and add the new column after `timezone`:

```ts
import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('regional_settings')
export class RegionalSettings extends BaseEntity {
  @Column({ type: 'varchar', length: 10, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  costingMethod: string;

  @Column({ type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
  dateFormat: string;

  @Column({ type: 'varchar', length: 10, default: '24h' })
  timeFormat: string;

  @Column({ type: 'varchar', length: 20, default: '1,234.56' })
  numberFormat: string;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Kuala_Lumpur' })
  timezone: string;

  @Column({ type: 'int', default: 10 })
  lowStockThreshold: number;
}
```

- [ ] **Step 2: Add `lowStockThreshold` to the response DTO**

Open `backend/src/modules/settings/dto/regional-settings-response.dto.ts` and add before the `createdAt` field:

```ts
  @ApiProperty({ description: 'Low stock threshold quantity', example: 10 })
  @Expose()
  lowStockThreshold: number;
```

- [ ] **Step 3: Add `lowStockThreshold` to the update DTO**

Open `backend/src/modules/settings/dto/update-regional-settings.dto.ts`. Add these imports at the top (merge with existing import line):

```ts
import { IsString, IsOptional, IsIn, MaxLength, IsInt, Min } from 'class-validator';
```

Then add the new field at the end of the class, before the closing `}`:

```ts
  @ApiProperty({ description: 'Low stock threshold quantity', example: 10 })
  @IsInt()
  @IsOptional()
  @Min(0)
  lowStockThreshold?: number;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Generate migration**

```bash
cd backend && npm run migration:generate --name=AddLowStockThresholdToRegionalSettings
```

Expected: a new file in `backend/src/database/migrations/` with `AddLowStockThresholdToRegionalSettings` in the name, containing `ALTER TABLE "regional_settings" ADD "lowStockThreshold" integer NOT NULL DEFAULT '10'`

- [ ] **Step 6: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected: `Migration AddLowStockThresholdToRegionalSettings has been executed successfully.`

- [ ] **Step 7: Commit**

```bash
git add backend/src/database/entities/regional-settings.entity.ts \
        backend/src/modules/settings/dto/regional-settings-response.dto.ts \
        backend/src/modules/settings/dto/update-regional-settings.dto.ts \
        backend/src/database/migrations/
git commit -m "feat(settings): add lowStockThreshold to regional settings entity and DTOs"
```

---

## Task 2: Add backend test for `lowStockThreshold`

**Files:**
- Modify: `backend/src/modules/settings/settings.controller.spec.ts`

- [ ] **Step 1: Write the failing test**

Open `backend/src/modules/settings/settings.controller.spec.ts` and add a new describe block at the end:

```ts
describe('SettingsController lowStockThreshold', () => {
  it('UpdateRegionalSettingsDto accepts lowStockThreshold as optional integer >= 0', () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.lowStockThreshold = 5;
    expect(dto.lowStockThreshold).toBe(5);
  });

  it('RegionalSettingsResponseDto exposes lowStockThreshold', () => {
    const dto = new RegionalSettingsResponseDto();
    (dto as any).lowStockThreshold = 10;
    expect(dto.lowStockThreshold).toBe(10);
  });
});
```

Add the missing imports at the top of the file:

```ts
import { UpdateRegionalSettingsDto } from './dto/update-regional-settings.dto';
import { RegionalSettingsResponseDto } from './dto/regional-settings-response.dto';
```

- [ ] **Step 2: Run the test to verify it fails first**

```bash
cd backend && npx jest src/modules/settings/settings.controller.spec.ts --no-coverage
```

Expected: FAIL — `UpdateRegionalSettingsDto` and `RegionalSettingsResponseDto` don't have `lowStockThreshold` yet (well, after Task 1 they do — run to confirm they now pass).

- [ ] **Step 3: Run the test to verify it passes**

```bash
cd backend && npx jest src/modules/settings/settings.controller.spec.ts --no-coverage
```

Expected: PASS — 4 tests total

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.controller.spec.ts
git commit -m "test(settings): add lowStockThreshold DTO tests"
```

---

## Task 3: Replace hardcoded `10` in `inventory-analytics.service.ts`

**Files:**
- Modify: `backend/src/modules/inventory/services/inventory-analytics.service.ts`

The `InventoryAnalyticsService` does not currently inject `SettingsService`. We need to add it.

- [ ] **Step 1: Add `SettingsService` import and inject it**

At the top of `backend/src/modules/inventory/services/inventory-analytics.service.ts`, add to the imports:

```ts
import { SettingsService } from '../../settings/settings.service';
```

In the constructor (around line 120), add `SettingsService` injection after the existing repositories:

```ts
constructor(
  @InjectRepository(Product)
  private readonly productRepository: Repository<Product>,
  @InjectRepository(Category)
  private readonly categoryRepository: Repository<Category>,
  @InjectRepository(StockMovement)
  private readonly stockMovementRepository: Repository<StockMovement>,
  @InjectRepository(PurchaseCostHistory)
  private readonly purchaseCostHistoryRepository: Repository<PurchaseCostHistory>,
  @InjectRepository(PriceListItemEntity)
  private readonly priceListItemRepository: Repository<PriceListItemEntity>,
  @InjectRepository(PurchaseOrderItem)
  private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
  private readonly settingsService: SettingsService,
) {}
```

- [ ] **Step 2: Add a private helper to get the threshold**

Add this private method to the class (place it just before `applyProductFilters`):

```ts
private async getLowStockThreshold(): Promise<number> {
  const settings = await this.settingsService.getRegionalSettings();
  return settings.lowStockThreshold ?? 10;
}
```

- [ ] **Step 3: Fix `getInventorySnapshotMetrics` (line ~736)**

At the top of `getInventorySnapshotMetrics`, add:
```ts
const threshold = await this.getLowStockThreshold();
```

Then change only the `lowStockCount` select line from:
```ts
'SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= 10 THEN 1 ELSE 0 END) as "lowStockCount"',
```
To:
```ts
`SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= ${threshold} THEN 1 ELSE 0 END) as "lowStockCount"`,
```

- [ ] **Step 4: Fix `getLowStockAlerts` (line ~845)**

Change:
```ts
.andWhere('product.stockQuantity <= :threshold', { threshold: 10 });
```
To:
```ts
const threshold = await this.getLowStockThreshold();
```
Add this line before the `.andWhere` call, then change the hardcoded value:
```ts
.andWhere('product.stockQuantity <= :threshold', { threshold });
```

- [ ] **Step 5: Fix `applyProductFilters` (lines ~934, ~938)**

Change:
```ts
if (filters.stockStatus === 'in_stock') {
  qb.andWhere(`${productAlias}.stockQuantity > :inStockThreshold`, { inStockThreshold: 10 });
} else if (filters.stockStatus === 'low_stock') {
  qb.andWhere(
    `${productAlias}.stockQuantity > :lowStockMin AND ${productAlias}.stockQuantity <= :lowStockMax`,
    { lowStockMin: 0, lowStockMax: 10 },
  );
}
```

`applyProductFilters` is synchronous and called from async methods. Change the signature to accept threshold as a parameter:

```ts
private applyProductFilters(
  qb: import('typeorm').SelectQueryBuilder<any>,
  filters: InventoryDashboardFilters,
  productAlias: string = 'product',
  lowStockThreshold: number = 10,
): void {
  if (filters.categoryId) {
    qb.andWhere(`${productAlias}.categoryId = :categoryId`, { categoryId: filters.categoryId });
  }
  if (filters.productIds !== undefined) {
    if (filters.productIds.length === 0) {
      qb.andWhere('1 = 0');
    } else {
      qb.andWhere(`${productAlias}.id IN (:...productIds)`, { productIds: filters.productIds });
    }
  }
  if (filters.stockStatus === 'in_stock') {
    qb.andWhere(`${productAlias}.stockQuantity > :inStockThreshold`, { inStockThreshold: lowStockThreshold });
  } else if (filters.stockStatus === 'low_stock') {
    qb.andWhere(
      `${productAlias}.stockQuantity > :lowStockMin AND ${productAlias}.stockQuantity <= :lowStockMax`,
      { lowStockMin: 0, lowStockMax: lowStockThreshold },
    );
  } else if (filters.stockStatus === 'out_of_stock') {
    qb.andWhere(`${productAlias}.stockQuantity <= :outOfStockThreshold`, { outOfStockThreshold: 0 });
  }
}
```

Then update every caller of `applyProductFilters` inside this service to pass `threshold`. Find all callers:
```bash
grep -n "applyProductFilters" backend/src/modules/inventory/services/inventory-analytics.service.ts
```

For each async method that calls `applyProductFilters`, add `const threshold = await this.getLowStockThreshold();` at the top and pass it as the fourth argument: `this.applyProductFilters(qb, filters, 'product', threshold)`.

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/inventory/services/inventory-analytics.service.ts
git commit -m "feat(inventory): use configurable lowStockThreshold in analytics service"
```

---

## Task 4: Replace hardcoded `10` in `product.service.ts`

**Files:**
- Modify: `backend/src/modules/inventory/services/product.service.ts`

`SettingsService` is already injected as `this.settingsService`.

- [ ] **Step 1: Fix the `lowStock` filter query (line ~1180)**

In the `getStockSummary` method, find:
```ts
if (filters?.lowStock) {
  queryBuilder.andWhere('product.stockQuantity <= 10');
}
```

Replace with:
```ts
if (filters?.lowStock) {
  const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
  queryBuilder.andWhere('product.stockQuantity <= :lowStockThreshold', { lowStockThreshold });
}
```

Note: `getStockSummary` must already be `async` — confirm this is the case before making the change.

- [ ] **Step 2: Fix `stockStatus`, `isLowStock` mapping (lines ~1203–1204)**

In the same `getStockSummary` results mapping, fetch threshold once at the top of the method:

```ts
const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
```

Then replace:
```ts
stockStatus: Number(result.product_stockQuantity) <= 0 ? 'out_of_stock' : Number(result.product_stockQuantity) <= 10 ? 'low_stock' : 'in_stock',
isLowStock: Number(result.product_stockQuantity) <= 10,
```

With:
```ts
stockStatus: Number(result.product_stockQuantity) <= 0 ? 'out_of_stock' : Number(result.product_stockQuantity) <= lowStockThreshold ? 'low_stock' : 'in_stock',
isLowStock: Number(result.product_stockQuantity) <= lowStockThreshold,
```

- [ ] **Step 3: Fix the count loop (lines ~1327–1330)**

Find the method that counts low stock (the one with the comment `// Count low stock and out of stock (using simple threshold of 10)`). Fetch threshold at the top of that method and replace:

```ts
} else if (stock <= 10) {
  lowStockCount++;
}
```

With:
```ts
} else if (stock <= lowStockThreshold) {
  lowStockCount++;
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/inventory/services/product.service.ts
git commit -m "feat(inventory): use configurable lowStockThreshold in product service"
```

---

## Task 5: Replace hardcoded `10` in `integration.service.ts` and `sales/inventory-integration.service.ts`

**Files:**
- Modify: `backend/src/modules/inventory/services/integration.service.ts`
- Modify: `backend/src/modules/sales/services/inventory-integration.service.ts`

Neither service currently injects `SettingsService`. Both modules (`InventoryModule`, `SalesModule`) already import `SettingsModule`, so injection is available.

- [ ] **Step 1: Inject `SettingsService` into `integration.service.ts`**

Add import at the top:
```ts
import { SettingsService } from '../../settings/settings.service';
```

Add to the constructor:
```ts
private readonly settingsService: SettingsService,
```

- [ ] **Step 2: Fix the two hardcoded `10`s in `integration.service.ts`**

In the `getReorderRecommendations` method (or whichever method contains lines ~344 and ~370), add threshold fetch at the top:

```ts
const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
```

Replace line ~344:
```ts
.where('product.stockQuantity <= 10')
```
With:
```ts
.where('product.stockQuantity <= :lowStockThreshold', { lowStockThreshold })
```

Replace line ~346 (the `.andWhere('10 > 0')` guard — this is always true and can be removed entirely as dead code):
```ts
// remove: .andWhere('10 > 0')
```

Replace line ~370:
```ts
reorderLevel: Number(10),
```
With:
```ts
reorderLevel: lowStockThreshold,
```

- [ ] **Step 3: Inject `SettingsService` into `sales/inventory-integration.service.ts`**

Add import at the top:
```ts
import { SettingsService } from '../../settings/settings.service';
```

Add to the constructor (after the existing `BaseCostCalculatorService` injection or at the end):
```ts
private readonly settingsService: SettingsService,
```

- [ ] **Step 4: Fix the hardcoded `10` in `sales/inventory-integration.service.ts`**

In the method containing line ~391, add threshold fetch at the top:
```ts
const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
```

Replace:
```ts
if (Number(product.stockQuantity) <= 10) {
```
With:
```ts
if (Number(product.stockQuantity) <= lowStockThreshold) {
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/inventory/services/integration.service.ts \
        backend/src/modules/sales/services/inventory-integration.service.ts
git commit -m "feat(inventory): use configurable lowStockThreshold in integration services"
```

---

## Task 6: Update frontend `settingsApi.ts` types

**Files:**
- Modify: `frontend/src/store/api/settingsApi.ts`

- [ ] **Step 1: Add `lowStockThreshold` to both interfaces**

In `frontend/src/store/api/settingsApi.ts`, update the `RegionalSettings` interface:

```ts
export interface RegionalSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
  lowStockThreshold: number
  createdAt: string
  updatedAt: string
  isActive: boolean
}
```

Update the `UpdateRegionalSettingsDto` interface:

```ts
export interface UpdateRegionalSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
  timezone?: string
  lowStockThreshold?: number
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/api/settingsApi.ts
git commit -m "feat(settings): add lowStockThreshold to frontend RTK Query types"
```

---

## Task 7: Create `StockLevelSettingsPage.tsx`

**Files:**
- Create: `frontend/src/pages/settings/StockLevelSettingsPage.tsx`

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/settings/StockLevelSettingsPage.tsx`:

```tsx
import React, { useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'
import PageHeader from '@/components/common/PageHeader'

interface StockLevelFormData {
  lowStockThreshold: number
}

const schema = yup.object({
  lowStockThreshold: yup
    .number()
    .typeError('Threshold must be a number')
    .integer('Threshold must be a whole number')
    .min(0, 'Threshold must be 0 or greater')
    .required('Low stock threshold is required'),
})

const StockLevelSettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = React.useState(false)

  const { data: settingsData, isLoading: loading, error: fetchError, refetch } = useGetRegionalSettingsQuery()
  const [updateRegionalSettings] = useUpdateRegionalSettingsMutation()

  const { control, handleSubmit, formState: { errors }, setValue } = useForm<StockLevelFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      lowStockThreshold: 10,
    },
  })

  useEffect(() => {
    if (settingsData) {
      setValue('lowStockThreshold', settingsData.lowStockThreshold ?? 10)
    }
  }, [settingsData, setValue])

  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load settings') : null

  const onSubmit = async (data: StockLevelFormData) => {
    try {
      setSubmitting(true)
      await updateRegionalSettings({ lowStockThreshold: data.lowStockThreshold }).unwrap()
      showSuccess('Stock level settings saved successfully.')
      refetch()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    refetch()
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader title="Stock Level Settings" subtitle="Configure thresholds for low stock classification across all products" />
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Stock Thresholds
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="lowStockThreshold"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Low Stock Threshold"
                    type="number"
                    fullWidth
                    required
                    inputProps={{ min: 0, step: 1 }}
                    error={!!errors.lowStockThreshold}
                    helperText={
                      errors.lowStockThreshold?.message ||
                      'Products with quantity above 0 and at or below this value are considered Low Stock.'
                    }
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
                  disabled={submitting}
                  size="large"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={submitting}
                  size="large"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  )
}

export default StockLevelSettingsPage
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/StockLevelSettingsPage.tsx
git commit -m "feat(settings): add StockLevelSettingsPage"
```

---

## Task 8: Wire up route and navigation

**Files:**
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/config/navigation.tsx`

- [ ] **Step 1: Add the lazy import and route in `router.tsx`**

In `frontend/src/router.tsx`, add the lazy import alongside the other settings pages (around line 57–67):

```ts
const StockLevelSettingsPage = React.lazy(() => import('./pages/settings/StockLevelSettingsPage'))
```

Add the route in the settings routes section (after the `inventory-costing` route, around line 185):

```ts
{ path: '/settings/stock-levels', element: <StockLevelSettingsPage />, handle: { title: 'Stock Levels' } },
```

- [ ] **Step 2: Add nav entry in `navigation.tsx`**

In `frontend/src/config/navigation.tsx`, add the icon import. Find the existing imports block (around line 21) and add:

```ts
  WarningAmber as StockLevelIcon,
```

Then in the Settings > Business group (after the `inventory-costing-settings` entry around line 565), add:

```ts
          {
            id: 'stock-level-settings',
            title: 'Stock Levels',
            icon: <StockLevelIcon />,
            group: 'Business',
            path: '/settings/stock-levels',
            roles: ADMIN_ONLY,
          },
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx frontend/src/config/navigation.tsx
git commit -m "feat(settings): add stock levels route and navigation entry"
```

---

## Task 9: Update `exportUtils.ts` to use dynamic threshold

**Files:**
- Modify: `frontend/src/utils/exportUtils.ts`
- Modify: `frontend/src/pages/inventory/hooks/useProductsActions.ts`

The `exportProducts` public function currently takes `(format, { products, filters })`. We need to pass `lowStockThreshold` through.

- [ ] **Step 1: Update `ExportData` interface and internal functions**

In `frontend/src/utils/exportUtils.ts`, update the `ExportData` interface:

```ts
interface ExportData {
  products: Product[]
  filters?: {
    search?: string
    category?: string
  }
  lowStockThreshold?: number
}
```

Update `getStockStatusText` to accept a threshold parameter:

```ts
const getStockStatusText = (product: Product, threshold: number): string => {
  const stock = product.stockQuantity || 0
  if (stock <= 0) return 'Out of Stock'
  if (stock <= threshold) return 'Low Stock'
  return 'In Stock'
}
```

Update `prepareExportData` to accept and pass threshold. Find the call to `getStockStatusText` inside `prepareExportData` and update:

```ts
const prepareExportData = (products: Product[], threshold: number) => {
  return products.map((product, index) => {
    // ... existing code ...
    // Find the 'Status' field assignment and update it:
    'Status': getStockStatusText(product, threshold),
    // ... rest of existing code ...
  })
}
```

Update `exportToCSV`, `exportToExcel`, `exportToPDF` to destructure `lowStockThreshold` from the data arg and pass it:

```ts
const exportToCSV = ({ products, filters, lowStockThreshold = 10 }: ExportData): void => {
  // ...
  const exportData = prepareExportData(products, lowStockThreshold)
  // ...
}
```

```ts
const exportToExcel = ({ products, filters, lowStockThreshold = 10 }: ExportData): void => {
  // ...
  const exportData = prepareExportData(products, lowStockThreshold)
  // ...
  // Replace the inline stock <= 10 checks in the summary sheet:
  { Metric: 'Low Stock Items', Value: products.filter(p => {
      const stock = p.stockQuantity || 0
      return stock > 0 && stock <= lowStockThreshold
    }).length
  },
}
```

```ts
const exportToPDF = ({ products, filters, lowStockThreshold = 10 }: ExportData): void => {
  // ...
  // Replace the inline stock <= 10 check in summaryStats:
  `Low Stock: ${products.filter(p => {
    const stock = p.stockQuantity || 0
    return stock > 0 && stock <= lowStockThreshold
  }).length}`
}
```

- [ ] **Step 2: Update `useProductsActions.ts` to pass the threshold**

In `frontend/src/pages/inventory/hooks/useProductsActions.ts`, add the RTK Query hook import at the top:

```ts
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
```

Inside the hook, add:

```ts
const { data: regionalSettings } = useGetRegionalSettingsQuery()
```

Update the `handleExport` call to pass the threshold:

```ts
await exportProducts(format, {
  products,
  filters: {
    search: productFilters.search || undefined,
    category: productFilters.categoryId || undefined,
  },
  lowStockThreshold: regionalSettings?.lowStockThreshold ?? 10,
})
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/exportUtils.ts \
        frontend/src/pages/inventory/hooks/useProductsActions.ts
git commit -m "feat(inventory): use configurable lowStockThreshold in export utilities"
```

---

## Task 10: Update `ProductDetailsTab.tsx` to use dynamic threshold

**Files:**
- Modify: `frontend/src/components/inventory/ProductDetailsTab.tsx`

- [ ] **Step 1: Refactor `getStockStatus` to use threshold from RTK Query**

In `frontend/src/components/inventory/ProductDetailsTab.tsx`, add the RTK Query import:

```ts
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
```

Remove the standalone `getStockStatus` function at the top of the file (lines ~22–32).

Inside the `ProductDetailsTab` component, add the hook and inline the logic:

```tsx
const ProductDetailsTab: React.FC<ProductDetailsTabProps> = ({ product }) => {
  const { data: priceListItems = [], isLoading: loading } = useGetProductPriceListItemsQuery(product.id)
  const { data: regionalSettings } = useGetRegionalSettingsQuery()
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  const getStockStatus = () => {
    const stock = product.stockQuantity || 0
    if (stock <= 0) return { label: 'Out of Stock', color: 'error' as const }
    if (stock <= lowStockThreshold) return { label: 'Low Stock', color: 'warning' as const }
    return { label: 'In Stock', color: 'success' as const }
  }

  // rest of component unchanged ...
```

Update the JSX usage from `getStockStatus(product)` to `getStockStatus()` (it now closes over `product` from props).

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/inventory/ProductDetailsTab.tsx
git commit -m "feat(inventory): use configurable lowStockThreshold in ProductDetailsTab"
```

---

## Task 11: Frontend test for `StockLevelSettingsPage`

**Files:**
- Create: `frontend/src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx`

- [ ] **Step 1: Write the test**

Create `frontend/src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import StockLevelSettingsPage from '../StockLevelSettingsPage'

const mockedSettingsApi = vi.hoisted(() => ({
  useGetRegionalSettingsQuery: vi.fn(),
  useUpdateRegionalSettingsMutation: vi.fn(),
}))

vi.mock('@/store/api/settingsApi', () => ({
  useGetRegionalSettingsQuery: mockedSettingsApi.useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation: mockedSettingsApi.useUpdateRegionalSettingsMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

describe('StockLevelSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedSettingsApi.useUpdateRegionalSettingsMutation.mockReturnValue([vi.fn(), {}])
  })

  it('renders loading spinner while fetching', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders the threshold input with the saved value', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: {
        id: '1',
        currency: 'MYR',
        costingMethod: 'AVERAGE',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24h',
        numberFormat: '1,234.56',
        timezone: 'Asia/Kuala_Lumpur',
        lowStockThreshold: 15,
        createdAt: '',
        updatedAt: '',
        isActive: true,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)
    expect(screen.getByLabelText(/Low Stock Threshold/i)).toBeInTheDocument()
  })

  it('renders error alert when fetch fails', () => {
    mockedSettingsApi.useGetRegionalSettingsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
      refetch: vi.fn(),
    })

    render(<StockLevelSettingsPage />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test**

```bash
cd frontend && npx vitest run src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx
```

Expected: PASS — 3 tests

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx
git commit -m "test(settings): add StockLevelSettingsPage tests"
```

---

## Task 12: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: all tests pass

- [ ] **Step 2: Run frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Run targeted frontend tests**

```bash
cd frontend && npx vitest run src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx
```

Expected: PASS

- [ ] **Step 4: Smoke test in browser (optional but recommended)**

Start the app and verify:
1. Navigate to Settings > Stock Levels — the page loads with the current threshold (default 10)
2. Change the value to `5` and save — success toast appears
3. Navigate to Inventory — products with qty 1–5 now show as "Low Stock"
4. Navigate back to Settings > Stock Levels — the saved value `5` is still shown
