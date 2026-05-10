# Regional Settings Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all `price_costing_settings` / `price-costing` / `priceCostingSettings` references to `regional_settings` / `regional` / `regionalSettings` across the full stack, with a route redirect and backup restore backward compatibility.

**Architecture:** New DB migration renames the table and index; entity decorator updated to match; backend API route changed; backup service internals renamed with a fallback that reads both old and new JSON keys; frontend URL updated with a redirect from the old path.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 19, RTK Query, React Router v7

---

## Files Modified

| File | What changes |
|------|-------------|
| `backend/src/database/migrations/1774757129028-RenameTablePriceCostingToRegional.ts` | **New** — rename table + index |
| `backend/src/database/entities/regional-settings.entity.ts` | `@Entity('price_costing_settings')` → `@Entity('regional_settings')` |
| `backend/src/database/migrations/1764380000000-CreatePriceCostingSettings.ts` | TS class name only: `CreatePriceCostingSettings1764380000000` → `CreateRegionalSettings1764380000000` |
| `backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts` | TS class name only: `AddRegionalSettingsToPriceCostingSettings1771700000000` → `AddColumnsToRegionalSettings1771700000000` |
| `backend/src/modules/settings/settings.controller.ts` | Routes + Swagger: `price-costing` → `regional` |
| `backend/src/modules/backup/backup.service.ts` | Rename private repo var, private methods, local var, JSON key; add backward-compat fallback |
| `backend/src/modules/backup/backup.service.spec.ts` | Rename repo var, test data key, assertions; add backward-compat test |
| `backend/src/modules/search/search.service.ts` | Route string `'/settings/price-costing'` → `'/settings/regional'` |
| `frontend/src/store/api/settingsApi.ts` | URL `/settings/price-costing` → `/settings/regional` (2 places) |
| `frontend/src/router.tsx` | Path updated; redirect from old path added |
| `frontend/src/config/navigation.tsx` | `id` and `path` updated |
| `frontend/src/components/common/TopBar.tsx` | Breadcrumb map key + NAVIGABLE_PATHS updated |
| `docs/PRICE_LIST_DEPLOYMENT_GUIDE.md` | Table name references updated |
| `docs/superpowers/specs/2026-03-27-timezone-setting-design.md` | Remove stale note about not renaming backup keys |

---

## Task 1: DB Migration — Rename Table and Index

**Files:**
- Create: `backend/src/database/migrations/1774757129028-RenameTablePriceCostingToRegional.ts`

- [ ] **Step 1: Create the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTablePriceCostingToRegional1774757129028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "price_costing_settings" RENAME TO "regional_settings"`);
    await queryRunner.query(
      `ALTER INDEX "IDX_price_costing_settings_is_active" RENAME TO "IDX_regional_settings_is_active"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "regional_settings" RENAME TO "price_costing_settings"`);
    await queryRunner.query(
      `ALTER INDEX "IDX_regional_settings_is_active" RENAME TO "IDX_price_costing_settings_is_active"`,
    );
  }
}
```

- [ ] **Step 2: Rename old migration TS class names (historical class identifiers only — do NOT touch any SQL inside them)**

In `backend/src/database/migrations/1764380000000-CreatePriceCostingSettings.ts`, change only line 3:
```typescript
// Before:
export class CreatePriceCostingSettings1764380000000 implements MigrationInterface {
// After:
export class CreateRegionalSettings1764380000000 implements MigrationInterface {
```

In `backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts`, change only line 3:
```typescript
// Before:
export class AddRegionalSettingsToPriceCostingSettings1771700000000 implements MigrationInterface {
// After:
export class AddColumnsToRegionalSettings1771700000000 implements MigrationInterface {
```

- [ ] **Step 3: Update entity decorator**

In `backend/src/database/entities/regional-settings.entity.ts`, change line 4:
```typescript
// Before:
@Entity('price_costing_settings')
// After:
@Entity('regional_settings')
```

- [ ] **Step 4: Run the migration**

```bash
cd backend && npm run migration:run
```

Expected output: migration `RenameTablePriceCostingToRegional1774757129028` runs successfully with no errors.

- [ ] **Step 5: Verify in PostgreSQL**

```bash
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "\dt regional_settings"
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "\di IDX_regional_settings_is_active"
```

