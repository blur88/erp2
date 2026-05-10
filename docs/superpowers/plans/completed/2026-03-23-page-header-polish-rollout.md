# PageHeader Polish & Phase 2 Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the `PageHeader` component (weight, spacing) and replace legacy `TYPOGRAPHY_STYLES.pageHeader` inline blocks across Inventory, Settings, and Purchasing with the standardized component.

**Architecture:** Apply two confirmed component changes first (fontWeight 700, mb 4), then migrate 18 files across 3 modules. Each toolbar/page file migration is a self-contained substitution: replace the inline header block with `<PageHeader>`, drop the icon, strip dynamic counts from subtitle, map up to 2 actions. Run full Vitest suite after each module batch.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest

**Spec:** `docs/superpowers/specs/2026-03-23-page-header-polish-rollout-design.md`

---

## File Map

### Modified — Component
- `frontend/src/components/common/PageHeader.tsx` — bump fontWeight to 700, mb to 4
- `frontend/src/components/common/__tests__/PageHeader.test.tsx` — confirm existing tests still pass (no new tests)

### Modified — Inventory (4 targets)
- `frontend/src/pages/inventory/components/ProductsToolbar.tsx` — PageHeader replaces inline block (header is in toolbar, not page file)
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` — PageHeader replaces inline block; strip dynamic count
- `frontend/src/pages/inventory/InventoryPage.tsx` — PageHeader replaces top-level header block only; second `TYPOGRAPHY_STYLES.pageHeader` usage at line ~323 is a stat card value, leave it
- `frontend/src/pages/inventory/CreateProductPage.tsx` — PageHeader with `showDivider={false}`

### Modified — Settings (10 targets)
- `frontend/src/pages/settings/UserManagementPage.tsx`
- `frontend/src/pages/settings/RoleManagementPage.tsx`
- `frontend/src/pages/settings/CompanySettingsPage.tsx`
- `frontend/src/pages/settings/RegionalSettingsPage.tsx`
- `frontend/src/pages/settings/SecuritySettingsPage.tsx`
- `frontend/src/pages/settings/PaymentMethodsPage.tsx`
- `frontend/src/pages/settings/DocumentNumbersPage.tsx`
- `frontend/src/pages/settings/PriceCostingPage.tsx`
- `frontend/src/pages/settings/PriceListsPage.tsx`
- `frontend/src/pages/settings/PrintSettingsPage.tsx`

### Modified — Purchasing (4 targets)
- `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx` — header is in toolbar
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`

---

## Migration Rules (apply to every file)

1. Replace the inline `TYPOGRAPHY_STYLES.pageHeader` block with `<PageHeader title="..." subtitle="..." primaryAction={...} secondaryAction={...} />`
2. Drop the title icon — do not port it
3. Strip dynamic counts from subtitle (e.g. `({pagination?.total || 0} total)` → `"View and manage stock adjustment history"`)
4. Map actions: first outlined → `secondaryAction`, first contained → `primaryAction`; if >2 actions exist, defer the page
5. Remove the outer `Box` wrapper that was handling layout (PageHeader owns its own layout)
6. Remove now-unused imports (`TYPOGRAPHY_STYLES` if nothing else in the file uses it; icon imports used only in the dropped header)
7. If the page doesn't cleanly fit, defer — do not modify PageHeader

---

## Task 1: Polish PageHeader Component

**Files:**
- Modify: `frontend/src/components/common/PageHeader.tsx`
- Test: `frontend/src/components/common/__tests__/PageHeader.test.tsx`

- [ ] **Step 1: Make the two confirmed changes**

In `frontend/src/components/common/PageHeader.tsx`:

Change line ~34: `mb: 3` → `mb: 4`
Change line ~56: `fontWeight: 600` → `fontWeight: 700`

The result should look like:

```tsx
<Box
  data-testid={showDivider ? 'page-header-divider' : undefined}
  sx={{
    mb: 4,
    pb: 2,
    ...(showDivider && {
      borderBottom: `1px solid ${theme.palette.divider}`,
    }),
  }}
>
  ...
    <Typography
      variant="h5"
      sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}
    >
```

- [ ] **Step 2: Run PageHeader tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx
```

Expected: all 16 tests pass. No new tests needed.

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/components/common/PageHeader.tsx
git commit -m "refactor(page-header): bump title weight to 700, increase bottom margin to mb:4"
```

---

## Task 2: Migrate Inventory — ProductsToolbar

**Files:**
- Modify: `frontend/src/pages/inventory/components/ProductsToolbar.tsx`

The current header block (around lines 74–107) is:

