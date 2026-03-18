# Sidebar Navigation Refactoring Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename sidebar groups and flatten the Analytics section to reduce nesting and improve naming clarity.

**Architecture:** Two files change: `Sidebar.tsx` (data config — title strings and structure) and `Sidebar.test.tsx` (three test updates). No new files, no routing changes, no backend changes. The `id: 'analytics'` is intentionally preserved — it is referenced in collapsed-sidebar divider rendering logic at lines 1171 and 1193 of `Sidebar.tsx`.

**Tech Stack:** React 19, Material-UI v7, Vitest

---

## Files

- Modify: `frontend/src/components/common/Sidebar.tsx`
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

---

### Task 1: Update tests to reflect new structure (TDD — write failing tests first)

**Files:**
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Update the section headers test**

In `Sidebar.test.tsx`, find the test `'renders accounting as its own top-level section'` (around line 47). Change both references to `'Analytics'` → `'Reports'`:

```tsx
// Before:
expect(sectionHeaders).toContain('Analytics')
expect(sectionHeaders.indexOf('Accounting')).toBeLessThan(sectionHeaders.indexOf('Analytics'))

// After:
expect(sectionHeaders).toContain('Reports')
expect(sectionHeaders.indexOf('Accounting')).toBeLessThan(sectionHeaders.indexOf('Reports'))
```

- [ ] **Step 2: Rewrite the analytics wrapper test**

Find `'renders reports as a parent group in analytics section'` (around line 80). Replace the entire test body:

```tsx
it('renders sales, purchasing, and inventory directly under reports section', () => {
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Sidebar />
    </MemoryRouter>
  )

  expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Purchasing' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Inventory' })).toBeInTheDocument()
})
```

- [ ] **Step 3: Update the accounting reports test**

Find `'renders accounting reports as a parent group after accounting'` (around line 97). Change the button query from `'Accounting Reports'` → `'Reports'`:

```tsx
// Before:
const accountingReportsButton = screen.getByRole('button', { name: 'Accounting Reports' })

// After:
const accountingReportsButton = screen.getByRole('button', { name: 'Reports' })
```

- [ ] **Step 4: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx
```

Expected: 3 tests fail (section headers, analytics wrapper, accounting reports). All other tests pass.

---

### Task 2: Update Sidebar.tsx

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`

- [ ] **Step 1: Rename Accounting Reports group**

Find around line 307–308:
```tsx
id: 'accounting-reports',
title: 'Accounting Reports',
```

Change title only (leave id unchanged):
```tsx
id: 'accounting-reports',
title: 'Reports',
```

- [ ] **Step 2: Rename Analytics section title**

Find around line 346–347:
```tsx
id: 'analytics',
title: 'Analytics',
```

Change title only (leave id unchanged — it is used in collapsed divider logic):
```tsx
id: 'analytics',
title: 'Reports',
```

- [ ] **Step 3: Flatten the Analytics items — remove the Reports wrapper**

The current structure (around lines 348–490) is:
```tsx
items: [
  {
    id: 'reports',
    title: 'Reports',
    icon: <AssessmentIcon />,
    children: [
      { id: 'sales-reports', title: 'Sales Reports', icon: ..., children: [...] },
      { id: 'purchasing-reports', title: 'Purchasing Reports', icon: ..., children: [...] },
      { id: 'inventory-reports', title: 'Inventory Reports', icon: ..., children: [...] },
    ],
  },
],
```

Replace with (remove the outer `reports` wrapper, promote the three children to direct items, rename their titles):
```tsx
items: [
  { id: 'sales-reports', title: 'Sales', icon: <SalesIcon />, children: [...] },
  { id: 'purchasing-reports', title: 'Purchasing', icon: <PurchasingIcon />, children: [...] },
  { id: 'inventory-reports', title: 'Inventory', icon: <InventoryIcon />, children: [...] },
],
```

Keep all `children` arrays and `icon` values inside each item exactly as they are — copy them verbatim from the existing source. Only the wrapper item and the three title strings change.

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/common/Sidebar.tsx frontend/src/components/common/__tests__/Sidebar.test.tsx
git commit -m "feat: sidebar nav refactoring — rename groups and flatten analytics section (closes #124)"
```