Expected: `regional_settings` table and `IDX_regional_settings_is_active` index both exist.

- [ ] **Step 6: Commit**

```bash
git add backend/src/database/migrations/1774757129028-RenameTablePriceCostingToRegional.ts \
        backend/src/database/migrations/1764380000000-CreatePriceCostingSettings.ts \
        backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts \
        backend/src/database/entities/regional-settings.entity.ts
git commit -m "chore: rename price_costing_settings table to regional_settings (#197)"
```

---

## Task 2: Backend — Update Settings Controller Routes

**Files:**
- Modify: `backend/src/modules/settings/settings.controller.ts`

- [ ] **Step 1: Update GET route and its Swagger docs (around line 191–212)**

```typescript
  /**
   * Get regional settings
   */
  @Get('regional')
  @ApiOperation({
    summary: 'Get regional settings',
    description: 'Retrieve current regional settings',
  })
  @ApiResponse({
    status: 200,
    description: 'Regional settings retrieved successfully',
    type: RegionalSettingsResponseDto,
  })
  async getRegionalSettings(): Promise<RegionalSettingsResponseDto> {
    try {
      this.logger.log('Fetching regional settings');
      return await this.settingsService.getRegionalSettings();
    } catch (error) {
      this.logger.error(`Failed to get regional settings: ${error.message}`, error.stack);
      throw error;
    }
  }
```

- [ ] **Step 2: Update PUT route and its Swagger docs (around line 214–239)**

```typescript
  /**
   * Update regional settings
   */
  @Put('regional')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update regional settings',
    description: 'Update regional settings information',
  })
  @ApiResponse({
    status: 200,
    description: 'Regional settings updated successfully',
    type: RegionalSettingsResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data' })
  async updateRegionalSettings(
    @Body(ValidationPipe) updateDto: UpdateRegionalSettingsDto,
  ): Promise<RegionalSettingsResponseDto> {
    try {
      this.logger.log('Updating regional settings');
      return await this.settingsService.updateRegionalSettings(updateDto, 'system');
    } catch (error) {
      this.logger.error(`Failed to update regional settings: ${error.message}`, error.stack);
      throw error;
    }
  }
```

- [ ] **Step 3: Build check**

```bash
cd backend && npm run build 2>&1 | tail -5
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.controller.ts
git commit -m "feat: rename settings API route price-costing → regional (#197)"
```

---

## Task 3: Backend — Rename Backup Service Internals + Backward Compat

**Files:**
- Modify: `backend/src/modules/backup/backup.service.ts`

- [ ] **Step 1: Rename repository injection (line 40)**

```typescript
// Before:
private readonly priceCostingSettingsRepository: Repository<RegionalSettings>,
// After:
private readonly regionalSettingsRepository: Repository<RegionalSettings>,
```

- [ ] **Step 2: Rename `getPriceCostingSettings` method and its usages**

Line 294 (call site inside `backupSettings`):
```typescript
// Before:
this.getPriceCostingSettings(),
// After:
this.getRegionalSettings(),
```

Line 291 (local variable):
```typescript
// Before:
const [companySettings, priceCostingSettings, documentNumberSettings, printSettings] =
// After:
const [companySettings, regionalSettings, documentNumberSettings, printSettings] =
```

Line 301 (JSON key in output object):
```typescript
// Before:
      priceCostingSettings,
// After:
      regionalSettings,
```

Line 447 (method signature):
```typescript
// Before:
  private async getPriceCostingSettings(): Promise<any> {
// After:
  private async getRegionalSettings(): Promise<any> {
```

Line 448 (repository reference inside method):
```typescript
// Before:
    const settings = await this.priceCostingSettingsRepository.findOne({
// After:
    const settings = await this.regionalSettingsRepository.findOne({
```

- [ ] **Step 3: Update restore call with backward-compat fallback (line 803)**

```typescript
// Before:
    await this.restorePriceCostingSettings(settings.priceCostingSettings);
// After:
    await this.restoreRegionalSettings(settings.regionalSettings ?? settings.priceCostingSettings);
```

- [ ] **Step 4: Rename `restorePriceCostingSettings` method and its internals (lines 831–848)**

