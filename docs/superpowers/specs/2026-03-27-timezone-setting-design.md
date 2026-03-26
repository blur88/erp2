# Timezone Setting & PriceCostingSettings Rename — Design Spec

**Issue:** #191
**Branch:** feat/tz
**Date:** 2026-03-27
**Scope:** Add timezone setting + rename PriceCostingSettings → RegionalSettings across backend and frontend. No analytics/service changes in this PR.

---

## Overview

Add a `timezone` field to the existing regional settings store and expose it in the Regional Settings UI. Also rename the entity and related types to `RegionalSettings` to better reflect their actual purpose (they store currency, date/time/number format, and now timezone — not just pricing/costing).

---

## Backend

### 1. Entity rename + new column

**File:** `backend/src/database/entities/price-costing-settings.entity.ts`

- Rename class `PriceCostingSettings` → `RegionalSettings`
- Keep `@Entity('price_costing_settings')` — table name stays the same, no data migration
- Add new column: `timezone varchar(100) DEFAULT 'Asia/Kuala_Lumpur' NOT NULL`

### 2. DTOs

**File:** `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts`
→ Create new file `update-regional-settings.dto.ts` with class `UpdateRegionalSettingsDto`, then delete the old file.
- Add optional `timezone` field: `@IsString() @IsOptional() @IsIn(TIMEZONE_LIST) timezone?: string`
- `TIMEZONE_LIST` is defined as a `const` array at the top of this file (see timezone list below)

**File:** `backend/src/modules/settings/dto/price-costing-settings-response.dto.ts`
→ Create new file `regional-settings-response.dto.ts` with class `RegionalSettingsResponseDto`, then delete the old file.
- Add `@Expose() timezone: string`

**File:** `backend/src/modules/settings/dto/index.ts`
- Remove old exports, add new exports for `UpdateRegionalSettingsDto` and `RegionalSettingsResponseDto`

**File:** `backend/src/modules/settings/dto/update-price-costing-settings.dto.spec.ts`
→ Create new file `update-regional-settings.dto.spec.ts`, delete the old file.
- Update class references to `UpdateRegionalSettingsDto`
- Add a test case for `timezone` validation: valid IANA string passes, invalid string fails `@IsIn`

### 3. Settings Service

**File:** `backend/src/modules/settings/settings.service.ts`

Update type/import references:
- Import: `RegionalSettings` instead of `PriceCostingSettings`
- Import: `UpdateRegionalSettingsDto`, `RegionalSettingsResponseDto` instead of old names
- Repository injection property: rename `priceCostingSettingsRepository` → `regionalSettingsRepository`
- Private methods: rename `createDefaultPriceCostingSettings` → `createDefaultRegionalSettings`, `mapToPriceCostingResponseDto` → `mapToRegionalSettingsResponseDto`
- Public methods: rename `getPriceCostingSettings` → `getRegionalSettings`, `updatePriceCostingSettings` → `updateRegionalSettings`
- Also rename `getDefaultCurrency()` helper stays the same (unrelated to pricing/costing naming)
- **Do NOT add `timezone` to `createDefaultRegionalSettings()`** — the DB column has a default of `'Asia/Kuala_Lumpur'`, so the DB handles it. No change needed there.

### 4. Controller

**File:** `backend/src/modules/settings/settings.controller.ts`

- Update DTO imports: `UpdateRegionalSettingsDto`, `RegionalSettingsResponseDto`
- Rename handler methods and service calls:
  - `getPriceCostingSettings()` → `getRegionalSettings()` (calls `this.settingsService.getRegionalSettings()`)
  - `updatePriceCostingSettings()` → `updateRegionalSettings()` (calls `this.settingsService.updateRegionalSettings()`)
- The API route path (`@Get`, `@Put` decorator strings) — keep unchanged to avoid breaking the existing API contract

### 5. Module

**File:** `backend/src/modules/settings/settings.module.ts`
- Update entity import: `RegionalSettings` instead of `PriceCostingSettings`

