# Global Search — Phase 3: Ranking, Recent Searches, and UX Polish

**Date:** 2026-03-22
**Issue:** #152
**Status:** Approved

## Overview

Phase 3 improves the global search experience without changing the API contract or architecture. It consists of two independent workstreams executed sequentially: backend ranking improvements first, then frontend UX enhancements.

**In scope:**
- Improved scoring model with centralized constants
- Increased internal candidate fetch limit (5 → 10 per entity)
- Recent searches via localStorage, namespaced per user
- Text highlighting in label and description
- Improved empty state message

**Out of scope:**
- Fuzzy/phonetic matching
- Per-user backend search history
- Elasticsearch / Meilisearch
- New entity types
- Analytics

---

## Execution Order

**Option B — Backend-first, then frontend.** The backend search module and the frontend modal are independently testable with no coupling between Phase 3 changes.

---

## Part 1: Backend Ranking

### Constants

Define two constants in the search module (e.g., `backend/src/modules/search/search.constants.ts`):

```ts
export const SEARCH_CANDIDATE_LIMIT = 10; // per entity, internal fetch cap
export const SEARCH_RESPONSE_LIMIT = 20;  // final merged output cap
```

Each domain search query imports `SEARCH_CANDIDATE_LIMIT` and uses it in `.take()`. The `SearchService` already slices to `SEARCH_RESPONSE_LIMIT` before returning — no structural change needed.

### Centralized Scoring Constants

All score values are defined once in the same constants file and imported by domain services. No score literals scattered across files.

```ts
// Base match scores
export const SCORE_EXACT_CODE    = 120; // SKU, orderNumber — highest priority
export const SCORE_STARTSWITH_CODE = 100;
export const SCORE_EXACT_NAME    = 95;
export const SCORE_STARTSWITH_NAME = 85;
export const SCORE_CONTAINS      = 60;  // ILIKE fallback

// Page-specific scores (static, in-memory)
export const SCORE_PAGE_EXACT    = 90;
export const SCORE_PAGE_STARTSWITH = 75;
export const SCORE_PAGE_KEYWORD  = 50;

// Entity type boosts (applied after base score)
export const BOOST_TRANSACTION   = 10;
export const BOOST_CUSTOMER      = 8;
export const BOOST_PRODUCT       = 6;
export const BOOST_PAGE          = 2;
```

### Code/Number Fields by Entity

The "exact code" and "starts-with code" scores apply only to these designated identifier fields:

| Entity | Code Field |
|---|---|
| Customer | `code` |
| Product | `sku` |
| Sales Order | `orderNumber` |
| Purchase Order | `orderNumber` |

Name fields (`name`, `customerName`) use the `EXACT_NAME` / `STARTSWITH_NAME` scores. All other string fields use `CONTAINS`.

### Scoring Logic per Domain

Each domain `searchGlobal` method applies `baseScore + entityBoost`:

**Example — Product:**
```ts
const baseScore = name === q     ? SCORE_EXACT_NAME
                : sku === q      ? SCORE_EXACT_CODE
                : sku.startsWith ? SCORE_STARTSWITH_CODE
                : name.startsWith? SCORE_STARTSWITH_NAME
                                 : SCORE_CONTAINS;
score = baseScore + BOOST_PRODUCT;
```

### Tie-Breaking

When two results have identical final scores, the `SearchService` sort uses a stable secondary order:
1. Score descending (primary)
2. Label ascending (secondary — alphabetical, deterministic)

### Candidate Fetch Limit

Each domain service changes `.take(5)` to `.take(SEARCH_CANDIDATE_LIMIT)` (10). Pages remain static/in-memory and are unaffected.

### What Does Not Change

- Response shape: `{ query, results: GlobalSearchResultDto[] }`
- `score` field on `GlobalSearchResultDto` remains optional
- Endpoint: `GET /search/global?q=`
- Role-based access control

---

## Part 2: Frontend — Recent Searches

### New Utility: `src/utils/recentSearch.ts`

```ts
const storageKey = (userId: string) => `global_search_recent_${userId}`;
const MAX_RECENT = 8;

export interface RecentSearchItem {
  label: string;
  route: string;
  type: 'page' | 'customer' | 'product' | 'transaction';
  timestamp: number;
}

export function getRecentSearches(userId: string): RecentSearchItem[]
// Returns [] on any error (malformed JSON, missing key, storage unavailable)

export function addRecentSearch(
  userId: string,
  item: Omit<RecentSearchItem, 'timestamp'>
): void
// 1. Load current list (defensively)
// 2. Remove existing entry with same route (dedupe by route)
// 3. Prepend with timestamp: Date.now()
// 4. Slice to MAX_RECENT
// 5. Write back

export function clearRecentSearches(userId: string): void
// Exists for test support and future use; no visible UI control in Phase 3
```

