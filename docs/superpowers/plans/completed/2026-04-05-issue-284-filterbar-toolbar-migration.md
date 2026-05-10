# FilterBar → PageHeader toolbar Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all remaining pages from rendering `<FilterBar>` as a sibling after `<PageHeader>` to passing it via the `toolbar` prop on `<PageHeader>`, standardizing the 16px gap and eliminating manual spacing wrappers.

**Architecture:** Mechanical per-page refactor — no changes to `PageHeader.tsx` or `FilterBar`. For each page: move `<FilterBar ...>` into `toolbar={<FilterBar ... />}` on `PageHeader`, delete the wrapping `<Box>` or `<Stack>` around it, and add `variant` prop where missing. Three pages have extra complexity (sort button, customer chip, calculator panel) handled per their special-case notes.

**Tech Stack:** React 19, Material-UI v7, TypeScript (strict: false)

---

## File Map

All files modified only — no new files created.

| File | Change |
|---|---|
| `frontend/src/pages/sales/SalesPage.tsx` | Move FilterBar to toolbar, add variant="overview" |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Move FilterBar to toolbar (variant already set) |
| `frontend/src/pages/inventory/InventoryPage.tsx` | Move FilterBar to toolbar, add variant="overview" |
| `frontend/src/pages/sales/OrdersPage.tsx` | Move FilterBar to toolbar, remove Box mb:2, add variant="workflow" |
| `frontend/src/pages/sales/CustomersPage.tsx` | Move FilterBar to toolbar, remove Box mb:2, add variant="workflow" |
| `frontend/src/pages/sales/PaymentsPage.tsx` | Move FilterBar to toolbar, collapse Box+Stack wrapper, keep sort Button and presetCustomerId Chip inline, add variant="workflow" |
| `frontend/src/pages/inventory/ProductsPage.tsx` | Move FilterBar to toolbar, remove Stack wrapper (marginRight already on PageHeader Box), add variant="workflow" |
| `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` | Move FilterBar to toolbar, collapse Box+Stack wrapper, keep sort Button inline, add variant="workflow" |
| `frontend/src/pages/purchasing/SuppliersPage.tsx` | Move FilterBar to toolbar, remove Box mb:3, add variant="workflow" |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Move FilterBar to toolbar, remove Box mb:2, add variant="workflow" |
| `frontend/src/pages/settings/UserManagementPage.tsx` | Move FilterBar to toolbar, remove Box mb:3, add variant="workflow" |
| `frontend/src/pages/settings/PriceListsPage.tsx` | Move FilterBar to toolbar, remove Box mb:3, add variant="workflow" |

---

## Task 1: Migrate SalesPage, PurchasingPage, InventoryPage (overview dashboards)

These three pages have an unwrapped `<FilterBar>` sibling directly after `<PageHeader>` — the simplest case.

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

- [ ] **Step 1: Update SalesPage**

In `frontend/src/pages/sales/SalesPage.tsx`, replace:

```tsx
      <PageHeader
        title="Sales Overview"
        subtitle="Monitor sales performance and manage customer relationships"
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
      />

      <FilterBar
        config={salesConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
      />
```

with:

```tsx
      <PageHeader
        title="Sales Overview"
        subtitle="Monitor sales performance and manage customer relationships"
        variant="overview"
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
        toolbar={
          <FilterBar
            config={salesConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            isFetching={isFetching}
          />
        }
      />
```

- [ ] **Step 2: Update PurchasingPage**

In `frontend/src/pages/purchasing/PurchasingPage.tsx`, replace:

```tsx
      <PageHeader
        variant="overview"
        title="Purchasing Overview"
        subtitle="Monitor purchasing activities and manage supplier relationships"
        primaryAction={{ label: 'Create Purchase Order', onClick: () => navigate('/purchasing/orders/create') }}
      />

      <FilterBar
        config={purchasingConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
      />
```

with:

```tsx
      <PageHeader
        variant="overview"
        title="Purchasing Overview"
        subtitle="Monitor purchasing activities and manage supplier relationships"
        primaryAction={{ label: 'Create Purchase Order', onClick: () => navigate('/purchasing/orders/create') }}
        toolbar={
          <FilterBar
            config={purchasingConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            isFetching={isFetching}
          />
        }
      />
```

- [ ] **Step 3: Update InventoryPage**

In `frontend/src/pages/inventory/InventoryPage.tsx` (around line 267), replace the `<PageHeader>` + bare `<FilterBar>` block with:

