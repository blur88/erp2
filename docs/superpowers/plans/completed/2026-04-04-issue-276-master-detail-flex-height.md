# Issue #276 Master-Detail Flex Height Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle viewport-height math on the four issue pages with a flex-based height chain so the workspace fills available height without bottom gaps or double scrollbars.

**Architecture:** Push height ownership up to `MainLayout`, make each target page a shrinkable column flex shell, and convert `MasterDetailWorkspace` plus the inventory master-detail cards to consume remaining height with `flex: 1` and `minHeight: 0`. Keep behavior, routing, and data flow unchanged; this is a layout refactor with targeted style assertions and change-scoped frontend verification.

**Tech Stack:** React 19, TypeScript, MUI v7, React Router, Vitest, Testing Library

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/common/MainLayout.tsx` | Convert routed content region into a column flex container with a shrinkable outlet wrapper |
| `frontend/src/components/common/MasterDetailWorkspace.tsx` | Replace desktop fixed height with `flex: 1`; add `minHeight: 0` to shrinkable flex nodes |
| `frontend/src/components/common/MasterDetailWorkspace.test.tsx` | Add style assertions for desktop/mobile workspace layout behavior |
| `frontend/src/components/common/__tests__/MainLayout.test.tsx` | Add assertions that the main content/outlet wrapper exposes a flex height chain |
| `frontend/src/pages/sales/OrdersPage.tsx` | Make page root a shrinkable column flex shell and make workspace region fill remaining height |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Same flex-shell migration as `OrdersPage` |
| `frontend/src/pages/inventory/ProductsPage.tsx` | Convert page shell and grid content wrapper to fill available height |
| `frontend/src/pages/inventory/components/ProductsTable.tsx` | Replace fixed card height with flex-fill + `minHeight: 0` for internal scrolling |
| `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx` | Replace fixed card height with flex-fill + `minHeight: 0` for tab content scrolling |
| `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` | Convert page shell and inline master/detail cards from fixed height to flex-fill layout |
| `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` | Keep page coverage green after layout wrapper changes; add one layout-wrapper assertion if needed |
| `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx` | Keep page coverage green after layout wrapper changes; add one layout-wrapper assertion if needed |
| `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx` | Add a layout assertion for the new flex content wrapper |
| `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx` | Add a layout assertion for the new flex content wrapper |
| `docs/superpowers/specs/2026-04-04-issue-276-master-detail-flex-height-design.md` | Reference only; no edits expected |

---

## Chunk 1: Layout Foundation + Shared Workspace

### Task 1: Add failing style tests for the shared flex chain

**Files:**
- Modify: `frontend/src/components/common/__tests__/MainLayout.test.tsx`
- Modify: `frontend/src/components/common/MasterDetailWorkspace.test.tsx`

- [ ] **Step 1: Extend `MainLayout.test.tsx` to expose the routed content container**

Mock `react-router-dom` so `Outlet` renders a marker:

```ts
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet-content">Outlet Content</div>,
  }
})
```

- [ ] **Step 2: Write the failing `MainLayout` flex-chain assertion**

Add a test that renders `MainLayout`, finds the `main` element and the immediate wrapper around `data-testid="outlet-content"`, and asserts:

```ts
expect(window.getComputedStyle(main)).toMatchObject({
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
})

expect(window.getComputedStyle(outletWrapper)).toMatchObject({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: '1',
  minHeight: '0px',
})
```

- [ ] **Step 3: Write the failing desktop workspace assertions**

In `MasterDetailWorkspace.test.tsx`, wrap each slot in a `data-testid` marker and assert on their parent containers. The desktop root should eventually report:

```ts
expect(window.getComputedStyle(desktopRoot)).toMatchObject({
  display: 'flex',
  flexDirection: 'row',
  flexGrow: '1',
  minHeight: '0px',
})
```

Also assert the right column and nested workspace wrapper have `minHeight: 0px` and `overflow: hidden`.

- [ ] **Step 4: Run the focused tests to confirm they fail first**

```bash
cd frontend && npx vitest run src/components/common/__tests__/MainLayout.test.tsx src/components/common/MasterDetailWorkspace.test.tsx --no-coverage
```

Expected: FAIL because `MainLayout` does not yet render a flex outlet wrapper and `MasterDetailWorkspace` still uses `height: calc(100vh - 300px)`.

- [ ] **Step 5: Commit the failing-test checkpoint**

```bash
git add frontend/src/components/common/__tests__/MainLayout.test.tsx frontend/src/components/common/MasterDetailWorkspace.test.tsx
git commit -m "test: add flex layout assertions for issue 276"
```

---

### Task 2: Implement the shared layout foundation

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`
- Modify: `frontend/src/components/common/MasterDetailWorkspace.tsx`
- Modify: `frontend/src/components/common/__tests__/MainLayout.test.tsx`
- Modify: `frontend/src/components/common/MasterDetailWorkspace.test.tsx`

