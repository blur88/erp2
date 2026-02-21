# Regional Settings — Design Document

**Date**: 2026-02-22
**Status**: Approved
**Scope**: System-wide date format, time format, number format, and currency settings

---

## Overview

Add a dedicated "Regional Settings" page at `/settings/regional` that allows admins to configure locale/display preferences that affect all frontend pages system-wide. These settings replace hardcoded values in `formatters.ts` and the currency value currently managed in `PriceCostingPage.tsx`.

---

## Goals

- Allow admins to configure date format, time format, number format, and default currency in one place
- Settings are system-wide (not per-user) and persisted in the database
- All 83+ files using `formatDate`/`formatDateTime` automatically reflect the new settings with no code changes
- Clean separation: Regional Settings handles locale/display; PriceCostingPage handles inventory costing only

---

## Out of Scope

- Timezone configuration (stays hardcoded as `Asia/Kuala_Lumpur`)
- Per-user preferences
- Fiscal year start month
- Language/i18n

---

## Backend Changes

### 1. Database Migration

`ALTER TABLE price_costing_settings` — add three new columns:

```sql
ALTER TABLE price_costing_settings
  ADD COLUMN "dateFormat" VARCHAR(20) NOT NULL DEFAULT 'DD/MM/YYYY',
  ADD COLUMN "timeFormat" VARCHAR(10) NOT NULL DEFAULT '24h',
  ADD COLUMN "numberFormat" VARCHAR(20) NOT NULL DEFAULT '1,234.56';
```

Default currency updated to `'MYR'` (verify existing row default).

### 2. Entity Update

File: `backend/src/database/entities/price-costing-settings.entity.ts`

Add fields:
```typescript
@Column({ default: 'DD/MM/YYYY' })
dateFormat: string;

@Column({ default: '24h' })
timeFormat: string;

@Column({ default: '1,234.56' })
numberFormat: string;
```

### 3. DTO Update

File: `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts`

Add optional enum-validated fields:
```typescript
@IsOptional()
@IsIn(['DD/MM/YYYY', 'DD-MM-YYYY', 'MM/DD/YYYY', 'MM-DD-YYYY', 'YYYY-MM-DD'])
dateFormat?: string;

@IsOptional()
@IsIn(['24h', '12h'])
timeFormat?: string;

@IsOptional()
@IsIn(['1,234.56', '1234.56'])
numberFormat?: string;
```

### 4. No New Endpoints Needed

Existing `/api/settings/price-costing` GET and PATCH endpoints handle the new fields automatically.

---

## Frontend Changes

### 1. `formatters.ts` Updates

File: `frontend/src/utils/formatters.ts`

- `formatDate(date)` — reads `localStorage.getItem('dateFormat')`, defaults to `'DD/MM/YYYY'`
- `formatDateTime(date)` — reads `dateFormat` + `timeFormat`; 12h renders `hh:mm A` (e.g. `2:30 PM`), 24h renders `HH:mm` (e.g. `14:30`)
- Add `formatNumber(value)` — reads `localStorage.getItem('numberFormat')`, applies thousand/decimal separator accordingly
- No signature changes — all 83 existing call sites remain unchanged

**localStorage keys:**
| Key | Default |
|-----|---------|
| `dateFormat` | `DD/MM/YYYY` |
| `timeFormat` | `24h` |
| `numberFormat` | `1,234.56` |
| `defaultCurrency` | `MYR` |

### 2. App Startup Initialization

File: `frontend/src/App.tsx` (or settings initialization hook)

On app load, fetch `/api/settings/price-costing` and write all four values to localStorage so formatters pick them up before any page renders.

### 3. New Regional Settings Page

**File**: `frontend/src/pages/settings/RegionalSettingsPage.tsx`
**Route**: `/settings/regional`

**Form fields:**