```tsx
      <PageHeader
        variant="overview"
        title="Inventory Overview"
        subtitle="Monitor stock levels, track movements, and manage inventory health"
        secondaryAction={{ label: 'Manage Categories', onClick: () => navigate('/inventory/categories') }}
        primaryAction={{ label: 'Add Product', onClick: () => navigate('/inventory/products') }}
        toolbar={
          <FilterBar
            config={inventoryConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            isFetching={isFetching}
          />
        }
      />
```

Note: `variant="overview"` is already present — keep it.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|SalesPage|PurchasingPage|InventoryPage" | head -20
```

Expected: no errors for these three files.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx frontend/src/pages/purchasing/PurchasingPage.tsx frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "feat(layout): migrate overview dashboards FilterBar to PageHeader toolbar slot"
```

---

## Task 2: Migrate OrdersPage and PurchaseOrdersPage (sort-prop FilterBar in Box wrapper)

Both pages wrap `<FilterBar>` in `<Box sx={{ mb: 2 }}>` and pass a `sort` prop to FilterBar. The outer flex-column layout Box stays; only the inner `mb: 2` Box is removed.

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- [ ] **Step 1: Update OrdersPage**

In `frontend/src/pages/sales/OrdersPage.tsx`, find the `<PageHeader>` block (around line 238). It currently looks like:

```tsx
      <PageHeader
        title="Sales Orders"
        subtitle="Track sales orders and delivery status"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
      />

      <Box sx={{ mb: 2 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={pageState.searchInputRef}
          sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
        />
      </Box>
```

Replace with:

```tsx
      <PageHeader
        title="Sales Orders"
        subtitle="Track sales orders and delivery status"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
          />
        }
      />
```

- [ ] **Step 2: Update PurchaseOrdersPage**

In `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`, find the `<PageHeader>` block (around line 179). It currently looks like:

```tsx
      <PageHeader
        ...
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/purchasing/orders/create') }}
      />

      <Box sx={{ mb: 2 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={filterBar.draftFilters}
          handlers={filterBar.handlers}
          hasActiveFilters={filterBar.hasActiveFilters}
          searchInputRef={pageState.searchInputRef}
          sort={{
            field: 'orderNumber',
            sortBy: pageState.sorting.sortBy,
            sortOrder: pageState.sorting.sortOrder,
            onSort: handleSort,
          }}
        />
      </Box>
```

Replace with:

```tsx
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier purchase orders and procurement"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/purchasing/orders/create') }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{
              field: 'orderNumber',
              sortBy: pageState.sorting.sortBy,
              sortOrder: pageState.sorting.sortOrder,
              onSort: handleSort,
            }}
          />
        }
      />
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|OrdersPage|PurchaseOrdersPage" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "feat(layout): migrate OrdersPage and PurchaseOrdersPage FilterBar to toolbar slot"
```

---

## Task 3: Migrate CustomersPage and SuppliersPage (simple Box wrapper)

Both pages have `<Box sx={{ mb: 2/3 }}><FilterBar .../></Box>` — the simplest list-page pattern.

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

- [ ] **Step 1: Update CustomersPage**

In `frontend/src/pages/sales/CustomersPage.tsx` (around line 420), replace:

```tsx
      <PageHeader
        title="Customers"
        subtitle="View customer profiles and client account details"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => handleOpenForm() }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 2 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Box>
```

with:

```tsx
      <PageHeader
        title="Customers"
        subtitle="View customer profiles and client account details"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => handleOpenForm() }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
          />
        }
      />
```

- [ ] **Step 2: Update SuppliersPage**

In `frontend/src/pages/purchasing/SuppliersPage.tsx` (around line 365), replace:

```tsx
      <PageHeader
        title="Suppliers"
        subtitle="Manage your suppliers and vendor relationships"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'Add Supplier', onClick: () => handleOpenForm() }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={searchInputRef}
        />
      </Box>
```

with:

```tsx
      <PageHeader
        title="Suppliers"
        subtitle="Manage your suppliers and vendor relationships"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => setIsDeletedDialogOpen(true) }}
        primaryAction={{ label: 'Add Supplier', onClick: () => handleOpenForm() }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
          />
        }
      />
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|CustomersPage|SuppliersPage" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx frontend/src/pages/purchasing/SuppliersPage.tsx
git commit -m "feat(layout): migrate CustomersPage and SuppliersPage FilterBar to toolbar slot"
```

---

## Task 4: Migrate UserManagementPage and PriceListsPage (settings pages)

Both follow the same `<Box sx={{ mb: 3 }}><FilterBar .../></Box>` pattern.

**Files:**
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`

- [ ] **Step 1: Update UserManagementPage**

In `frontend/src/pages/settings/UserManagementPage.tsx` (around line 320), replace:

```tsx
      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
        />
      </Box>