### 6. Other backend files referencing `PriceCostingSettings`

These files import the entity for TypeORM entity registration — update the import and class reference only:
- `backend/src/config/database-config.factory.ts`
- `backend/src/modules/inventory/inventory.module.ts`
- `backend/src/modules/backup/backup.service.ts`
- `backend/src/modules/backup/backup.module.ts`
- `backend/src/modules/backup/backup.service.spec.ts`
- `backend/src/modules/inventory/services/costing/costing-strategy-factory.service.ts`

**Note on `backup.service.ts` and `backup.service.spec.ts`:** These files also contain internal private method names (`getPriceCostingSettings`, `restorePriceCostingSettings`) and JSON backup data keys (`priceCostingSettings`) that reference the old name. Do NOT rename these — they are internal implementation details of the backup format and renaming them would break existing backup files. Only update the entity import.

Note: `purchasing.module.ts` does NOT reference `PriceCostingSettings` — do not touch it.

### 7. Migration

**New file:** `backend/src/database/migrations/<timestamp>-AddTimezoneToRegionalSettings.ts`

```sql
-- up
ALTER TABLE price_costing_settings ADD COLUMN IF NOT EXISTS timezone varchar(100) NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

-- down
ALTER TABLE price_costing_settings DROP COLUMN IF EXISTS timezone;
```

### 8. Timezone list constant

Define `TIMEZONE_LIST` as a `const` array in `update-regional-settings.dto.ts`. This same list is duplicated in the frontend `RegionalSettingsPage.tsx` as `TIMEZONES` with `{ value, label }` shape. They do not need to be shared — the backend validates, the frontend displays.

```
'UTC', 'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok',
'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh', 'Europe/London', 'Europe/Paris',
'Europe/Berlin', 'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg',
'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
'America/Sao_Paulo', 'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland'
```

---

## Frontend

### 1. RTK Query API types + hooks

**File:** `frontend/src/store/api/settingsApi.ts`

- Rename interface `PriceCostingSettings` → `RegionalSettings`, add `timezone: string`
- Rename interface `UpdatePriceCostingSettingsDto` → `UpdateRegionalSettingsDto`, add `timezone?: string`
- Rename tag `'PriceCostingSettings'` → `'RegionalSettings'` in **all three** places it appears:
  - `tagTypes` array
  - `providesTags` on `getPriceCostingSettings` endpoint
  - `providesTags` on `getDefaultCurrency` endpoint (line ~113)
- Rename endpoints and exported hooks:
  - `getPriceCostingSettings` → `getRegionalSettings`, export as `useGetRegionalSettingsQuery`
  - `updatePriceCostingSettings` → `updateRegionalSettings`, export as `useUpdateRegionalSettingsMutation`

**File:** `frontend/src/store/api/__tests__/settingsApi.test.ts`
- Update all references to renamed types and hooks

### 2. useRegionalSettings hook

**File:** `frontend/src/hooks/useRegionalSettings.ts`
- Update import: `useGetRegionalSettingsQuery` instead of `useGetPriceCostingSettingsQuery`
- Add `if (s.timezone) localStorage.setItem('timezone', s.timezone)` to the effect alongside the existing fields

### 3. RegionalSettingsPage

**File:** `frontend/src/pages/settings/RegionalSettingsPage.tsx`

- Update imports: `useGetRegionalSettingsQuery` / `useUpdateRegionalSettingsMutation`
- Add `timezone: string` to `RegionalFormData` interface
- Add `timezone: yup.string().required('Timezone is required')` to the Yup schema
- Add `timezone: 'Asia/Kuala_Lumpur'` to `useForm` `defaultValues`
- Add `TIMEZONES` constant: `{ value: string; label: string }[]` using the timezone list above. Label format: `'Asia/Kuala_Lumpur (UTC+8)'` style is fine but simple `value === label` is acceptable too.
- Add a "Timezone" section (between Number Format and Preview) with a `Controller`/`TextField` select, same pattern as other fields
- In `useEffect` that populates from API: add `setValue('timezone', s.timezone || 'Asia/Kuala_Lumpur')`
- In `onSubmit`: include `timezone` in the update payload; add `localStorage.setItem('timezone', data.timezone)`
- Rename the local mutation alias from `updatePriceCostingSettings` → `updateRegionalSettings` for consistency