- [ ] **Step 1: Update `MainLayout.tsx` to hand bounded height to routed pages**

Patch the `main` container to be a column flex container, then wrap `<Outlet />` in a shrinkable flex child:

```tsx
<Box
  component="main"
  sx={{
    flexGrow: 1,
    display: 'flex',
    flexDirection: 'column',
    pt: 8,
    px: { xs: 2, sm: 3 },
    pb: 3,
    bgcolor: 'background.default',
    minHeight: '100vh',
    overflow: 'hidden',
    maxWidth: '100%',
  }}
>
  <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
    <Outlet />
  </Box>
</Box>
```

- [ ] **Step 2: Replace the fixed height in `MasterDetailWorkspace.tsx`**

For desktop mode, change:

```ts
height: 'calc(100vh - 300px)'
```

to:

```ts
flex: 1,
minHeight: 0,
```

and add `minHeight: 0` to the left column, right column, and nested workspace wrapper.

- [ ] **Step 3: Keep mobile behavior stacked and content-driven**

Do not add viewport-height constraints in the mobile branch. Only preserve the three-slot stacked rendering.

- [ ] **Step 4: Run the focused component tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/MainLayout.test.tsx src/components/common/MasterDetailWorkspace.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit the shared layout foundation**

```bash
git add frontend/src/components/common/MainLayout.tsx frontend/src/components/common/MasterDetailWorkspace.tsx frontend/src/components/common/__tests__/MainLayout.test.tsx frontend/src/components/common/MasterDetailWorkspace.test.tsx
git commit -m "feat: convert master detail shell to flex height chain"
```

---

## Chunk 2: Sales + Purchasing Page Shells

### Task 3: Convert `OrdersPage` to a shrinkable flex page shell

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Add a failing layout assertion in `OrdersPage.filterbar.test.tsx`**

Mock `MasterDetailWorkspace` with a marker element, render `OrdersPage`, and assert the page root / workspace wrapper becomes a flex child:

```ts
const workspaceMarker = screen.getByText('MasterDetailWorkspace')
const workspaceWrapper = workspaceMarker.parentElement?.parentElement

expect(window.getComputedStyle(workspaceWrapper as HTMLElement)).toMatchObject({
  flexGrow: '1',
  minHeight: '0px',
})
```

If the exact wrapper depth differs, add a stable `data-testid` on the wrapper in `OrdersPage.tsx` and assert against that instead.

