# Regional Settings Rename Design

**Goal:** Rename all `price_costing` / `price-costing` / `priceCostingSettings` references to `regional` / `regional-settings` / `regionalSettings` across the full stack — database, backend, frontend, and docs — while preserving backward compatibility for old backup files.

---

## Scope

This is a pure rename/refactor. No feature changes.

---

## Files Changed

### Database
| File | Change |
|------|--------|
| New migration `XXXXXXXXX-RenameTablePriceCostingToRegionalSettings.ts` | Rename table + index |
| `backend/src/database/entities/regional-settings.entity.ts` | `@Entity('price_costing_settings')` → `@Entity('regional_settings')` |
| `backend/src/database/migrations/1764380000000-CreatePriceCostingSettings.ts` | Rename TS class only: `CreatePriceCostingSettings` → `CreateRegionalSettings` |
| `backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts` | Rename TS class only: `AddRegionalSettingsToPriceCostingSettings` → `AddColumnsToRegionalSettings` |

> Note: SQL inside existing migrations is historical record — do not change it.

### Backend
| File | Change |
|------|--------|
| `backend/src/modules/settings/settings.controller.ts` | `@Get('price-costing')` → `@Get('regional')`, `@Put('price-costing')` → `@Put('regional')`, Swagger docs updated |
| `backend/src/modules/backup/backup.service.ts` | See backup section below |
| `backend/src/modules/backup/backup.service.spec.ts` | See backup section below |
| `backend/src/modules/search/search.service.ts` | Route string `'/settings/price-costing'` → `'/settings/regional'` |

### Frontend
| File | Change |
|------|--------|
| `frontend/src/store/api/settingsApi.ts` | URL `/settings/price-costing` → `/settings/regional` (2 places) |
| `frontend/src/router.tsx` | Path `/settings/price-costing` → `/settings/regional`; add redirect from old path |
| `frontend/src/config/navigation.tsx` | `id: 'price-costing-settings'` → `id: 'regional-settings'`, path updated |
| `frontend/src/components/common/TopBar.tsx` | Path key updated in breadcrumb map and NAVIGABLE_PATHS |

### Docs
| File | Change |
|------|--------|
| `docs/PRICE_LIST_DEPLOYMENT_GUIDE.md` | Update table name references |
| `docs/superpowers/specs/2026-03-27-timezone-setting-design.md` | Remove stale note saying "do NOT rename backup keys" (now incorrect) |

> All completed plans/specs under `docs/superpowers/plans/completed/` and `docs/superpowers/specs/completed/` are historical record — leave them unchanged.

---

## Database Migration

New migration renames the table and index:

```sql
-- up
ALTER TABLE "price_costing_settings" RENAME TO "regional_settings";
ALTER INDEX "IDX_price_costing_settings_is_active" RENAME TO "IDX_regional_settings_is_active";

-- down
ALTER TABLE "regional_settings" RENAME TO "price_costing_settings";
ALTER INDEX "IDX_regional_settings_is_active" RENAME TO "IDX_price_costing_settings_is_active";
```

---

## Backend: Backup Service

### backup.service.ts renames
| Old | New |
|-----|-----|
| `priceCostingSettingsRepository` | `regionalSettingsRepository` |
| `getPriceCostingSettings()` | `getRegionalSettings()` |
| `restorePriceCostingSettings()` | `restoreRegionalSettings()` |
| local var `priceCostingSettings` | `regionalSettings` |
| JSON key `priceCostingSettings` in backup output | `regionalSettings` |
| Logger message "Price costing settings restored" | "Regional settings restored" |

### Backward compatibility (restore logic)

Old backup files have the key `priceCostingSettings`. New backups use `regionalSettings`. The restore call must handle both:

```typescript
// Old: await this.restoreRegionalSettings(settings.priceCostingSettings);
await this.restoreRegionalSettings(settings.regionalSettings ?? settings.priceCostingSettings);
```

### backup.service.spec.ts renames
| Old | New |
|-----|-----|
| `priceCostingSettingsRepo` | `regionalSettingsRepo` |
| Test data key `priceCostingSettings` | `regionalSettings` |
| Assertion `data.priceCostingSettings.currency` | `data.regionalSettings.currency` |

Add a test case verifying that restoring an old backup (with `priceCostingSettings` key) still works.

---

## Frontend: Route Redirect (Breaking Change Fix)

Users with the old URL bookmarked (`/settings/price-costing`) must be redirected to `/settings/regional`. Add a redirect route in `router.tsx`:

```tsx
import { Navigate } from 'react-router-dom'

// In the routes array, alongside the new route:
{ path: '/settings/price-costing', element: <Navigate to="/settings/regional" replace /> },
{ path: '/settings/regional', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
```

---

## What Is NOT Renamed

| Item | Reason |
|------|--------|
| Frontend hook names (`useGetRegionalSettingsQuery` etc.) | Already use "regional" naming |
| `RegionalSettings` entity class name | Already correct |
| `InventoryCostingPage` component | Display name, unrelated to technical naming |
| `PriceCostingIcon` import alias in navigation.tsx | Just an icon alias, no functional impact |
| SQL inside existing migrations | Historical record |
| `docs/superpowers/plans/completed/` and `specs/completed/` | Historical record |
| `CHANGELOG.md` | Historical record |

---

## No External Breaking Changes

- All RTK Query hook names (`useGetRegionalSettingsQuery` etc.) stay the same — 28+ consuming components are unaffected
- `RegionalSettings` entity class name stays the same — all 6 importing modules (inventory costing strategy, settings module, backup, etc.) are unaffected
- Frontend route redirect handles bookmarked URLs
- Backup restore backward compat handles old backup files

---

## Verification Plan

- [ ] Run migration and verify `regional_settings` table exists in PostgreSQL; old table gone
- [ ] Verify `IDX_regional_settings_is_active` index exists
- [ ] `GET /api/settings/regional` returns 200
- [ ] `PUT /api/settings/regional` updates and returns 200
- [ ] Frontend settings page loads correctly at `/settings/regional`
- [ ] Navigating to `/settings/price-costing` redirects to `/settings/regional`
- [ ] Create a backup — verify JSON contains `regionalSettings` key
- [ ] Restore a new backup — verify successful
- [ ] Restore an old backup (containing `priceCostingSettings` key) — verify successful
- [ ] Run backend tests: `cd backend && npm run test`
- [ ] Run frontend tests: `cd frontend && npm run test`
- [ ] TypeScript check: `cd frontend && npm run type-check`
