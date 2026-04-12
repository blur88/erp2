# CategoriesPage Master-Detail Refactor — Design Spec

**Issue**: #344  
**Date**: 2026-04-12  
**Status**: Approved

---

## Goal

Refactor `CategoriesPage.tsx` from a 700+ line monolith into the standardized Master-Detail pattern used by `ProductsPage`, `SuppliersPage`, and others. The result is a consistent UI with the list on the left, a context header and workspace card on the right, and all logic decomposed into focused hooks and components.

---

## Redux Slice Change

Add `selectedCategory: Category | null` to `inventorySlice` alongside the existing `selectedProduct`:

```ts
// inventorySlice.ts additions
selectedCategory: Category | null   // new state field, initial value: null
setSelectedCategory(state, action)  // new reducer
selectSelectedCategory              // new selector
```

No other slice changes.

---

## File Structure

All new files live under `frontend/src/pages/inventory/`:

```
hooks/
  useCategoriesPageState.ts
  useCategoriesSelection.ts
  useCategoriesActions.ts

components/
  CategoryList.tsx
  CategoryContextHeader.tsx
  CategoryWorkspaceCard.tsx
  CategoryDialogs.tsx

CategoriesPage.tsx   (rewritten)
```

---

## Hooks

### `useCategoriesPageState`

Owns UI-only flags and refs — no business logic. Returns:

| Name | Type | Purpose |
|------|------|---------|
| `dialogOpen` / `setDialogOpen` | `boolean` | Form dialog open state |
| `editMode` / `setEditMode` | `boolean` | Create vs. edit mode flag |
| `deletedCategoriesDialogOpen` / `setDeletedCategoriesDialogOpen` | `boolean` | Deleted categories dialog |
| `deleteConfirmOpen` / `setDeleteConfirmOpen` | `boolean` | Simple delete confirmation dialog |
| `categoryToDelete` / `setCategoryToDelete` | `Category \| null` | Category staged for deletion |
| `smartDeleteOpen` / `setSmartDeleteOpen` | `boolean` | Smart delete dialog (has products) |
| `deleteError` / `setDeleteError` | `any` | Error payload from failed delete (for SmartCategoryDeleteDialog) |
| `submitting` / `setSubmitting` | `boolean` | Form submission in-flight flag |
| `focusedCategoryIndex` / `setFocusedCategoryIndex` | `number` | Keyboard focus position in list |
| `categoryListRef` | `RefObject<HTMLDivElement>` | Scroll container ref for keyboard nav |
| `searchInputRef` | `RefObject<HTMLInputElement>` | Search input ref for `/` shortcut |

### `useCategoriesSelection`

Linear keyboard navigation over the flat categories array — same pattern as `useProductsSelection`. Inputs: `dispatch`, `categories`, `selectedCategory`, `focusedCategoryIndex`, `setFocusedCategoryIndex`, `categoryListRef`.

Behaviours:
- Auto-select first category on load (when no category is selected and list is non-empty)
- Keep selected category in sync when list refreshes after edits
- Deselect (`setSelectedCategory(null)`) when selected category disappears from list (deleted)
- Scroll focused row into view via `categoryListRef`

Returns: `handleCategorySelect`, `handleNavigateUp`, `handleNavigateDown`, `handleNavigateToFirst`, `handleNavigateToLast`, `handlePageUpNavigation`, `handlePageDownNavigation`, `handleEscapeAction`

Navigation is linear (up/down by flat index) — no hierarchy-aware traversal.

### `useCategoriesActions`

Owns all API calls and form logic. Receives injected dependencies from the page (mutations, notification helpers, pageState setters, `selectedCategory`, `categories` list).

| Handler | Behaviour |
|---------|-----------|
| `handleAddCategory(parentId?)` | Resets form (pre-fills `parentId` if provided), sets `editMode=false`, opens dialog |
| `handleEditCategory(category)` | Pre-fills form with category data, sets `editMode=true`, opens dialog |
| `handleDeleteCategory(category)` | Sets `categoryToDelete`, clears `deleteError`, opens `deleteConfirmOpen` |
| `handleConfirmDelete` | Calls RTK `deleteCategory().unwrap()`; on success shows toast and closes; on "has products" error (detects via `error.productCount` or message containing `'contains'`) closes confirm dialog and opens smart delete dialog with error payload |
| `handleSmartDelete(moveToUncategorized)` | Direct `fetch` call to `/api/inventory/categories/:id?force=true[&moveToUncategorized=true]`; shows contextual success toast; calls `refetchCategories()`; re-throws on error so dialog can manage its loading state |
| `handleCancelDelete` | Closes confirm dialog, clears `categoryToDelete` |
| `handleSmartDeleteClose` | Closes smart delete dialog, clears `categoryToDelete` and `deleteError` |
| `onSubmit(data)` | Guards against `isDuplicateName`; calls `updateCategory` or `createCategory`; closes dialog on success; handles 409/400/generic errors with descriptive toast messages |

Form state (`useForm`, `Controller`, `yupResolver`, real-time duplicate check via `useCategoryDuplicateCheck`) lives inside `CategoryDialogs` — `useCategoriesActions.onSubmit` is passed down as the form's submit handler.

---

## UI Components

### `CategoryList`

Mirrors `ProductList`. A `Paper` with a sticky header row (count label) and a scrollable `TableContainer`.

