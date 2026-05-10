# Issue #260 — Master-Detail-Items Workspace Layout

**Date:** 2026-04-03  
**Issue:** blur88/erp2#260  
**Scope:** Sales Orders page + Purchase Orders page (desktop layout only)

---

## Objective

Replace the current single-panel detail view in Sales Orders and Purchase Orders with a triple-card workspace that keeps the order list, order metadata, and order items all visible simultaneously — eliminating the need to scroll past metadata to reach items.

---

## Architecture

### New component: `MasterDetailWorkspace`

**Location:** `frontend/src/components/common/MasterDetailWorkspace.tsx`

A pure layout shell — no state, no data, no behavior. Accepts three named slots:

```tsx
interface MasterDetailWorkspaceProps {
  listSlot: React.ReactNode       // left nav card (25% width)
  headerSlot: React.ReactNode     // top-right context header (content-driven height)
  workspaceSlot: React.ReactNode  // bottom-right workspace (fills remaining height)
  isMobile: boolean               // when true, renders mobile fallback layout
}
```

**Desktop layout (md+):**
- Outer `Box`: `display: flex, flexDirection: row, height: calc(100vh - 300px), gap: spacing(3)`
- Left `Box`: `width: 25%, flexShrink: 0, overflow: hidden` — contains `listSlot`
- Right `Box`: `flex: 1, display: flex, flexDirection: column, gap: spacing(2), overflow: hidden` — contains `headerSlot` (content height) stacked above `workspaceSlot` (`flex: 1, overflow: hidden`)

**Mobile layout:**
- Falls back to the existing stacked behavior: `listSlot` on top, `headerSlot` below, `workspaceSlot` below that — matching the current `Grid container` behavior. Each slot renders at natural height with vertical scroll on the page.

---

## Component Changes

### Sales Orders

**Delete:** `frontend/src/pages/sales/components/OrderDetailsPanel.tsx`

**Create:** `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Props: all current `OrderDetailsPanelProps` except items-related rendering
- Contains: order metadata table (customer, date, invoice refs, payment refs, journal entry ref), financial summary table (subtotal, shipping, total, paid, balance), Pay/Fulfill action buttons
- Wrapped in `Paper` with no fixed height (content-driven)
- Empty state: when `selectedOrder` is null, renders the "Select an order to view details" message in a centered `Paper`

**Create:** `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx`
- Props: `selectedOrder: SalesOrder | null`
- Contains: "SO Items" header + items table with independent scroll
- Wrapped in `Paper` with `display: flex, flexDirection: column, flex: 1, overflow: hidden`
- Empty state: when `selectedOrder` is null, renders a `Paper` with `flex: 1` but no content (the context header handles the "select an order" prompt)
- Items table: identical to current implementation, `TableContainer` with `flex: 1, overflow: auto`

### Purchase Orders

**Delete:** `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx`

**Create:** `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Props: all current `PurchaseOrderDetailsPanelProps` except items-related rendering
- Contains: PO info table (supplier, date, GRN refs, vendor payment refs, journal entry ref), financial summary (subtotal, shipping, total, paid, balance), Pay/Receive action buttons
- Same Paper/empty-state pattern as `OrderContextHeader`

**Create:** `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`
- Props: `selectedOrder: PurchaseOrder | null`
- Contains: "PO Items" header + items table with independent scroll
- Same Paper/scroll pattern as `OrderWorkspaceCard`

---

## Page Changes

### `OrdersPage.tsx`

Replace:
```tsx
<Grid container spacing={3}>
  <Grid item xs={12} md={3}>
    <OrdersTable ... />
  </Grid>
  <Grid item xs={12} md={9}>
    <OrderDetailsPanel ... />
  </Grid>
</Grid>
```

With:
```tsx
<MasterDetailWorkspace
  isMobile={isMobile}
  listSlot={<OrdersTable ... />}
  headerSlot={<OrderContextHeader ... />}
  workspaceSlot={<OrderWorkspaceCard selectedOrder={selectedOrder} />}
/>
```

Props currently passed to `OrderDetailsPanel` are distributed: metadata/action props go to `OrderContextHeader`, items are handled internally by `OrderWorkspaceCard` from `selectedOrder`.

### `PurchaseOrdersPage.tsx`

Same substitution pattern — replace `Grid container` + `PurchaseOrderDetailsPanel` with `<MasterDetailWorkspace>` wiring `PurchaseOrderContextHeader` and `PurchaseOrderWorkspaceCard`.

---

## Data Flow

- No new state, no new API calls, no new hooks
- `MasterDetailWorkspace` is a pure layout component — zero data awareness
- Props currently on `OrderDetailsPanel` split between header (metadata + actions) and workspace (items read from `selectedOrder` directly)
- All existing hooks (`useOrdersActions`, `useOrdersSelection`, `useOrdersPageState`, and purchasing equivalents) are untouched

---

## Styling Conventions

- All new components use existing `TABLE_STYLES` constants
- `Paper` components use no explicit `elevation` override — inherit theme default
- `gap` between header and workspace cards: `theme.spacing(2)` (matching existing `spacing={3}` grid gaps roughly)
- No new color, typography, or spacing tokens introduced

---

## Error Handling

- API error `Alert` stays in the page component above `MasterDetailWorkspace` — unchanged
- "Select an order" empty state: rendered by `OrderContextHeader` / `PurchaseOrderContextHeader` when `selectedOrder` is null; `WorkspaceCard` renders an empty `Paper` in that case
- Items empty state (`Alert severity="info"`) stays inside the workspace cards — unchanged

---

## Testing

- No new unit tests required (no new logic)
- Existing filterbar tests (`OrdersPage.filterbar.test.tsx`, `PurchaseOrdersPage.filterbar.test.tsx`) are unaffected — they test filter state, not panel structure
- Manual verification: confirm items table scrolls independently of the context header on desktop; confirm mobile stacks correctly

---

## Out of Scope

- Invoices page and other list+detail pages — future work
- Behavior sharing between modules (keyboard navigation, selection state)
- Resizable divider between header and workspace
- Any mobile-specific improvements beyond preserving current behavior