### 4. PriceCostingPage

**File:** `frontend/src/pages/settings/PriceCostingPage.tsx`
- This file uses `useGetPriceCostingSettingsQuery` and `useUpdatePriceCostingSettingsMutation` — both are being renamed. Update these two imports to the new hook names. This is required, not optional.

### 5. formatters.ts

**File:** `frontend/src/utils/formatters.ts`
- Replace `const APP_TIMEZONE = 'Asia/Kuala_Lumpur'` with `const getAppTimezone = () => localStorage.getItem('timezone') || 'Asia/Kuala_Lumpur'`
- Update `getCurrentDate()` to call `getAppTimezone()` instead of `APP_TIMEZONE`
- Update `getDateDaysAgo()` to call `getAppTimezone()` (this function has no callers but should stay consistent)
- **Known limitation:** `getCurrentDate()` reads localStorage at call time. On first page load, before `useRegionalSettings` has fetched and stored the timezone, `getAppTimezone()` returns the fallback `'Asia/Kuala_Lumpur'`. This is acceptable — it matches current hardcoded behavior.

---

## What is NOT changing

- Table name stays `price_costing_settings`
- API route paths stay the same (no breaking API change)
- No analytics services touched
- `formatDate` / `formatDateTime` display functions unchanged
- `purchasing.module.ts` — not touched (does not reference `PriceCostingSettings`)

---

## Files Changed Summary

| File | Change |
|------|--------|
| `entities/price-costing-settings.entity.ts` | Rename class → `RegionalSettings`, add `timezone` column |
| `dto/update-price-costing-settings.dto.ts` | Delete; replaced by `update-regional-settings.dto.ts` |
| `dto/update-regional-settings.dto.ts` | New file: `UpdateRegionalSettingsDto` with `timezone` field + `TIMEZONE_LIST` |
| `dto/price-costing-settings-response.dto.ts` | Delete; replaced by `regional-settings-response.dto.ts` |
| `dto/regional-settings-response.dto.ts` | New file: `RegionalSettingsResponseDto` with `timezone` exposed |
| `dto/index.ts` | Update exports |
| `dto/update-price-costing-settings.dto.spec.ts` | Delete; replaced by `update-regional-settings.dto.spec.ts` |
| `dto/update-regional-settings.dto.spec.ts` | New file: update class refs, add `timezone` validation test |
| `settings.service.ts` | Rename entity/DTO refs, repository, methods |
| `settings.controller.ts` | Rename DTO imports + handler method names; keep route paths |
| `settings.module.ts` | Update entity import |
| `database-config.factory.ts` | Update entity import |
| `inventory.module.ts` | Update entity import |
| `backup.service.ts` + `backup.module.ts` + `backup.service.spec.ts` | Update entity import |
| `costing-strategy-factory.service.ts` | Update entity import |
| `<timestamp>-AddTimezoneToRegionalSettings.ts` | New migration |
| `frontend/store/api/settingsApi.ts` | Rename types, tag (all 3 occurrences), hooks; add `timezone` |
| `frontend/store/api/__tests__/settingsApi.test.ts` | Update references |
| `frontend/hooks/useRegionalSettings.ts` | Update hook import, persist `timezone` to localStorage |
| `frontend/pages/settings/RegionalSettingsPage.tsx` | Add `timezone` field, dropdown, localStorage write |
| `frontend/pages/settings/PriceCostingPage.tsx` | Update hook imports (required) |
| `frontend/utils/formatters.ts` | Read timezone from localStorage |

Total: ~22 files.