- Each category renders as a `TableRow` with `data-category-index={index}` for scroll targeting
- Indentation: `ml: category.level * 1.5` on the name cell content
- Selection highlight: `backgroundColor: 'action.selected'` when `selectedCategoryId === category.id`
- Focus outline: `outline: '2px solid'` + `outlineColor: 'primary.main'` when `index === focusedIndex`
- Columns: Category Hierarchy (drag icon + indented name), Products (chip), Created Date (hidden on mobile)
- **No Edit/Delete buttons in row** — actions live in `CategoryContextHeader`
- Rows are clickable (`onClick: onSelect`)

Props: `categories`, `loading`, `selectedCategoryId`, `focusedIndex`, `onSelect`, `categoryListRef`

### `CategoryContextHeader`

Mirrors `ProductContextHeader`.

- No selection: renders a `Paper` with centered "Select a category to view details" placeholder
- Selection: renders `Paper` with header bar showing category name + full path as subtitle, and Edit + Delete `IconButton`s top-right
- Props: `selectedCategory`, `onEdit`, `onDelete`

### `CategoryWorkspaceCard`

Two-tab `Paper` — tab state resets to 0 when `selectedCategory.id` changes.

**Tab 0 — Details**  
Key/value grid (MUI `Grid` or `Box` rows):
- Full Path
- Level (Root / Level N)
- Parent (name, or "None" if root)
- Products (count)
- Created Date

**Tab 1 — Products**  
Calls `useGetProductsQuery({ categoryId: selectedCategory.id })`. Renders a compact read-only list: product name + stock quantity. No edit actions — view-only context. Shows "No products in this category" when empty.

Props: `selectedCategory: Category | null`

### `CategoryDialogs`

Consolidates all four dialogs. Owns form state internally (`useForm`, `useCategoryDuplicateCheck`, `useEffect` for real-time validation).

| Dialog | Trigger |
|--------|---------|
| Form dialog | `dialogOpen` — create or edit |
| `DeletedCategoriesDialog` | `deletedCategoriesDialogOpen` |
| `ConfirmationDialog` | `deleteConfirmOpen` — simple delete confirm |
| `SmartCategoryDeleteDialog` | `smartDeleteOpen` — force delete with product reassignment |

The form dialog contains: name `TextField` with real-time duplicate error display, `CategorySelector` for parent (excludes self in edit mode).

Props: all open/close flags + handlers from `useCategoriesPageState` and `useCategoriesActions`, plus `categories`, `editMode`, `selectedCategory` (for form pre-fill and exclude logic), `refetchCategories`.

---

## `CategoriesPage` (Rewritten Orchestrator)

Structure mirrors `ProductsPage`:

```tsx
const CategoriesPage = () => {
  // hooks
  const pageState = useCategoriesPageState()
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data: categories, isFetching, refetch } = useGetCategoriesQuery(...)
  const selection = useCategoriesSelection(...)
  const actions = useCategoriesActions(...)
  useKeyboardShortcuts({ onSearch, onArrowUp, onArrowDown, ... })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        variant="workflow"
        title="Categories"
        subtitle={...}
        primaryAction={{ label: 'Add Category', onClick: actions.handleAddCategory }}
        secondaryAction={{ label: 'View Deleted', onClick: ... }}
        toolbar={<FilterBar config={filterConfig} ... />}
      />
      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={<CategoryList ... />}
        headerSlot={<CategoryContextHeader ... />}
        workspaceSlot={<CategoryWorkspaceCard selectedCategory={selectedCategory} />}
      />
      <CategoryDialogs ... />
    </Box>
  )
}
```

`FilterBar` config: search only (`fields: []`), placeholder "Search categories by name...". No filter chips for now.

---

## Data Flow

```
useGetCategoriesQuery (search filter from Redux)
  → categories[]
    → CategoryList (renders rows)
    → useCategoriesSelection (auto-select, keyboard nav) → dispatches setSelectedCategory
      → selectedCategory (from Redux)
        → CategoryContextHeader (name, edit/delete buttons)
        → CategoryWorkspaceCard (details + products query)
        → useCategoriesActions (edit/delete operations)
```

---

## Preserved Behaviours

- Hierarchical indentation (level-based `ml`) — unchanged
- Real-time duplicate name validation (debounced, 500ms) — moved into `CategoryDialogs`
- Smart delete escalation (confirm → smart delete on "has products" error) — moved into `useCategoriesActions`
- `SmartCategoryDeleteDialog` uses direct `fetch` (not RTK) — preserved as-is
- Keyboard shortcut `/` focuses search input — wired via `useKeyboardShortcuts`
- `DeletedCategoriesDialog` triggers `refetchCategories` on restore — preserved
- Mobile responsive layout via `isMobile` passed to `MasterDetailWorkspace`

---

## Testing

- Existing `CategoriesPage` has no test file — no regressions to protect
- `CategoryList` should get a basic render + selection test (mirrors `ProductList.test.tsx`)
- `useCategoriesSelection` should get a hook test (mirrors `useProductsSelection.test.tsx`)
- Manual verification checklist (from issue #344):
  - [ ] Hierarchical display and indentation correct
  - [ ] Smart delete logic preserved and functional
  - [ ] Keyboard navigation works (arrow keys, escape, home/end)
  - [ ] Real-time duplicate name validation works in form dialog
  - [ ] FilterBar search filters the list
  - [ ] Workspace card shows correct category details and products

---

## Out of Scope

- Filter chips for categories (level, has-products) — deferred per filter bar system
- Hierarchy-aware keyboard navigation (down enters children) — deferred by design decision
- Drag-and-drop reordering (DragIndicatorIcon is decorative only, as in current code)