- [ ] **Step 2: Run the single-page test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx --no-coverage
```

Expected: FAIL because the current page root is only padded content, not a flex height shell.

- [ ] **Step 3: Update `OrdersPage.tsx` layout wrappers**

Convert the root `<Box sx={{ p: 3 }}>` into:

```tsx
<Box sx={{ p: 3, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
```

Then make the `MasterDetailWorkspace` region the single expanding child, for example with a wrapper:

```tsx
<Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
  <MasterDetailWorkspace ... />
</Box>
```

Keep `PageHeader`, `FilterBar`, and `Alert` as natural-height siblings above it.

- [ ] **Step 4: Re-run the `OrdersPage` test**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
git commit -m "feat: migrate sales orders page to flex height shell"
```

---

### Task 4: Convert `PurchaseOrdersPage` to a shrinkable flex page shell

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Add a failing layout assertion in `PurchaseOrdersPage.filterbar.test.tsx`**

Use the same pattern as `OrdersPage`: assert the wrapper around the mocked `MasterDetailWorkspace` becomes `flexGrow: 1` and `minHeight: 0px`.

- [ ] **Step 2: Run the focused purchasing page test and confirm failure**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Update `PurchaseOrdersPage.tsx` root and workspace wrappers**

Apply the same page-shell structure used in `OrdersPage`:
- root page `Box`: `flex: 1`, `minHeight: 0`, column flex
- workspace wrapper: `flex: 1`, `minHeight: 0`, column flex

- [ ] **Step 4: Re-run the purchasing page test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
git commit -m "feat: migrate purchase orders page to flex height shell"
```

---

## Chunk 3: Inventory Page Migrations

### Task 5: Convert `ProductsPage` and its two cards away from viewport math

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductsTable.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductDetailsPanel.tsx`
- Modify: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`

- [ ] **Step 1: Add a failing layout assertion for the products content region**

In `ProductsPage.filterbar.test.tsx`, after rendering the page, find the wrapper around `ProductsTable` / `ProductDetailsPanel` and assert it becomes the expanding content region:

```ts
expect(window.getComputedStyle(contentWrapper as HTMLElement)).toMatchObject({
  flexGrow: '1',
  minHeight: '0px',
})
```

If DOM traversal is brittle, add a `data-testid="products-content-region"` wrapper in the implementation and assert against that.

- [ ] **Step 2: Run the focused test to confirm failure**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Convert `ProductsPage.tsx` into a column flex shell**

Update the root page `Box` to:

```tsx
<Box sx={{ p: 3, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
```

Wrap the grid content in an expanding container:

```tsx
<Box
  data-testid="products-content-region"
  sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}
>
```

Make the `Grid` container and both grid items participate in the shrinkable height chain.

- [ ] **Step 4: Replace fixed heights in `ProductsTable.tsx` and `ProductDetailsPanel.tsx`**

Change each root `Paper` from:

```ts
height: 'calc(100vh - 300px)'
```

to:

```ts
flex: 1,
minHeight: 0,
display: 'flex',
flexDirection: 'column',
```

Also add `minHeight: 0` to the nested flex containers that own scrolling content (`TableContainer`, tab body wrapper, etc.).

- [ ] **Step 5: Re-run the products page test**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx frontend/src/pages/inventory/components/ProductsTable.tsx frontend/src/pages/inventory/components/ProductDetailsPanel.tsx frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
git commit -m "feat: migrate products page to flex height layout"
```

---

### Task 6: Convert `StockAdjustmentsPage` away from viewport math

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- Modify: `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx`

- [ ] **Step 1: Add a failing layout assertion for the stock adjustments content region**

Add a test that targets the main master/detail content wrapper and expects `flexGrow: 1` and `minHeight: 0px`. As with `ProductsPage`, use a stable `data-testid` if the DOM is otherwise too brittle.

- [ ] **Step 2: Run the focused stock adjustments test and confirm failure**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx --no-coverage
```

Expected: FAIL

- [ ] **Step 3: Convert the page root and master/detail region into a flex shell**

Change the root page wrapper to a column flex container with `flex: 1` and `minHeight: 0`. Make the main two-column content region the single expanding child.

- [ ] **Step 4: Replace all three inline fixed-height `Paper` usages**

In `StockAdjustmentsPage.tsx`, replace each:

```ts
height: 'calc(100vh - 300px)'
```

with flex-fill equivalents:

```ts
flex: 1,
minHeight: 0,
display: 'flex',
flexDirection: 'column',
```

For the loading/empty-state card that centers content, keep the centering styles but still use `flex: 1` and `minHeight: 0`.

- [ ] **Step 5: Add `minHeight: 0` to nested scrolling wrappers**

Any `Box`, `TableContainer`, or detail-section container inside the master/detail region that owns overflow should be able to shrink. Patch those wrappers while keeping behavior unchanged.

- [ ] **Step 6: Re-run the focused stock adjustments test**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
git commit -m "feat: migrate stock adjustments page to flex height layout"
```

---

## Chunk 4: Change-Scoped Verification

### Task 7: Run the frontend verification set required by the touched files

**Files:**
- No code changes expected

- [ ] **Step 1: Run lint**

```bash
cd frontend && npm run lint
```

Expected: PASS

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: PASS

- [ ] **Step 3: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: PASS

- [ ] **Step 4: Record the exact commands and outcomes for PR notes**

Document that the change touched `frontend/src/**`, so the required change-scoped verification was:

```text
cd frontend && npm run lint
cd frontend && npm run type-check
cd frontend && npm run test
```

- [ ] **Step 5: Manual browser verification on the four issue pages**

Check:
- no bottom gap except normal `MainLayout` padding
- no browser scrollbar plus inner panel scrollbar for the same region
- left list and right detail/workspace panels scroll independently where intended
- behavior is correct on a smaller laptop-height viewport and a larger monitor-height viewport
- mobile layout still stacks naturally

- [ ] **Step 6: Commit the final verification checkpoint if any follow-up adjustments were needed**

```bash
git add frontend/src/components/common/MainLayout.tsx frontend/src/components/common/MasterDetailWorkspace.tsx frontend/src/pages/sales/OrdersPage.tsx frontend/src/pages/purchasing/PurchaseOrdersPage.tsx frontend/src/pages/inventory/ProductsPage.tsx frontend/src/pages/inventory/components/ProductsTable.tsx frontend/src/pages/inventory/components/ProductDetailsPanel.tsx frontend/src/pages/inventory/StockAdjustmentsPage.tsx frontend/src/components/common/__tests__/MainLayout.test.tsx frontend/src/components/common/MasterDetailWorkspace.test.tsx frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
git commit -m "fix: complete issue 276 flex height migration"
```

