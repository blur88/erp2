# Timezone Cleanup Design

**Issue:** #318  
**Date:** 2026-04-09  
**Scope:** Option B — Docker/config cleanup + timezone-aware date range resolvers

---

## Problem

The application manages timezone preference via `RegionalSettings.timezone` (default `Asia/Kuala_Lumpur`), but three layers still hardcode KL time:

1. `TZ: Asia/Kuala_Lumpur` in Docker Compose services
2. `timezone: 'Asia/Kuala_Lumpur'` in the pg driver config (`database-config.factory.ts`)
3. The `ALTER DATABASE erp_db SET timezone TO 'Asia/Kuala_Lumpur'` migration applied to the live DB
4. Date range boundary math in three analytics services using plain `new Date()` (system clock)

After removing hardcoded timezones, the server runs UTC — which exposes a real user-facing bug: "start of today" is computed at midnight UTC, not midnight in the user's configured timezone.

---

## Section 1: Docker & Database Config

### Changes

**`docker-compose.yml` and `docker-compose.prod.yml`**  
Remove `TZ: Asia/Kuala_Lumpur` from all 5 services: `postgres`, `redis`, `backend`, `frontend`, `nginx`. Containers default to UTC.

**`backend/src/config/database-config.factory.ts`**  
Change line 129:
```ts
// Before
timezone: 'Asia/Kuala_Lumpur',

// After
timezone: 'UTC',
```

**New migration** (generated name: `RemoveHardcodedTimezone`)  
```sql
-- up
ALTER DATABASE erp_db SET timezone TO 'UTC';
COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: UTC (user timezone via RegionalSettings)';

-- down
ALTER DATABASE erp_db SET timezone TO 'Asia/Kuala_Lumpur';
COMMENT ON DATABASE erp_db IS 'ERP Database - Timezone: Asia/Kuala_Lumpur';
```

The existing `SetTimezoneToAsiaKualaLumpur` migration remains in history — we don't modify it. The new migration supersedes it going forward.

---

## Section 2: Timezone-Aware Date Range Resolver

### Problem

Three analytics services each have a private date range resolver:

| Service | Method |
|---|---|
| `inventory-analytics.service.ts` | `resolveInventoryDateRange()` |
| `purchasing-analytics.service.ts` | `parsePurchasingDateRange()` |
| `sales-analytics.service.ts` | `parseDateRange()` |

All three use `new Date()` (system clock) to compute boundaries. After the config fix, system clock is UTC. For a KL-configured user, "this month" would start at midnight UTC (8 hours early).

### Solution

**New file:** `backend/src/common/utils/date-range.util.ts`

Export a single shared function:

```ts
export function resolveDateRange(
  timezone: string,
  dateRange?: DateRange,
  customStartDate?: Date,
  customEndDate?: Date,
): { startDate: Date; endDate: Date }
```

Uses `date-fns` v4's `TZDate` to anchor `now` in the user's timezone before computing boundaries. Returns standard `Date` objects (UTC-anchored) that TypeORM/Postgres handles correctly.

**Each analytics service:**
1. Fetches `RegionalSettings` timezone early in the analytics call (via `settingsService.getRegionalSettings()`)
2. Passes `timezone` to `resolveDateRange()` instead of doing local date math
3. Deletes its private resolver method

**Files changed:** 3 services modified, 1 utility created, 3 private resolver methods deleted.

### date-fns v4 note

`date-fns` v4 ships `TZDate` natively — no separate `date-fns-tz` package needed. Already in `backend/package.json`.

---

## Section 3: Testing

**New file:** `backend/src/common/utils/date-range.util.spec.ts`

Unit tests covering:

- Each `DateRange` enum value: TODAY, THIS_WEEK, THIS_MONTH, THIS_QUARTER, THIS_YEAR, LAST_WEEK, LAST_MONTH, LAST_QUARTER, LAST_YEAR
- Custom date range passthrough (ignores `dateRange`, returns normalized custom dates)
- Timezone boundary correctness: given a fixed UTC instant at 23:30 UTC, `TODAY` in `Asia/Kuala_Lumpur` (UTC+8) must start at KL midnight that same day — not the previous UTC day

**Not added:** Integration tests, changes to existing analytics service specs (resolver logic moves out; services gain no new testable surface).

---

## Files Touched

| File | Change |
|---|---|
| `docker-compose.yml` | Remove `TZ: Asia/Kuala_Lumpur` from 5 services |
| `docker-compose.prod.yml` | Remove `TZ: Asia/Kuala_Lumpur` from 5 services |
| `backend/src/config/database-config.factory.ts` | `timezone: 'UTC'` |
| `backend/src/database/migrations/XXXXXXXXXXXXXX-RemoveHardcodedTimezone.ts` | New migration (UTC) |
| `backend/src/common/utils/date-range.util.ts` | New shared resolver |
| `backend/src/common/utils/date-range.util.spec.ts` | New unit tests |
| `backend/src/modules/inventory/services/inventory-analytics.service.ts` | Use shared resolver, delete private method |
| `backend/src/modules/purchasing/services/purchasing-analytics.service.ts` | Use shared resolver, delete private method |
| `backend/src/modules/sales/services/sales-analytics.service.ts` | Use shared resolver, delete private method |

---

## Out of Scope

- Auditing timestamp-recording `new Date()` calls (payment dates, movement dates, backup logs) — these are correct as UTC
- Frontend date formatting — already reads `RegionalSettings.dateFormat` and `timezone`
- `RegionalSettings` default value for `timezone` — remains `'Asia/Kuala_Lumpur'`, which is correct (it's the user preference, not a system config)