| Field | Type | Options |
|-------|------|---------|
| Currency | Select | USD, EUR, GBP, JPY, AUD, CAD, CHF, CNY, INR, SGD, MYR (default), THB |
| Date Format | Select | DD/MM/YYYY (default), DD-MM-YYYY, MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD |
| Time Format | Select | 24-hour — 14:30 (default), 12-hour — 2:30 PM |
| Number Format | Select | 1,234.56 (default), 1234.56 |

**Live preview**: A preview box below the form that updates in real-time as the user changes dropdowns, showing the current date/time/number formatted with the selected options. Example: `22/02/2026 14:30 — MYR 1,234.56`

**Behavior:**
- On load: fetch `/api/settings/price-costing`, pre-fill form
- On save: PATCH `/api/settings/price-costing` with all fields, write new values to localStorage
- Success/error alerts, loading state — consistent with existing settings pages pattern

### 4. `PriceCostingPage.tsx` Refactored

- Rename page title to "Inventory Costing Settings"
- Remove currency field (moved to Regional Settings)
- Keep: costing method dropdown + product cost recalculation button
- Update PATCH call to exclude currency field

### 5. Sidebar & Routing

**Sidebar** (`frontend/src/components/common/Sidebar.tsx`):
- Add "Regional Settings" entry under the Settings section

**Router** (`frontend/src/App.tsx`):
- Add route: `<Route path="/settings/regional" element={<RegionalSettingsPage />} />`

---

## Data Flow

```
App startup
  → fetch /api/settings/price-costing
  → write dateFormat, timeFormat, numberFormat, currency to localStorage

User visits any page
  → formatDate() reads localStorage.dateFormat
  → formatDateTime() reads localStorage.dateFormat + localStorage.timeFormat
  → formatNumber() reads localStorage.numberFormat
  → formatCurrency() reads localStorage.defaultCurrency

Admin visits /settings/regional
  → form pre-filled from API
  → admin changes settings → save
  → PATCH /api/settings/price-costing
  → localStorage updated immediately
  → all formatters reflect new values on next render
```

---

## Allowed Format Values

### Date Formats
| Value | Example |
|-------|---------|
| `DD/MM/YYYY` | 22/02/2026 |
| `DD-MM-YYYY` | 22-02-2026 |
| `MM/DD/YYYY` | 02/22/2026 |
| `MM-DD-YYYY` | 02-22-2026 |
| `YYYY-MM-DD` | 2026-02-22 |

### Time Formats
| Value | Example |
|-------|---------|
| `24h` | 14:30 |
| `12h` | 2:30 PM |

### Number Formats
| Value | Example |
|-------|---------|
| `1,234.56` | 1,234.56 |
| `1234.56` | 1234.56 |

---

## File Checklist

### Backend
- [ ] `backend/src/database/entities/price-costing-settings.entity.ts` — add 3 fields
- [ ] `backend/src/modules/settings/dto/update-price-costing-settings.dto.ts` — add 3 fields
- [ ] New migration file — add 3 columns to `price_costing_settings`

### Frontend
- [ ] `frontend/src/utils/formatters.ts` — read from localStorage, add `formatNumber()`
- [ ] `frontend/src/pages/settings/RegionalSettingsPage.tsx` — new page
- [ ] `frontend/src/pages/settings/PriceCostingPage.tsx` — remove currency, rename title
- [ ] `frontend/src/components/common/Sidebar.tsx` — add Regional Settings entry
- [ ] `frontend/src/App.tsx` — add route + startup settings fetch
- [ ] `frontend/src/services/settingsApi.ts` — ensure types include new fields

---

## Testing

- Save each format combination and verify live preview updates correctly
- Save settings, reload page — verify localStorage values persisted correctly
- Navigate to a page with dates (e.g. Sales Orders) — verify format changed
- Navigate to a page with numbers/currency — verify format changed
- Verify PriceCostingPage no longer shows currency field
- Verify existing costing method save still works after refactor