```

with nothing (delete those lines), and on the `<PageHeader>` block above (around line 286), add `variant="workflow"` and the `toolbar` prop:

```tsx
      <PageHeader
        title="User Management"
        subtitle="Manage system users and access control"
        variant="workflow"
        secondaryAction={{
          label: 'Refresh',
          onClick: () => {
            refetchUsers()
            refetchStatistics()
          },
        }}
        primaryAction={{ label: 'Add User', onClick: handleAddUser }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
          />
        }
      />
```

- [ ] **Step 2: Update PriceListsPage**

In `frontend/src/pages/settings/PriceListsPage.tsx` (around line 244), replace:

```tsx
      <PageHeader
        title="Price Lists"
        subtitle="Manage pricing structures and product prices"
        secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
        primaryAction={{ label: 'Add Price List', onClick: handleAddPriceList }}
      />

      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
        />
      </Box>
```

with:

```tsx
      <PageHeader
        title="Price Lists"
        subtitle="Manage pricing structures and product prices"
        variant="workflow"
        secondaryAction={{ label: 'Refresh', onClick: () => refetch() }}
        primaryAction={{ label: 'Add Price List', onClick: handleAddPriceList }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
          />
        }
      />
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|UserManagementPage|PriceListsPage" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/UserManagementPage.tsx frontend/src/pages/settings/PriceListsPage.tsx
git commit -m "feat(layout): migrate UserManagementPage and PriceListsPage FilterBar to toolbar slot"
```

---

## Task 5: Migrate PaymentsPage and StockAdjustmentsPage (sort Button + FilterBar in Stack)

Both pages have `<Box><Stack><Box flex:1><FilterBar/></Box><Button sort/></Stack></Box>`. The sort `Button` lives outside `FilterBar` and should stay in the page body as a sibling after `PageHeader`. Move only `FilterBar` into `toolbar`.

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

- [ ] **Step 1: Update PaymentsPage**

In `frontend/src/pages/sales/PaymentsPage.tsx` (around line 485), the current structure is:

```tsx
      <PageHeader
        title="Payments"
        subtitle="Review customer payments and transaction history"
        secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedPaymentsDialogOpen(true) }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={filterBarHandlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />

            {presetCustomerId ? (
              <Stack direction="row" sx={{ mt: '7px' }}>
                <Chip
                  label={`Customer: ${customers.find((customer) => customer.id === presetCustomerId)?.name ?? presetCustomerId}`}
                  size="small"
                  variant="filled"
                />
              </Stack>
            ) : null}
          </Box>

          <Button
            variant={sortState.sortBy === 'paymentNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={sortState.sortBy === 'paymentNumber' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
            onClick={() => handleSort('paymentNumber')}
            sx={{ height: '40px', fontSize: '0.875rem', minWidth: 'auto', px: 2 }}
          >
            Sort
          </Button>
        </Stack>
      </Box>
```

Replace with:

```tsx
      <PageHeader
        title="Payments"
        subtitle="Review customer payments and transaction history"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedPaymentsDialogOpen(true) }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterBarHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
          />
        }
      />

      {/* Preset customer chip + sort button */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {presetCustomerId ? (
          <Stack direction="row" sx={{ flex: 1 }}>
            <Chip
              label={`Customer: ${customers.find((customer) => customer.id === presetCustomerId)?.name ?? presetCustomerId}`}
              size="small"
              variant="filled"
            />
          </Stack>
        ) : (
          <Box sx={{ flex: 1 }} />
        )}
        <Button
          variant={sortState.sortBy === 'paymentNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={sortState.sortBy === 'paymentNumber' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('paymentNumber')}
          sx={{ height: '40px', fontSize: '0.875rem', minWidth: 'auto', px: 2 }}
        >
          Sort
        </Button>
      </Box>
```

> **Note:** If `presetCustomerId` is never shown at the same time as the sort button in practice, simplify the Box to just contain the Button with `sx={{ mb: 3 }}`. Read the file to check whether `presetCustomerId` is a URL param or state before deciding.

- [ ] **Step 2: Update StockAdjustmentsPage**

In `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` (around line 450), the current structure is:

```tsx
      <PageHeader
        title="Stock Adjustments"
        subtitle="View and manage stock adjustment history"
        secondaryAction={{ label: 'View Deleted', onClick: () => setShowDeletedDialog(true) }}
        primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={handlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />
          </Box>
          <Button
            variant={sortState.sortBy === 'adjustmentDate' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={sortState.sortBy === 'adjustmentDate' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
            onClick={() => handleSort('adjustmentDate')}
            sx={{ height: '40px', fontSize: '0.875rem', minWidth: 'auto', px: 2 }}
          >
            Sort
          </Button>
        </Stack>
      </Box>
```

Replace with:

```tsx
      <PageHeader
        title="Stock Adjustments"
        subtitle="View and manage stock adjustment history"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => setShowDeletedDialog(true) }}
        primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={searchInputRef}
          />
        }
      />

      {/* Sort button */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          variant={sortState.sortBy === 'adjustmentDate' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={sortState.sortBy === 'adjustmentDate' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('adjustmentDate')}
          sx={{ height: '40px', fontSize: '0.875rem', minWidth: 'auto', px: 2 }}
        >
          Sort
        </Button>
      </Box>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|PaymentsPage|StockAdjustmentsPage" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx frontend/src/pages/inventory/StockAdjustmentsPage.tsx
git commit -m "feat(layout): migrate PaymentsPage and StockAdjustmentsPage FilterBar to toolbar slot"
```

---

## Task 6: Migrate ProductsPage (calculator panel slide layout)

`ProductsPage` has a sliding calculator panel — the `PageHeader` is in a `<Box sx={{ mb: 3, marginRight: contentMarginRight }}>` for the slide animation, and FilterBar is in a separate `<Stack sx={{ mb: 2, marginRight: contentMarginRight }}>`. After moving FilterBar into `toolbar`, the `Stack` is removed entirely — the `marginRight` is already applied to the outer Box wrapping `PageHeader`.

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`

- [ ] **Step 1: Read the file around the current layout**

Read `frontend/src/pages/inventory/ProductsPage.tsx` lines 127–160 to confirm the exact structure before editing.

- [ ] **Step 2: Update ProductsPage**

The current structure (lines ~127–153) is:

```tsx
  return (
    <>
      <Box sx={{ mb: 3, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}>
        <PageHeader
          title="Products"
          subtitle="Manage your product catalog and inventory"
          secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
          primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
        />
      </Box>

      <Stack
        direction={isMobile ? 'column' : 'row'}
        spacing={1}
        alignItems={isMobile ? 'stretch' : 'center'}
        sx={{ mb: 2, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}
      >
        <Box sx={{ flex: 1 }}>
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        </Box>
      </Stack>
```

Replace with:

```tsx
  return (
    <>
      <Box sx={{ mb: 3, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}>
        <PageHeader
          title="Products"
          subtitle="Manage your product catalog and inventory"
          variant="workflow"
          secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
          primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
          toolbar={
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={handlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={pageState.searchInputRef}
            />
          }
        />
      </Box>
```

Note: the `Stack` element and its inner `Box` are fully removed. The outer Box's `mb: 3` now covers the gap to content (previously the outer Box had `mb: 3` + the Stack had `mb: 2`; consolidate to `mb: 3` on the outer Box since `PageHeader`'s own `mb: 2` provides the gap between the header bottom and page content — verify visually).

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|ProductsPage" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "feat(layout): migrate ProductsPage FilterBar to toolbar slot"
```

---

## Task 7: Full type-check and open a PR

- [ ] **Step 1: Full type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS" | head -30
```

Expected: 0 errors related to any of the 12 migrated files.

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -E "error|warning" | grep -v "node_modules" | head -30
```

Expected: no new lint errors.

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --title "feat(layout): migrate FilterBar to PageHeader toolbar slot (closes #284)" \
  --body "$(cat <<'EOF'
## Summary

- Moves `<FilterBar>` from sibling-after-`PageHeader` into the `toolbar` prop on all 12 affected pages
- Removes manual `<Box sx={{ mb: 2/3 }}>` and `<Stack>` wrappers around filter bars
- Adds `variant="overview"` or `variant="workflow"` to `PageHeader` on pages that were missing it
- `PageHeader.tsx` unchanged — the `toolbar` slot with `mt: 1` and outer `mb: 2` already provided the correct gap

**Pages migrated:** SalesPage, PurchasingPage, InventoryPage, OrdersPage, PurchaseOrdersPage, CustomersPage, SuppliersPage, PaymentsPage, StockAdjustmentsPage, ProductsPage, UserManagementPage, PriceListsPage

**Excluded:** DashboardPage, AccountingDashboardPage (no FilterBar), JournalEntriesPage (custom batch-action filter row, not a FilterBar)

## Test plan

- [ ] Visit each migrated page and confirm FilterBar renders inside the header area, not as a separate block below
- [ ] Confirm 16px gap between filter bar and page content on all pages
- [ ] Confirm no double-gap or missing-gap on any page
- [ ] Confirm ProductsPage calculator panel slide still animates correctly
- [ ] Confirm PaymentsPage preset-customer Chip and sort Button still appear correctly
- [ ] Confirm StockAdjustmentsPage sort Button still appears correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
