# DashboardFilterBar FilterSelect Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 7 manually-implemented MUI dropdown blocks in `DashboardFilterBar.tsx` with the shared `FilterSelect` component, adding `emptyLabel` and `minWidth` props to `FilterSelect` to support the variation needed.

**Architecture:** Enhance `FilterSelect` with two backward-compatible optional props, then replace each raw `FormControl`/`Select`/`MenuItem` block in `DashboardFilterBar` one-by-one with `<FilterSelect />`. The Compare filter (which has tooltip/disabled behavior) is left as raw MUI.

**Tech Stack:** React 19, TypeScript, Material UI v7, Vitest + React Testing Library

---

## Files

- Modify: `frontend/src/components/filters/FilterSelect.tsx` — add `emptyLabel` and `minWidth` props
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx` — replace 7 dropdowns with `FilterSelect`
- Test (existing): `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx` — no changes needed, used for verification

---

## Task 1: Add `emptyLabel` and `minWidth` props to `FilterSelect`

**Files:**
- Modify: `frontend/src/components/filters/FilterSelect.tsx`

- [ ] **Step 1: Update the `Props` interface**

Open `frontend/src/components/filters/FilterSelect.tsx`. Replace the existing `Props` interface:

```ts
interface Props {
  field: string
  label: string
  type: 'select' | 'multi-select'
  value: string | null | string[]
  options: FilterOption[]
  onChange: (value: string | null | string[]) => void
  emptyLabel?: string
  minWidth?: number
}
```

- [ ] **Step 2: Apply `minWidth` to both `FormControl` usages**

In the `multi-select` branch, change:
```tsx
<FormControl size="small" sx={{ minWidth: 140 }}>
```
to:
```tsx
<FormControl size="small" sx={{ minWidth: minWidth ?? 140 }}>
```

In the `select` branch (the `return` at the bottom), change:
```tsx
<FormControl size="small" sx={{ minWidth: 140 }}>
```
to:
```tsx
<FormControl size="small" sx={{ minWidth: minWidth ?? 140 }}>
```

- [ ] **Step 3: Apply `emptyLabel` to the empty MenuItem and remove `<em>` wrapper**

In the `select` branch, change:
```tsx
<MenuItem value="">
  <em>All</em>
</MenuItem>
```
to:
```tsx
<MenuItem value="">{emptyLabel ?? 'All'}</MenuItem>
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```
Expected: no errors related to `FilterSelect.tsx`

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/filters/FilterSelect.tsx
git commit -m "feat: add emptyLabel and minWidth props to FilterSelect (#244)"
```

---

## Task 2: Replace Customer, Supplier, Category dropdowns with `FilterSelect`

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 1: Add `FilterSelect` import**

At the top of `frontend/src/components/filters/DashboardFilterBar.tsx`, add:
```ts
import { FilterSelect } from './FilterSelect'
```

- [ ] **Step 2: Replace the Customer dropdown**

Find and replace the entire Customer `FormControl` block (lines ~108–124):
```tsx
{customers !== undefined && onCustomerChange && (
  <FormControl size="small" sx={{ minWidth: 170 }}>
    <InputLabel id="dashboard-customer-label">Customer</InputLabel>
    <Select
      labelId="dashboard-customer-label"
      id="dashboard-customer"
      value={customerId ?? ''}
      label="Customer"
      onChange={(e) => onCustomerChange(e.target.value || null)}
    >
      <MenuItem value="">All Customers</MenuItem>
      {customers.map((customer) => (
        <MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```
with:
```tsx
{customers !== undefined && onCustomerChange && (
  <FilterSelect
    field="customer"
    label="Customer"
    type="select"
    value={customerId ?? null}
    options={customers.map((c) => ({ value: c.id, label: c.name }))}
    onChange={(v) => onCustomerChange(v as string | null)}
    emptyLabel="All Customers"
    minWidth={170}
  />
)}
```

- [ ] **Step 3: Replace the Supplier dropdown**

Find and replace the entire Supplier `FormControl` block (lines ~126–142):
```tsx
{suppliers !== undefined && onSupplierChange && (
  <FormControl size="small" sx={{ minWidth: 170 }}>
    <InputLabel id="dashboard-supplier-label">Supplier</InputLabel>
    <Select
      labelId="dashboard-supplier-label"
      id="dashboard-supplier"
      value={supplierId ?? ''}
      label="Supplier"
      onChange={(e) => onSupplierChange(e.target.value || null)}
    >
      <MenuItem value="">All Suppliers</MenuItem>
      {suppliers.map((supplier) => (
        <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```