```tsx
<Box sx={{ mb: isMobile ? 2 : 0 }}>
  <Typography
    variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant}
    sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}
  >
    <ProductIcon sx={{ fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize, color: TYPOGRAPHY_STYLES.pageHeader.icon.color }} />
    Products
  </Typography>
  <Typography variant="body2" color="text.secondary">
    Manage your product catalog and inventory ({productCount} total)
  </Typography>
</Box>
<Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 1.5 : 1, alignItems: isMobile ? 'stretch' : 'center' }}>
  <Button variant="outlined" ...>View Deleted</Button>
  <Button variant="contained" ...>Add Product</Button>
</Box>
```

And there is an outer wrapper `Box` with `display: 'flex'`, `justifyContent: 'space-between'`, `mb: 3`.

- [ ] **Step 1: Add PageHeader import**

Add to the imports at the top of `ProductsToolbar.tsx`:
```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace the header block**

Replace the entire outer header `Box` (from the `Box` with `display: 'flex'` / `justifyContent: 'space-between'` / `mb: 3` down through the closing `</Box>` that contains both the title box and the actions box) with:

```tsx
<PageHeader
  title="Products"
  subtitle="Manage your product catalog and inventory"
  secondaryAction={{ label: 'View Deleted', onClick: onViewDeleted }}
  primaryAction={{ label: 'Add Product', onClick: onAddProduct }}
/>
```

Note: check the toolbar's prop interface — `onViewDeleted` and `onAddProduct` should already exist as props passed from `ProductsPage`. Use whatever callback prop names are defined.

- [ ] **Step 3: Remove now-unused imports**

If `ProductIcon`, `TYPOGRAPHY_STYLES.pageHeader.*` are no longer referenced anywhere else in the file:
- Remove the `ProductIcon` import (or the specific import if it's from a grouped import)
- Remove the `TYPOGRAPHY_STYLES` import only if no other `TYPOGRAPHY_STYLES.*` references remain in the file

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|ProductsToolbar" | head -20
```

Expected: no errors on this file.

---

## Task 3: Migrate Inventory — StockAdjustmentsPage

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

Current header (around lines 470–530) has:
- Title: `Stock Adjustments` (with icon and mobile variant)
- Subtitle: `View and manage stock adjustment history ({pagination?.total || 0} total)` ← strip count
- Actions: `View Deleted` (outlined, warning), `New Adjustment` (contained)

- [ ] **Step 1: Add PageHeader import**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

- [ ] **Step 2: Replace header block**

Replace the outer header `Box` (with `display: 'flex'`, `justifyContent: 'space-between'`, `mb: 3`) with:

```tsx
<PageHeader
  title="Stock Adjustments"
  subtitle="View and manage stock adjustment history"
  secondaryAction={{ label: 'View Deleted', onClick: () => setShowDeletedDialog(true) }}
  primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
/>
```

- [ ] **Step 3: Remove unused imports**

Remove `StockAdjustmentIcon` (or its import) if only used in the dropped header. Remove `TYPOGRAPHY_STYLES` import only if no other references remain.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|StockAdjustments" | head -20
```

---

## Task 4: Migrate Inventory — InventoryPage

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

`InventoryPage` has TWO uses of `TYPOGRAPHY_STYLES.pageHeader`:
- Line ~243: The top-level page header (`Inventory Overview` title + subtitle + actions) — **migrate this one**
- Line ~323: Inside a stat card as a large number display value — **leave this one, it's not a page header**

The top-level header has:
- Title: `Inventory Overview`
- Subtitle: `Monitor stock levels, track movements, and manage inventory health` (already static — no count to strip)
- Actions: check what buttons are in the actions Box at line ~260

- [ ] **Step 1: Check the actions on InventoryPage**

Read lines 255–280 of `frontend/src/pages/inventory/InventoryPage.tsx` to see what action buttons exist.

If there are 0, 1, or 2 actions that map cleanly — proceed to migrate.
If the page has >2 actions or a nonstandard pattern — defer this page and skip to Task 5.

- [ ] **Step 2: Add PageHeader import and replace top-level header block only**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace only the outer header `Box` (containing the title/subtitle Box and actions Box) with `<PageHeader>`. Leave the stat cards section (line ~323) untouched.

Example (adjust actions based on what you found in Step 1):
```tsx
<PageHeader
  title="Inventory Overview"
  subtitle="Monitor stock levels, track movements, and manage inventory health"
  // primaryAction and/or secondaryAction if applicable
