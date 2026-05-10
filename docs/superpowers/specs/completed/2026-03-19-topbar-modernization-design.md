# Top Bar Modernization — Design Spec

**Issue:** #136
**Date:** 2026-03-19
**Status:** Approved

---

## Overview

Modernize the ERP top bar (`AppBar`) by extracting it into a dedicated `TopBar` component, adding breadcrumb navigation, a command-palette search placeholder, a refined system status indicator, and removing the duplicated user/account controls. The sidebar footer (added in PR #135) becomes the sole home for user identity, account actions, logout, and version info.

---

## Decisions

| Topic | Decision |
|---|---|
| Breadcrumbs vs page title | Keep both — breadcrumbs in top bar for context, page title in content area for clarity |
| Global search | Command-palette modal (B): click or Ctrl+K opens overlay with "coming soon" state |
| User avatar/menu in top bar | Remove entirely — sidebar footer is the single access point |
| System status indicator | Icon + absolute-positioned status dot overlay; pulse on warning/error only |
| Component structure | Option B: extract `TopBar.tsx` + `SearchModal.tsx`, refactor `SystemStatus.tsx` in place |

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `frontend/src/constants/layout.ts` | **New** — shared sidebar width constants |
| `frontend/src/components/common/MainLayout.tsx` | Remove all `AppBar`/`Toolbar` JSX and user menu logic; render `<TopBar>`; import constants from `layout.ts` |
| `frontend/src/components/common/TopBar.tsx` | **New** — owns all top bar UI and behavior |
| `frontend/src/components/common/SearchModal.tsx` | **New** — command palette modal |
| `frontend/src/components/common/SystemStatus.tsx` | Refactor in place: chip trigger → icon + status dot |
| `frontend/src/components/common/__tests__/MainLayout.test.tsx` | Remove breadcrumb/title tests (behaviour moves to `TopBar`) |
| `frontend/src/components/common/__tests__/TopBar.test.tsx` | **New** — migrate breadcrumb tests from `MainLayout.test.tsx` |

`NotificationPanel.tsx` is unchanged in logic; it moves to render inside `TopBar` (see notification trigger below).

### Shared layout constants

Create `frontend/src/constants/layout.ts`:

```ts
export const DRAWER_WIDTH_EXPANDED = 256
export const DRAWER_WIDTH_COLLAPSED = 64
```

Both `MainLayout.tsx` and `TopBar.tsx` import from this file. The constants are no longer defined inline in `MainLayout`. This is the single source of truth — local redefinition in both files is not acceptable.

---

## `MainLayout.tsx` — After refactor

### Responsibilities

- Sidebar collapsed/expanded state and `localStorage` persistence
- Mobile drawer open/close state
- `location.pathname` effect: close mobile drawer on navigation (retain `useEffect` for `setMobileOpen(false)`)
- Rendering `<TopBar>`, the sidebar `<Drawer>`, and `<Outlet>`

### Props passed to `TopBar`

```ts
interface TopBarProps {
  collapsed: boolean          // sidebar collapsed state (drives AppBar width offset)
  onMobileMenuOpen: () => void // callback to open mobile drawer
}
```

`MainLayout` passes `collapsed` and `handleDrawerToggle` to `TopBar`. It does not pass sidebar width constants directly — `TopBar` imports `DRAWER_WIDTH_EXPANDED` and `DRAWER_WIDTH_COLLAPSED` from a shared constants file or defines them locally (same values as `MainLayout` currently uses).

### Removed entirely

- All `AppBar`/`Toolbar` JSX
- Avatar, user menu `<Menu>`, and all user menu handlers (`handleUserMenuOpen/Close`, `handleLogout`, `getUserInitials`, `getUserDisplayName`, `getRoleBadgeColor`)
- Notification anchor state and handlers (moved to `TopBar`)
- `useMatches` import (moved to `TopBar`)
- `setUserMenuAnchorEl(null)` from the `location.pathname` effect (user menu no longer exists in `MainLayout`)

### `location.pathname` effect after refactor

```ts
useEffect(() => {
  setMobileOpen(false)
}, [location.pathname])
```

Notification popover close-on-navigate: `TopBar` does **not** need a parallel effect for notifications — the existing `NotificationPanel` already closes on backdrop click/escape. No additional close-on-navigate behavior is needed.

Expected result: ~130–150 lines (down from ~393).

---

## `TopBar.tsx` — Specification

### Props interface

```ts
interface TopBarProps {
  collapsed: boolean
  onMobileMenuOpen: () => void
}
```

### Internal state

```ts
const [notificationAnchorEl, setNotificationAnchorEl] = useState<HTMLElement | null>(null)
const [searchOpen, setSearchOpen] = useState(false)
```

### Visual spec

| Property | Value |
|---|---|
| Height | 64px |
| Background | `#1E1E1E` (Surface) |
| Border bottom | `1px solid #2A2A2A` |
| Box shadow | none (border separation only) |
| Width | computed from `collapsed` prop: `calc(100% - 64px)` or `calc(100% - 256px)` |
| Transition | `width 0.22s ease, margin-left 0.22s ease` (matches sidebar animation) |

### Layout — Desktop

```
[Breadcrumbs ──────────────────] [Search trigger] [Status] [Notifications]
```

### Layout — Mobile (below `lg` breakpoint)

```
[☰ Hamburger] [Leaf title (truncated)] [Status] [Notifications]
```

- Hamburger calls `onMobileMenuOpen`
- Shows only the leaf breadcrumb segment (current page title) as plain `Typography`, `noWrap`
- Search trigger is hidden on mobile
- Status dot and notifications remain visible

---

### Breadcrumbs — Implementation detail (important)

**The router is flat.** All app routes are direct children of the `MainLayout` wrapper in `router.tsx` — there are no nested parent routes with their own `handle.title`. As a result, `useMatches()` on any route will return at most two matches: the anonymous auth/layout wrapper (no `handle`) and the leaf route.

**Consequence:** `useMatches()` will never produce multiple titled ancestor segments. The breadcrumb will always be a single segment (the current page title). The multi-segment hierarchy (e.g., `Inventory / Products / Create Product`) must be derived synthetically from the `pathname`, not from router nesting.

**Implementation: synthetic breadcrumb from pathname**

Build the breadcrumb segments by:
1. Split `location.pathname` on `/`, discard empty strings
2. Walk each prefix from shortest to longest (e.g., `/inventory`, `/inventory/products`, `/inventory/products/create`)
3. For each prefix, look up the corresponding `handle.title` from a static route-to-title map derived from the flat route list, or by matching against the current `useMatches()` entries plus known parent paths
4. Segments with a resolvable title become breadcrumb items; segments without one are skipped

**Implementation:** define a `BREADCRUMB_MAP: Record<string, string>` in `TopBar.tsx` (or a co-located file) covering all static and intermediate paths. Dynamic segments (e.g., `/inventory/products/:id/edit`) are handled separately via `useMatches()` leaf.

```ts
const BREADCRUMB_MAP: Record<string, string> = {
  // Top-level modules
  '/dashboard': 'Dashboard',
  '/inventory': 'Inventory',
  '/sales': 'Sales',
  '/purchasing': 'Purchasing',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/accounting': 'Accounting',
  '/audit-logs': 'Audit Logs',

  // Inventory
  '/inventory/products': 'Products',
  '/inventory/products/create': 'Create Product',
  '/inventory/categories': 'Categories',
  '/inventory/stock-adjustments': 'Stock Adjustments',
  '/inventory/stock-adjustments/create': 'Create Stock Adjustment',

  // Sales
  '/sales/customers': 'Customers',
  '/sales/orders': 'Sales Orders',
  '/sales/orders/create': 'Create Sales Order',
  '/sales/invoices': 'Invoices',
  '/sales/payments': 'Payments',

  // Purchasing
  '/purchasing/suppliers': 'Suppliers',
  '/purchasing/orders': 'Purchase Orders',
  '/purchasing/orders/create': 'Create Purchase Order',
  '/purchasing/goods-received': 'Goods Received',
  '/purchasing/vendor-payments': 'Vendor Payments',

  // Reports (virtual intermediate paths not in router)
  '/reports/inventory': 'Inventory',
  '/reports/purchasing': 'Purchasing',
  '/reports/sales': 'Sales',
  '/reports/inventory/summary': 'Inventory Summary',
  '/reports/inventory/historical': 'Historical Inventory',
  '/reports/inventory/movement-summary': 'Inventory Movement Summary',
  '/reports/inventory/price-list': 'Product Price List',
  '/reports/inventory/product-cost': 'Product Cost Report',
  '/reports/purchasing/order-summary': 'Purchase Order Summary',
  '/reports/purchasing/order-status': 'Purchase Order Status',
  '/reports/purchasing/order-details': 'Purchase Order Details',
  '/reports/purchasing/payment-details': 'Vendor Payment Details',
  '/reports/purchasing/vendor-purchase-list': 'Vendor Product List',
  '/reports/sales/product-summary': 'Sales by Product Summary',
  '/reports/sales/product-details': 'Sales by Product Details',
  '/reports/sales/order-summary': 'Sales Order Summary',
  '/reports/sales/order-profit': 'Sales Order Profit Report',
  '/reports/sales/customer-payment-summary': 'Customer Payment Summary',
  '/reports/sales/payment-by-order': 'Customer Payment by Order',
  '/reports/sales/payment-details': 'Customer Payment Details',
  '/reports/sales/order-history': 'Customer Order History',
  '/reports/sales/product-customer': 'Product Customer Report',

  // Settings
  '/settings/company': 'Company',
  '/settings/price-costing': 'Inventory Costing',
  '/settings/regional': 'Regional',
  '/settings/price-lists': 'Price Lists',
  '/settings/payment-methods': 'Payment Methods',
  '/settings/print': 'Print Settings',
  '/settings/document-numbers': 'Document Numbers',
  '/settings/users': 'Users',
  '/settings/roles': 'Roles & Permissions',
  '/settings/security': 'Security',
  '/settings/backup': 'Backup & Restore',

  // Accounting
  '/accounting/dashboard': 'Dashboard',
  '/accounting/chart-of-accounts': 'Chart of Accounts',
  '/accounting/fiscal-periods': 'Fiscal Periods',
  '/accounting/journal-entries': 'Journal Entries',
  '/accounting/journal-entries/new': 'Create Journal Entry',
  '/accounting/account-mappings': 'Account Mappings',
  '/accounting/settlements': 'Settlements',
  '/accounting/owner-equity': "Owner's Equity",
  '/accounting/expenses': 'Expenses',
  '/accounting/fund-transfers': 'Fund Transfers',
  '/accounting/bank-reconciliations': 'Bank Reconciliation',
  '/accounting/bank-reconciliations/new': 'New Bank Reconciliation',
  // Accounting reports (virtual intermediate path)
  '/accounting/reports': 'Reports',
  '/accounting/reports/trial-balance': 'Trial Balance',
  '/accounting/reports/balance-sheet': 'Balance Sheet',
  '/accounting/reports/profit-loss': 'Profit & Loss',
  '/accounting/reports/general-ledger': 'General Ledger',
  '/accounting/reports/account-activity': 'Account Activity',
}
```

**Note on virtual intermediate paths:** Routes like `/reports`, `/reports/inventory`, `/settings`, `/accounting/reports` are not registered in `router.tsx` but appear as URL prefixes. They are included in `BREADCRUMB_MAP` as non-navigable ancestor labels — when rendered as ancestor breadcrumb items, they should be plain `Typography` (not `Link`) since navigating to them would hit React Router's "no match" or redirect. Alternatively, they can be rendered as links only if a navigable route exists for that prefix. For this iteration, treat all BREADCRUMB_MAP ancestors as plain text unless they match a known navigable route in `router.tsx`.

For dynamic segments (e.g., `/inventory/products/abc123/edit`), match against the route pattern and use the `handle.title` from `useMatches()` leaf (which already carries the correct title like `'Edit Product'`).

**Rendering rules:**
- All segments except the last: render as MUI `Link` pointing to the segment's pathname
- Last segment: render as plain `Typography` (not a link)
- Separator: MUI `NavigateNext` icon
- If only one segment exists (no ancestors): render as plain `Typography` only (no separator, no links)

**Fallback:** If `BREADCRUMB_MAP` has no match and `useMatches()` leaf has no title, render nothing in the breadcrumb area.

**Styling:**
- Font size: `12px`
- All segments color: `#A0A0A0`
- Leaf segment color: `#E0E0E0` (slightly brighter, regular weight)
- No separator after the leaf

**Desktop only** — on mobile, show only the leaf segment title as described above.

---

### Search trigger

Styled as a command trigger, not a form input:
- A `Box` (not `TextField`) containing: search icon on left, placeholder text `Search...` center, shortcut hint on right
- Shortcut badge: `Ctrl+K` styled as a small `kbd`-like chip in `#232323` with border
- `cursor: pointer`, `role="button"`, `aria-label="Open global search"`
- Background: `#232323`, border: `1px solid #2A2A2A`, border-radius: `8px`
- Width: `220px` on desktop; `display: none` on mobile (below `lg`)
- On click: `setSearchOpen(true)`
- No caret, no editable state

**Ctrl+K global shortcut:**

```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      const editable = (e.target as HTMLElement)?.isContentEditable
      if (tag === 'input' || tag === 'textarea' || editable) return
      e.preventDefault()
      setSearchOpen(true)
    }
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [])
```

Listener is cleaned up on unmount. Ignored when focus is inside `input`, `textarea`, or `contenteditable`.

---

### Notifications

Same behavior as current `MainLayout` implementation. `TopBar` owns the anchor state and renders both the trigger and the panel:

```tsx
// notification trigger (in TopBar right-side icons)
<Tooltip title="Notifications">
  <IconButton onClick={(e) => setNotificationAnchorEl(e.currentTarget)} color="inherit">
    <Badge badgeContent={unreadCount} color="error">
      <NotificationsIcon />
    </Badge>
  </IconButton>
</Tooltip>

// notification panel (rendered inside TopBar JSX, after the AppBar)
<NotificationPanel
  anchorEl={notificationAnchorEl}
  open={Boolean(notificationAnchorEl)}
  onClose={() => setNotificationAnchorEl(null)}
/>
```

`TopBar` imports `selectUnreadCount` from `@/store/slices/notificationSlice` and calls `useAppSelector(selectUnreadCount)` for the badge count.

`NotificationPanel` props interface and internal behavior are unchanged.

---

## `SearchModal.tsx` — Specification

### Props

```ts
interface SearchModalProps {
  open: boolean
  onClose: () => void
}
```

`TopBar` owns `searchOpen` state and passes it down.

### Trigger / close behavior

| Action | Result |
|---|---|
| Click search trigger | Open modal |
| Ctrl+K / ⌘+K | Open modal |
| Escape key | Close modal (MUI Modal default) |
| Backdrop click | Close modal (MUI Modal default) |

### Accessibility

Relies on MUI `Modal` default behavior for focus trap and focus restoration (focus returns to trigger element on close). No custom focus management needed.

### Visual spec

| Property | Value |
|---|---|
| Overlay | MUI `Modal` with semi-transparent backdrop |
| Paper width | `560px`, `maxWidth: '90vw'` |
| Background | `#1E1E1E` |
| Border | `1px solid #2A2A2A` |
| Border radius | `12px` |
| Vertical position | Upper-center: `position: absolute, top: '20%', left: '50%', transform: 'translate(-50%, 0)'` |

### Contents

1. **Search input row** — autofocused on open (`autoFocus` prop on `input`)
   - MUI `InputBase` with `SearchIcon` start adornment
   - Placeholder: `Search across the ERP...`
   - Right side: `Esc to close` hint text, muted
   - No heavy border; background: `#232323`

2. **Divider** (`bgcolor: '#2A2A2A'`)

3. **Coming soon body**
   - `ManageSearch` or `SearchOff` MUI icon, large, muted
   - Heading: `Global Search Coming Soon`
   - Secondary text: `Will search across Pages, Customers, Products, and Transactions`

4. **Footer hint**
   - `Tip: Press Ctrl+K to open search anytime`
   - Color: `#6B7280`, `fontSize: 12px`

---

## `SystemStatus.tsx` — Refactor spec

### Status type update

Introduce a fourth status value `unknown` for when health data has not yet loaded or cannot be fetched. Update `getOverallStatus()`:

```ts
// Before
const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' => {
  if (!health) return 'unhealthy'
  return health.status
}

// After
const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' => {
  if (loading && !health) return 'unknown'  // initial fetch in progress
  if (!health) return 'unknown'             // fetch failed, no prior data
  return health.status
}
```

The prior behavior of mapping `null` health to `'unhealthy'` is changed: `null` health now maps to `'unknown'` (gray dot, neutral tooltip). This is more honest — the system is unreachable or still loading, not confirmed unhealthy.

### Replace the chip trigger with icon + dot

**Before:** `<IconButton><Chip label="HEALTHY" /></IconButton>`

**After:**

```tsx
<Tooltip title={tooltipText}>
  <IconButton onClick={handleClick} size="small">
    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
      <DnsRounded sx={{ fontSize: 22, color: '#A0A0A0' }} />
      <Box sx={{
        position: 'absolute',
        top: 2,
        right: 2,
        width: 8,
        height: 8,
        borderRadius: '50%',
        bgcolor: dotColor,
        animation: shouldPulse ? `${statusPulse} 1.8s ease-in-out infinite` : 'none',
        '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
      }} />
    </Box>
  </IconButton>
</Tooltip>
```

`statusPulse` is defined using Emotion's `keyframes` helper (idiomatic MUI approach — not `GlobalStyles`):

```ts
import { keyframes } from '@emotion/react'

const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
`
```

### Dot color mapping

| Status | Color |
|---|---|
| `healthy` | `#22C55E` |
| `degraded` | `#F59E0B` |
| `unhealthy` | `#EF4444` |
| `unknown` | `#6B7280` |

### Pulse rule

```ts
const shouldPulse = overallStatus === 'degraded' || overallStatus === 'unhealthy'
```

No pulse for `healthy` or `unknown`.

### Tooltip text

| Status | Text |
|---|---|
| `healthy` | `System: Healthy — All services operational` |
| `degraded` | `System: Degraded — One or more services affected` |
| `unhealthy` | `System: Unhealthy — Backend may be offline` |
| `unknown` | `System: Unknown — Checking status...` |

### Popover (unchanged)

The existing detail popover with service list (Backend, Database, Redis, Frontend) remains completely intact. Only the trigger (the `IconButton` content) changes.

---

## Page title rule (explicit)

**Breadcrumbs do not replace the page title.**

The breadcrumbs in the top bar serve navigation context ("where am I in the system"). Each page component is responsible for its own prominent heading in the content area. The `h6` title that currently lives in the `Toolbar` is removed from `TopBar` — it is not re-added elsewhere as part of this issue.

> If a page currently relies on `MainLayout`'s `pageTitle` as its only visible title, a follow-up issue should add explicit page headers. That work is out of scope for this issue.

---

## Test migration

The existing `MainLayout.test.tsx` contains 4 tests under `'MainLayout AppBar title'` that test `useMatches()`-driven title rendering. This behaviour moves to `TopBar`.

**Action:** Delete those 4 tests from `MainLayout.test.tsx` and create `TopBar.test.tsx` with equivalent coverage:
- Renders leaf breadcrumb segment from current pathname
- Renders multi-segment breadcrumbs for deep paths (e.g., `/inventory/products/create`)
- Renders nothing in breadcrumb area when pathname has no mapping
- Ctrl+K opens search modal
- Search trigger click opens search modal
- Mobile layout: shows leaf title text, hides search trigger

---

## What is out of scope

- Backend global search integration
- Mobile search icon trigger (may be added in a later iteration)
- Per-page explicit page title headers (follow-up issue)
- Route `handle` additions for routes currently missing `title`
- Notification panel UI redesign (panel was recently improved; cosmetic tweaks deferred)

---

## Theme compliance

All colors reference the dark theme defined in `docs/ui.md`. No new colors are introduced — only values from the existing palette are used.