```typescript
  private async restoreRegionalSettings(data: any): Promise<void> {
    if (!data || Object.keys(data).length === 0) return;

    try {
      const existing = await this.regionalSettingsRepository.findOne({ where: { isActive: true } });

      if (existing) {
        Object.assign(existing, data);
        await this.regionalSettingsRepository.save(existing);
      } else {
        const created = this.regionalSettingsRepository.create({ ...data, isActive: true });
        await this.regionalSettingsRepository.save(created);
      }

      this.logger.log('Regional settings restored');
    } catch (error) {
      this.logger.warn(`Failed to restore regional settings: ${error.message}`);
    }
  }
```

- [ ] **Step 5: Build check**

```bash
cd backend && npm run build 2>&1 | tail -5
```

Expected: build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/backup/backup.service.ts
git commit -m "refactor: rename priceCostingSettings → regionalSettings in backup service (#197)"
```

---

## Task 4: Backend — Update Backup Service Tests

**Files:**
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

- [ ] **Step 1: Rename `priceCostingSettingsRepo` variable (line 50)**

```typescript
// Before:
  let priceCostingSettingsRepo: ReturnType<typeof mockRepository>;
// After:
  let regionalSettingsRepo: ReturnType<typeof mockRepository>;
```

- [ ] **Step 2: Update assignment (line 70)**

```typescript
// Before:
    priceCostingSettingsRepo = module.get(getRepositoryToken(RegionalSettings));
// After:
    regionalSettingsRepo = module.get(getRepositoryToken(RegionalSettings));