/>
```

- [ ] **Step 3: Remove unused imports**

Remove `InventoryIcon` (title icon) if only used in the dropped header block. Do NOT touch the `TYPOGRAPHY_STYLES` import — it is still used at line ~323 for stat card values.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|InventoryPage" | head -20
```

---

## Task 5: Migrate Inventory — CreateProductPage

**Files:**
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`

This is a form page. The existing header may not have actions. Use `showDivider={false}` since form pages conventionally don't use the divider.

- [ ] **Step 1: Read the current header block**

Read lines 1–60 of `frontend/src/pages/inventory/CreateProductPage.tsx` to confirm the title text, subtitle (if any), and whether actions exist.

- [ ] **Step 2: Add PageHeader import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace with:
```tsx
<PageHeader
  title="Create Product"
  subtitle="Add a new product to your catalog"   {/* adjust if different */}
  showDivider={false}
  // primaryAction only if a submit/save button is in the header (usually not — it's in the form)
/>
```

- [ ] **Step 3: Remove unused imports**

Remove icon and `TYPOGRAPHY_STYLES.pageHeader` imports if no longer needed.

- [ ] **Step 4: TypeScript check + full Inventory Vitest run**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error" | head -20
cd frontend && npx vitest run src/pages/inventory
```

Expected: no type errors, all inventory tests pass.

- [ ] **Step 5: Commit Inventory batch**

Stage only the files you actually migrated. If `InventoryPage.tsx` was deferred in Task 4, omit it from the `git add`:

```bash
cd /home/blur/erp2
git add frontend/src/pages/inventory/components/ProductsToolbar.tsx \
        frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
        frontend/src/pages/inventory/CreateProductPage.tsx
# Add InventoryPage only if it was migrated (not deferred) in Task 4:
# git add frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "refactor(inventory): migrate inventory pages to PageHeader"
```

---

## Task 6: Migrate Settings — UserManagementPage

**Files:**
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`

Current header (line ~245):
- Icon: `PeopleIcon` — drop
- Title: `User Management`
- Subtitle: `Manage system users and access control ({totalCount} total)` — strip count → `"Manage system users and access control"`
- Actions: `Refresh` (outlined), `Add User` (contained)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the outer header `Box` with:
```tsx
<PageHeader
  title="User Management"
  subtitle="Manage system users and access control"
  secondaryAction={{
    label: 'Refresh',
    onClick: () => { refetchUsers(); refetchStatistics() }
  }}
  primaryAction={{ label: 'Add User', onClick: handleAddUser }}
/>
```

- [ ] **Step 2: Remove unused imports** (`PeopleIcon`; `TYPOGRAPHY_STYLES` if unused elsewhere)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|UserManagement" | head -20
```

---

## Task 7: Migrate Settings — RoleManagementPage

**Files:**
- Modify: `frontend/src/pages/settings/RoleManagementPage.tsx`

Current header (line ~100):
- Icon: `SecurityIcon` — drop
- Title: `Roles & Permissions`
- Subtitle: `Overview of user roles and their permissions`
- Actions: none (read-only page)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the outer header `Box` with:
```tsx
<PageHeader
  title="Roles & Permissions"
  subtitle="Overview of user roles and their permissions"
/>
```

- [ ] **Step 2: Remove unused imports** (`SecurityIcon` if only in header; `TYPOGRAPHY_STYLES` if unused elsewhere)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|RoleManagement" | head -20
```

---

## Task 8: Migrate Settings — CompanySettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/CompanySettingsPage.tsx`

Current header (line ~202):
- Icon: `CompanyIcon` — drop
- Title: `Company Settings`
- Subtitle: none (header has no subtitle)
- Actions: none in the header (save button is inside the form)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the `Box` wrapper that contains icon + Typography with:
```tsx
<PageHeader
  title="Company Settings"
/>
```

- [ ] **Step 2: Remove unused imports** (`CompanyIcon`; `TYPOGRAPHY_STYLES` if unused elsewhere)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|CompanySettings" | head -20
```

---

## Task 9: Migrate Settings — RegionalSettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

Current header (line ~186):
- Icon: `RegionalIcon` — drop
- Title: `Regional Settings`
- Subtitle: none
- Actions: none in header

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the `Box` with icon + Typography with:
```tsx
<PageHeader title="Regional Settings" />
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|RegionalSettings" | head -20
```

---

## Task 10: Migrate Settings — SecuritySettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/SecuritySettingsPage.tsx`

Current header (line ~20):
- Icon: `LockIcon` — drop
- Title: `Security Settings`
- Subtitle: `View current security configuration and policies`
- Actions: none (read-only page)

