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

| Entity | Code/Identifier Field | Name Field |
|---|---|---|
| Customer | `phone` (no `code` field exists on entity) | `name` |
| Product | `barcode` (actual entity/DB field; `sku` is an alias in some service methods — scoring uses the entity value, not the alias; UI may still display "SKU" as the label if that is what users recognize) | `name` |
| Sales Order | `orderNumber` | `customerName` (joined) |
| Purchase Order | `orderNumber` | supplier name (if available) |

The `SCORE_EXACT_CODE` / `SCORE_STARTSWITH_CODE` tiers apply to the Code/Identifier fields above. Name fields use `SCORE_EXACT_NAME` / `SCORE_STARTSWITH_NAME`. All other string fields use `SCORE_CONTAINS`.

> **Customer note:** Because `phone` is a nullable field and not a structured identifier like an order number, `SCORE_EXACT_CODE = 120` for an exact phone match remains correct — a user typing an exact phone number expects the customer to be the top result. Phone matching should compare normalized values where possible (trimmed, formatting-insensitive), consistent with however the existing service already handles phone queries.

### Scoring Logic per Domain

Each domain `searchGlobal` method applies `baseScore + entityBoost`:

**Example — Product:**
```ts
// Check exact code before exact name — code matches have higher priority (120 > 95)
const baseScore = barcode === q          ? SCORE_EXACT_CODE
                : barcode.startsWith(q)  ? SCORE_STARTSWITH_CODE
                : name === q             ? SCORE_EXACT_NAME
                : name.startsWith(q)     ? SCORE_STARTSWITH_NAME
                                         : SCORE_CONTAINS;
score = baseScore + BOOST_PRODUCT;
```

### Tie-Breaking

When two results have identical final scores, the `SearchService` sort uses a stable secondary order:
1. Score descending (primary)
2. Label ascending, case-insensitive (secondary — `localeCompare` or `.toLowerCase()` before comparing, deterministic)

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
  description?: string; // preserved for display; matches live result row rendering
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
// 1. Load current list (defensively, [] on any error)
// 2. Remove existing entry with same route (dedupe by route)
// 3. Prepend with timestamp: Date.now()
// 4. Slice to MAX_RECENT
// 5. Write back — wrapped in try/catch; silently swallows errors (e.g. quota exceeded)

export function clearRecentSearches(userId: string): void
// Removes the key from localStorage; wrapped in try/catch.
// No visible UI control in Phase 3 — exists for test support and future use.
```

All localStorage access is wrapped in try/catch. `getRecentSearches` returns `[]` on any error. `addRecentSearch` and `clearRecentSearches` silently swallow errors (no throw, no user-visible feedback).

### SearchModal Behavior

**On open:**
- Load recent searches from localStorage into component state (`useState<RecentSearchItem[]>`)
- Done once on open via `useEffect`

**When trimmed query is empty (0 chars):**
- Render a "Recent" section showing loaded recent items
- If no recent items: show neutral hint — "Start typing to search"
- Navigation list = recent items only

**When trimmed query is 1 char:**
- Inherit existing behavior: show help/hint text (query too short to search)
- Do not show recent searches — this prevents the recent section from briefly flashing during the transition from empty to a real query, which would feel inconsistent
- Navigation list = empty (no keyboard navigation)

**When query is non-empty (≥ 2 chars):**
- Replace Recent section with live RTK Query results
- Navigation list = live results only
- No mixing of recent and live results in Phase 3

**On result select (Enter or click):**
1. Call `addRecentSearch(userId, { label, description, route, type })`
2. Update `recentSearches` state in memory optimistically (keep UI in sync for this session). This update is session-only: if storage fails silently (quota exceeded etc.), in-memory state will show the add, but reopening the modal reloads from storage and the item will be absent. This is acceptable; no reconciliation is required.
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
- Implementation may use `RegExp` (with special chars escaped) or a plain `indexOf`/`split` approach — either is acceptable as long as it is case-insensitive, matches the first occurrence only, and handles special characters safely
- Case-insensitive match of the **first occurrence** only
- Returns three spans: pre-match | **highlighted** | post-match
- Returns the original `text` string unchanged (no React wrapping) if there is no match or if query is empty/blank. This is assignable to `ReactNode` — callers must treat the return as opaque `ReactNode` only and never cast it to a React element.
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
| `search/search.service.ts` | Import constants; refactor `searchPages` to use `SCORE_PAGE_*` constants; sort with label tie-break |
| `search/search.service.spec.ts` | Update tests for new scoring and limits |
| `*/customer.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/customer.service.spec.ts` | Update tests for new scoring and candidate limit |
| `*/product.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/product.service.spec.ts` | Update tests for new scoring and candidate limit |
| `*/sales-order.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/sales-order.service.spec.ts` | Update tests for new scoring and candidate limit |
| `*/purchase-order.service.ts` | Import constants; apply new scores + `.take(10)` |
| `*/purchase-order.service.spec.ts` | Update tests for new scoring and candidate limit |

### Frontend

| File | Change |
|---|---|
| `utils/recentSearch.ts` | **New** — localStorage recent search utility |
| `utils/recentSearch.test.ts` | **New** — unit tests for recent search utility |
| `utils/highlightText.tsx` | **New** — text highlight helper |
| `utils/highlightText.test.tsx` | **New** — unit tests for highlight helper |
| `components/common/SearchModal.tsx` | Recent section, highlight, empty state, selection reset |
| `components/common/__tests__/SearchModal.test.tsx` | Tests for new behavior |

---

## Testing Plan

### Backend
- Score ordering: exact code > starts-with code > exact name > starts-with name > contains
- Entity priority: transactions > customers > products > pages at equal base score
- Candidate pool: verify the candidate query limit was increased from 5 to 10 — assert on behavior (no more than 10 candidates per entity source are considered before merge), not on the raw `.take()` call
- Final cap: response never exceeds 20 results
- Tie-break: two results with identical final score are returned in ascending label order (verified with a test case that has two items sharing the same score)

### Frontend
- `recentSearch.ts`: persistence, deduplication by route, max 8, namespace isolation by userId, graceful localStorage failure
- `highlightText.tsx`: match/no-match, case-insensitivity, regex escape for special chars, null/empty input
- `SearchModal`: recent section shown when query empty, replaced by live results when typing, selection reset on transition, save on Enter and click, clock icon rendering, improved empty state text
