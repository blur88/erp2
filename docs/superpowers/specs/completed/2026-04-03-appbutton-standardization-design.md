# AppButton Standardization — Design Spec
*Issue #268 | 2026-04-03*

## Goal

Consolidate button logic into a single `AppButton` component to eliminate visual inconsistency and code duplication across `FilterBar`, `DashboardFilterBar`, and `PageHeader`. Simultaneously delete legacy toolbar files that are superseded by the `FilterBar` system.

---

## AppButton Component

**Location:** `frontend/src/components/common/AppButton.tsx`

### API

```ts
type AppButtonProps = {
  variant?: 'primary' | 'secondary' | 'outlined' | 'danger'
  size?: 'filter' | 'small' | 'medium' | 'large'
  loading?: boolean
  sortConfig?: {
    field: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
  }
  // All standard MUI ButtonProps also accepted (onClick, disabled, children, startIcon, sx, etc.)
}
```

### Behavior

**Size:**
- `size="filter"` → MUI `size="small"` + `height: 40px` (aligns with filter inputs)
- All other sizes → passed through to MUI Button as-is, no height override

**Variant mapping:**

| AppButton variant | MUI variant | MUI color |
|---|---|---|
| `primary` | `contained` | `primary` |
| `secondary` | `outlined` | `inherit` |
| `outlined` | `outlined` | `inherit` |
| `danger` | `contained` | `error` |
| *(default, no variant)* | `outlined` | `inherit` |

**Loading:**
- `loading={true}` disables the button and replaces `startIcon` with `<CircularProgress size={16} />`
- Children (label text) remain visible

**Sort mode (`sortConfig` provided):**
- Derives `variant` and `color` from active state — ignores the `variant` prop
- Active (`sortBy === field`): `variant="contained"` + `color="primary"`
- Inactive: `variant="outlined"` + `color="inherit"`
- Active + `sortOrder === 'asc'`: `startIcon=<ArrowUpward />`
- Active + `sortOrder === 'desc'`: `startIcon=<ArrowDownward />`
- Inactive: `startIcon=<Sort />`

---

## Files Changed

### New
- `frontend/src/components/common/AppButton.tsx`

### Updated

**`FilterBar.tsx`**
- Reset button → `<AppButton size="filter" variant="outlined" onClick={handlers.onClearAll}>Reset</AppButton>`
- Sort button → `<AppButton size="filter" sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }} onClick={() => sort.onSort(sort.field)}>Sort</AppButton>`

**`DashboardFilterBar.tsx`**
- Reset button → `<AppButton size="filter" variant="outlined" onClick={onReset}>Reset</AppButton>`
- Remove inline `sx={{ height: 40 }}`

**`PageHeader.tsx`**
- Secondary action → `<AppButton variant="outlined" onClick={...}>label</AppButton>` (no `size="filter"`, keeps default MUI height)
- Primary action → `<AppButton variant="primary" onClick={...}>label</AppButton>`

**Dialog submit buttons**
- Any dialog submit button currently accepting a `loading`/`isLoading` prop switches to `<AppButton variant="primary" loading={isLoading}>Submit</AppButton>`
- Audit scope: grep for `loading=` on MUI `Button` in `src/pages` and `src/components`

### Deleted
| File | Imported by |
|---|---|
| `frontend/src/pages/sales/components/OrdersToolbar.tsx` | `OrdersPage.tsx` |
| `frontend/src/pages/sales/components/InvoicesToolbar.tsx` | `InvoicesPage.tsx` |
| `frontend/src/pages/sales/components/OrderContextHeader.tsx` | `OrdersPage.tsx` |
| `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx` | `PurchaseOrdersPage.tsx` |
| `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` | `PurchaseOrdersPage.tsx` |
| `frontend/src/pages/inventory/components/ProductsToolbar.tsx` | *(not imported anywhere)* |

For each deleted file:
- Remove its import and JSX usage from the consuming page
- Remove its `vi.mock(...)` and any related assertions from test files (`OrdersPage.filterbar.test.tsx`, `PurchaseOrdersPage.filterbar.test.tsx`)

The page will have no toolbar until the `FilterBar` migration is done for that page — this is intentional.

---

## Testing

- Unit test `AppButton` for all variant mappings, loading state, and sort mode icon/variant logic
- Update `PageHeader` tests if snapshot assertions exist
- Verify `FilterBar` tests still pass (Reset/Sort button behavior unchanged, just new component)
- No visual regression testing required — behavior is identical, only the component source changes

---

## Out of Scope

- Legacy toolbar files other than the ones listed above
- Migrating `OrdersPage`, `InvoicesPage`, `PurchaseOrdersPage` to `FilterBar` — that is a separate issue
- One-off styled buttons in legacy toolbars (Export, Import, Calculator) — deleted with the toolbar files
