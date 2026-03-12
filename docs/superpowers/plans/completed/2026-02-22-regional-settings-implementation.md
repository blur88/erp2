# Regional Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a system-wide Regional Settings page at `/settings/regional` for configuring date format, time format, number format, and currency — replacing hardcoded values in `formatters.ts` and moving currency out of `PriceCostingPage`.

**Architecture:** Extend the existing `price_costing_settings` table with 3 new columns (`dateFormat`, `timeFormat`, `numberFormat`). The existing `/api/settings/price-costing` GET/PATCH endpoints serve the new fields automatically. The frontend reads these values from `localStorage` (same pattern as existing currency), populated on app startup and refreshed after saving. A new `RegionalSettingsPage` handles all locale display preferences; `PriceCostingPage` is refactored to costing-only.

**Tech Stack:** NestJS + TypeORM (backend), React + MUI v7 + React Hook Form + Yup (frontend), localStorage for formatter caching

---

## Task 1: Backend — Add migration for new columns

**Files:**
- Create: `backend/src/database/migrations/1771700000000-AddRegionalSettingsToPrice​CostingSettings.ts`

**Step 1: Create the migration file**

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegionalSettingsToPriceCostingSettings1771700000000 implements MigrationInterface {
  name = 'AddRegionalSettingsToPriceCostingSettings1771700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_costing_settings"
        ADD COLUMN IF NOT EXISTS "dateFormat" character varying(20) NOT NULL DEFAULT 'DD/MM/YYYY',
        ADD COLUMN IF NOT EXISTS "timeFormat" character varying(10) NOT NULL DEFAULT '24h',
        ADD COLUMN IF NOT EXISTS "numberFormat" character varying(20) NOT NULL DEFAULT '1,234.56'
    `);
    // Update default currency to MYR if it's still the old default 'USD'
    await queryRunner.query(`
      UPDATE "price_costing_settings" SET "currency" = 'MYR' WHERE "currency" = 'USD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "price_costing_settings"
        DROP COLUMN IF EXISTS "dateFormat",
        DROP COLUMN IF EXISTS "timeFormat",
        DROP COLUMN IF EXISTS "numberFormat"
    `);
  }
}
```

**Step 2: Run the migration**

```bash
cd /home/blur/erp2/backend
npm run migration:run
```

Expected: Migration runs successfully, no errors.

**Step 3: Verify columns exist**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c "\d price_costing_settings"
```

Expected: Output shows `dateFormat`, `timeFormat`, `numberFormat` columns.

**Step 4: Commit**

```bash
git add backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts
git commit -m "feat: add migration for regional settings columns on price_costing_settings"
```

---

## Task 2: Backend — Update entity and DTO

**Files:**
- Modify: `backend/src/database/entities/price-costing-settings.entity.ts`
- Modify: `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts`

**Step 1: Update the entity**

In `price-costing-settings.entity.ts`, replace the entire file content:

```typescript
import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('price_costing_settings')
export class PriceCostingSettings extends BaseEntity {
  @Column({ type: 'varchar', length: 10, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  costingMethod: string; // AVERAGE, FIFO, LIFO, STANDARD

  @Column({ type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
  dateFormat: string;

  @Column({ type: 'varchar', length: 10, default: '24h' })
  timeFormat: string;

  @Column({ type: 'varchar', length: 20, default: '1,234.56' })
  numberFormat: string;
}
```

**Step 2: Update the DTO**

In `update-price-costing-settings.dto.ts`, replace the entire file content:

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MaxLength } from 'class-validator';

export class UpdatePriceCostingSettingsDto {
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

  @ApiProperty({ description: 'Date display format', example: 'DD/MM/YYYY' })
  @IsString()
  @IsOptional()
  @IsIn(['DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'])
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
}
```

**Step 3: Build to verify no TypeScript errors**

```bash
cd /home/blur/erp2/backend
npm run build 2>&1 | head -30
```

Expected: Build completes with no errors (ignore any pre-existing warnings unrelated to these files).

**Step 4: Commit**

```bash
git add backend/src/database/entities/price-costing-settings.entity.ts
git add backend/src/modules/settings/dto/update-price-costing-settings.dto.ts
git commit -m "feat: add dateFormat, timeFormat, numberFormat fields to PriceCostingSettings"
```

---

## Task 3: Frontend — Update `settingsApi.ts` types

**Files:**
- Modify: `frontend/src/services/settingsApi.ts`

**Step 1: Update the `PriceCostingSettings` interface and `UpdatePriceCostingSettingsDto`**

Find this block in `settingsApi.ts` (lines 33–45):

```typescript
export interface PriceCostingSettings {
  id: string
  currency: string
  costingMethod: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdatePriceCostingSettingsDto {
  currency?: string
  costingMethod?: string
}
```

Replace with:

```typescript
export interface PriceCostingSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdatePriceCostingSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
}
```

**Step 2: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | head -30
```

Expected: No new errors related to `settingsApi.ts`.

**Step 3: Commit**

```bash
git add frontend/src/services/settingsApi.ts
git commit -m "feat: add regional settings fields to PriceCostingSettings types"
```

---

## Task 4: Frontend — Update `formatters.ts` to read from localStorage

**Files:**
- Modify: `frontend/src/utils/formatters.ts`

**Step 1: Replace `formatDate`, `formatDateTime`, and `formatNumber` functions**

The existing `formatDate` (lines 15–27), `formatDateTime` (lines 32–49), and `formatNumber` (lines 54–62) use hardcoded locale/format. Replace all three with localStorage-aware versions. Replace the entire content of `formatters.ts`:

```typescript
/**
 * Common formatting utilities
 * Date/time/number formats are read from localStorage (set by Regional Settings)
 */

import { formatCurrency as formatCurrencyUtil } from './currency'

/**
 * Format currency using the existing currency utility
 */
export const formatCurrency = formatCurrencyUtil

/**
 * Apply a date format string (e.g. 'DD/MM/YYYY') to a Date object.
 * Returns formatted string.
 */
const applyDateFormat = (dateObj: Date, fmt: string): string => {
  const day = String(dateObj.getDate()).padStart(2, '0')
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const year = String(dateObj.getFullYear())

  return fmt
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)
}

/**
 * Apply a time format ('24h' or '12h') to a Date object.
 * Returns formatted time string.
 */
const applyTimeFormat = (dateObj: Date, fmt: string): string => {
  const hours24 = dateObj.getHours()
  const minutes = String(dateObj.getMinutes()).padStart(2, '0')

  if (fmt === '12h') {
    const period = hours24 >= 12 ? 'PM' : 'AM'
    const hours12 = hours24 % 12 || 12
    return `${hours12}:${minutes} ${period}`
  }

  return `${String(hours24).padStart(2, '0')}:${minutes}`
}

/**
 * Format date to a readable string.
 * Reads dateFormat from localStorage (default: 'DD/MM/YYYY').
 */
export const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const fmt = localStorage.getItem('dateFormat') || 'DD/MM/YYYY'
  return applyDateFormat(dateObj, fmt)
}

/**
 * Format date and time to a readable string.
 * Reads dateFormat and timeFormat from localStorage.
 */
export const formatDateTime = (date: Date | string | null | undefined): string => {
  if (!date) return '-'

  const dateObj = typeof date === 'string' ? new Date(date) : date

  if (isNaN(dateObj.getTime())) return '-'

  const dateFmt = localStorage.getItem('dateFormat') || 'DD/MM/YYYY'
  const timeFmt = localStorage.getItem('timeFormat') || '24h'

  const datePart = applyDateFormat(dateObj, dateFmt)
  const timePart = applyTimeFormat(dateObj, timeFmt)

  return `${datePart} ${timePart}`
}

/**
 * Format number with thousand separators.
 * Reads numberFormat from localStorage (default: '1,234.56').
 * '1,234.56' = comma thousands, dot decimal
 * '1234.56'  = no thousands separator
 */
export const formatNumber = (num: number | string | null | undefined): string => {
  if (num === null || num === undefined) return '-'

  const numericValue = typeof num === 'string' ? parseFloat(num) : num

  if (isNaN(numericValue)) return '-'

  const fmt = localStorage.getItem('numberFormat') || '1,234.56'

  if (fmt === '1234.56') {
    return numericValue.toString()
  }

  // Default: comma thousands, dot decimal (en-MY / en-US style)
  return numericValue.toLocaleString('en-MY')
}

/**
 * Format quantities as whole numbers for list/table display.
 */
export const formatWholeQuantity = (quantity: number | string | null | undefined): string => {
  if (quantity === null || quantity === undefined) return '-'

  const numericValue = typeof quantity === 'string' ? parseFloat(quantity) : quantity

  if (isNaN(numericValue)) return '-'

  return Math.trunc(numericValue).toString()
}

/**
 * Format percentage
 */
export const formatPercentage = (value: number | string | null | undefined, decimals = 2): string => {
  if (value === null || value === undefined) return '-'

  const numericValue = typeof value === 'string' ? parseFloat(value) : value

  if (isNaN(numericValue)) return '-'

  return `${numericValue.toFixed(decimals)}%`
}

/**
 * Application timezone constant
 */
export const APP_TIMEZONE = 'Asia/Kuala_Lumpur'

/**
 * Get current date in Asia/Kuala_Lumpur timezone as YYYY-MM-DD string
 * Use this instead of new Date().toISOString().split('T')[0] for form defaults
 */
export const getCurrentDate = (): string => {
  const now = new Date()
  const options: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(now)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}

/**
 * Get date N days ago in Asia/Kuala_Lumpur timezone as YYYY-MM-DD string
 */
export const getDateDaysAgo = (days: number): string => {
  const date = new Date()
  date.setDate(date.getDate() - days)
  const options: Intl.DateTimeFormatOptions = {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }
  const parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return `${year}-${month}-${day}`
}
```

**Step 2: Run frontend tests to verify nothing broke**

```bash
cd /home/blur/erp2/frontend
npm run test 2>&1 | tail -20
```

Expected: All existing tests pass. (Tests that mock `formatDate` are unaffected since the function signature is unchanged.)

**Step 3: Commit**

```bash
git add frontend/src/utils/formatters.ts
git commit -m "feat: make formatDate/formatDateTime/formatNumber read from localStorage"
```

---

## Task 5: Frontend — Add startup settings initialization

**Files:**
- Modify: `frontend/src/App.tsx`

**Goal:** On app startup (after authentication), fetch `/api/settings/price-costing` and write `dateFormat`, `timeFormat`, `numberFormat`, and `currency` to `localStorage` so formatters pick them up before any page renders.

**Step 1: Find the existing settings fetch pattern in App.tsx**

Look for where `refreshCurrencyCache` is called or where app-startup effects are placed. Search:

```bash
grep -n "refreshCurrencyCache\|useEffect\|settingsApi\|initializeApp" /home/blur/erp2/frontend/src/App.tsx | head -20
```

**Step 2: Add a `useRegionalSettings` initialization hook**

Create a new file `frontend/src/hooks/useRegionalSettings.ts`:

```typescript
import { useEffect } from 'react'
import { settingsApi } from '@/services/settingsApi'

/**
 * Initialize regional settings from backend into localStorage on app startup.
 * These values are read by formatDate(), formatDateTime(), formatNumber().
 */
export const useRegionalSettings = () => {
  useEffect(() => {
    const init = async () => {
      try {
        const settings = await settingsApi.getPriceCostingSettings()
        const s = settings as any
        if (s.dateFormat) localStorage.setItem('dateFormat', s.dateFormat)
        if (s.timeFormat) localStorage.setItem('timeFormat', s.timeFormat)
        if (s.numberFormat) localStorage.setItem('numberFormat', s.numberFormat)
        if (s.currency) localStorage.setItem('defaultCurrency', s.currency)
      } catch {
        // Silently keep existing localStorage values or defaults
      }
    }
    init()
  }, [])
}
```

**Step 3: Call `useRegionalSettings()` in App.tsx**

In `App.tsx`, find the top of the main `App` component function. Import and call the hook:

```typescript
import { useRegionalSettings } from '@/hooks/useRegionalSettings'

// Inside the App function component, near the top with other hooks:
useRegionalSettings()
```

**Step 4: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | head -20
```

Expected: No new errors.

**Step 5: Commit**

```bash
git add frontend/src/hooks/useRegionalSettings.ts frontend/src/App.tsx
git commit -m "feat: initialize regional settings into localStorage on app startup"
```

---

## Task 6: Frontend — Create `RegionalSettingsPage.tsx`

**Files:**
- Create: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

**Step 1: Create the file**

```typescript
import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Divider,
  CircularProgress,
  Alert,
  MenuItem,
} from '@mui/material'
import { Language as RegionalIcon } from '@mui/icons-material'
import { useForm, Controller, useWatch } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import { settingsApi } from '@/services/settingsApi'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface RegionalFormData {
  currency: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
}

const schema = yup.object({
  currency: yup.string().required('Currency is required'),
  dateFormat: yup.string().required('Date format is required'),
  timeFormat: yup.string().required('Time format is required'),
  numberFormat: yup.string().required('Number format is required'),
})

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
  { value: 'THB', label: 'THB - Thai Baht' },
]

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 22/02/2026)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (e.g. 22-02-2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 02/22/2026)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (e.g. 02-22-2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2026-02-22)' },
]

const TIME_FORMATS = [
  { value: '24h', label: '24-hour (e.g. 14:30)' },
  { value: '12h', label: '12-hour (e.g. 2:30 PM)' },
]

const NUMBER_FORMATS = [
  { value: '1,234.56', label: '1,234.56 (comma thousands, dot decimal)' },
  { value: '1234.56', label: '1234.56 (no thousands separator)' },
]

/** Generate a live preview string based on current form values */
const buildPreview = (dateFormat: string, timeFormat: string, numberFormat: string, currency: string): string => {
  const now = new Date(2026, 1, 22, 14, 30) // Fixed example date: 22 Feb 2026, 14:30

  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())

  const datePart = dateFormat
    .replace('DD', day)
    .replace('MM', month)
    .replace('YYYY', year)

  let timePart: string
  if (timeFormat === '12h') {
    timePart = '2:30 PM'
  } else {
    timePart = '14:30'
  }

  const numPart = numberFormat === '1234.56' ? '1234.56' : '1,234.56'

  return `${datePart} ${timePart}  |  ${currency} ${numPart}`
}

const RegionalSettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { control, handleSubmit, formState: { errors }, setValue } = useForm<RegionalFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      currency: 'MYR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: '1,234.56',
    },
  })

  const watchedValues = useWatch({ control })

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const settings = await settingsApi.getPriceCostingSettings()
      const s = settings as any
      setValue('currency', s.currency || 'MYR')
      setValue('dateFormat', s.dateFormat || 'DD/MM/YYYY')
      setValue('timeFormat', s.timeFormat || '24h')
      setValue('numberFormat', s.numberFormat || '1,234.56')
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to load settings'
      setError(msg)
      showError(msg)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: RegionalFormData) => {
    try {
      setSubmitting(true)
      await settingsApi.updatePriceCostingSettings(data)

      // Update localStorage immediately so formatters reflect new values
      localStorage.setItem('defaultCurrency', data.currency)
      localStorage.setItem('dateFormat', data.dateFormat)
      localStorage.setItem('timeFormat', data.timeFormat)
      localStorage.setItem('numberFormat', data.numberFormat)

      // Notify currency-aware components
      window.dispatchEvent(new Event('currencyChanged'))

      showSuccess('Regional settings saved successfully.')
      await fetchSettings()
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save settings'
      showError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  const preview = buildPreview(
    watchedValues.dateFormat || 'DD/MM/YYYY',
    watchedValues.timeFormat || '24h',
    watchedValues.numberFormat || '1,234.56',
    watchedValues.currency || 'MYR',
  )

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <RegionalIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
          Regional Settings
        </Typography>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>

            {/* Currency */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Currency</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Default Currency"
                    fullWidth
                    required
                    error={!!errors.currency}
                    helperText={errors.currency?.message || 'Select the default currency for your business'}
                  >
                    {CURRENCIES.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Date & Time Format */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Date & Time Format</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="dateFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Date Format"
                    fullWidth
                    required
                    error={!!errors.dateFormat}
                    helperText={errors.dateFormat?.message || 'How dates are displayed throughout the system'}
                  >
                    {DATE_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="timeFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Time Format"
                    fullWidth
                    required
                    error={!!errors.timeFormat}
                    helperText={errors.timeFormat?.message || 'How times are displayed throughout the system'}
                  >
                    {TIME_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Number Format */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Number Format</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="numberFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Number Format"
                    fullWidth
                    required
                    error={!!errors.numberFormat}
                    helperText={errors.numberFormat?.message || 'How numbers are displayed throughout the system'}
                  >
                    {NUMBER_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Live Preview */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Preview</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                <Typography variant="body1" fontFamily="monospace">
                  {preview}
                </Typography>
              </Paper>
              <Typography variant="caption" color="text.secondary">
                This preview shows how dates, times, and numbers will appear across all pages.
              </Typography>
            </Grid>

            {/* Buttons */}
            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={fetchSettings}
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

export default RegionalSettingsPage
```

**Step 2: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i "regional\|error" | head -20
```

Expected: No errors related to the new file.

**Step 3: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx
git commit -m "feat: add RegionalSettingsPage with currency, date, time, number format controls"
```

---

## Task 7: Frontend — Refactor `PriceCostingPage.tsx`

**Files:**
- Modify: `frontend/src/pages/settings/PriceCostingPage.tsx`

**Goal:** Remove currency field (moved to Regional Settings), rename page title to "Inventory Costing Settings".

**Step 1: Update the form interface and schema**

Find and replace:
```typescript
interface PriceCostingFormData {
  currency: string
  costingMethod: string
}

const schema = yup.object({
  currency: yup.string().required('Currency is required'),
  costingMethod: yup.string().required('Costing method is required'),
})
```

With:
```typescript
interface PriceCostingFormData {
  costingMethod: string
}

const schema = yup.object({
  costingMethod: yup.string().required('Costing method is required'),
})
```

**Step 2: Update the form default values**

Find:
```typescript
    defaultValues: {
      currency: 'USD',
      costingMethod: 'AVERAGE',
    },
```

Replace with:
```typescript
    defaultValues: {
      costingMethod: 'AVERAGE',
    },
```

**Step 3: Update `fetchSettings` to remove currency**

Find:
```typescript
      setValue('currency', settings.currency || 'USD')
      setValue('costingMethod', settings.costingMethod || 'AVERAGE')
```

Replace with:
```typescript
      setValue('costingMethod', settings.costingMethod || 'AVERAGE')
```

**Step 4: Update `onSubmit` to remove currency and `refreshCurrencyCache`**

Find:
```typescript
      await settingsApi.updatePriceCostingSettings(data)

      // Refresh currency cache immediately after saving
      await refreshCurrencyCache()

      // Update saved costing method after successful save
      setSavedCostingMethod(data.costingMethod)

      showSuccess('Price and costing settings saved successfully. Please refresh pages to see currency changes.')
```

Replace with:
```typescript
      await settingsApi.updatePriceCostingSettings(data)

      // Update saved costing method after successful save
      setSavedCostingMethod(data.costingMethod)

      showSuccess('Inventory costing settings saved successfully.')
```

**Step 5: Remove the `CURRENCIES` constant and currency import**

Remove these lines:
```typescript
import { refreshCurrencyCache } from '@/hooks/useCurrency'
```

And remove the entire `CURRENCIES` array (lines 37–50 in the original file).

**Step 6: Remove the Currency section from the JSX**

Remove the Currency section block (the `<Grid size={12}>` with "Currency" Typography, and the currency `<Controller>` block, and the `<Divider>` after it).

**Step 7: Update the page title**

Find:
```typescript
          Price & Costing Settings
```

Replace with:
```typescript
          Inventory Costing Settings
```

**Step 8: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | grep -i "pricecosting\|error" | head -20
```

Expected: No errors.

**Step 9: Commit**

```bash
git add frontend/src/pages/settings/PriceCostingPage.tsx
git commit -m "refactor: remove currency from PriceCostingPage, rename to Inventory Costing Settings"
```

---

## Task 8: Frontend — Add route and sidebar entry

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/common/Sidebar.tsx`

**Step 1: Add the lazy import in `App.tsx`**

Find (around line 58):
```typescript
const PriceCostingPage = React.lazy(() => import('./pages/settings/PriceCostingPage'))
```

Add after it:
```typescript
const RegionalSettingsPage = React.lazy(() => import('./pages/settings/RegionalSettingsPage'))
```

**Step 2: Add the route in `App.tsx`**

Find:
```typescript
                    <Route path="/settings/price-costing" element={<PriceCostingPage />} />
```

Add after it:
```typescript
                    <Route path="/settings/regional" element={<RegionalSettingsPage />} />
```

**Step 3: Add sidebar entry in `Sidebar.tsx`**

Find the icon imports at the top of Sidebar.tsx. Add `Language` to the import from `@mui/icons-material`:

```typescript
  Language as RegionalIcon,
```

**Step 4: Add the sidebar nav item**

In the settings children array, find:
```typescript
          {
            id: 'price-costing-settings',
            title: 'Price & Costing',
            icon: <PriceCostingIcon />,
            path: '/settings/price-costing',
          },
```

Add after it:
```typescript
          {
            id: 'regional-settings',
            title: 'Regional',
            icon: <RegionalIcon />,
            path: '/settings/regional',
          },
```

**Step 5: Update the 'Price & Costing' sidebar title to match refactored page**

Change:
```typescript
            title: 'Price & Costing',
```

To:
```typescript
            title: 'Inventory Costing',
```

**Step 6: Verify TypeScript**

```bash
cd /home/blur/erp2/frontend
npm run type-check 2>&1 | head -20
```

Expected: No errors.

**Step 7: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add /settings/regional route and sidebar entry for Regional Settings"
```

---

## Task 9: Build and verify end-to-end

**Step 1: Build the backend**

```bash
cd /home/blur/erp2/backend
npm run build 2>&1 | tail -10
```

Expected: Build completes without errors.

**Step 2: Rebuild and restart Docker containers**

```bash
cd /home/blur/erp2
docker compose build backend frontend && docker compose up -d
```

Expected: Both containers build and start successfully.

**Step 3: Verify backend serves new fields**

```bash
# Get an auth token first (adjust credentials as needed)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/settings/price-costing | python3 -m json.tool
```

Expected: Response includes `dateFormat`, `timeFormat`, `numberFormat` fields with defaults.

**Step 4: Test PATCH with new fields**

```bash
curl -s -X PUT http://localhost:3001/api/settings/price-costing \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"dateFormat":"DD-MM-YYYY","timeFormat":"12h","numberFormat":"1234.56","costingMethod":"AVERAGE","currency":"MYR"}' \
  | python3 -m json.tool
```

Expected: Response shows updated fields.

**Step 5: Verify frontend**

1. Open http://localhost:3000
2. Navigate to Settings → Regional
3. Verify the page loads with correct current values
4. Change date format to `DD-MM-YYYY` and observe live preview updates
5. Save and navigate to Sales Orders — verify dates show in new format
6. Navigate to Settings → Inventory Costing — verify currency field is gone, only costing method remains

**Step 6: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: post-integration adjustments for regional settings"
```

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `backend/src/database/migrations/1771700000000-AddRegionalSettingsToPriceCostingSettings.ts` | New migration |
| `backend/src/database/entities/price-costing-settings.entity.ts` | +3 fields, currency default MYR |
| `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts` | +3 optional fields |
| `frontend/src/services/settingsApi.ts` | +3 fields in types |
| `frontend/src/utils/formatters.ts` | formatDate/formatDateTime/formatNumber read from localStorage |
| `frontend/src/hooks/useRegionalSettings.ts` | New startup initialization hook |
| `frontend/src/pages/settings/RegionalSettingsPage.tsx` | New page |
| `frontend/src/pages/settings/PriceCostingPage.tsx` | Remove currency, rename title |
| `frontend/src/App.tsx` | +import, +route, +hook call |
| `frontend/src/components/common/Sidebar.tsx` | +Regional entry, rename Inventory Costing |
