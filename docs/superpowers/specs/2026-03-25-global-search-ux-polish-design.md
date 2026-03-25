# Global Search UX Polish — Design Spec

**Issue:** #184
**Date:** 2026-03-25
**Scope:** High-impact items only (B): items 1, 2, 3, 9

---

## Overview

Four targeted improvements to the Global Search experience that improve search usefulness, not just appearance. They work together: pages become less dominant, page descriptions become more informative, highlights become easier to scan, and exact record matches rise to the top.

---

## Item 1: Priority Rebalance (Data > Pages)

**Problem:** Pages often appear above actual data results (Customers, Sales Orders, Products) in both section order and score ranking.

**Two distinct effects — both required:**

- **`GROUP_ORDER` change** — controls section display order in the UI. Moving `page` to the end of the array causes the Pages section to render after all data-result sections.
- **`BOOST_PAGE = 0`** — controls ranking competitiveness in the flat score-sorted result list before grouping. Lowering it from `2` to `0` makes page results slightly less competitive when mixed with record results.

**Changes:**

- `frontend/src/components/common/SearchModal.tsx`: move `'page'` to the last position in `GROUP_ORDER`
- `backend/src/modules/search/search.constants.ts`: change `BOOST_PAGE` from `2` to `0`

---

## Item 2: Meaningful Navigation Labels

**Problem:** Every page result shows `"Navigation"` as its description, providing no useful context.

**Approach:** Derive the section label from the route prefix. No changes to `STATIC_PAGES` entries — a single helper function handles all routes automatically, including future additions.

**Helper: `getPageCategory(route: string): string`**

Evaluation order matters — more specific prefixes must be checked before generic ones:

```ts
function getPageCategory(route: string): string {
  const r = route.toLowerCase().trim();

  if (r === '/dashboard') return 'Dashboard';
  if (r === '/reports' || r.startsWith('/reports/')) return 'Report';
  if (r === '/accounting' || r.startsWith('/accounting/')) return 'Accounting';
  if (r === '/sales' || r.startsWith('/sales/')) return 'Sales';
  if (r === '/purchasing' || r.startsWith('/purchasing/')) return 'Purchasing';
  if (r === '/inventory' || r.startsWith('/inventory/')) return 'Inventory';
  if (r === '/settings' || r.startsWith('/settings/')) return 'Settings';

  return 'Page';
}
```

Notes:
- `/reports` is checked before `/sales` to prevent `/reports/sales/...` from matching as "Sales"
- Trailing-slash safety: each prefix uses exact match (`=== '/x'`) OR `startsWith('/x/')` — never bare `startsWith('/x')`, which would incorrectly match `/sales-reporting`
- Unknown prefix falls back to `"Page"`

**Change:**

- `backend/src/modules/search/search.service.ts`: add `getPageCategory` as a module-level function (outside the `SearchService` class — it has no `this` dependency); replace `description: 'Navigation'` with `description: getPageCategory(page.route)` in `searchPages()`

---

## Item 3: Highlight Color

**Problem:** Matched text is only bolded, which is hard to spot when scanning many results quickly.

**Approach:** Add an optional `color` parameter to `highlightText()`. The helper stays a pure function with no theme dependency. The caller (`SearchResultRow`) provides the color from `useTheme()`.

**`highlightText` signature change:**

```ts
export function highlightText(
  text: string,
  query: string,
  highlightWeight = 700,
  highlightColor?: string,
): ReactNode
```

When `highlightColor` is provided, the highlight span gets both `fontWeight` and `color` applied.

**Call site in `SearchResultRow`:**

- Call `useTheme()` to get the MUI theme
- Pass `theme.palette.primary.light` as `highlightColor` — slightly brighter than `primary.main` for better contrast on the dark `#1E1E1E` background
- **Label:** bold + color (`highlightWeight = 700`, `highlightColor = primary.light`)
- **Description:** color only (`highlightWeight = 600` as currently, `highlightColor = primary.light`) — no extra weight to keep visual hierarchy clear

**Changes:**

- `frontend/src/utils/highlightText.tsx`: add optional `highlightColor` param; apply as `color` on the highlight span when provided
- `frontend/src/components/common/SearchModal.tsx`: import `useTheme`; pass `theme.palette.primary.light` to both label and description `highlightText` calls

