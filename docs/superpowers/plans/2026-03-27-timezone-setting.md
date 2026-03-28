# Timezone Setting & RegionalSettings Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `timezone` field to regional settings and rename `PriceCostingSettings` → `RegionalSettings` throughout the codebase so the name matches what the entity actually stores.

**Architecture:** The existing `price_costing_settings` table keeps its name; only the TypeScript class and DTO names change. A new DB column `timezone` is added via migration with a DB-level default. The frontend adds a timezone dropdown to Regional Settings and persists the value to `localStorage` so `getCurrentDate()` can read it.

**Tech Stack:** NestJS 11 (TypeORM, class-validator, class-transformer), React 19, MUI v7, RTK Query, Vitest (frontend tests), Jest (backend tests).

---

## File Map

| File | Action |
|------|--------|
| `backend/src/database/entities/price-costing-settings.entity.ts` | Modify — rename class, add column |
| `backend/src/database/migrations/1774500000000-AddTimezoneToRegionalSettings.ts` | Create — new migration |
| `backend/src/modules/settings/dto/update-regional-settings.dto.ts` | Create — replaces old file |
| `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts` | Delete |
| `backend/src/modules/settings/dto/regional-settings-response.dto.ts` | Create — replaces old file |
| `backend/src/modules/settings/dto/price-costing-settings-response.dto.ts` | Delete |
| `backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts` | Create — replaces old file |
| `backend/src/modules/settings/dto/update-price-costing-settings.dto.spec.ts` | Delete |
| `backend/src/modules/settings/dto/index.ts` | Modify — update exports |
| `backend/src/modules/settings/settings.service.ts` | Modify — rename refs |
| `backend/src/modules/settings/settings.controller.ts` | Modify — rename refs |
| `backend/src/modules/settings/settings.module.ts` | Modify — update entity import |
| `backend/src/config/database-config.factory.ts` | Modify — update entity import |
| `backend/src/modules/inventory/inventory.module.ts` | Modify — update entity import |
| `backend/src/modules/inventory/services/costing/costing-strategy-factory.service.ts` | Modify — update entity import |
| `backend/src/modules/backup/backup.module.ts` | Modify — update entity import |
| `backend/src/modules/backup/backup.service.ts` | Modify — update entity import only |
| `backend/src/modules/backup/backup.service.spec.ts` | Modify — update entity import only |
| `frontend/src/store/api/settingsApi.ts` | Modify — rename types/hooks, add timezone |
| `frontend/src/store/api/__tests__/settingsApi.test.ts` | Modify — update endpoint names |
| `frontend/src/hooks/useRegionalSettings.ts` | Modify — update hook import, persist timezone |
| `frontend/src/pages/settings/RegionalSettingsPage.tsx` | Modify — add timezone field |
| `frontend/src/pages/settings/PriceCostingPage.tsx` | Modify — update hook imports |
| `frontend/src/utils/formatters.ts` | Modify — read timezone from localStorage |

---

## Task 1: Rename entity class and add timezone column

**Files:**
- Modify: `backend/src/database/entities/price-costing-settings.entity.ts`

- [ ] **Step 1: Update the entity file**

Replace the entire file content with:

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('price_costing_settings')
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
}
```

- [ ] **Step 2: Create the migration**

Create `backend/src/database/migrations/1774500000000-AddTimezoneToRegionalSettings.ts`:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimezoneToRegionalSettings1774500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      ADD COLUMN IF NOT EXISTS timezone varchar(100) NOT NULL DEFAULT 'Asia/Kuala_Lumpur'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE price_costing_settings
      DROP COLUMN IF EXISTS timezone
    `);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/entities/price-costing-settings.entity.ts \
        backend/src/database/migrations/1774500000000-AddTimezoneToRegionalSettings.ts
