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
| `id` | uuid | PK | app-generated before insert — use `@PrimaryColumn('uuid')` (not `@PrimaryGeneratedColumn`) since the service assigns the ID before calling save() |
| `query` | varchar(500) | NOT NULL | trimmed search string |
| `user_id` | uuid | NOT NULL | from `req.user.userId` (JWT payload field name) |
| `result_count` | int | NOT NULL | total results across all groups |
| `execution_time_ms` | int | NOT NULL | measured from before `Promise.all()` fan-out to after, using `Date.now()`; partial source failures (caught by `safeSearch`) are included in the window |
| `created_at` | timestamptz | NOT NULL, default NOW() | |

**Indexes:**
- `created_at` — retention deletes
- `user_id` — per-user analytics
- `(result_count, created_at)` — zero-result queries by period

### `search_clicks`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | DB-generated via `@PrimaryGeneratedColumn('uuid')` |
| `search_query_id` | uuid | FK → search_queries, nullable | nullable to handle clients that don't send it |
| `query` | varchar(500) | NOT NULL | denormalized; trimmed |
| `result_type` | varchar(100) | NOT NULL | value from `GlobalSearchResultType` union (see note below) |
| `result_id` | varchar(255) | NOT NULL | entity UUID or page route |
| `result_label` | varchar(255) | nullable | display label at click time |
| `position` | int | NOT NULL | 1-based rank |
| `created_at` | timestamptz | NOT NULL, default NOW() | |

**Indexes:**
- `created_at` — retention deletes
- `search_query_id` — query-to-click joins, CTR

**FK behavior:** define with `onDelete: 'NO ACTION'` and `nullable: true` on the TypeORM `@ManyToOne` decorator. The retention scheduler must wrap both deletes in a **single transaction** (clicks first, then queries) to prevent FK violations on crash between the two deletes. No manual deletion of `search_queries` rows is expected outside the retention job.

**Note on `result_type` values:** `GlobalSearchResultType` is a TypeScript string union type (not an enum). For DTO validation, a `SearchResultType` TypeScript enum must be created with all 9 values:
`page`, `customer`, `product`, `transaction`, `supplier`, `invoice`, `customer_payment`, `vendor_payment`, `journal_entry`.
Both sales orders and purchase orders use `'transaction'` — this ambiguity is accepted for Phase 5 analytics; Phase 6 can refine if needed.

---

## API Contract

### `GET /search/global?q=...` (modified)

Response adds `searchQueryId`:

```ts
{
  query: string;
  searchQueryId: string;   // UUID; always non-null on a 200 response (GlobalSearchQueryDto enforces @MinLength(2) so the early-return path is unreachable via the API)
  results: GlobalSearchResultDto[];
}
```

### `POST /search/click` (new)

**Auth:** protected by the global `JwtAuthGuard` registered in `app.module.ts` — no explicit guard decorator needed on the controller.
**Response:** `201 Created`, empty body.

```ts
// Request body (track-click.dto.ts)
{
  searchQueryId?: string;   // @IsOptional() @IsUUID()
  query: string;            // @IsString() @MaxLength(500); trimmed before storing
  resultType: SearchResultType;        // NestJS enum (new, mirrors GlobalSearchResultType union) — validated, rejects unknown values
  resultId: string;         // @IsString() @MaxLength(255)
  resultLabel?: string;     // @IsOptional() @IsString() @MaxLength(255)
  position: number;         // @IsInt() @Min(1) @Max(50) — ceiling is 50 (2.5× SEARCH_RESPONSE_LIMIT of 20) to allow for client-side result caching; adjust if limit changes
}
```

**Fire-and-forget contract:** the controller calls `logClick()` (returns `void`, never awaited) and immediately returns `201`. There is no causal relationship between write success and the response status — the `201` is returned regardless of whether the DB write succeeds.

---

## ID Generation Strategy

`SearchAnalyticsService.logQuery()` generates the UUID in application code *before* attempting the DB insert. This means:

1. UUID is available immediately to include in the search response
2. DB write is kicked off but not awaited by the caller
3. If the insert fails, the error is logged internally — the caller already has the ID and the response is unaffected

This avoids any coupling between analytics persistence success and the search response contract.

**Short queries:** `GlobalSearchQueryDto` enforces `@MinLength(2)`, so the internal `trimmed.length < 2` guard in `search()` is unreachable from the API. `searchQueryId` will always be a non-null `string` in every successful `200` response.

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
  track-click.dto.ts             — validated DTO for POST /search/click (uses SearchResultType enum)

backend/src/modules/search/
  search-result-type.enum.ts     — SearchResultType enum (mirrors GlobalSearchResultType union; needed for @IsEnum() validation)
```

### Modified files

```
backend/src/database/entities/index.ts          — export new entities
backend/src/config/database-config.factory.ts  — import and register SearchQuery + SearchClick in the entities array (critical: TypeORM loads entities from here, not from index.ts)
backend/src/modules/search/search.service.ts    — inject analytics service, return searchQueryId
backend/src/modules/search/search.controller.ts — add POST /search/click
backend/src/modules/search/search.module.ts     — register entities, providers (SearchAnalyticsService, SearchScheduler)
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
  resultType: string;   // deliberately typed as string to avoid coupling analytics service to SearchResultType enum; the controller has already validated the value via @IsEnum() before it reaches here
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
  // 2. open a single DB transaction
  // 3. delete search_clicks older than 90 days (clicks first — respects FK)
  // 4. delete search_queries older than 90 days
  // 5. commit transaction
  // 6. log rows deleted from each table
  // catch: log error, do not rethrow
}
```

The two deletes must run in a **single transaction** to prevent FK violations if the process crashes between steps.

---

## Retention Policy

- **Window:** 90 days
- **Schedule:** daily at 2 AM (`EVERY_DAY_AT_2AM`) — intentionally aligns with `AuthScheduler`; both run concurrently, which is acceptable for lightweight deletes
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

The `(result_count, created_at)` composite index makes this efficient. Note: the query window (30 days) is an analytics window, not the retention window — data is kept for 90 days.

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
