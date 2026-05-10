# Header Modernization Design

**Issue:** #125 — Modernize Header with Logo, Application Name, and Workspace Label
**Date:** 2026-03-18
**Status:** Draft

---

## Overview

Modernize two header areas: the sidebar brand header (logo + app name + company name) and the AppBar page title (route-derived instead of static). No structural layout changes — purely content and data upgrades.

---

## Section 1: Sidebar Header

### Current State

A hardcoded 36×36 blue box with "ERP" text, followed by `<Typography variant="h6">ERP System</Typography>`, and the collapse toggle. The header row uses `justifyContent: collapsed ? 'center' : 'space-between'`.

### New State

**Brand container (36×36, fixed):**
The outer container stays exactly 36×36 in all states. The inner content is conditional:

- If `logoUrl` is set and the image loads successfully: render `<img>` with `objectFit: 'contain'`, centered, `width: '100%'`, `height: '100%'`, no distortion, `alt={company.name ?? 'Company logo'}`. Apply a subtle `bgcolor: 'rgba(255,255,255,0.04)'` background to support transparent PNG/SVG logos on the dark sidebar. Add `onError` handler that sets a local `useState` flag (`imageError`) to `true`, triggering the fallback.
- If `logoUrl` is absent, the query is loading/errored, or `imageError` is `true`: render the existing styled "ERP" fallback box (unchanged appearance, no background tweak).

**Text stack (expanded mode only):**
Beside the brand container, a vertical two-line stack:

- Line 1: `ERP System` — `variant="h6"`, `fontWeight: 600`, `color: SIDEBAR_COLORS.activeText` (white)
- Line 2: `company.name` — `variant="caption"`, `color: SIDEBAR_COLORS.text` (#9CA3AF), `noWrap`, ellipsis truncation, tight line height. Omitted entirely when `company.name` is unavailable — no empty line, no placeholder.

**Collapsed mode:** Only the 36×36 mark is shown. The text stack is hidden. The existing `justifyContent: 'center'` logic on the header row is retained unchanged, so the mark stays centered and the toggle stays in its current position — no change to the toggle button's rendering or placement logic.

**Data source:** `useGetCompanySettingsQuery()` from `settingsApi.ts`, called at the top of `Sidebar`. RTK Query's default caching (60-second `keepUnusedDataFor`) is acceptable — no polling or `refetchOnMountOrArgChange` needed. On loading/error, degrade gracefully: show the ERP fallback mark, show "ERP System", omit company name. No spinner, no layout shift.

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

**Route metadata:** Add `handle: { title: string }` to every applicable route object in `router.tsx`. Redirect routes (`/`, `/accounting`) and the catch-all (`*`) do not get a handle. Auth routes (`/login`, `/change-password-required`) are outside `MainLayout` and do not get a handle.

**Complete route title mapping:**

| Path | Title |
|---|---|
| `/dashboard` | `Dashboard` |
| `/inventory` | `Inventory` |
| `/inventory/products` | `Products` |
| `/inventory/products/create` | `Create Product` |
| `/inventory/products/:id/edit` | `Edit Product` |
| `/inventory/categories` | `Categories` |
| `/inventory/stock-adjustments` | `Stock Adjustments` |
| `/inventory/stock-adjustments/create` | `Create Stock Adjustment` |
| `/inventory/stock-adjustments/:id/edit` | `Edit Stock Adjustment` |
| `/sales` | `Sales` |
| `/sales/customers` | `Customers` |
| `/sales/customers/:id` | `Customer Profile` |
| `/sales/orders` | `Sales Orders` |
| `/sales/orders/create` | `Create Sales Order` |
| `/sales/orders/:id/edit` | `Edit Sales Order` |
| `/sales/invoices` | `Invoices` |
| `/sales/payments` | `Payments` |
| `/purchasing` | `Purchasing` |
| `/purchasing/suppliers` | `Suppliers` |
| `/purchasing/orders` | `Purchase Orders` |
| `/purchasing/orders/create` | `Create Purchase Order` |
| `/purchasing/orders/:id/edit` | `Edit Purchase Order` |
| `/purchasing/goods-received` | `Goods Received` |
| `/purchasing/vendor-payments` | `Vendor Payments` |
| `/reports/inventory/summary` | `Inventory Summary` |
| `/reports/inventory/historical` | `Historical Inventory` |
| `/reports/inventory/movement-summary` | `Inventory Movement Summary` |
| `/reports/inventory/price-list` | `Product Price List` |
| `/reports/inventory/product-cost` | `Product Cost Report` |
| `/reports/purchasing/order-summary` | `Purchase Order Summary` |
| `/reports/purchasing/order-status` | `Purchase Order Status` |
| `/reports/purchasing/order-details` | `Purchase Order Details` |
| `/reports/purchasing/payment-details` | `Vendor Payment Details` |
| `/reports/purchasing/vendor-purchase-list` | `Vendor Product List` |
| `/reports/sales/product-summary` | `Sales by Product Summary` |
| `/reports/sales/product-details` | `Sales by Product Details` |
| `/reports/sales/order-summary` | `Sales Order Summary` |
| `/reports/sales/order-profit` | `Sales Order Profit Report` |
| `/reports/sales/customer-payment-summary` | `Customer Payment Summary` |
| `/reports/sales/payment-by-order` | `Customer Payment by Order` |
| `/reports/sales/payment-details` | `Customer Payment Details` |
| `/reports/sales/order-history` | `Customer Order History` |
| `/reports/sales/product-customer` | `Product Customer Report` |
| `/settings/company` | `Company` |
| `/settings/price-costing` | `Inventory Costing` |
| `/settings/regional` | `Regional` |
| `/settings/price-lists` | `Price Lists` |
| `/settings/price-lists/:id` | `Price List Details` |
| `/settings/payment-methods` | `Payment Methods` |
| `/settings/print` | `Print Settings` |
| `/settings/document-numbers` | `Document Numbers` |
| `/settings/users` | `Users` |
| `/settings/roles` | `Roles & Permissions` |
| `/settings/security` | `Security` |
| `/settings/backup` | `Backup & Restore` |
| `/audit-logs` | `Audit Logs` |
| `/accounting/dashboard` | `Dashboard` |
| `/accounting/chart-of-accounts` | `Chart of Accounts` |
| `/accounting/fiscal-periods` | `Fiscal Periods` |
| `/accounting/journal-entries` | `Journal Entries` |
| `/accounting/journal-entries/new` | `Create Journal Entry` |
| `/accounting/journal-entries/:id/edit` | `Edit Journal Entry` |
| `/accounting/journal-entries/:id` | `Journal Entry` |
| `/accounting/account-mappings` | `Account Mappings` |
| `/accounting/settlements` | `Settlements` |
| `/accounting/owner-equity` | `Owner's Equity` |
| `/accounting/expenses` | `Expenses` |
| `/accounting/fund-transfers` | `Fund Transfers` |
| `/accounting/bank-reconciliations` | `Bank Reconciliation` |
| `/accounting/bank-reconciliations/new` | `New Bank Reconciliation` |
| `/accounting/bank-reconciliations/:id` | `Bank Reconciliation` |
| `/accounting/reports/trial-balance` | `Trial Balance` |
| `/accounting/reports/balance-sheet` | `Balance Sheet` |
| `/accounting/reports/profit-loss` | `Profit & Loss` |
| `/accounting/reports/general-ledger` | `General Ledger` |
| `/accounting/reports/account-activity` | `Account Activity` |

**Naming convention:**
- List pages → plural noun (`Products`, `Journal Entries`)
- Create forms → `Create [Entity]`
- Edit forms → `Edit [Entity]`
- Detail pages → singular noun (`Journal Entry`, `Customer Profile`)
- Special cases → business name (`Roles & Permissions`, `Profit & Loss`, `Owner's Equity`)

**Title resolution in MainLayout:**

```ts
type RouteHandle = {
  title?: string
}

const matches = useMatches()
const pageTitle =
  [...matches].reverse().find(m => (m.handle as RouteHandle)?.title)?.handle?.title ?? 'ERP System'
```

`useMatches()` returns the full match chain: `RootLayout` → `MainLayout` (pathless, auth-guarded) → leaf route. Neither `RootLayout` nor the `MainLayout` wrapper carry a `handle.title`, so the leaf route always wins. Falls back to `'ERP System'` when no route in the chain has a title (e.g., 404 page).

**Typography:** Same `variant="h6"`, `fontWeight: 600`, `flexGrow: 1`, `noWrap`. Content-only change, no layout change.

---

## Section 3: Testing

### Sidebar Tests (`Sidebar.test.tsx`)

**Existing test migration:** Adding `useGetCompanySettingsQuery` to `Sidebar.tsx` will break all existing Sidebar tests because the hook internally requires a Redux context. The fix is to add a `vi.mock` at the top of the test file that replaces the hook with a `vi.fn()` returning a plain object — no Redux Provider needed:

```ts
vi.mock('@/store/api/settingsApi', () => ({
  useGetCompanySettingsQuery: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}))
```

Individual tests that need company data override the mock return value as needed.

**New test cases:**

- Renders logo `<img>` with correct `src` and `alt={company.name}` when `logoUrl` is set and the image loads
- Renders logo `<img>` with `alt="Company logo"` when `logoUrl` is set but `company.name` is absent
- Renders "ERP" fallback mark when `logoUrl` is absent
- Renders "ERP" fallback mark when `logoUrl` is set but image fires `onError`
- Expanded: "ERP System" text is always in the document
- Expanded: company name is in the document when `company.name` is available
- Expanded: company name is `not.toBeInTheDocument()` when `company.name` is unavailable
- Collapsed: "ERP System" text is `not.toBeInTheDocument()`; only the mark is shown

Avoid asserting internal DOM wrapper structure. Prefer assertions on visible content (image src/alt, text presence/absence).

### MainLayout Tests (`MainLayout.test.tsx` — new file)

This file does not currently exist and must be created at `frontend/src/components/common/__tests__/MainLayout.test.tsx`.

Mock `useMatches` from `react-router-dom` (via `vi.mock`) and cover:

- Deepest matched route's `handle.title` is rendered in the AppBar
- When a match chain has multiple entries but only a non-leaf entry has a `handle.title`, that title is used (covers the "deepest titled match" logic)
- Falls back to `'ERP System'` when no route in the match chain has a `handle.title`
- Falls back to `'ERP System'` when the match chain is empty (404 scenario)

### Router Tests (`__tests__/router.test.tsx`)

No new dedicated tests required. Existing tests may need small updates if they assert on the static "ERP System" AppBar text or inspect exact route object shapes (which now include `handle`).

---

## Files to Modify / Create

| File | Action |
|---|---|
| `frontend/src/components/common/Sidebar.tsx` | Modify: conditional logo/fallback with `onError` state, two-line text stack, company data from settings API |
| `frontend/src/components/common/MainLayout.tsx` | Modify: replace static title with `useMatches()`-derived page title; add `RouteHandle` type |
| `frontend/src/router.tsx` | Modify: add `handle: { title }` to all applicable route objects |
| `frontend/src/components/common/__tests__/Sidebar.test.tsx` | Modify: add `vi.mock` for `settingsApi`; add new test cases; update existing tests |
| `frontend/src/components/common/__tests__/MainLayout.test.tsx` | Create: new test file for AppBar title resolution |

---

## Non-Goals

- No breadcrumb implementation (future issue)
- No unified route/menu/permissions config (future refactor)
- No changes to sidebar navigation items, collapsed flyout behavior, or color scheme
- No changes to the AppBar actions area (notifications, user avatar, system status)
