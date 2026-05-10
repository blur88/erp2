# Filter Bar Bottom Gap Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the bottom margin below every filter bar from 24px (`mb: 3`) to 16px (`mb: 2`) across all pages.

**Architecture:** Two edit locations — `DashboardFilterBar` owns its own bottom margin internally (one edit fixes both dashboard pages), while list pages own it externally via a wrapping `Box` or `Stack` (one edit per page).

**Tech Stack:** React 19, MUI v7, Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/components/filters/DashboardFilterBar.tsx` | `mb: 3` → `mb: 2` on root `Box` (line 78) |
| `frontend/src/pages/sales/OrdersPage.tsx` | `mb: 3` → `mb: 2` on wrapping `Box` (line 246) |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | `mb: 3` → `mb: 2` on wrapping `Box` (line 186) |
| `frontend/src/pages/inventory/ProductsPage.tsx` | `mb: 3` → `mb: 2` on wrapping `Stack` (line 142) |
| `frontend/src/pages/sales/CustomersPage.tsx` | `mb: 3` → `mb: 2` on wrapping `Box` (line 426) |

---

### Task 1: Update DashboardFilterBar internal margin

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx:78`
- Test: `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Check the existing test for mb**

Run:
```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```
Expected: all tests pass (baseline).

- [ ] **Step 2: Update the root Box margin**

In `frontend/src/components/filters/DashboardFilterBar.tsx` line 78, change:
```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 3 }}>
```
to:
```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
```

- [ ] **Step 3: Run tests to confirm nothing broke**

Run:
```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "fix: reduce DashboardFilterBar bottom margin to 16px (closes part of #272)"
```

---

### Task 2: Update OrdersPage filter bar wrapper margin

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx:246`
- Test: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Run existing filter bar tests as baseline**

Run:
```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 2: Update the wrapping Box margin**

In `frontend/src/pages/sales/OrdersPage.tsx` line 246, change:
```tsx
<Box sx={{ mb: 3 }}>
```
to:
```tsx
<Box sx={{ mb: 2 }}>
```

- [ ] **Step 3: Run tests**

Run:
```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "fix: reduce OrdersPage filter bar bottom margin to 16px (#272)"
```

---

### Task 3: Update PurchaseOrdersPage filter bar wrapper margin

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:186`
- Test: `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Run existing filter bar tests as baseline**

Run:
```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 2: Update the wrapping Box margin**

In `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` line 186, change:
```tsx
<Box sx={{ mb: 3 }}>
```
to:
```tsx
<Box sx={{ mb: 2 }}>
```

- [ ] **Step 3: Run tests**

Run:
```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "fix: reduce PurchaseOrdersPage filter bar bottom margin to 16px (#272)"
```

---

### Task 4: Update ProductsPage filter bar wrapper margin

**Files:**
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx:142`
- Test: `frontend/src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx`

- [ ] **Step 1: Run existing filter bar tests as baseline**

Run:
```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 2: Update the wrapping Stack margin**

In `frontend/src/pages/inventory/ProductsPage.tsx` line 142, change:
```tsx
sx={{ mb: 3, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}
```
to:
```tsx
sx={{ mb: 2, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}
```

- [ ] **Step 3: Run tests**

Run:
```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/ProductsPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/ProductsPage.tsx
git commit -m "fix: reduce ProductsPage filter bar bottom margin to 16px (#272)"
```

---

### Task 5: Update CustomersPage filter bar wrapper margin and open PR

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx:426`
- Test: `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`

- [ ] **Step 1: Run existing filter bar tests as baseline**

Run:
```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 2: Update the wrapping Box margin**

In `frontend/src/pages/sales/CustomersPage.tsx` line 426, change:
```tsx
<Box sx={{ mb: 3 }}>
```
to:
```tsx
<Box sx={{ mb: 2 }}>
```

- [ ] **Step 3: Run tests**

Run:
```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "fix: reduce CustomersPage filter bar bottom margin to 16px (#272)"
```

- [ ] **Step 5: Open PR**

```bash
gh pr create --title "fix: standardize filter bar bottom gap to 16px" --body "$(cat <<'EOF'
## Summary
- Reduces bottom margin below filter bar from 24px (`mb: 3`) to 16px (`mb: 2`) on all pages
- Fixes `DashboardFilterBar` internally (covers Sales and Purchasing dashboards)
- Fixes wrapping containers on Orders, Purchase Orders, Products, and Customers pages

Closes #272

## Test plan
- [ ] Smoke test list pages: Sales Orders, Purchase Orders, Products, Customers
- [ ] Check Sales Dashboard and Purchasing Dashboard filter bar spacing
- [ ] Verify filter bar → table transition looks intentional and compact

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
