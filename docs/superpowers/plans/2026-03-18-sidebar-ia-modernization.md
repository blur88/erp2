# Sidebar IA Modernization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the sidebar's `menuSections` array to improve information architecture — consolidating all reports under one top-level item, grouping settings children visually, renaming sections, and deduplicating two icons.

**Architecture:** All changes are confined to one file (`Sidebar.tsx`) and its test file. The `MenuItem` interface gains an optional `group?: string` field; `renderMenuItem` and `renderFlyoutItem` gain a small group-label insertion; `menuSections` is rewritten with the new structure. No routes, page components, or interaction mechanics change.

**Tech Stack:** React 19, TypeScript, Material-UI v7, Vitest

---

## Files

| File | Action | What changes |
|------|--------|-------------|
| `frontend/src/components/common/Sidebar.tsx` | Modify | `MenuItem` interface, icon imports, `menuSections` array, `renderMenuItem`, `renderFlyoutItem`, divider conditions |
| `frontend/src/components/common/__tests__/Sidebar.test.tsx` | Modify | 3 tests that assert old section/item structure |

---

## Task 1: Add `group?: string` to `MenuItem` and update `renderMenuItem`

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx:83-96` (interface)
- Modify: `frontend/src/components/common/Sidebar.tsx:887-1097` (`renderMenuItem`)
- Test: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

**Context:** The `MenuItem` interface (lines 89–96) does not have a `group` field. The `renderMenuItem` function (starting line 887) iterates `item.children` and renders each child by calling itself recursively. We need to intercept at the children-array level to insert a label when `group` changes.

The group label should only render inside the children list of an item that has at least one child with a `group` value set. It must not appear in collapsed rail trigger mode (the `collapsed && hasChildren` branch at line 919 renders only an icon button — no label rendering happens there, so no change needed in that branch).

- [ ] **Step 1: Write a failing test for group label rendering in expanded mode**

In `frontend/src/components/common/__tests__/Sidebar.test.tsx`, add this test inside the `describe('Sidebar')` block:

```tsx
it('renders group labels inside Settings accordion when expanded', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={false} />
    </MemoryRouter>
  )

  const settingsButton = screen.getByRole('button', { name: 'Settings' })
  fireEvent.click(settingsButton)

  await waitFor(() => {
    expect(screen.getByText('Business')).toBeInTheDocument()
    expect(screen.getByText('Access')).toBeInTheDocument()
    expect(screen.getByText('System')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — "Business" not found in document.

- [ ] **Step 3: Add `group?: string` to the `MenuItem` interface**

In `Sidebar.tsx`, update the interface at lines 89–96:

```ts
interface MenuItem {
  id: string
  title: string
  icon: React.ReactNode
  path?: string
  badge?: number | string
  group?: string
  children?: MenuItem[]
}
```

- [ ] **Step 4: Add a `renderGroupLabel` helper and call it from `renderMenuItem`**

In `Sidebar.tsx`, add this helper just above `renderMenuItem` (before line 887):

```tsx
const renderGroupLabel = (label: string) => (
  <Typography
    key={`group-${label}`}
    variant="caption"
    sx={{
      display: 'block',
      px: 2,
      pt: 1.5,
      pb: 0.5,
      color: SIDEBAR_COLORS.sectionLabel,
      fontWeight: 600,
      fontSize: '0.6875rem',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}
  >
    {label}
  </Typography>
)
```

Then inside `renderMenuItem`, find the `Collapse` block that renders `item.children` (around line 1090–1094):

```tsx
<Collapse in={isExpanded} timeout={200} unmountOnExit>
  <List component="div" disablePadding>
    {item.children?.map(child => renderMenuItem(child, level + 1))}
  </List>
</Collapse>
```

Replace with:

```tsx
<Collapse in={isExpanded} timeout={200} unmountOnExit>
  <List component="div" disablePadding>
    {item.children?.map((child, idx, arr) => (
      <React.Fragment key={child.id}>
        {child.group && (idx === 0 || child.group !== arr[idx - 1].group) &&
          renderGroupLabel(child.group)}
        {renderMenuItem(child, level + 1)}
      </React.Fragment>
    ))}
  </List>
</Collapse>
```

- [ ] **Step 5: Run the new test to confirm it passes**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: The new test passes. (Other tests may still pass or will be addressed in later tasks.)

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/components/common/Sidebar.tsx src/components/common/__tests__/Sidebar.test.tsx
git commit -m "feat: add group label rendering to sidebar MenuItem children"
```

---

## Task 2: Update `renderFlyoutItem` to also render group labels

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx:774-885` (`renderFlyoutItem`)
- Test: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

**Context:** `renderFlyoutItem` renders children in the hover flyout panel (collapsed rail mode). It has its own `Collapse` block for nested children (lines 876–882). Group labels must also appear here so that Settings and Reports are visually grouped when shown as a flyout.

- [ ] **Step 1: Write a failing test for group labels in the Settings flyout**

Add this test to `Sidebar.test.tsx`:

```tsx
it('renders group labels inside Settings flyout in collapsed mode', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar collapsed={true} />
    </MemoryRouter>
  )

  const settingsButton = document.getElementById('rail-item-settings') as HTMLElement
  fireEvent.mouseEnter(settingsButton)

  await waitFor(() => {
    expect(screen.getByText('Business')).toBeInTheDocument()
  }, { timeout: 500 })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — "Business" not found in document (flyout doesn't render group labels yet).

- [ ] **Step 3: Update `renderFlyoutItem` to insert group labels**

In `Sidebar.tsx`, inside `renderFlyoutItem`, find the `Collapse` block that renders nested children (lines 876–882):

```tsx
{hasChildren && (
  <Collapse in={isExpanded} timeout={200} unmountOnExit>
    <List component="div" disablePadding>
      {item.children?.map(child => renderFlyoutItem(child, level + 1))}
    </List>
  </Collapse>
)}
```

Replace with:

```tsx
{hasChildren && (
  <Collapse in={isExpanded} timeout={200} unmountOnExit>
    <List component="div" disablePadding>
      {item.children?.map((child, idx, arr) => (
        <React.Fragment key={child.id}>
          {child.group && (idx === 0 || child.group !== arr[idx - 1].group) &&
            renderGroupLabel(child.group)}
          {renderFlyoutItem(child, level + 1)}
        </React.Fragment>
      ))}
    </List>
  </Collapse>
)}
```

Also update the top-level `flyoutItem.children.map` call in the Popper render block (around line 1273) from:

```tsx
{flyoutItem.children.map((child, idx) => renderFlyoutItem(child, 0, idx === 0))}
```

to:

```tsx
{flyoutItem.children.map((child, idx, arr) => (
  <React.Fragment key={child.id}>
    {child.group && (idx === 0 || child.group !== arr[idx - 1].group) &&
      renderGroupLabel(child.group)}
    {renderFlyoutItem(child, 0, idx === 0)}
  </React.Fragment>
))}
```

Note: When group labels are rendered at the top level of the flyout, the `isFirst` / `data-flyout-first` logic for keyboard focus needs to remain on the first interactive item (not on a group label). The `renderFlyoutItem(child, 0, idx === 0)` call still sets `isFirst` on the first child — this is correct because group labels are not focusable.

- [ ] **Step 4: Run both new tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1 | tail -25
```

Expected: Both group-label tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "feat: render group labels in sidebar flyout panel"
```

---

## Task 3: Rewrite `menuSections` — sections and Accounting

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx:112-572` (`menuSections` array)

**Context:** This task rewrites the section structure. We do it in two commits: first the section scaffolding + Accounting changes, then Reports + Settings. This keeps each commit reviewable.

The changes in this task:
- Rename section `main` → `primary` (title: 'Primary')
- Keep `operations` section unchanged
- Rename section `accounting` → `finance` (title: 'Finance'); remove `accounting-reports` sibling item from it
- Stub in empty `insights` and `administration` sections (filled in Task 4 and 5)

- [ ] **Step 1: Rename `main` to `primary` and `accounting` to `finance`, remove `accounting-reports`**

In `Sidebar.tsx`, replace the entire `menuSections` declaration (lines 112–572) with:

```ts
const menuSections: MenuSection[] = [
  {
    id: 'primary',
    title: 'Primary',
    items: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        icon: <DashboardIcon />,
        path: '/dashboard',
      },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      {
        id: 'sales',
        title: 'Sales',
        icon: <SalesIcon />,
        children: [
          {
            id: 'sales-overview',
            title: 'Overview',
            icon: <SalesIcon />,
            path: '/sales',
          },
          {
            id: 'customers',
            title: 'Customers',
            icon: <CustomersIcon />,
            path: '/sales/customers',
          },
          {
            id: 'orders',
            title: 'Sales Orders',
            icon: <OrdersIcon />,
            path: '/sales/orders',
          },
          {
            id: 'invoices',
            title: 'Invoices',
            icon: <InvoiceIcon />,
            path: '/sales/invoices',
          },
          {
            id: 'payments',
            title: 'Payments',
            icon: <PaymentsIcon />,
            path: '/sales/payments',
          },
        ],
      },
      {
        id: 'purchasing',
        title: 'Purchasing',
        icon: <PurchasingIcon />,
        children: [
          {
            id: 'purchasing-overview',
            title: 'Overview',
            icon: <PurchasingIcon />,
            path: '/purchasing',
          },
          {
            id: 'suppliers',
            title: 'Suppliers',
            icon: <SuppliersIcon />,
            path: '/purchasing/suppliers',
          },
          {
            id: 'purchase-orders',
            title: 'Purchase Orders',
            icon: <PurchaseOrderIcon />,
            path: '/purchasing/orders',
          },
          {
            id: 'grn',
            title: 'Goods Received',
            icon: <GRNIcon />,
            path: '/purchasing/goods-received',
          },
          {
            id: 'vendor-payments',
            title: 'Vendor Payments',
            icon: <VendorPaymentsIcon />,
            path: '/purchasing/vendor-payments',
          },
        ],
      },
      {
        id: 'inventory',
        title: 'Inventory',
        icon: <InventoryIcon />,
        children: [
          {
            id: 'inventory-overview',
            title: 'Overview',
            icon: <InventoryIcon />,
            path: '/inventory',
          },
          {
            id: 'products',
            title: 'Products',
            icon: <ProductIcon />,
            path: '/inventory/products',
          },
          {
            id: 'categories',
            title: 'Categories',
            icon: <CategoryIcon />,
            path: '/inventory/categories',
          },
          {
            id: 'stock-adjustments',
            title: 'Stock Adjustments',
            icon: <StockAdjustmentIcon />,
            path: '/inventory/stock-adjustments',
          },
        ],
      },
    ],
  },
  {
    id: 'finance',
    title: 'Finance',
    items: [
      {
        id: 'accounting',
        title: 'Accounting',
        icon: <AccountBalanceIcon />,
        children: [
          {
            id: 'accounting-dashboard',
            title: 'Dashboard',
            icon: <DashboardIcon />,
            path: '/accounting/dashboard',
          },
          {
            id: 'chart-of-accounts',
            title: 'Chart of Accounts',
            icon: <AccountTreeIcon />,
            path: '/accounting/chart-of-accounts',
          },
          {
            id: 'journal-entries',
            title: 'Journal Entries',
            icon: <DescriptionIcon />,
            path: '/accounting/journal-entries',
          },
          {
            id: 'bank-reconciliation',
            title: 'Bank Reconciliation',
            icon: <AccountBalanceOutlinedIcon />,
            path: '/accounting/bank-reconciliations',
          },
          {
            id: 'expenses',
            title: 'Expenses',
            icon: <OrdersIcon />,
            path: '/accounting/expenses',
          },
          {
            id: 'fund-transfers',
            title: 'Fund Transfers',
            icon: <SwapHorizIcon />,
            path: '/accounting/fund-transfers',
          },
          {
            id: 'settlements',
            title: 'Settlements',
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/settlements',
          },
          {
            id: 'owner-equity',
            title: "Owner's Equity",
            icon: <AccountBalanceWalletIcon />,
            path: '/accounting/owner-equity',
          },
          {
            id: 'fiscal-periods',
            title: 'Fiscal Periods',
            icon: <DateRangeIcon />,
            path: '/accounting/fiscal-periods',
          },
          {
            id: 'account-mappings',
            title: 'Account Mappings',
            icon: <SettingsIcon />,
            path: '/accounting/account-mappings',
          },
        ],
      },
    ],
  },
  {
    id: 'insights',
    title: 'Insights',
    items: [
      // filled in Task 4
    ],
  },
  {
    id: 'administration',
    title: 'Administration',
    items: [
      // filled in Task 5
    ],
  },
]
```

Also add `AccountBalanceOutlinedIcon` to the MUI icon import block at the top of the file. Find the import line containing `AccountBalance as AccountBalanceIcon` and add after it:

```ts
AccountBalanceOutlined as AccountBalanceOutlinedIcon,
```

- [ ] **Step 2: Run the TypeScript check to catch any import/type errors**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors. If there are errors about `AccountBalanceOutlinedIcon` not exported, use `AccountBalanceOutlined` (without the `Icon` suffix alias — check what other icons use as the alias pattern).

- [ ] **Step 3: Run the full test suite to see current state**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1
```

Expected: Some tests fail because `insights` and `administration` sections are empty stubs. The group-label tests from Tasks 1–2 will also fail until Settings is populated. Note which tests fail — they will all be fixed by Task 5.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "refactor: rename sidebar sections, remove accounting-reports item"
```

---

## Task 4: Add the consolidated `reports` item to `insights`

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (`menuSections` — `insights` section)

**Context:** Replace the empty `insights` stub with the full `reports` item containing all 24 report links across 4 `group`-annotated groups (9 Sales + 5 Purchasing + 5 Inventory + 5 Accounting). Icon imports: `MenuBookIcon` needs to be added for General Ledger.

- [ ] **Step 1: Add `MenuBook` to the icon imports**

In the MUI icon import block, add:

```ts
MenuBook as MenuBookIcon,
```

- [ ] **Step 2: Replace the `insights` stub with the full `reports` item**

Replace:

```ts
  {
    id: 'insights',
    title: 'Insights',
    items: [
      // filled in Task 4
    ],
  },
```

With:

```ts
  {
    id: 'insights',
    title: 'Insights',
    items: [
      {
        id: 'reports',
        title: 'Reports',
        icon: <AssessmentIcon />,
        children: [
          // Sales group
          {
            id: 'sales-by-product-summary',
            title: 'Product Summary',
            icon: <SummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/product-summary',
          },
          {
            id: 'sales-by-product-details',
            title: 'Product Details',
            icon: <DetailIcon />,
            group: 'Sales',
            path: '/reports/sales/product-details',
          },
          {
            id: 'sales-order-summary',
            title: 'Order Summary',
            icon: <OrdersIcon />,
            group: 'Sales',
            path: '/reports/sales/order-summary',
          },
          {
            id: 'sales-order-profit-report',
            title: 'Order Profit',
            icon: <ProfitIcon />,
            group: 'Sales',
            path: '/reports/sales/order-profit',
          },
          {
            id: 'customer-payment-summary',
            title: 'Payment Summary',
            icon: <PaymentSummaryIcon />,
            group: 'Sales',
            path: '/reports/sales/customer-payment-summary',
          },
          {
            id: 'customer-payment-by-order',
            title: 'Payment by Order',
            icon: <PaymentOrderIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-by-order',
          },
          {
            id: 'customer-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Sales',
            path: '/reports/sales/payment-details',
          },
          {
            id: 'customer-order-history',
            title: 'Order History',
            icon: <HistoryIcon />,
            group: 'Sales',
            path: '/reports/sales/order-history',
          },
          {
            id: 'product-customer-report',
            title: 'Product Customers',
            icon: <CustomerProductIcon />,
            group: 'Sales',
            path: '/reports/sales/product-customer',
          },
          // Purchasing group
          {
            id: 'purchase-order-summary',
            title: 'Order Summary',
            icon: <SummaryIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-summary',
          },
          {
            id: 'purchase-order-details',
            title: 'Order Details',
            icon: <DetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-details',
          },
          {
            id: 'purchase-order-status',
            title: 'Order Status',
            icon: <OrdersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/order-status',
          },
          {
            id: 'vendor-payment-details',
            title: 'Payment Details',
            icon: <PaymentDetailIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/payment-details',
          },
          {
            id: 'vendor-purchase-list',
            title: 'Vendor Products',
            icon: <SuppliersIcon />,
            group: 'Purchasing',
            path: '/reports/purchasing/vendor-purchase-list',
          },
          // Inventory group
          {
            id: 'inventory-summary',
            title: 'Inventory Summary',
            icon: <InventorySummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/summary',
          },
          {
            id: 'historical-inventory',
            title: 'Historical Inventory',
            icon: <HistoricalInventoryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/historical',
          },
          {
            id: 'inventory-movement-summary',
            title: 'Movement Summary',
            icon: <MovementSummaryIcon />,
            group: 'Inventory',
            path: '/reports/inventory/movement-summary',
          },
          {
            id: 'product-price-list',
            title: 'Product Price List',
            icon: <PriceListIcon />,
            group: 'Inventory',
            path: '/reports/inventory/price-list',
          },
          {
            id: 'product-cost-report',
            title: 'Product Cost Report',
            icon: <CostReportIcon />,
            group: 'Inventory',
            path: '/reports/inventory/product-cost',
          },
          // Accounting group
          {
            id: 'trial-balance',
            title: 'Trial Balance',
            icon: <AccountBalanceIcon />,
            group: 'Accounting',
            path: '/accounting/reports/trial-balance',
          },
          {
            id: 'balance-sheet',
            title: 'Balance Sheet',
            icon: <ReceiptLongIcon />,
            group: 'Accounting',
            path: '/accounting/reports/balance-sheet',
          },
          {
            id: 'profit-loss',
            title: 'Profit & Loss',
            icon: <ShowChartIcon />,
            group: 'Accounting',
            path: '/accounting/reports/profit-loss',
          },
          {
            id: 'general-ledger',
            title: 'General Ledger',
            icon: <MenuBookIcon />,
            group: 'Accounting',
            path: '/accounting/reports/general-ledger',
          },
          {
            id: 'account-activity',
            title: 'Account Activity',
            icon: <TimelineIcon />,
            group: 'Accounting',
            path: '/accounting/reports/account-activity',
          },
        ],
      },
    ],
  },
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: consolidate all reports under single Reports item in Insights section"
```

---

## Task 5: Add `administration` section with grouped Settings

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (`menuSections` — `administration` section)

- [ ] **Step 1: Replace the `administration` stub with Settings (grouped) + Audit Logs**

Replace:

```ts
  {
    id: 'administration',
    title: 'Administration',
    items: [
      // filled in Task 5
    ],
  },
```

With:

```ts
  {
    id: 'administration',
    title: 'Administration',
    items: [
      {
        id: 'settings',
        title: 'Settings',
        icon: <SettingsIcon />,
        children: [
          // Business group
          {
            id: 'company-settings',
            title: 'Company',
            icon: <CompanyIcon />,
            group: 'Business',
            path: '/settings/company',
          },
          {
            id: 'price-costing-settings',
            title: 'Inventory Costing',
            icon: <PriceCostingIcon />,
            group: 'Business',
            path: '/settings/price-costing',
          },
          {
            id: 'regional-settings',
            title: 'Regional',
            icon: <RegionalIcon />,
            group: 'Business',
            path: '/settings/regional',
          },
          {
            id: 'price-lists',
            title: 'Price Lists',
            icon: <PriceTagIcon />,
            group: 'Business',
            path: '/settings/price-lists',
          },
          {
            id: 'payment-methods',
            title: 'Payment Methods',
            icon: <PaymentsIcon />,
            group: 'Business',
            path: '/settings/payment-methods',
          },
          {
            id: 'print-settings',
            title: 'Print Settings',
            icon: <PrintIcon />,
            group: 'Business',
            path: '/settings/print',
          },
          {
            id: 'document-numbers',
            title: 'Document Numbers',
            icon: <DocumentNumberIcon />,
            group: 'Business',
            path: '/settings/document-numbers',
          },
          // Access group
          {
            id: 'users',
            title: 'Users',
            icon: <PeopleIcon />,
            group: 'Access',
            path: '/settings/users',
          },
          {
            id: 'roles',
            title: 'Roles & Permissions',
            icon: <SecurityIcon />,
            group: 'Access',
            path: '/settings/roles',
          },
          {
            id: 'security',
            title: 'Security',
            icon: <LockIcon />,
            group: 'Access',
            path: '/settings/security',
          },
          // System group
          {
            id: 'backup-restore',
            title: 'Backup & Restore',
            icon: <BackupIcon />,
            group: 'System',
            path: '/settings/backup',
          },
        ],
      },
      {
        id: 'audit-logs',
        title: 'Audit Logs',
        icon: <AuditIcon />,
        path: '/audit-logs',
      },
    ],
  },
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 3: Run the full test suite**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1
```

Expected: The group-label tests from Tasks 1–2 now pass. Three tests still fail (the ones documented in the spec). Note their names for Task 6.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "feat: add Administration section with grouped Settings children"
```

---

## Task 6: Fix divider conditions and update failing tests

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx` (divider render block, ~lines 1195–1225)
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx` (3 tests)

**Context:** The divider render block currently uses the old section IDs `'analytics'` and `'system'`. These must be updated. Then the 3 tests that assert the old structure must be updated or replaced.

- [ ] **Step 1: Update divider conditions in the render block**

In `Sidebar.tsx`, find the `Divider` component's `display` condition (around line 1200):

```ts
display:
  collapsed && !['analytics', 'system'].includes(section.id) ? 'none' : 'block',
```

Replace with:

```ts
display:
  collapsed && section.id !== 'administration' ? 'none' : 'block',
```

Then find the collapsed spacer condition (around line 1223):

```ts
{collapsed && index > 0 && ['analytics', 'system'].includes(section.id) && (
  <Box sx={{ pt: 1 }} />
)}
```

Replace with:

```ts
{collapsed && index > 0 && section.id === 'administration' && (
  <Box sx={{ pt: 1 }} />
)}
```

Also update the divider `display` condition for the non-collapsed case. In the existing code the divider renders between all sections when expanded. Now we only want it before `administration`. Find the outer condition:

```ts
{index > 0 && (
  <Divider ... />
)}
```

Change to:

```ts
{index > 0 && section.id === 'administration' && (
  <Divider ... />
)}
```

- [ ] **Step 2: Update test — `renders accounting as its own top-level section` (line 63)**

Replace the existing test body with:

```ts
it('renders Finance and Insights as top-level sections in correct order', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>
  )

  const sectionHeaders = Array.from(document.querySelectorAll('.MuiTypography-overline')).map(
    element => element.textContent
  )

  expect(sectionHeaders).toContain('Operations')
  expect(sectionHeaders).toContain('Finance')
  expect(sectionHeaders).toContain('Insights')
  expect(sectionHeaders).toContain('Administration')
  expect(sectionHeaders.indexOf('Operations')).toBeLessThan(sectionHeaders.indexOf('Finance'))
  expect(sectionHeaders.indexOf('Finance')).toBeLessThan(sectionHeaders.indexOf('Insights'))
  expect(sectionHeaders.indexOf('Insights')).toBeLessThan(sectionHeaders.indexOf('Administration'))
})
```

- [ ] **Step 3: Update test — `renders sales, purchasing, and inventory directly under reports section` (line 96)**

Replace the existing test body with:

```ts
it('renders Reports accordion button under Insights section', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>
  )

  const insightsList = getSectionList('Insights')
  const reportsButton = within(insightsList).getByRole('button', { name: 'Reports' })
  expect(reportsButton).toBeInTheDocument()

  fireEvent.click(reportsButton)

  await waitFor(() => {
    expect(screen.getByText('Sales')).toBeInTheDocument()
    expect(screen.getByText('Purchasing')).toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
    expect(screen.getByText('Accounting')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Replace test — `renders accounting reports as a parent group after accounting` (line 110)**

Replace the entire test with:

```ts
it('Trial Balance is accessible by expanding Reports under Insights', async () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>
  )

  expect(screen.queryByText('Trial Balance')).not.toBeInTheDocument()

  const insightsList = getSectionList('Insights')
  const reportsButton = within(insightsList).getByRole('button', { name: 'Reports' })
  fireEvent.click(reportsButton)

  await waitFor(() => {
    expect(screen.getByText('Trial Balance')).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run the full test suite**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --reporter=verbose 2>&1
```

Expected: All tests pass.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "fix: update divider conditions and test assertions for new sidebar structure"
```

---

## Task 7: Final verification

**Context:** Run the complete frontend test suite (not just Sidebar tests) to confirm nothing else was broken, then do a final type-check and lint.

- [ ] **Step 1: Run full frontend test suite**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: All tests pass. If any non-Sidebar tests fail, investigate — but these changes are confined to `Sidebar.tsx` so failures elsewhere would indicate a pre-existing issue.

- [ ] **Step 2: Run lint**

```bash
cd frontend && npm run lint 2>&1 | tail -20
```

Expected: No errors. If lint flags unused imports (e.g., old icons that are no longer referenced), remove them from the import block and re-run.

- [ ] **Step 3: Clean up unused icon imports**

After the `menuSections` rewrite, some icon aliases that were used only by the removed items may now be unused. Check and remove any that are flagged:

Likely candidates for removal (were used only in the old `analytics`/`accounting-reports` sections and replaced):
- `AccountBalance as VendorPaymentsIcon` — still used in Purchasing section, keep
- `ReceiptLong as ReceiptLongIcon` — still used in Reports Accounting group, keep
- Review all imports: if any alias appears only in the removed items, delete it

Run lint again after cleanup to confirm clean.

- [ ] **Step 4: Final type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -10
```

Expected: No errors.

- [ ] **Step 5: Final commit**

```bash
git add frontend/src/components/common/Sidebar.tsx
git commit -m "chore: remove unused icon imports after sidebar restructure"
```

If there are no unused imports to remove, skip this commit.