All localStorage access is wrapped in try/catch, falling back to `[]` or silent failure.

### SearchModal Behavior

**On open:**
- Load recent searches from localStorage into component state (`useState<RecentSearchItem[]>`)
- Done once on open via `useEffect`

**When query is empty (trimmed):**
- Render a "Recent" section showing loaded recent items
- If no recent items: show neutral hint — "Start typing to search"
- Navigation list = recent items only

**When query is non-empty (≥ 2 chars):**
- Replace Recent section with live RTK Query results
- Navigation list = live results only
- No mixing of recent and live results in Phase 3

**On result select (Enter or click):**
1. Call `addRecentSearch(userId, { label, route, type })`
2. Update `recentSearches` state in memory (keep UI in sync)
3. Navigate to `route`

**Selection index:** Reset to `0` whenever switching between recent and live result lists (i.e., when trimmed query transitions from empty to non-empty or vice versa).

**Recent item rendering:**
- Uses the same result row component as live results
- Clock icon on the left instead of a type badge
- Label and description still shown for context

---

## Part 3: Frontend — UX Polish

### Text Highlighting: `src/utils/highlightText.tsx`

```ts
export function highlightText(text: string, query: string): ReactNode
```

**Behavior:**
- Trims `query` before matching
- Escapes regex special characters in query (`.`, `+`, `?`, `(`, `[`, etc.) before constructing RegExp
- Case-insensitive match of the **first occurrence** only
- Returns three spans: pre-match | **highlighted** | post-match
- Returns a plain text node (no extra wrapping) if no match or if query is empty
- Applied defensively — only called when the field exists and query is non-empty

**Visual treatment:**

| Field | Style |
|---|---|
| Label | `fontWeight: 700`, `color: theme.palette.text.primary` |
| Description | `fontWeight: 600`, `color: theme.palette.text.secondary` (slightly muted) |

No background chips, colored pills, or other decorations in Phase 3.

### Empty State

When query is trimmed and ≥ 2 characters and results array is empty:

```
No results for "[trimmed query]"
Try searching by name, code, SKU, or order number
```

- First line: `Typography` variant `body2`, primary color
- Second line: `Typography` variant `caption`, secondary color
- No icon required

The `[trimmed query]` value uses the trimmed query string, not raw input.

### What Does Not Change

- Keyboard navigation (Ctrl+K, Escape, arrows, Enter)
- Grouping by type in live results
- Type badges on live results
- Modal dimensions (560px)
- Loading spinner behavior
- Error state behavior

---

## File Changes Summary

### Backend

| File | Change |
|---|---|
| `search/search.constants.ts` | **New** — all score and limit constants |
| `search/search.service.ts` | Import constants; sort with label tie-break |
| `search/search.service.spec.ts` | Update tests for new scoring and limits |
| `*/customer.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/product.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/sales-order.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/purchase-order.service.ts` | Import constants; apply new scores + `.take(10)` |

### Frontend

| File | Change |
|---|---|
| `utils/recentSearch.ts` | **New** — localStorage recent search utility |
| `utils/highlightText.tsx` | **New** — text highlight helper |
| `components/common/SearchModal.tsx` | Recent section, highlight, empty state, selection reset |
| `components/common/__tests__/SearchModal.test.tsx` | Tests for new behavior |

---

## Testing Plan

### Backend
- Score ordering: exact code > starts-with code > exact name > starts-with name > contains
- Entity priority: transactions > customers > products > pages at equal base score
- Candidate pool: verify each domain service fetches up to 10
- Final cap: response never exceeds 20 results
- Tie-break: equal-score items sorted label ascending

### Frontend
- `recentSearch.ts`: persistence, deduplication by route, max 8, namespace isolation by userId, graceful localStorage failure
- `highlightText.tsx`: match/no-match, case-insensitivity, regex escape for special chars, null/empty input
- `SearchModal`: recent section shown when query empty, replaced by live results when typing, selection reset on transition, save on Enter and click, clock icon rendering, improved empty state text
