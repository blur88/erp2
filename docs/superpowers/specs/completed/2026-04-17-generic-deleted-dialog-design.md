# Design: GenericDeletedDialog — Issue #381

## Summary

Replace 13 independent `Deleted*Dialog.tsx` components (~7,900 lines) with a single generic `GenericDeletedDialog<T>` component plus 13 thin wrapper files. Eliminates duplicate logic for search, bulk selection, restore/permanent-delete mutations, and confirmation flows.

## Props Interface

```ts
interface ColumnDef<T> {
  label: string
  render: (item: T) => React.ReactNode
  width?: string
  hideOnMobile?: boolean
  align?: 'left' | 'right' | 'center'
}

interface GenericDeletedDialogProps<T extends { id: string }> {
  open: boolean
  onClose: () => void

  // Display
  title: string                          // e.g. "Deleted Products"
  entityLabel: string                    // e.g. "product" (used in success/error messages)
  icon: React.ReactNode                  // e.g. <Inventory2Icon />
  columns: ColumnDef<T>[]
  getItemLabel: (item: T) => string      // primary display name for confirmation dialogs

  // Search
  searchPlaceholder: string
  filterItem: (item: T, searchTerm: string) => boolean

  // RTK Query hooks
  useGetDeletedQuery: (arg: any, options?: any) => { data: any; isFetching: boolean; refetch: () => void }
  useRestoreMutation: () => [Function, { isLoading: boolean }]
  usePermanentDeleteMutation: () => [Function, { isLoading: boolean }]
  useBulkRestoreMutation: () => [Function, { isLoading: boolean }]
  useBulkPermanentDeleteMutation: () => [Function, { isLoading: boolean }]
}
```

**Key decisions:**
- `columns` config array (not render props or key-value) — consistent with existing `EntityTable`/`GenericListPage` patterns, caller controls cell content, generic controls layout/styling
- `getItemLabel` returns a string — uniform confirmation dialog layout (entity name only), no custom JSX per caller. Secondary fields (phone, category, barcode) omitted from confirmations — they add noise without value.
- RTK hooks passed as props — generic component stays API-agnostic, works for any future entity without modification

## Component Structure

**File:** `frontend/src/components/common/GenericDeletedDialog.tsx` — single file, no hook extraction, no sub-component files.

**Internal state:**
- `searchTerm` — drives client-side filtering via `filterItem` prop
- `restoringId / deletingId: string | null` — per-row loading state
- `confirmDelete: T | null` — item pending single permanent delete confirmation
- `selectedItems: Set<string>` — bulk selection set
- `showBulkConfirm / showBulkRestoreConfirm: boolean` — confirmation dialog visibility
- `bulkDeleting / bulkRestoring: boolean` — bulk operation loading state

**Layout (top to bottom):**
1. Dialog header — icon + title + close button + item count subtitle
2. Info alert + search bar + conditional bulk action buttons (Restore Selected / Delete Selected)
3. Scrollable sticky-header table — checkbox column, `columns` rendered via config, actions column (hover-reveal on desktop, always-visible on mobile)
4. Single permanent delete confirmation dialog
5. Bulk restore confirmation dialog
6. Bulk permanent delete confirmation dialog

`useEffect` resets `selectedItems` when `open` flips to `true`.

## Caller Pattern

Each existing `Deleted*Dialog.tsx` becomes a thin wrapper (~25-35 lines). File paths and export names stay identical — no changes needed in parent components.

```tsx
// frontend/src/components/inventory/DeletedProductsDialog.tsx (after refactor)
const columns: ColumnDef<Product>[] = [
  { label: 'Product Name', render: (p) => <Typography>{p.name}</Typography>, width: '40%' },
  { label: 'Category', render: (p) => <Chip label={p.category?.name || 'No Category'} />, width: '20%' },
  { label: 'Price', render: (p) => <Typography>{formatCurrency(...)}</Typography>, width: '12%', hideOnMobile: true, align: 'right' },
  { label: 'Deleted Date', render: (p) => <Typography>{formatDate(p.deletedAt)}</Typography>, width: '15%', hideOnMobile: true },
]

const DeletedProductsDialog = ({ open, onClose }) => (
  <GenericDeletedDialog
    open={open}
    onClose={onClose}
    title="Deleted Products"
    entityLabel="product"
    icon={<Inventory2Icon />}
    columns={columns}
    getItemLabel={(p) => p.name}
    searchPlaceholder="Search deleted products..."
    filterItem={(p, term) => p.name?.toLowerCase().includes(term) || p.barcode?.toLowerCase().includes(term)}
    useGetDeletedQuery={useGetDeletedProductsQuery}
    useRestoreMutation={useRestoreProductMutation}
    usePermanentDeleteMutation={usePermanentDeleteProductMutation}
    useBulkRestoreMutation={useBulkRestoreProductsMutation}
    useBulkPermanentDeleteMutation={useBulkPermanentDeleteProductsMutation}
  />
)
```

## Affected Files

**New:**
- `frontend/src/components/common/GenericDeletedDialog.tsx`
- `frontend/src/components/common/GenericDeletedDialog.test.tsx`

**Replaced (thin wrappers, same path/export):**
- `frontend/src/components/inventory/DeletedProductsDialog.tsx`
- `frontend/src/components/inventory/DeletedCategoriesDialog.tsx`
- `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx`
- `frontend/src/components/sales/DeletedCustomersDialog.tsx`
- `frontend/src/components/sales/DeletedOrdersDialog.tsx`
- `frontend/src/components/sales/DeletedInvoicesDialog.tsx`
- `frontend/src/components/sales/DeletedPaymentsDialog.tsx`
- `frontend/src/components/purchasing/DeletedSuppliersDialog.tsx`
- `frontend/src/components/purchasing/DeletedPurchaseOrdersDialog.tsx`
- `frontend/src/components/purchasing/DeletedGRNsDialog.tsx`
- `frontend/src/components/purchasing/DeletedVendorPaymentsDialog.tsx`
- `frontend/src/components/accounting/DeletedAccountsDialog.tsx`
- `frontend/src/components/settings/DeletedPaymentMethodsDialog.tsx`

## Testing

One test file: `frontend/src/components/common/GenericDeletedDialog.test.tsx`

Uses a minimal `TestEntity = { id: string; name: string }` with mock RTK hooks (no real API calls).

**Test cases:**
1. Renders title, icon, and item count correctly
2. Search filters the item list
3. Restore button calls `useRestoreMutation` with correct id
4. Permanent delete button opens confirmation dialog; confirm calls `usePermanentDeleteMutation`
5. Checkbox selects items; bulk restore button appears with correct count
6. Bulk restore confirm calls `useBulkRestoreMutation` with selected ids
7. Bulk permanent delete confirm calls `useBulkPermanentDeleteMutation` with selected ids
8. Select-all checkbox selects all filtered items
9. `selectedItems` resets when dialog reopens
10. Empty state message shown when no items match search

No tests on individual wrapper files — they are pure config with no logic to test.

## Migration Steps

1. Create `GenericDeletedDialog.tsx` in `frontend/src/components/common/`
2. Refactor `DeletedProductsDialog.tsx` as proof-of-concept; verify type-check passes
3. Refactor remaining 12 dialogs in bulk
4. Write `GenericDeletedDialog.test.tsx`
5. Run `npm run type-check` + `npx vitest run src/components/common/GenericDeletedDialog.test.tsx`