git commit -m "feat: rename PriceCostingSettings entity to RegionalSettings, add timezone column"
```

---

## Task 2: Replace DTOs

**Files:**
- Create: `backend/src/modules/settings/dto/update-regional-settings.dto.ts`
- Create: `backend/src/modules/settings/dto/regional-settings-response.dto.ts`
- Delete: `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts`
- Delete: `backend/src/modules/settings/dto/price-costing-settings-response.dto.ts`
- Modify: `backend/src/modules/settings/dto/index.ts`

- [ ] **Step 1: Write the failing test first**

Create `backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts`:

```typescript
import { validate } from 'class-validator';
import { UpdateRegionalSettingsDto } from './update-regional-settings.dto';

describe('UpdateRegionalSettingsDto', () => {
  it('accepts all supported date formats', async () => {
    const supportedFormats = [
      'DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'MM-DD-YYYY',
      'YYYY-MM-DD', 'DD MMM YYYY', 'DD MMMM YYYY', 'MMM DD, YYYY', 'MMMM DD, YYYY',
    ];
    for (const dateFormat of supportedFormats) {
      const dto = new UpdateRegionalSettingsDto();
      dto.dateFormat = dateFormat;
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects unsupported date formats', async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.dateFormat = 'YYYY/MM/DD';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid IANA timezone strings', async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.timezone = 'Asia/Kuala_Lumpur';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid timezone strings', async () => {
    const dto = new UpdateRegionalSettingsDto();
    dto.timezone = 'Not/ATimezone';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test — expect it to fail (file doesn't exist yet)**

```bash
cd backend && npx jest src/modules/settings/dto/update-regional-settings.dto.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './update-regional-settings.dto'`

- [ ] **Step 3: Create the update DTO**

Create `backend/src/modules/settings/dto/update-regional-settings.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

const DATE_FORMAT_OPTIONS = [
  'DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD',
  'DD MMM YYYY', 'DD MMMM YYYY', 'MMM DD, YYYY', 'MMMM DD, YYYY',
] as const;

export const TIMEZONE_LIST = [
  'UTC',
  'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok',
  'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Johannesburg',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney', 'Australia/Melbourne',
  'Pacific/Auckland',
] as const;

export class UpdateRegionalSettingsDto {
  @ApiProperty({ description: 'Currency code (e.g., MYR, USD)', example: 'MYR', maxLength: 10 })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  currency?: string;

  @ApiProperty({ description: 'Costing method', example: 'AVERAGE', enum: ['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'] })
  @IsString()
  @IsOptional()
  @IsIn(['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'])
  costingMethod?: string;

  @ApiProperty({ description: 'Date display format', example: 'DD/MM/YYYY', enum: DATE_FORMAT_OPTIONS })
  @IsString()
  @IsOptional()
  @IsIn(DATE_FORMAT_OPTIONS)
  dateFormat?: string;

  @ApiProperty({ description: 'Time display format', example: '24h', enum: ['24h', '12h'] })
  @IsString()
  @IsOptional()
  @IsIn(['24h', '12h'])
  timeFormat?: string;

  @ApiProperty({ description: 'Number display format', example: '1,234.56', enum: ['1,234.56', '1234.56'] })
  @IsString()
  @IsOptional()
  @IsIn(['1,234.56', '1234.56'])
  numberFormat?: string;

  @ApiProperty({ description: 'IANA timezone identifier', example: 'Asia/Kuala_Lumpur', enum: TIMEZONE_LIST })
  @IsString()
  @IsOptional()
  @IsIn(TIMEZONE_LIST)
  timezone?: string;
}
```

- [ ] **Step 4: Create the response DTO**

Create `backend/src/modules/settings/dto/regional-settings-response.dto.ts`:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';

export class RegionalSettingsResponseDto {
  @ApiProperty({ description: 'Settings ID' })
  @Expose()
  id: string;

  @ApiProperty({ description: 'Currency code', example: 'MYR' })
  @Expose()
  currency: string;

  @ApiProperty({ description: 'Costing method', example: 'AVERAGE', enum: ['AVERAGE', 'FIFO', 'LIFO', 'STANDARD'] })
  @Expose()
  costingMethod: string;

  @ApiProperty({ description: 'Date display format', example: 'DD/MM/YYYY' })
  @Expose()
  dateFormat: string;

  @ApiProperty({ description: 'Time display format', example: '24h' })
  @Expose()
  timeFormat: string;

  @ApiProperty({ description: 'Number display format', example: '1,234.56' })
  @Expose()
  numberFormat: string;

  @ApiProperty({ description: 'IANA timezone identifier', example: 'Asia/Kuala_Lumpur' })
  @Expose()
  timezone: string;

  @ApiProperty({ description: 'Creation timestamp' })
  @Expose()
  createdAt: Date;

  @ApiProperty({ description: 'Last update timestamp' })
  @Expose()
  updatedAt: Date;

  @ApiProperty({ description: 'Active status' })
  @Expose()
  isActive: boolean;
}
```

- [ ] **Step 5: Update dto/index.ts**

Replace the two old exports in `backend/src/modules/settings/dto/index.ts`:

```typescript
export * from './update-company-settings.dto';
export * from './company-settings-response.dto';
export * from './update-regional-settings.dto';
export * from './regional-settings-response.dto';
export * from './document-number-settings.dto';
export * from './payment-method.dto';
```

- [ ] **Step 6: Delete the old DTO files**

```bash
rm backend/src/modules/settings/dto/update-price-costing-settings.dto.ts
rm backend/src/modules/settings/dto/price-costing-settings-response.dto.ts
rm backend/src/modules/settings/dto/update-price-costing-settings.dto.spec.ts
```

- [ ] **Step 7: Run the new spec — expect it to pass**

```bash
cd backend && npx jest src/modules/settings/dto/update-regional-settings.dto.spec.ts --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/settings/dto/
git commit -m "feat: replace PriceCostingSettings DTOs with RegionalSettings DTOs, add timezone validation"
```

---

## Task 3: Update settings service

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`

- [ ] **Step 1: Update the import lines at the top of the service**

Find and replace these imports:
- `import { PriceCostingSettings } from '../../database/entities/price-costing-settings.entity';` → `import { RegionalSettings } from '../../database/entities/price-costing-settings.entity';`
- In the dto import: `UpdatePriceCostingSettingsDto, PriceCostingSettingsResponseDto` → `UpdateRegionalSettingsDto, RegionalSettingsResponseDto`

- [ ] **Step 2: Update the constructor injection**

In the `constructor` parameter list, change:
```typescript
@InjectRepository(PriceCostingSettings)
private priceCostingSettingsRepository: Repository<PriceCostingSettings>,
```
to:
```typescript
@InjectRepository(RegionalSettings)
private regionalSettingsRepository: Repository<RegionalSettings>,
```

- [ ] **Step 3: Rename the public methods and their internals**

Rename in the service body (use find & replace carefully):
- `priceCostingSettingsRepository` → `regionalSettingsRepository` (all occurrences in the service)
- `getPriceCostingSettings` → `getRegionalSettings` (the public method and its internal call)
- `updatePriceCostingSettings` → `updateRegionalSettings` (the public method and its internal call)
- `createDefaultPriceCostingSettings` → `createDefaultRegionalSettings` (private method)
- `mapToPriceCostingResponseDto` → `mapToRegionalSettingsResponseDto` (private method)
- `PriceCostingSettingsResponseDto` → `RegionalSettingsResponseDto` (type references)
- `UpdatePriceCostingSettingsDto` → `UpdateRegionalSettingsDto` (type references)
- `PriceCostingSettings` → `RegionalSettings` (entity type references)

Do NOT rename `getDefaultCurrency` — it is unrelated to the pricing naming and stays the same.

- [ ] **Step 4: Run the backend tests to verify no breakage**

```bash
cd backend && npm run test -- --testPathPattern=settings --no-coverage
```

Expected: all settings tests pass (the service itself has no unit test file, so this mainly catches compile errors via Jest's TS compilation)

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/settings/settings.service.ts
git commit -m "refactor: rename PriceCostingSettings references in settings service"
```

---

## Task 4: Update settings controller

**Files:**
- Modify: `backend/src/modules/settings/settings.controller.ts`

- [ ] **Step 1: Update DTO imports**

Change the import of old DTOs to new names:
- `UpdatePriceCostingSettingsDto` → `UpdateRegionalSettingsDto`
- `PriceCostingSettingsResponseDto` → `RegionalSettingsResponseDto`

- [ ] **Step 2: Rename the handler methods and service calls**

Find and replace in the controller:
- `async getPriceCostingSettings()` → `async getRegionalSettings()`
- `this.settingsService.getPriceCostingSettings()` → `this.settingsService.getRegionalSettings()`
- `async updatePriceCostingSettings(` → `async updateRegionalSettings(`
- `this.settingsService.updatePriceCostingSettings(` → `this.settingsService.updateRegionalSettings(`
- `UpdatePriceCostingSettingsDto` → `UpdateRegionalSettingsDto` (in `@Body` decorator and parameter type)
- `PriceCostingSettingsResponseDto` → `RegionalSettingsResponseDto` (in `@ApiResponse` and return type)

Do NOT change the `@Get('price-costing')` and `@Put('price-costing')` route strings — the API path stays the same.

- [ ] **Step 3: Run backend build check**

```bash
cd backend && npm run build 2>&1 | head -30
```

Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.controller.ts
git commit -m "refactor: rename PriceCostingSettings references in settings controller"
```

---

## Task 5: Update module files and other backend references

**Files:**
- Modify: `backend/src/modules/settings/settings.module.ts`
- Modify: `backend/src/config/database-config.factory.ts`
- Modify: `backend/src/modules/inventory/inventory.module.ts`
- Modify: `backend/src/modules/inventory/services/costing/costing-strategy-factory.service.ts`
- Modify: `backend/src/modules/backup/backup.module.ts`
- Modify: `backend/src/modules/backup/backup.service.ts`
- Modify: `backend/src/modules/backup/backup.service.spec.ts`

- [ ] **Step 1: Update entity import in each file**

In each file, find:
```typescript
import { PriceCostingSettings } from '...<path>...price-costing-settings.entity';
```
Replace with:
```typescript
import { RegionalSettings } from '...<path>...price-costing-settings.entity';
```
Then replace any usage of the class name `PriceCostingSettings` (in TypeORM decorators, `forFeature([...])` arrays, or type annotations) with `RegionalSettings`.

**Important for `backup.service.ts` and `backup.service.spec.ts`:** Update the import and entity class reference only. Do NOT rename:
- The private methods `getPriceCostingSettings()` and `restorePriceCostingSettings()` inside `BackupService`
- The JSON data key `priceCostingSettings` used in the backup format
These are internal to the backup system and changing them would corrupt existing backup files.

- [ ] **Step 2: Run full backend build**

```bash
cd backend && npm run build 2>&1 | head -40
```

Expected: zero TypeScript errors

- [ ] **Step 3: Run full backend test suite**

```bash
cd backend && npm run test -- --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.module.ts \
        backend/src/config/database-config.factory.ts \
        backend/src/modules/inventory/inventory.module.ts \
        backend/src/modules/inventory/services/costing/costing-strategy-factory.service.ts \
        backend/src/modules/backup/backup.module.ts \
        backend/src/modules/backup/backup.service.ts \
        backend/src/modules/backup/backup.service.spec.ts
git commit -m "refactor: update RegionalSettings entity import across backend modules"
```

---

## Task 6: Update frontend RTK Query API

**Files:**
- Modify: `frontend/src/store/api/settingsApi.ts`
- Modify: `frontend/src/store/api/__tests__/settingsApi.test.ts`

- [ ] **Step 1: Update the test first**

Replace the content of `frontend/src/store/api/__tests__/settingsApi.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { settingsApiSlice } from '../settingsApi'

describe('settingsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(settingsApiSlice.reducerPath).toBe('settingsApi')
  })

  it('exports query hooks', () => {
    expect(typeof settingsApiSlice.endpoints.getCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getRegionalSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDefaultCurrency).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof settingsApiSlice.endpoints.updateCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updateRegionalSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updateDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.uploadLogo).toBe('object')
    expect(typeof settingsApiSlice.endpoints.deleteLogo).toBe('object')
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd frontend && npx vitest run src/store/api/__tests__/settingsApi.test.ts
```

Expected: FAIL — `settingsApiSlice.endpoints.getRegionalSettings` is undefined

- [ ] **Step 3: Update settingsApi.ts**

Replace the full content of `frontend/src/store/api/settingsApi.ts`:

```typescript
import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'
import { normalizeSingle } from './normalizers'

export interface CompanySettings {
  id: string
  name: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  logoUrl?: string
  createdAt: string
  updatedAt: string
}

export interface UpdateCompanySettingsDto {
  name: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
}

export interface RegionalSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdateRegionalSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
  timezone?: string
}

export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  paddingDigits: number
  nextNumber: number
  lastResetYear: number
}

export interface DocumentNumberSettings {
  configurations: DocumentNumberConfig[]
}

export interface UpdateDocumentNumberSettingsDto {
  configurations: DocumentNumberConfig[]
}

export const settingsApiSlice = createApi({
  reducerPath: 'settingsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['CompanySettings', 'RegionalSettings', 'DocumentNumberSettings'],
  endpoints: (builder) => ({
    getCompanySettings: builder.query<CompanySettings, void>({
      query: () => ({ url: '/settings/company' }),
      transformResponse: normalizeSingle<CompanySettings>,
      providesTags: ['CompanySettings'],
    }),
    updateCompanySettings: builder.mutation<CompanySettings, UpdateCompanySettingsDto>({
      query: (data) => ({ url: '/settings/company', method: 'PUT', data }),
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    uploadLogo: builder.mutation<CompanySettings, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('logo', file)
        return { url: '/settings/company/logo', method: 'POST', data: formData }
      },
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    deleteLogo: builder.mutation<CompanySettings, void>({
      query: () => ({ url: '/settings/company/logo', method: 'DELETE' }),
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    getRegionalSettings: builder.query<RegionalSettings, void>({
      query: () => ({ url: '/settings/price-costing' }),
      transformResponse: normalizeSingle<RegionalSettings>,
      providesTags: ['RegionalSettings'],
    }),
    updateRegionalSettings: builder.mutation<RegionalSettings, UpdateRegionalSettingsDto>({
      query: (data) => ({ url: '/settings/price-costing', method: 'PUT', data }),
      transformResponse: normalizeSingle<RegionalSettings>,
      invalidatesTags: ['RegionalSettings'],
    }),
    getDefaultCurrency: builder.query<{ currency: string }, void>({
      query: () => ({ url: '/settings/default-currency' }),
      transformResponse: normalizeSingle<{ currency: string }>,
      providesTags: ['RegionalSettings'],
    }),
    getDocumentNumberSettings: builder.query<DocumentNumberSettings, void>({
      query: () => ({ url: '/settings/document-numbers' }),
      transformResponse: normalizeSingle<DocumentNumberSettings>,
      providesTags: ['DocumentNumberSettings'],
    }),
    updateDocumentNumberSettings: builder.mutation<DocumentNumberSettings, UpdateDocumentNumberSettingsDto>({
      query: (data) => ({ url: '/settings/document-numbers', method: 'PUT', data }),
      transformResponse: normalizeSingle<DocumentNumberSettings>,
      invalidatesTags: ['DocumentNumberSettings'],
    }),
  }),
})

export const {
  useGetCompanySettingsQuery,
  useUpdateCompanySettingsMutation,
  useUploadLogoMutation,
  useDeleteLogoMutation,
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
  useGetDefaultCurrencyQuery,
  useGetDocumentNumberSettingsQuery,
  useUpdateDocumentNumberSettingsMutation,
} = settingsApiSlice
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
cd frontend && npx vitest run src/store/api/__tests__/settingsApi.test.ts
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: errors only from files that still import the old hook names (PriceCostingPage, RegionalSettingsPage, useRegionalSettings) — that's expected, we fix those next.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/store/api/settingsApi.ts \
        frontend/src/store/api/__tests__/settingsApi.test.ts
git commit -m "feat: rename PriceCostingSettings to RegionalSettings in RTK Query API, add timezone type"
```

---

## Task 7: Update hook and pages that import old hook names

**Files:**
- Modify: `frontend/src/hooks/useRegionalSettings.ts`
- Modify: `frontend/src/pages/settings/PriceCostingPage.tsx`

- [ ] **Step 1: Update useRegionalSettings.ts**

Replace the full content:

```typescript
import { useEffect } from 'react'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'

/**
 * Initialize regional settings from backend into localStorage on app startup.
 * These values are read by formatDate(), formatDateTime(), formatNumber(), getCurrentDate().
 * Only fetches when the user is authenticated to avoid 401 redirect loops.
 */
export const useRegionalSettings = (isAuthenticated: boolean) => {
  const { data } = useGetRegionalSettingsQuery(undefined, { skip: !isAuthenticated })

  useEffect(() => {
    if (!isAuthenticated || !data) return
    const s = data as any
    if (s.dateFormat) localStorage.setItem('dateFormat', s.dateFormat)
    if (s.timeFormat) localStorage.setItem('timeFormat', s.timeFormat)
    if (s.numberFormat) localStorage.setItem('numberFormat', s.numberFormat)
    if (s.currency) localStorage.setItem('defaultCurrency', s.currency)
    if (s.timezone) localStorage.setItem('timezone', s.timezone)
  }, [isAuthenticated, data])
}
```

- [ ] **Step 2: Update PriceCostingPage.tsx imports**

In `frontend/src/pages/settings/PriceCostingPage.tsx`, find:

```typescript
import {
  useGetPriceCostingSettingsQuery,
  useUpdatePriceCostingSettingsMutation,
} from '@/store/api/settingsApi'
```

Replace with:

```typescript
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'
```

Then update the two usages of those hooks in the component body:
- `useGetPriceCostingSettingsQuery` → `useGetRegionalSettingsQuery`
- `useUpdatePriceCostingSettingsMutation` → `useUpdateRegionalSettingsMutation`

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: errors only from `RegionalSettingsPage.tsx` (the big one — fixed in next task)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useRegionalSettings.ts \
        frontend/src/pages/settings/PriceCostingPage.tsx
git commit -m "refactor: update hook imports to renamed RTK Query hooks, persist timezone to localStorage"
```

---

## Task 8: Update RegionalSettingsPage — add timezone field

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

- [ ] **Step 1: Update imports at the top**

Change:
```typescript
import {
  useGetPriceCostingSettingsQuery,
  useUpdatePriceCostingSettingsMutation,
} from '@/store/api/settingsApi'
```
to:
```typescript
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'
```

- [ ] **Step 2: Add timezone to RegionalFormData and schema**

Update the interface:
```typescript
interface RegionalFormData {
  currency: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
}
```

Update the Yup schema — add after `numberFormat`:
```typescript
  timezone: yup.string().required('Timezone is required'),
```

- [ ] **Step 3: Add TIMEZONES constant**

Add after `NUMBER_FORMATS` constant:

```typescript
const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (UTC+8)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Manila', label: 'Asia/Manila (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+3)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1/+2)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (UTC+2)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (UTC+2)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6/-5)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7/-6)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8/-7)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10/+11)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (UTC+10/+11)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12/+13)' },
]
```

- [ ] **Step 4: Update useForm hook**

Update `defaultValues` to include timezone:
```typescript
defaultValues: {
  currency: 'MYR',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberFormat: '1,234.56',
  timezone: 'Asia/Kuala_Lumpur',
},
```

Update the query hook and mutation:
```typescript
const { data: settingsData, isLoading: loading, error: fetchError, refetch } = useGetRegionalSettingsQuery()
const [updateRegionalSettings] = useUpdateRegionalSettingsMutation()
```

- [ ] **Step 5: Update the useEffect to populate timezone**

In the `useEffect` that sets form values from API data, add:
```typescript
setValue('timezone', s.timezone || 'Asia/Kuala_Lumpur')
```

- [ ] **Step 6: Update onSubmit**

In `onSubmit`, update the mutation call to use the renamed variable, and add the localStorage write. The mutation call changes from:
```typescript
await updatePriceCostingSettings(data).unwrap()
```
to:
```typescript
await updateRegionalSettings(data).unwrap()
```

And add after the existing localStorage calls:
```typescript
localStorage.setItem('timezone', data.timezone)
```

- [ ] **Step 7: Add Timezone section to the form JSX**

Insert this block between the Number Format section and the Live Preview section (before `<Grid size={12}><Divider sx={{ my: 1 }} /></Grid>` that precedes the Preview):

```tsx
<Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

{/* Timezone */}
<Grid size={12}>
  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Timezone</Typography>
</Grid>
<Grid size={{ xs: 12, md: 6 }}>
  <Controller
    name="timezone"
    control={control}
    render={({ field }) => (
      <TextField
        {...field}
        select
        label="Timezone"
        fullWidth
        required
        error={!!errors.timezone}
        helperText={errors.timezone?.message || 'The timezone used for date-based reports and analytics'}
      >
        {TIMEZONES.map(opt => (
          <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
        ))}
      </TextField>
    )}
  />
</Grid>
```

- [ ] **Step 8: Run TypeScript check — expect clean**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 9: Run frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx
git commit -m "feat: add timezone field to Regional Settings page"
```

---

## Task 9: Update formatters.ts to read timezone from localStorage

**Files:**
- Modify: `frontend/src/utils/formatters.ts`

- [ ] **Step 1: Replace the hardcoded APP_TIMEZONE constant**

Find:
```typescript
const APP_TIMEZONE = 'Asia/Kuala_Lumpur'
```

Replace with:
```typescript
const getAppTimezone = (): string => localStorage.getItem('timezone') || 'Asia/Kuala_Lumpur'
```

- [ ] **Step 2: Update getCurrentDate() to use getAppTimezone()**

Find inside `getCurrentDate()`:
```typescript
    timeZone: APP_TIMEZONE,
```
Replace with:
```typescript
    timeZone: getAppTimezone(),
```

- [ ] **Step 3: Update getDateDaysAgo() to use getAppTimezone()**

Find inside `getDateDaysAgo()`:
```typescript
    timeZone: APP_TIMEZONE,
```
Replace with:
```typescript
    timeZone: getAppTimezone(),
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/formatters.ts
git commit -m "feat: read app timezone from localStorage instead of hardcoded constant"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && npm run test -- --no-coverage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 3: Run frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 4: Run backend lint**

```bash
cd backend && npm run lint 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 5: Verify git log is clean**

```bash
git log --oneline feat/tz ^main
```

Expected: ~9-10 commits, all feat/refactor prefixed, no WIP commits

- [ ] **Step 6: Final commit if anything was missed**

If any stray changes remain uncommitted:
```bash
git status
# stage and commit as appropriate
```