with:
```tsx
{suppliers !== undefined && onSupplierChange && (
  <FilterSelect
    field="supplier"
    label="Supplier"
    type="select"
    value={supplierId ?? null}
    options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
    onChange={(v) => onSupplierChange(v as string | null)}
    emptyLabel="All Suppliers"
    minWidth={170}
  />
)}
```

- [ ] **Step 4: Replace the Category dropdown**

Find and replace the entire Category `FormControl` block (lines ~144–160):
```tsx
{categories !== undefined && onCategoryChange && (
  <FormControl size="small" sx={{ minWidth: 170 }}>
    <InputLabel id="dashboard-category-label">Category</InputLabel>
    <Select
      labelId="dashboard-category-label"
      id="dashboard-category"
      value={categoryId ?? ''}
      label="Category"
      onChange={(e) => onCategoryChange(e.target.value || null)}
    >
      <MenuItem value="">All Categories</MenuItem>
      {categories.map((category) => (
        <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```
with:
```tsx
{categories !== undefined && onCategoryChange && (
  <FilterSelect
    field="category"
    label="Category"
    type="select"
    value={categoryId ?? null}
    options={categories.map((c) => ({ value: c.id, label: c.name }))}
    onChange={(v) => onCategoryChange(v as string | null)}
    emptyLabel="All Categories"
    minWidth={170}
  />
)}
```

- [ ] **Step 5: Run the existing DashboardFilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "refactor: replace Customer, Supplier, Category dropdowns with FilterSelect (#244)"
```

---

## Task 3: Replace Stock Status, Order Status (sales), Order Status (purchasing) dropdowns

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 1: Replace the Stock Status dropdown**

Find and replace the entire Stock Status `FormControl` block (lines ~162–178):
```tsx
{stockStatus !== undefined && onStockStatusChange && (
  <FormControl size="small" sx={{ minWidth: 150 }}>
    <InputLabel id="dashboard-stock-status-label">Stock Status</InputLabel>
    <Select
      labelId="dashboard-stock-status-label"
      id="dashboard-stock-status"
      value={stockStatus ?? ''}
      label="Stock Status"
      onChange={(e) => onStockStatusChange(e.target.value || null)}
    >
      <MenuItem value="">All</MenuItem>
      <MenuItem value="in_stock">In Stock</MenuItem>
      <MenuItem value="low_stock">Low Stock</MenuItem>
      <MenuItem value="out_of_stock">Out of Stock</MenuItem>
    </Select>
  </FormControl>
)}
```
with:
```tsx
{stockStatus !== undefined && onStockStatusChange && (
  <FilterSelect
    field="stockStatus"
    label="Stock Status"
    type="select"
    value={stockStatus ?? null}
    options={[
      { value: 'in_stock', label: 'In Stock' },
      { value: 'low_stock', label: 'Low Stock' },
      { value: 'out_of_stock', label: 'Out of Stock' },
    ]}
    onChange={(v) => onStockStatusChange(v as string | null)}
    minWidth={150}
  />
)}
```

- [ ] **Step 2: Replace the Order Status (sales / isFulfilled) dropdown**

Find and replace the entire `isFulfilled` `FormControl` block (lines ~180–198):
```tsx
{isFulfilled !== undefined && onFulfilledChange && (
  <FormControl size="small" sx={{ minWidth: 150 }}>
    <InputLabel id="dashboard-order-status-label">Order Status</InputLabel>
    <Select
      labelId="dashboard-order-status-label"
      id="dashboard-order-status"
      value={isFulfilled === null ? '' : String(isFulfilled)}
      label="Order Status"
      onChange={(e) => {
        const value = e.target.value
        onFulfilledChange(value === '' ? null : value === 'true')
      }}
    >
      <MenuItem value="">All</MenuItem>
      <MenuItem value="true">Fulfilled</MenuItem>
      <MenuItem value="false">Pending</MenuItem>
    </Select>
  </FormControl>
)}
```
with:
```tsx
{isFulfilled !== undefined && onFulfilledChange && (
  <FilterSelect
    field="isFulfilled"
    label="Order Status"
    type="select"
    value={isFulfilled === null ? null : String(isFulfilled)}
    options={[
      { value: 'true', label: 'Fulfilled' },
      { value: 'false', label: 'Pending' },
    ]}
    onChange={(v) => onFulfilledChange(v === null ? null : v === 'true')}
    minWidth={150}
  />
)}
```

- [ ] **Step 3: Replace the Order Status (purchasing / status) dropdown**

Find and replace the entire `status` `FormControl` block (lines ~200–215):
```tsx
{status !== undefined && onStatusChange && (
  <FormControl size="small" sx={{ minWidth: 150 }}>
    <InputLabel id="dashboard-purchasing-order-status-label">Order Status</InputLabel>
    <Select
      labelId="dashboard-purchasing-order-status-label"
      id="dashboard-order-status-purchasing"
      value={status ?? ''}
      label="Order Status"
      onChange={(e) => onStatusChange(e.target.value || null)}
    >
      <MenuItem value="">All</MenuItem>
      <MenuItem value="received">Received</MenuItem>
      <MenuItem value="pending">Pending</MenuItem>
    </Select>
  </FormControl>
)}
```
with:
```tsx
{status !== undefined && onStatusChange && (
  <FilterSelect
    field="status"
    label="Order Status"
    type="select"
    value={status ?? null}
    options={[
      { value: 'received', label: 'Received' },
      { value: 'pending', label: 'Pending' },
    ]}
    onChange={(v) => onStatusChange(v as string | null)}
    minWidth={150}
  />
)}
```

- [ ] **Step 4: Run the existing DashboardFilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "refactor: replace Stock Status and Order Status dropdowns with FilterSelect (#244)"
```