Note: there are also `h4` Typography elements inside the page body (lines ~61, 75, 119, 132) — these are section sub-headers, not the page header. Leave them untouched.

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the outer header `Box` with:
```tsx
<PageHeader
  title="Security Settings"
  subtitle="View current security configuration and policies"
/>
```

- [ ] **Step 2: Remove unused imports** (`LockIcon`; `TYPOGRAPHY_STYLES` if unused elsewhere)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|SecuritySettings" | head -20
```

---

## Task 11: Migrate Settings — PaymentMethodsPage

**Files:**
- Modify: `frontend/src/pages/settings/PaymentMethodsPage.tsx`

Current header (line ~96):
- Icon: `PaymentIcon` — drop
- Title: dynamic `{title}` prop — keep as-is, pass to PageHeader
- Subtitle: `Manage payment methods and configurations`
- Actions: `View Deleted` (outlined warning), `Add Payment Method` (contained)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the outer header `Box` with:
```tsx
<PageHeader
  title={title}
  subtitle="Manage payment methods and configurations"
  secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedOpen(true) }}
  primaryAction={{ label: 'Add Payment Method', onClick: () => { setSelected(null); setFormOpen(true) } }}
/>
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|PaymentMethods" | head -20
```

---

## Task 12: Migrate Settings — DocumentNumbersPage

**Files:**
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx`

Current header (line ~118):
- Icon: `DocumentNumberIcon` — drop
- Title: `Document Numbers Settings`
- Subtitle: none
- Actions: none in header (sync button may be inside the table, not the header)

- [ ] **Step 1: Read lines 115–145 to confirm no actions in the header Box**

If there are action buttons in the header, map them. If not, proceed without actions.

- [ ] **Step 2: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader title="Document Numbers Settings" />
```

- [ ] **Step 3: Remove unused imports**

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|DocumentNumbers" | head -20
```

---

## Task 13: Migrate Settings — PriceCostingPage

**Files:**
- Modify: `frontend/src/pages/settings/PriceCostingPage.tsx`

Current header (line ~160):
- Icon: `PriceCostingIcon` — drop
- Title: `Inventory Costing Settings`
- Subtitle: none
- Actions: form save button is inside the form, not in header

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader title="Inventory Costing Settings" />
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|PriceCosting" | head -20
```

---

## Task 14: Migrate Settings — PriceListsPage

**Files:**
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`

Current header (line ~218):
- Icon: `PriceListIcon` — drop
- Title: `Price Lists`
- Subtitle: `Manage pricing structures and product prices ({total} total)` — strip count → `"Manage pricing structures and product prices"`
- Actions: `Refresh` (outlined), `Add Price List` (contained)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader
  title="Price Lists"
  subtitle="Manage pricing structures and product prices"
  secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
  primaryAction={{ label: 'Add Price List', onClick: handleAddPriceList }}
/>
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|PriceLists" | head -20
```

---

## Task 15: Migrate Settings — PrintSettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/PrintSettingsPage.tsx`

Current header (line ~91):
- Icon: `PrintIcon` — drop
- Title: `Print Settings`
- Subtitle: `Configure print templates and document footers`
- Actions: none in header

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader
  title="Print Settings"
  subtitle="Configure print templates and document footers"
/>
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: Run full Settings Vitest + TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
cd frontend && npx vitest run src/pages/settings
```

Expected: no type errors, all settings tests pass.

- [ ] **Step 4: Commit Settings batch**

```bash
cd /home/blur/erp2
git add frontend/src/pages/settings/UserManagementPage.tsx \
        frontend/src/pages/settings/RoleManagementPage.tsx \
        frontend/src/pages/settings/CompanySettingsPage.tsx \
        frontend/src/pages/settings/RegionalSettingsPage.tsx \
        frontend/src/pages/settings/SecuritySettingsPage.tsx \
        frontend/src/pages/settings/PaymentMethodsPage.tsx \
        frontend/src/pages/settings/DocumentNumbersPage.tsx \
        frontend/src/pages/settings/PriceCostingPage.tsx \
        frontend/src/pages/settings/PriceListsPage.tsx \
        frontend/src/pages/settings/PrintSettingsPage.tsx
git commit -m "refactor(settings): migrate 10 settings pages to PageHeader"
```

---

## Task 16: Migrate Purchasing — PurchaseOrdersToolbar

**Files:**
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`