Note: `SearchResultRow` is also rendered for recent searches (with `query=""`). Because `highlightText` already returns the text unchanged when `query` is empty, no special handling is needed — the color will never be applied to recent result rows.

---

## Item 9: Exact Match Priority

**Problem:** Exact record matches (e.g., typing a customer's full name) don't always rank clearly above partial page matches or other partial record matches.

**Approach:** Add `BOOST_EXACT_MATCH = 20` to scoring constants. Apply it in each entity service's scoring logic when the computed `baseScore` is `SCORE_EXACT_NAME` or `SCORE_EXACT_CODE` — i.e. any exact match on any field, whether name, phone, SKU, order number, or reference. Pages do not receive this boost — applying it to pages would work against item 1.

**Where the scoring logic lives:** Each entity type has its own scoring in its own service file. `search.service.ts` only orchestrates calls — the `BOOST_EXACT_MATCH` changes must be made in each entity service file:

| Entity | File |
|--------|------|
| Customer | `backend/src/modules/sales/services/customer.service.ts` |
| Product | `backend/src/modules/inventory/services/product.service.ts` |
| Supplier | `backend/src/modules/purchasing/services/supplier.service.ts` |
| Sales Order | `backend/src/modules/sales/services/sales-order.service.ts` |
| Invoice | `backend/src/modules/sales/services/invoice.service.ts` |
| Customer Payment | `backend/src/modules/sales/services/payment.service.ts` |
| Purchase Order | `backend/src/modules/purchasing/services/purchase-order.service.ts` |
| Vendor Payment | `backend/src/modules/purchasing/services/vendor-payment.service.ts` |
| Journal Entry | `backend/src/modules/accounting/services/journal-entry.service.ts` |

**What "exact match" means:** Each service computes a `baseScore` using a priority chain (e.g. `phone === q` → `SCORE_EXACT_CODE`, `name === q` → `SCORE_EXACT_NAME`, etc.). Apply `BOOST_EXACT_MATCH` when `baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME`. This covers all exact matches — name, code, phone, SKU, order number, reference — without needing to re-examine individual fields.

**Score examples after change:**
- Exact customer name: `SCORE_EXACT_NAME(95) + BOOST_CUSTOMER(8) + BOOST_EXACT_MATCH(20) = 123`
- Exact customer phone (code): `SCORE_EXACT_CODE(120) + BOOST_CUSTOMER(8) + BOOST_EXACT_MATCH(20) = 148`
- Exact page: `SCORE_PAGE_EXACT(90) + BOOST_PAGE(0) = 90`
- StartsWith customer: `SCORE_STARTSWITH_NAME(85) + BOOST_CUSTOMER(8) = 93`

Exact record matches decisively outrank all partial matches and all page results.

**Changes:**

- `backend/src/modules/search/search.constants.ts`: add `export const BOOST_EXACT_MATCH = 20`
- Each entity service listed above: import `BOOST_EXACT_MATCH`; in the score expression, add `+ (baseScore === SCORE_EXACT_CODE || baseScore === SCORE_EXACT_NAME ? BOOST_EXACT_MATCH : 0)`

---

## Files Touched

| File | Change |
|------|--------|
| `frontend/src/components/common/SearchModal.tsx` | Move `page` to end of `GROUP_ORDER`; use `useTheme`; pass color to `highlightText` |
| `frontend/src/utils/highlightText.tsx` | Add optional `highlightColor` param |
| `backend/src/modules/search/search.constants.ts` | `BOOST_PAGE = 0` (intentional — zero is correct, the constant remains for formula consistency); add `BOOST_EXACT_MATCH = 20` |
| `backend/src/modules/search/search.service.ts` | Add `getPageCategory` module-level function (outside the class, no `this` dependency); apply in `searchPages()` |
| `backend/src/modules/sales/services/customer.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/inventory/services/product.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/supplier.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/sales-order.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/invoice.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/sales/services/payment.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/purchasing/services/vendor-payment.service.ts` | Import and apply `BOOST_EXACT_MATCH` |
| `backend/src/modules/accounting/services/journal-entry.service.ts` | Import and apply `BOOST_EXACT_MATCH` |

---

## Out of Scope (deferred to later polish)

- Stronger group header styling
- Result density tweaks
- Color-coded type badges
- Selected-row visual polish
- Result counts per group
