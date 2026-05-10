# Design: Use FilterSelect in DashboardFilterBar (Issue #244)

## Summary

Refactor `DashboardFilterBar.tsx` to replace 7 manually-implemented MUI dropdown blocks with the shared `FilterSelect` component. Enhances `FilterSelect` with two new optional props to support the varied empty labels and widths needed.

## Changes

### 1. `FilterSelect.tsx` — two new optional props

```ts
interface Props {
  field: string
  label: string
  type: 'select' | 'multi-select'
  value: string | null | string[]
  options: FilterOption[]
  onChange: (value: string | null | string[]) => void
  emptyLabel?: string   // default: "All"
  minWidth?: number     // default: 140
}
```

- The empty `<MenuItem>` in the `select` branch changes from `<em>All</em>` to `{emptyLabel ?? 'All'}` (plain text, no `<em>` wrapper)
- `FormControl` sx gets `minWidth: minWidth ?? 140`

### 2. `DashboardFilterBar.tsx` — replace 7 dropdowns

Remove raw MUI imports: `FormControl`, `InputLabel`, `Select`, `MenuItem` (kept only for the Compare filter which remains unchanged).

Import `FilterSelect` from `@/components/filters/FilterSelect`.

| Filter | field | label | emptyLabel | minWidth | Notes |
|---|---|---|---|---|---|
| Customer | `customer` | `Customer` | `All Customers` | `170` | map `{id, name}` → `FilterOption` |
| Supplier | `supplier` | `Supplier` | `All Suppliers` | `170` | map `{id, name}` → `FilterOption` |
| Category | `category` | `Category` | `All Categories` | `170` | map `{id, name}` → `FilterOption` |
| Stock Status | `stockStatus` | `Stock Status` | `All` | `150` | static options inline |
| Order Status (sales) | `isFulfilled` | `Order Status` | `All` | `150` | boolean↔string at boundary |
| Order Status (purchasing) | `status` | `Order Status` | `All` | `150` | static options inline |
| Payment Status | `paymentStatus` | `Payment Status` | `All` | `170` | uses `resolvedPaymentStatusOptions` |

**Boolean conversion for `isFulfilled`:**
```tsx
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
```

### 3. Compare filter — leave as-is

The Compare filter stays as raw MUI. It has a `disabled` state, a conditional `Tooltip`, a custom type (`DashboardCompare`), and a custom empty label (`"No Comparison"`). Refactoring it would require adding `disabled`/tooltip support to `FilterSelect` for a single consumer — not worth it.

## Out of scope

- `FilterSelect` `disabled` prop
- `FilterSelect` tooltip support
- `sx` passthrough on `FilterSelect`
- Extracting static option arrays as module-level constants

## Tests

No test changes needed. Existing `DashboardFilterBar` tests assert by label text and option text — all assertions remain valid after the refactor. No `FilterSelect` unit tests exist.

## Verification

- All dashboard filters still correctly trigger data refreshes
- Layout remains clean and aligned (minWidth values preserved)
- Reset button correctly clears all `FilterSelect` instances
- Existing `DashboardFilterBar` test suite passes unchanged
