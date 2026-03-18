# Header Modernization Design

**Issue:** #125 — Modernize Header with Logo, Application Name, and Workspace Label
**Date:** 2026-03-18
**Status:** Approved

---

## Overview

Modernize two header areas: the sidebar brand header (logo + app name + company name) and the AppBar page title (route-derived instead of static). No structural layout changes — purely content and data upgrades.

---

## Section 1: Sidebar Header

### Current State

A hardcoded 36×36 blue box with "ERP" text, followed by `<Typography variant="h6">ERP System</Typography>`, and the collapse toggle.

### New State

**Brand container (36×36, fixed):**
The outer container stays exactly 36×36 in all states. The inner content is conditional:

- If `logoUrl` is set and the image loads successfully: render `<img>` with `objectFit: 'contain'`, centered, `max-width: 100%`, `max-height: 100%`, no distortion. Apply a subtle `rgba(255,255,255,0.04)` background to support transparent PNG/SVG logos on the dark sidebar.
- If `logoUrl` is absent, loading, errored, or the image fires `onError`: render the existing styled "ERP" fallback box (unchanged appearance).

**Text stack (expanded mode only):**
Beside the brand container, a vertical two-line stack:

- Line 1: `ERP System` — `variant="h6"`, `fontWeight: 600`, `color: SIDEBAR_COLORS.activeText` (white)
- Line 2: `company.name` — `variant="caption"`, `color: SIDEBAR_COLORS.text` (#9CA3AF), `noWrap`, ellipsis truncation, tight line height. Omitted entirely when `company.name` is unavailable — no empty line, no placeholder.

**Collapsed mode:** Only the 36×36 mark is shown. The text stack is hidden. Toggle position unchanged.

**Data source:** `useGetCompanySettingsQuery()` from `settingsApi.ts`. On loading/error, degrade gracefully — show the ERP fallback mark, show "ERP System", omit company name. No spinner, no layout shift.

**Layout structure (expanded):**
```
[ 36×36 brand mark ] [ ERP System        ] [ toggle ]
                      [ Acme Trading Sdn  ]
```

---

## Section 2: AppBar Page Title

### Current State

Static `<Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>ERP System</Typography>` in `MainLayout.tsx`.

### New State

Replace with a route-derived title using React Router's `handle` metadata and `useMatches()`.

**Route metadata:** Add `handle: { title: string }` to every route object in `router.tsx`. Example entries:

| Path | Title |
|---|---|
| `/dashboard` | `Dashboard` |
| `/inventory/products` | `Products` |
| `/inventory/products/create` | `Create Product` |
| `/inventory/products/:id/edit` | `Edit Product` |
| `/sales/customers` | `Customers` |
| `/sales/customers/:id` | `Customer Profile` |
| `/sales/orders/create` | `Create Sales Order` |
| `/accounting/journal-entries` | `Journal Entries` |
| `/accounting/journal-entries/new` | `Create Journal Entry` |
| `/accounting/journal-entries/:id/edit` | `Edit Journal Entry` |
| `/accounting/journal-entries/:id` | `Journal Entry` |
| `/settings/roles` | `Roles & Permissions` |
| `/reports/sales/order-profit` | `Sales Order Profit Report` |

**Naming convention:**
- List pages → plural noun (`Products`, `Journal Entries`)
- Create forms → `Create [Entity]`
- Edit forms → `Edit [Entity]`
- Detail pages → singular noun (`Journal Entry`, `Customer Profile`)
- Special cases → business name (`Roles & Permissions`)

**Title resolution in MainLayout:**

```ts
type RouteHandle = {
  title?: string
}

const matches = useMatches()
const pageTitle =
  [...matches].reverse().find(m => (m.handle as RouteHandle)?.title)?.handle?.title ?? 'ERP System'
```

Deepest matched route with a title wins. Falls back to `'ERP System'` when no handle exists (e.g., 404 page or auth routes).

**Typography:** Same `variant="h6"`, `fontWeight: 600`, `flexGrow: 1`, `noWrap`. Content-only change, no layout change.

---

## Section 3: Testing

### Sidebar Tests (`Sidebar.test.tsx`)

Cover at the component level:

- Renders logo `<img>` with correct `src` and `alt` when `logoUrl` is set
- Renders "ERP" fallback mark when `logoUrl` is absent
- Renders "ERP" fallback mark when image fires `onError`
- Expanded: "ERP System" is always visible
- Expanded: company name is shown when `company.name` is available
- Expanded: company name line is absent when `company.name` is unavailable
- Collapsed: only the 36×36 mark is shown; text block is hidden

Avoid asserting internal DOM wrapper structure. Prefer assertions on visible content (image src/alt, text presence/absence).

### MainLayout Tests

Mock `useMatches()` and cover:

- Deepest matched route's `handle.title` is shown in the AppBar
- When only a parent route has a title and the child has none, the parent's title is used
- Falls back to `'ERP System'` when no route in the match chain has a `handle.title`
- Falls back to `'ERP System'` on the 404 route
- Optional: render `MainLayout` with mocked matches and assert AppBar title while sidebar renders normally

### Router Tests (`__tests__/router.test.tsx`)

No new dedicated router tests required. Existing tests may need small updates if they assert on the static "ERP System" AppBar text or inspect exact route object shapes (which now include `handle`).

---

## Files to Modify

| File | Change |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | Brand header: conditional logo/fallback, two-line text stack, company data from settings API |
| `frontend/src/components/common/MainLayout.tsx` | AppBar: replace static title with `useMatches()`-derived page title |
| `frontend/src/router.tsx` | Add `handle: { title }` to all route objects |

---

## Non-Goals

- No breadcrumb implementation (future issue)
- No unified route/menu/permissions config (future refactor)
- No changes to sidebar navigation items, collapsed flyout behavior, or color scheme
- No changes to the AppBar actions area (notifications, user avatar, system status)
