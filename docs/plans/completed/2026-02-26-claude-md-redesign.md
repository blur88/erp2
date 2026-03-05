# CLAUDE.md Redesign

**Date**: 2026-02-26
**Status**: Approved

## Problem

The existing CLAUDE.md grew to 865 lines organically as features were added. This violates Anthropic's published best practices:
> "Bloated CLAUDE.md files cause Claude to ignore your actual instructions"

The test for each line: *"Would removing this cause Claude to make mistakes?"* Most of the content fails this test.

## Violations in the Current File

| Violation | Example |
|---|---|
| API endpoint lists | Every `/api/...` endpoint for every module |
| File-by-file descriptions | "Key Files" section listing individual .ts files |
| Changelog / timeline | 250+ lines of "Recent Changes Timeline" |
| SQL schema blocks | Full CREATE TABLE SQL for price_lists, etc. |
| Code patterns inferable from reading code | Redux slice patterns, entity design patterns |
| Information that changes frequently | Feature flags, access URLs, test counts |
| Standard conventions Claude already knows | Generic TypeScript, NestJS, React patterns |

## Approach: Ruthless Trim

Target: ~100 lines. Keep only things Claude **cannot infer from reading the code**.

### What Stays

1. **Stack overview** — non-obvious technology choices (MongoDB alongside PostgreSQL, Redis 8 with built-in modules)
2. **Key commands** — build, test (including single-test patterns), migrate, deploy
3. **Architecture decisions** — non-obvious choices with reasoning (why strict: false, why IPv4, why Docker rebuild required)
4. **Active modules list** — 11 active modules so Claude knows what's enabled
5. **Gotchas** — things Claude would get wrong without being told

### What Gets Deleted

- "Current System Status" section (~50 lines)
- "Recent Changes Timeline" (~250 lines)
- All API endpoint lists
- All database schema SQL
- All code pattern examples
- Detailed per-feature documentation
- Access URLs
- "Key Files" section
- All frontend routes lists

### Gotchas to Preserve (non-obvious, causes real bugs)

- NestJS route order: specific routes (e.g. `deleted`) must precede `:id` params in controllers
- Soft delete: must use TypeORM's `softDelete()` method (not just setting flags) for `deletedAt` timestamp
- API response wrapping: `ApiService` wraps all responses in `{ data, meta }` — tree endpoints return `response.data` not `response.data.data`
- Docker: backend source changes require `docker compose build backend && docker compose up -d backend` (no volume mount)
- TypeScript: `"strict": false` — use `as any` assertions when needed for TypeORM
- Accounting `description` column: was NOT NULL in DB, required manual `ALTER TABLE`; now nullable

## New Structure

```
# CLAUDE.md

## Project Overview      (~6 lines)
## Key Commands          (~25 lines)
## Architecture          (~15 lines)
## Active Modules        (~5 lines)
## Gotchas               (~20 lines)
```

Total: ~70-100 lines.
