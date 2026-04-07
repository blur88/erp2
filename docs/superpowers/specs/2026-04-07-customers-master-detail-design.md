# Customers Page — Master-Detail Layout Redesign

**Issue:** #303
**Date:** 2026-04-07
**Status:** Approved

## Overview

Redesign `CustomersPage` to follow the Master-Detail layout pattern established by `OrdersPage` and `PurchaseOrdersPage`. Replace the current monolithic 1,071-line page (inline table + Dialog form) with a focused list + detail workspace. Remove `CustomerProfilePage` as a standalone route — its content moves into the workspace card.

## New Files

```
frontend/src/pages/sales/
  CustomerFormPage.tsx                     # Create + Edit form (replaces inline Dialog)
  components/
    CustomerList.tsx                        # Left-pane list: name only, keyboard-navigable
    CustomerContextHeader.tsx               # Right-pane header: customer name + Edit/Delete actions
    CustomerWorkspaceCard.tsx               # Right-pane body: full profile with tabs
  hooks/
    useCustomersSelection.ts                # Selected customer state, keyboard navigation
    useCustomersActions.ts                  # Delete, restore handlers
    useCustomersPageState.ts                # Refs, dialog open/close state
```

## Deleted Files

```
frontend/src/pages/sales/CustomerProfilePage.tsx
frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx
```

Only linked from `CustomersPage` itself and `router.tsx` — safe to remove.

## Modified Files

```
frontend/src/store/slices/salesSlice.ts    # add selectedCustomer + setSelectedCustomer
frontend/src/router.tsx                    # update routes (see Router Changes)
frontend/src/pages/sales/CustomersPage.tsx # gutted to ~150 lines
```

## Router Changes

| Before | After |
|--------|-------|
| `/sales/customers` → `CustomersPage` | unchanged |
| `/sales/customers/:id` → `CustomerProfilePage` | REMOVED |
| — | `/sales/customers/create` → `CustomerFormPage` (new) |
| — | `/sales/customers/:id/edit` → `CustomerFormPage` (new) |

**Important:** `create` route must be declared before `/:id/edit` in the router to avoid React Router treating the literal string `"create"` as an id parameter.

## State & Data Flow

### Redux

Add to `salesSlice`:
- `selectedCustomer: Customer | null`
- `setSelectedCustomer` reducer
- `selectSelectedCustomer` selector

Follows the exact same pattern as `selectedOrder`, `selectedInvoice`, `selectedPayment`.

### `useCustomersSelection`

- Owns keyboard navigation: Arrow Up/Down, Enter, Escape, Home, End, PageUp/PageDown
- On selection change: dispatches `setSelectedCustomer`
- Enter action: navigates to `/sales/customers/:id/edit`
- Mirrors `useOrdersSelection` API

### `CustomerWorkspaceCard` Data Fetching

When `selectedCustomer` changes:
- Fetches `/customers/:id/statistics` immediately (overview tab)
- `/customers/:id/sales-history` lazy-loads on first switch to Orders tab
- `/customers/:id/outstanding-invoices` lazy-loads on first switch to Invoices tab
- Resets tab index to 0 and clears lazy-load flags on each new selection

Logic extracted directly from `CustomerProfilePage` — no new API endpoints required.

## Component Responsibilities

### `CustomerList` (left pane, 25% width)
- Scrollable list of customer names only (no type, phone, city columns)
- Highlights selected row; shows focused row indicator for keyboard navigation
- Props: `customers`, `loading`, `selectedCustomerId`, `focusedIndex`, `onSelect`, `listRef`
- Shows `ListSkeleton` while loading

### `CustomerContextHeader` (right pane header)
- Selected state: customer name + type chip + Edit button + Delete button
- Empty state: prompt to select a customer from the list
- Edit navigates to `/sales/customers/:id/edit`
- Delete opens confirmation dialog
- Mirrors `OrderContextHeader` structure

### `CustomerWorkspaceCard` (right pane body)
- Empty state: illustration + "Select a customer to view details"
- Loading state: skeleton/spinner after selection change
- Loaded state: contact info, stats row (reuses `SalesStatsCards` with Total Orders / Total Sales / Avg Order Value / Outstanding Balance), tabs:
  - **Overview** — contact details, address, notes, price list, credit limit
  - **Order History** — lazy-loaded orders table
  - **Outstanding Invoices** — lazy-loaded invoices table + total outstanding
- `SalesStatsCards` is reused as-is (fully generic `StatItem[]` interface, no Sales-domain hardcoding)

### `CustomerFormPage`
- Handles both Create (`/sales/customers/create`) and Edit (`/sales/customers/:id/edit`)
- Detects mode from presence of `:id` URL param
- Edit mode: fetches customer by id and pre-populates form
- Contains all form validation, phone duplicate-check, and `PriceListSelector` logic currently in the CustomersPage Dialog
- On save → navigates back to `/sales/customers`
- On cancel → navigates back to `/sales/customers`

### `CustomersPage` (after refactor, ~150 lines)
- `PageHeader` + `FilterBar` + error alert
- `MasterDetailWorkspace` with three slots: `CustomerList` / `CustomerContextHeader` / `CustomerWorkspaceCard`
- Keyboard shortcuts wired to `useCustomersSelection`
- Dialogs: Delete confirm + View Deleted (`DeletedCustomersDialog`)

## Testing

### Updated tests
- `CustomersPage.filterbar.test.tsx` — filter/search logic unchanged, rendering context updated (MasterDetailWorkspace shell)
- `CustomersPage.filter.test.tsx` — same

### New tests
- `CustomerFormPage.test.tsx`:
  - Create mode: empty form renders, submit calls `createCustomer`, validation errors shown
  - Edit mode: pre-populated from fetched customer, submit calls `updateCustomer`
  - Phone duplicate check fires on blur
- `CustomersPage.test.tsx`:
  - Selecting a customer dispatches `setSelectedCustomer`
  - Keyboard nav calls selection handlers
  - MasterDetailWorkspace receives correct slot components

### No standalone tests for
- `CustomerList`, `CustomerContextHeader`, `CustomerWorkspaceCard` — covered via page integration tests (consistent with `OrdersTable`, `OrderContextHeader`, `OrderWorkspaceCard` which also have no standalone tests)
- `useCustomersSelection`, `useCustomersActions`, `useCustomersPageState` — tested indirectly via page tests

## Implementation Phases (Incremental)

1. **Extract `CustomerFormPage`** — Create + Edit routes, remove Dialog from CustomersPage. CustomersPage still works as-is (View action still navigates to CustomerProfilePage temporarily).
2. **Extract `CustomerWorkspaceCard`** — Pull profile content out of `CustomerProfilePage` into a reusable component.
3. **Refactor `CustomersPage`** — Replace table with `MasterDetailWorkspace`, wire up new components and hooks, delete `CustomerProfilePage`, update router.
4. **Redux + keyboard nav** — Add `selectedCustomer` to `salesSlice`, implement `useCustomersSelection` with full keyboard support.
5. **Tests** — Update existing filter tests, write `CustomerFormPage.test.tsx` and `CustomersPage.test.tsx`.