---

## Task 4: Replace Payment Status dropdown and clean up unused imports

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 1: Replace the Payment Status dropdown**

Find and replace the entire Payment Status `FormControl` block (lines ~217–233):
```tsx
{paymentStatus !== undefined && onPaymentStatusChange && (
  <FormControl size="small" sx={{ minWidth: 170 }}>
    <InputLabel id="dashboard-payment-status-label">Payment Status</InputLabel>
    <Select
      labelId="dashboard-payment-status-label"
      id="dashboard-payment-status"
      value={paymentStatus ?? ''}
      label="Payment Status"
      onChange={(e) => onPaymentStatusChange(e.target.value || null)}
    >
      <MenuItem value="">All</MenuItem>
      {resolvedPaymentStatusOptions.map((option) => (
        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
      ))}
    </Select>
  </FormControl>
)}
```
with:
```tsx
{paymentStatus !== undefined && onPaymentStatusChange && (
  <FilterSelect
    field="paymentStatus"
    label="Payment Status"
    type="select"
    value={paymentStatus ?? null}
    options={resolvedPaymentStatusOptions}
    onChange={(v) => onPaymentStatusChange(v as string | null)}
    minWidth={170}
  />
)}
```

- [ ] **Step 2: Remove unused MUI imports**

The `FormControl`, `InputLabel`, `Select`, and `MenuItem` imports are no longer used (the Compare filter still uses `FormControl`, `InputLabel`, `Select`, `MenuItem` — double check before removing).

Check what the Compare filter block still uses in the current file. It uses `FormControl`, `InputLabel`, `Select`, `MenuItem` — so they must stay. Only remove them if they truly have zero usages. Run type-check to confirm:

```bash
cd frontend && npm run type-check 2>&1 | head -30
```
Expected: no errors. If unused import warnings appear, remove those specific imports.

- [ ] **Step 3: Run the full DashboardFilterBar test suite**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```
Expected: all 20+ tests pass

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "refactor: replace Payment Status dropdown with FilterSelect, complete #244"
```

---

## Self-Review

**Spec coverage:**
- ✅ `emptyLabel` prop on `FilterSelect` — Task 1
- ✅ `minWidth` prop on `FilterSelect` — Task 1
- ✅ `<em>All</em>` → plain text — Task 1
- ✅ Customer → `FilterSelect` — Task 2
- ✅ Supplier → `FilterSelect` — Task 2
- ✅ Category → `FilterSelect` — Task 2
- ✅ Stock Status → `FilterSelect` — Task 3
- ✅ Order Status (sales/isFulfilled) with boolean conversion — Task 3
- ✅ Order Status (purchasing/status) → `FilterSelect` — Task 3
- ✅ Payment Status → `FilterSelect` — Task 4
- ✅ Compare filter left as-is — not touched in any task
- ✅ Tests verified at end of Task 2, 3, and 4

**Placeholder scan:** None found.

**Type consistency:**
- `FilterSelect` props defined in Task 1, used consistently in Tasks 2–4
- `onChange` always typed as `(v: string | null | string[]) => void` — callers cast with `as string | null` for single-select, boolean conversion inline for `isFulfilled`
- `resolvedPaymentStatusOptions` is `{ value: string; label: string }[]` which matches `FilterOption[]` — compatible