Current header (line ~59):
- Icon: `OrderIcon` — drop
- Title: `Purchase Orders`
- Subtitle: `Manage supplier purchase orders and procurement ({ordersCount} total)` — strip count
- Actions: `View Deleted` (outlined warning), `Create Order` (contained)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Replace the outer header `Box` (with `display: 'flex'`, `justifyContent: 'space-between'`, `mb: 3`) with:
```tsx
<PageHeader
  title="Purchase Orders"
  subtitle="Manage supplier purchase orders and procurement"
  secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
  primaryAction={{ label: 'Create Order', onClick: onCreateOrder }}
/>
```

- [ ] **Step 2: Remove unused imports** (`OrderIcon`; `TYPOGRAPHY_STYLES` if no longer referenced)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|PurchaseOrders" | head -20
```

---

## Task 17: Migrate Purchasing — SuppliersPage

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

Current header (line ~340):
- Icon: `BusinessIcon` — drop
- Title: `Suppliers`
- Subtitle: `Manage your suppliers and vendor relationships ({suppliers.length} total)` — strip count
- Actions: `View Deleted` (outlined warning), and possibly a second action — read the buttons in the actions Box

- [ ] **Step 1: Confirm actions in SuppliersPage header**

Read lines 378–420 of `frontend/src/pages/purchasing/SuppliersPage.tsx` to see all Button elements in the header actions Box.

- [ ] **Step 2: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

Map max 2 actions. If a "Add Supplier" contained button exists:
```tsx
<PageHeader
  title="Suppliers"
  subtitle="Manage your suppliers and vendor relationships"
  secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
  primaryAction={{ label: 'Add Supplier', onClick: () => { /* existing handler */ } }}
/>
```

- [ ] **Step 3: Remove unused imports**

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|Suppliers" | head -20
```

---

## Task 18: Migrate Purchasing — VendorPaymentsPage

**Files:**
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`

Current header (line ~352):
- Icon: `PaymentIcon` — drop
- Title: `Vendor Payments`
- Subtitle: `Track and manage payments to suppliers ({vendorPayments.length} total)` — strip count
- Actions: `View Deleted` only (one outlined button, no contained)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader
  title="Vendor Payments"
  subtitle="Track and manage payments to suppliers"
  secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedPaymentsDialogOpen(true) }}
/>
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|VendorPayments" | head -20
```

---

## Task 19: Migrate Purchasing — GoodsReceivedPage

**Files:**
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`

Current header (line ~345):
- Icon: `GRNIcon` — drop
- Title: `Goods Received Notes`
- Subtitle: `Track and manage incoming goods from suppliers ({filteredGRNs.length} total)` — strip count
- Actions: `View Deleted` only (one outlined button)

- [ ] **Step 1: Add import and replace header**

```tsx
import PageHeader from '@/components/common/PageHeader'
```

```tsx
<PageHeader
  title="Goods Received Notes"
  subtitle="Track and manage incoming goods from suppliers"
  secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedGRNsDialogOpen(true) }}
/>
```

- [ ] **Step 2: Remove unused imports**

- [ ] **Step 3: Run full Purchasing Vitest + TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error" | head -20
cd frontend && npx vitest run src/pages/purchasing
```

Expected: no type errors, all purchasing tests pass.

- [ ] **Step 4: Commit Purchasing batch**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx \
        frontend/src/pages/purchasing/SuppliersPage.tsx \
        frontend/src/pages/purchasing/VendorPaymentsPage.tsx \
        frontend/src/pages/purchasing/GoodsReceivedPage.tsx
git commit -m "refactor(purchasing): migrate PurchaseOrdersToolbar, SuppliersPage, VendorPaymentsPage, GoodsReceivedPage to PageHeader"
```

---

## Task 20: Final Verification

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass (baseline: 474 tests, 79 files).

- [ ] **Step 2: TypeScript full check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Manual visual QA checklist**

Open the app (`docker compose up -d` or `cd frontend && npm run dev`) and spot-check:
- [ ] A product list page (Products or Stock Adjustments) — title weight is visually bold, subtitle is clean text with no count
- [ ] A settings form page (Company Settings or Regional Settings) — header has no icon, correct spacing below before form content
- [ ] A purchasing page (Suppliers or Purchase Orders) — header actions align correctly, title hierarchy reads well
- [ ] Dark mode — confirm subtitle color and divider remain readable

If visual QA reveals repeated issues across multiple pages (not one-offs):
- Button nudge needed → add `pt: '2px'` to actions Box in `PageHeader.tsx`
- Divider too strong → apply `alpha(theme.palette.divider, 0.7)` in `PageHeader.tsx`

Commit any QA-driven component adjustments separately:
```bash
git add frontend/src/components/common/PageHeader.tsx
git commit -m "refactor(page-header): apply visual QA adjustments from rollout"
```
