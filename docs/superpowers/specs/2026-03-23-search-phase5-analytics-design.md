# Search Phase 5: Analytics & Observability — Design Spec

**Date:** 2026-03-23
**Issue:** #158
**Scope:** Backend infrastructure only. No admin dashboard (Phase 6).

---

## Overview

Phase 5 shifts from building the search engine to learning from it. It adds the infrastructure to capture what users search for, what they click, and what fails — without affecting search performance or user experience.

---

## Goals

- Log every search query with metadata (user, result count, execution time)
- Log every result click with correlation back to the originating query
- Derive zero-result analysis from `result_count = 0` (no separate tracking needed)
- Enforce 90-day data retention automatically
- Never let analytics failures affect search UX

---

## Database Schema

### `search_queries`

Lightweight entity — no `deletedAt` / `isActive` (append-only telemetry).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | app-generated before insert |
| `query` | varchar(500) | NOT NULL | trimmed search string |
| `user_id` | varchar(100) | NOT NULL | from JWT payload |
| `result_count` | int | NOT NULL | total results across all groups |
| `execution_time_ms` | int | NOT NULL | server-side ms, non-negative |
| `created_at` | timestamptz | NOT NULL, default NOW() | |

**Indexes:**
- `created_at` — retention deletes
- `user_id` — per-user analytics
- `(result_count, created_at)` — zero-result queries by period

### `search_clicks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `search_query_id` | uuid | FK → search_queries, nullable | nullable for resilience |
| `query` | varchar(500) | NOT NULL | denormalized; trimmed |
| `result_type` | varchar(100) | NOT NULL | `GlobalSearchResultType` enum value |
| `result_id` | varchar(255) | NOT NULL | entity UUID or page route |
| `result_label` | varchar(255) | nullable | display label at click time |
| `position` | int | NOT NULL | 1-based rank |
| `created_at` | timestamptz | NOT NULL, default NOW() | |

**Indexes:**
- `created_at` — retention deletes
- `search_query_id` — query-to-click joins, CTR

**FK behavior:** no `ON DELETE CASCADE` or `ON DELETE SET NULL` needed — retention job deletes clicks before queries.

---

## API Contract

### `GET /search/global?q=...` (modified)

Response adds `searchQueryId`:

```ts
{
  query: string;
  searchQueryId: string;   // UUID generated before insert attempt; always present
  results: GlobalSearchResultDto[];
}
```

### `POST /search/click` (new)

**Auth:** same JWT guard as search endpoint.
**Response:** `201 Created`, empty body.

```ts
// Request body (track-click.dto.ts)
{
  searchQueryId?: string;   // @IsOptional() @IsUUID()
  query: string;            // @IsString() @MaxLength(500); trimmed before storing
  resultType: GlobalSearchResultType;  // enum — validated, rejects unknown values
  resultId: string;         // @IsString() @MaxLength(255)
  resultLabel?: string;     // @IsOptional() @IsString() @MaxLength(255)
  position: number;         // @IsInt() @Min(1) @Max(50)
}
```

**Fire-and-forget contract:** persistence failure is logged internally; endpoint always returns `201`.

---

## ID Generation Strategy

`SearchAnalyticsService.logQuery()` generates the UUID in application code *before* attempting the DB insert. This means:

1. UUID is available immediately to include in the search response
2. DB write is kicked off but not awaited by the caller
3. If the insert fails, the error is logged internally — the caller already has the ID and the response is unaffected

This avoids any coupling between analytics persistence success and the search response contract.

---

## Implementation Structure

All changes are contained within the existing search module. No new modules.

### New files

```
backend/src/database/entities/
  search-query.entity.ts         — SearchQuery entity (lightweight base)
  search-click.entity.ts         — SearchClick entity (lightweight base)

backend/src/modules/search/
  search-analytics.service.ts    — logQuery(), logClick() — fire-and-forget writes
  search.scheduler.ts            — daily retention cleanup at 2 AM

backend/src/modules/search/dto/
  track-click.dto.ts             — validated DTO for POST /search/click
```

### Modified files

```
backend/src/database/entities/index.ts          — export new entities
backend/src/modules/search/search.service.ts    — inject analytics service, return searchQueryId
backend/src/modules/search/search.controller.ts — add POST /search/click
backend/src/modules/search/search.module.ts     — register entities, providers
backend/src/modules/search/dto/global-search-response.dto.ts — add searchQueryId field
```

### New migration

```
backend/src/database/migrations/<timestamp>-AddSearchAnalyticsTables.ts
```

Creates both tables with all specified indexes.

---

## Service Responsibilities

### `SearchAnalyticsService`

```ts
logQuery(params: {
  id: string;          // pre-generated UUID
  query: string;
  userId: string;
  resultCount: number;
  executionTimeMs: number;
}): void                // synchronous call; async write is fire-and-forget

logClick(params: {
  searchQueryId?: string;
  query: string;
  resultType: string;
  resultId: string;
  resultLabel?: string;
  position: number;
}): void                // fire-and-forget
```

Both methods: catch all errors, log via `Logger`, never throw to caller.

### `SearchScheduler`

Follows `auth.scheduler.ts` pattern exactly:

```ts
@Cron(CronExpression.EVERY_DAY_AT_2AM)
async handleRetentionCleanup() {
  // 1. log start
  // 2. delete search_clicks older than 90 days
  // 3. delete search_queries older than 90 days
  // 4. log rows deleted
  // catch: log error, do not rethrow
}
```

Delete order: clicks first, then queries (respects FK).

---

## Retention Policy

- **Window:** 90 days
- **Schedule:** daily at 2 AM (`EVERY_DAY_AT_2AM`)
- **Method:** hard delete (`DELETE WHERE created_at < NOW() - INTERVAL '90 days'`)
- **Idempotent:** safe to run multiple times
- **Failure handling:** logs error, does not crash, does not retry

---

## Zero-Result Analysis

No separate tracking mechanism needed. Zero-result queries are derived:

```sql
SELECT query, COUNT(*) as occurrences
FROM search_queries
WHERE result_count = 0
  AND created_at > NOW() - INTERVAL '30 days'
GROUP BY query
ORDER BY occurrences DESC;
```

The `(result_count, created_at)` composite index makes this efficient.

---

## Non-Goals (Phase 5)

- No admin dashboard or charts
- No aggregation endpoints
- No configurable retention UI
- No partitioned tables or archival storage
- No real-time analytics

These are Phase 6+ concerns.

---

## Testing

- Unit tests for `SearchAnalyticsService` — verify fire-and-forget: DB failures do not propagate
- Unit test for `SearchScheduler` — verify delete order and error handling
- Integration test for `POST /search/click` — valid payload, invalid enum, position out of range
- Verify `GET /search/global` response includes `searchQueryId` field
- Verify search response is unaffected when analytics write fails