```

- [ ] **Step 3: Update all mock usages — replace every `priceCostingSettingsRepo` with `regionalSettingsRepo`**

Lines 152, 222, 223, 244, 245, 271, 272 — change every occurrence:
```typescript
// Before (example):
      priceCostingSettingsRepo.findOne.mockResolvedValue({
// After:
      regionalSettingsRepo.findOne.mockResolvedValue({
```

(Repeat for all `.findOne`, `.save`, `.create` calls on this variable.)

- [ ] **Step 4: Update backup output assertion (line 180)**

```typescript
// Before:
      expect(data.priceCostingSettings.currency).toBe('MYR');
// After:
      expect(data.regionalSettings.currency).toBe('MYR');
```

- [ ] **Step 5: Update `mockSettingsJson` restore test data key (line 194)**

```typescript
// Before:
      priceCostingSettings: {
        currency: 'USD', costingMethod: 'FIFO',
        dateFormat: 'MM/DD/YYYY', timeFormat: '12h', numberFormat: '1,234.56',
      },
// After:
      regionalSettings: {
        currency: 'USD', costingMethod: 'FIFO',
        dateFormat: 'MM/DD/YYYY', timeFormat: '12h', numberFormat: '1,234.56',
      },
```

- [ ] **Step 6: Add backward-compat test — old backup key still restores**

Add this test inside the `describe('restoreSettings', ...)` block, after the existing tests:

```typescript
    it('restores regional settings from old backup using priceCostingSettings key', async () => {
      const oldBackupJson = {
        companySettings: {},
        priceCostingSettings: {
          currency: 'USD', costingMethod: 'FIFO',
          dateFormat: 'MM/DD/YYYY', timeFormat: '12h', numberFormat: '1,234.56',
        },
        documentNumberSettings: { configurations: [] },
        printSettings: {},
        timestamp: '2025-01-01T00:00:00.000Z',
      };
      jest.spyOn(require('fs/promises'), 'readFile').mockResolvedValue(JSON.stringify(oldBackupJson));

      companySettingsRepo.findOne.mockResolvedValue({ id: 'uuid-1', isActive: true });
      companySettingsRepo.save.mockResolvedValue({});
      regionalSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-2', isActive: true });
      regionalSettingsRepo.save.mockResolvedValue({});
      documentNumberSettingRepo.findOne.mockResolvedValue(null);
      documentNumberSettingRepo.create.mockReturnValue({});
      documentNumberSettingRepo.save.mockResolvedValue({});
      printSettingsRepo.findOne.mockResolvedValue({ id: 'uuid-4' });
      printSettingsRepo.save.mockResolvedValue({});

      await (service as any).restoreSettings('/tmp/restore');

      expect(regionalSettingsRepo.findOne).toHaveBeenCalledWith({ where: { isActive: true } });
      expect(regionalSettingsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currency: 'USD', costingMethod: 'FIFO' }),
      );
    });
```

- [ ] **Step 7: Run backup tests**

```bash
cd backend && npx jest src/modules/backup/backup.service.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/backup/backup.service.spec.ts
git commit -m "test: update backup service specs for regional settings rename (#197)"
```

---

## Task 5: Backend — Update Search Service Route String

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`

- [ ] **Step 1: Update route string (around line 324)**

```typescript
// Before:
    route: '/settings/price-costing',
// After:
    route: '/settings/regional',
```

- [ ] **Step 2: Build check**

```bash
cd backend && npm run build 2>&1 | tail -5
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/search/search.service.ts
git commit -m "fix: update search service static route price-costing → regional (#197)"
```

---

## Task 6: Frontend — Update RTK Query API URL

**Files:**
- Modify: `frontend/src/store/api/settingsApi.ts`

- [ ] **Step 1: Update the two URL strings (lines 103, 108)**

```typescript
// Before (line 103):
      query: () => ({ url: '/settings/price-costing' }),
// After:
      query: () => ({ url: '/settings/regional' }),

// Before (line 108):
      query: (data) => ({ url: '/settings/price-costing', method: 'PUT', data }),
// After:
      query: (data) => ({ url: '/settings/regional', method: 'PUT', data }),
```

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npx vitest run src/store/api/__tests__/settingsApi.test.ts
```

Expected: all tests pass (the test only checks endpoint names, not URLs, so no test changes needed).

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/api/settingsApi.ts
git commit -m "fix: update settingsApi URLs price-costing → regional (#197)"
```

---

## Task 7: Frontend — Router: Rename Path + Add Redirect

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Add Navigate import if not already present**

Check the top of `frontend/src/router.tsx`. If `Navigate` is not imported from `react-router-dom`, add it:
```typescript
import { createBrowserRouter, Navigate } from 'react-router-dom'
```

- [ ] **Step 2: Update the route and add redirect (around line 184)**

```tsx
// Before:
          { path: '/settings/price-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
// After:
          { path: '/settings/price-costing', element: <Navigate to="/settings/regional" replace /> },
          { path: '/settings/regional', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
```

> Note: `/settings/regional` already exists on line 185 pointing to `<RegionalSettingsPage />`. The two routes `/settings/regional` now point to different pages (InventoryCostingPage vs RegionalSettingsPage). Check whether `/settings/regional` → `<RegionalSettingsPage />` should be kept or if these are two distinct pages. If they are separate, rename the new InventoryCostingPage path to something distinct (e.g. `/settings/inventory-costing`). If they are the same, remove the duplicate. **Looking at the existing router:** line 185 has `{ path: '/settings/regional', element: <RegionalSettingsPage /> }` — this is a separate page. So use a distinct path for the InventoryCostingPage redirect target. Use `/settings/inventory-costing`:

```tsx
          { path: '/settings/price-costing', element: <Navigate to="/settings/inventory-costing" replace /> },
          { path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/router.tsx
git commit -m "fix: rename /settings/price-costing route, add redirect (#197)"
```

---

## Task 8: Frontend — Navigation, TopBar

**Files:**
- Modify: `frontend/src/config/navigation.tsx`
- Modify: `frontend/src/components/common/TopBar.tsx`

- [ ] **Step 1: Update navigation.tsx (lines 562–567)**

```typescript
// Before:
          {
            id: 'price-costing-settings',
            title: 'Inventory Costing',
            icon: <PriceCostingIcon />,
            group: 'Business',
            path: '/settings/price-costing',
            roles: ADMIN_ONLY,
          },
// After:
          {
            id: 'inventory-costing-settings',
            title: 'Inventory Costing',
            icon: <PriceCostingIcon />,
            group: 'Business',
            path: '/settings/inventory-costing',
            roles: ADMIN_ONLY,
          },
```

- [ ] **Step 2: Update TopBar.tsx breadcrumb map (line 78)**

```typescript
// Before:
  '/settings/price-costing': 'Inventory Costing',
// After:
  '/settings/inventory-costing': 'Inventory Costing',
```

- [ ] **Step 3: Update TopBar.tsx NAVIGABLE_PATHS (line 136)**

```typescript
// Before:
  '/settings/price-costing',
// After:
  '/settings/inventory-costing',
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/config/navigation.tsx frontend/src/components/common/TopBar.tsx
git commit -m "fix: update navigation and topbar paths for inventory costing (#197)"
```

---

## Task 9: Backend — Update Search Service for New Inventory Costing Route

**Files:**
- Modify: `backend/src/modules/search/search.service.ts`

- [ ] **Step 1: Update route string (already done in Task 5 to `/settings/regional` — re-check)**

In Task 5 we changed the search service route from `/settings/price-costing` to `/settings/regional`. But now the InventoryCostingPage lives at `/settings/inventory-costing`. Check what this search entry is for:

```bash
grep -n -A3 -B3 "price-costing\|inventory-costing\|Inventory Costing" backend/src/modules/search/search.service.ts | head -30
```

If the entry is labeled "Inventory Costing", update to `/settings/inventory-costing`:
```typescript
    route: '/settings/inventory-costing',
```

If there is a separate "Regional Settings" entry at `/settings/regional`, leave it as is.

- [ ] **Step 2: Build check**

```bash
cd backend && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit if changed**

```bash
git add backend/src/modules/search/search.service.ts
git commit -m "fix: update search service inventory costing route to /settings/inventory-costing (#197)"
```

---

## Task 10: Update settingsApi.ts URL to Match New Route

**Files:**
- Modify: `frontend/src/store/api/settingsApi.ts`

- [ ] **Step 1: Re-verify** — the InventoryCostingPage at `/settings/inventory-costing` calls `useGetRegionalSettingsQuery` / `useUpdateRegionalSettingsMutation`. These hit `/settings/regional` on the backend (already updated in Task 6). The route rename is only a frontend path change — the **API endpoint** stays `/settings/regional`. No additional change needed here.

---

## Task 11: Docs Update

**Files:**
- Modify: `docs/PRICE_LIST_DEPLOYMENT_GUIDE.md`
- Modify: `docs/superpowers/specs/2026-03-27-timezone-setting-design.md`

- [ ] **Step 1: Update PRICE_LIST_DEPLOYMENT_GUIDE.md**

Find and update all references to `price_costing_settings` table name in SQL examples:

Line 178:
```sql
-- Before:
SELECT * FROM price_costing_settings LIMIT 1;
-- After:
SELECT * FROM regional_settings LIMIT 1;
```

Line 607:
```sql
-- Before:
SELECT * FROM price_costing_settings;
-- After:
SELECT * FROM regional_settings;
```

Line 160 (descriptive text):
```markdown
-- Before:
- Migrates pricing schemes from `price_costing_settings` to `price_lists`
-- After:
- Migrates pricing schemes from `regional_settings` to `price_lists`
```

- [ ] **Step 2: Update timezone-setting-design.md**

Remove the stale note at line 83 that says:
> "Do NOT rename these — they are internal implementation details of the backup format and renaming them would break existing backup files. Only update the entity import."

Replace with:
> "These have been renamed as part of issue #197. The restore logic uses `settings.regionalSettings ?? settings.priceCostingSettings` for backward compatibility with old backup files."

- [ ] **Step 3: Commit**

```bash
git add docs/PRICE_LIST_DEPLOYMENT_GUIDE.md docs/superpowers/specs/2026-03-27-timezone-setting-design.md
git commit -m "docs: update table name references price_costing_settings → regional_settings (#197)"
```

---

## Task 12: Full Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: no errors.

- [ ] **Step 4: Start the app and verify manually**

```bash
docker compose up -d
```

Then in a browser:
1. Navigate to `/settings/price-costing` — should redirect to `/settings/inventory-costing`
2. Navigate to `/settings/inventory-costing` — InventoryCostingPage loads and fetches data
3. Update a setting — PUT succeeds
4. Check the sidebar — "Inventory Costing" nav item links to `/settings/inventory-costing`

- [ ] **Step 5: Verify DB table rename**

```bash
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "\dt regional_settings"
```

Expected: table exists; `price_costing_settings` does not:
```bash
docker exec -it erp2-postgres-1 psql -U postgres -d erp2 -c "\dt price_costing_settings"
```

Expected: "Did not find any relation named price_costing_settings."

- [ ] **Step 6: Backup + restore smoke test**

Create a backup via the UI or API, download it, inspect the JSON — should contain `regionalSettings` key.

Modify the JSON to use `priceCostingSettings` key instead, re-upload and restore — should succeed without errors.
