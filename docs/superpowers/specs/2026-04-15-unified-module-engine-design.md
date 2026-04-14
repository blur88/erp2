# Unified Module Engine Design

**Issue:** #372  
**Date:** 2026-04-15  
**Scope:** Sales, Purchasing, and Inventory modules — frontend and backend  
**Strategy:** Big-bang branch, additive-first, single merge when all 17 pages are done

---

## Problem

The Sales, Purchasing, and Inventory modules follow a "parallel track" pattern — each entity has its own nearly-identical implementation of the same scaffold. This produces:

- ~60% frontend duplication across 17 list pages
- ~50% backend duplication across services and controllers
- Bug fixes and UI improvements must be applied 9–17 times manually

The duplicated pattern is: `useXxxPageState` + `useXxxSelection` + `useXxxActions` + `Box` + `PageHeader` + `FilterBar` + `MasterDetailWorkspace` — repeated for every entity.

---

## Decisions

| Question | Decision | Rationale |
|---|---|---|
| Generic engine strictness | Flexible — covers ~80%, entity-specific edge cases stay local | Tree structures (Categories), complex workspace cards (Orders) can't be cleanly config-driven |
| Backend audit logging | In base class via hooks | Consistency and "fix once" guarantee worth the migration cost of normalizing existing audit calls |
| Frontend schema vs props | Props-driven (`GenericListPage` accepts typed props) | Schema-driven adds indirection with no TypeScript benefit; props are just React |
| Transaction unification | Shared `TransactionForm` component + abstract base entities | Sales and Purchase Orders share header+line-items structure; differences handled via config props |
| Migration strategy | Big-bang single branch, additive-first ordering | User preference; old pages remain working until explicitly migrated |

---

## Phase 1: Backend Core

### `BaseCrudService<T, CreateDto, UpdateDto, QueryDto>`

**Location:** `backend/src/common/services/base-crud.service.ts`

Abstract generic class. Concrete services extend it.

**Provided methods:**
- `findAll(query: QueryDto)` — pagination, fuzzy search, sort, filter via `buildWhereClause(query)` hook
- `findOne(id: string)` — throws 404 if not found
- `findDeleted(query: QueryDto)` — `withDeleted` + `isActive = false` filter
- `create(dto: CreateDto, userId: string, username: string)` — saves entity, fires audit
- `update(id: string, dto: UpdateDto, userId: string, username: string)` — fetches before snapshot, saves, fires audit
- `softDelete(id: string, userId: string, username: string)` — calls TypeORM `softDelete`, fires audit
- `restore(id: string, userId: string, username: string)` — restores, fires audit
- `bulkRestore(ids: string[], userId: string, username: string)` — loops, returns `{ successCount, failedItems }`
- `bulkPermanentDelete(ids: string[], userId: string, username: string)` — loops, returns `{ successCount, failedItems }`
- `permanentDelete(id: string, userId: string, username: string)` — hard delete, fires audit

**Subclass-implemented hooks:**
- `abstract buildWhereClause(query: QueryDto): FindOptionsWhere<T>` — entity-specific filter logic
- `abstract getEntityType(): string` — returns audit entity type string (e.g. `'Customer'`)
- `protected afterCreate(entity: T, userId: string, username: string): Promise<void>` — override for custom post-create logic (default: no-op)
- `protected afterUpdate(before: T, after: T, userId: string, username: string): Promise<void>` — override for custom post-update logic
- `protected afterDelete(entity: T, userId: string, username: string): Promise<void>` — override for custom dependency checks or cascade logic

**Audit integration:** Before each mutation the base fetches the current entity as a "before" snapshot. After the mutation it calls `AuditLogService.log(entityType, entityId, action, userId, username, before, after)`. Subclasses that need to suppress or customize audit behavior override the `after*` hooks.

**What stays in concrete services:** All entity-specific methods (`getSalesHistory`, `getSupplierPurchaseOrders`, `canPurchase`, `recalculateAllCustomerTotals`, costing strategy calls, etc.) are not touched by the base.

### `BaseCrudController`

**Location:** `backend/src/common/controllers/base-crud.controller.ts`

Abstract class. Concrete controllers extend it and inherit standard decorated endpoints.

**Provided endpoints:**
- `GET /` → `findAll`
- `GET /deleted` → `findDeleted`
- `GET /:id` → `findOne`
- `POST /` → `create`
- `PUT /:id` or `PATCH /:id` → `update`
- `DELETE /:id` → `softDelete`
- `POST /:id/restore` → `restore`
- `POST /bulk-restore` → `bulkRestore`
- `POST /bulk-permanent-delete` → `bulkPermanentDelete`
- `DELETE /:id/permanent` → `permanentDelete`

Concrete controllers add entity-specific endpoints (e.g. `GET /:id/sales-history`, `GET /:id/can-purchase`) as additional methods.

**Note:** NestJS route ordering rule still applies — `GET /deleted` and `GET /summary` must be declared before `GET /:id`. The base class declares them in the correct order.

### Shared DTOs

**`BaseQueryDto`** (`backend/src/common/dto/base-query.dto.ts`)  
Fields: `search?: string`, `isActive?: boolean`, `sortBy?: string`, `sortOrder?: 'ASC' | 'DESC'`, `page?: number`, `limit?: number`  
Concrete query DTOs extend this and add entity-specific filter fields.

**`BaseContactDto`** (`backend/src/common/dto/base-contact.dto.ts`)  
Fields: `name/companyName`, `email?`, `phone?`, `address?`, `city?`, `country?`  
Extended by `CreateCustomerDto` and `CreateSupplierDto`.

### Pilot Migration

`CustomerService`/`CustomerController` and `SupplierService`/`SupplierController` are migrated first to validate the base design. All existing audit log call signatures are normalized to the standard shape during this pilot. The remaining services follow the same pattern.

---

## Phase 2: Frontend Core

### `useEntityWorkspace<T extends { id: string }>` hook

**Location:** `frontend/src/hooks/useEntityWorkspace.ts`

Replaces the three parallel hooks (`useXxxPageState`, `useXxxSelection`, `useXxxActions`) with one generic hook.

**Config:**
```ts
interface UseEntityWorkspaceConfig<T> {
  entities: T[]
  selectedEntity: T | null
  selectEntity: (entity: T | null) => void   // Redux dispatch wrapper
  refetch: () => void
  navigate: NavigateFunction
  routes: {
    create: string
    edit: (id: string) => string
  }
  notifications: {
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
}
```

**Returns:**
```ts
{
  // Selection
  focusedIndex: number
  setFocusedIndex: (i: number) => void
  listRef: RefObject<HTMLElement>
  searchInputRef: RefObject<HTMLInputElement>
  // Standard dialogs
  deleteConfirmOpen: boolean
  setDeleteConfirmOpen: (open: boolean) => void
  deletedEntitiesDialogOpen: boolean
  setDeletedEntitiesDialogOpen: (open: boolean) => void
  // Search focus
  setShouldPreserveSearchFocus: (v: boolean) => void
  // Handlers (pre-wired, pass directly to components)
  handleSelect: (entity: T) => void
  handleDelete: () => Promise<void>
  handleCancelDelete: () => void
  handleNavigateUp: () => void
  handleNavigateDown: () => void
  handleEnterAction: () => void
  handleEscapeAction: () => void
  handlePageUpNavigation: () => void
  handlePageDownNavigation: () => void
  handleNavigateToFirst: () => void
  handleNavigateToLast: () => void
}
```

**Internals:** Calls `useKeyboardShortcuts` internally. Manages the `shouldPreserveSearchFocus` + `useEffect` pattern internally. Pages no longer need to call `useKeyboardShortcuts` directly or write the focus `useEffect`.

**Entity-specific state that stays local:** Extra dialog state unique to an entity (e.g. Categories' `smartDeleteOpen`, `categoryToDelete`, `deleteError`) stays as `useState` in the page component. `useEntityWorkspace` does not attempt to cover these.

### `GenericListPage` component

**Location:** `frontend/src/components/common/GenericListPage.tsx`

Replaces the repeated `Box` + `PageHeader` + `FilterBar` + error `Alert` + `MasterDetailWorkspace` scaffold.

**Props:**
```ts
interface GenericListPageProps<F> {
  // Header
  title: string
  subtitle: string
  primaryAction: { label: string; onClick: () => void }
  secondaryAction: { label: string; onClick: () => void }
  // Filter bar
  filterConfig: FilterBarConfig<F>
  draftFilters: F
  handlers: FilterHandlers
  hasActiveFilters: boolean
  searchInputRef: RefObject<HTMLInputElement>
  sort: SortConfig
  // Error
  error?: string | null
  onErrorClose?: () => void
  // Slots
  listSlot: ReactNode
  headerSlot: ReactNode
  workspaceSlot: ReactNode
  dialogs?: ReactNode
}
```

**Result — a migrated page looks like:**
```tsx
const CustomersPage = () => {
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const { data, isLoading, refetch } = useGetCustomersQuery(queryParams)
  const workspace = useEntityWorkspace({ entities: customers, ... })

  return (
    <GenericListPage
      title="Customers"
      subtitle="View customer profiles and client account details"
      primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedEntitiesDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={sortConfig}
      listSlot={<CustomerList ... />}
      headerSlot={<CustomerContextHeader ... />}
      workspaceSlot={<CustomerWorkspaceCard ... />}
      dialogs={<CustomersDialogs ... />}
    />
  )
}
```

Pages shrink from ~210 lines to ~60–80 lines.

### Pilot Migration

`CustomersPage` and `SuppliersPage` migrated first. Validates `useEntityWorkspace` and `GenericListPage` against real pages. The remaining 7 list pages follow the same pattern.

---

## Phase 3: Transaction Unification

### Backend: Abstract Base Entities

**`BaseTransactionHeader`** (`backend/src/database/entities/base-transaction-header.entity.ts`)  
Abstract TypeORM entity (no `@Entity()` decorator — subclasses keep their own table names).  
Fields: `status`, `notes`, `subtotal`, `taxAmount`, `discountAmount`, `totalAmount`, `createdByUserId`, `createdByUsername`  
Extended by: `SalesOrder`, `PurchaseOrder`, `Invoice` (where applicable)

**`BaseTransactionItem`** (`backend/src/database/entities/base-transaction-item.entity.ts`)  
Abstract TypeORM entity.  
Fields: `productId`, `description`, `quantity`, `unitPrice`, `discountType`, `discountValue`, `taxRate`, `subtotal`, `totalAmount`  
Extended by: `SalesOrderItem`, `PurchaseOrderItem`, `InvoiceItem`, `GoodsReceivedNoteItem`

**No database migrations required.** These are TypeScript inheritance changes only — the database schema is unchanged.

### Frontend: `TransactionForm` component

**Location:** `frontend/src/components/common/TransactionForm.tsx`

Unified order-entry form used by both `CreateSalesOrderPage` and `CreatePurchaseOrderPage`.

**Config props:**
```ts
interface TransactionFormProps {
  entityLabel: 'Customer' | 'Supplier' | undefined
  entityOptions: { id: string; name: string }[]   // from RTK Query result
  lineItemColumns: ColumnConfig[]   // differs: 'Unit Price' vs 'Cost Price'
  onSubmit: (data: TransactionFormData) => Promise<void>
  onCancel: () => void
  initialValues?: Partial<TransactionFormData>
  isSubmitting: boolean
}
```

**Shared UI:** Partner selector, date picker, line-items table (add/remove rows, qty/price/discount inputs, running totals), notes field, submit/cancel actions.

**What stays separate:**
- Sales-specific: credit limit checks, price list application on line items
- Purchase-specific: PO approval workflow, goods receipt matching logic

These stay in `CreateSalesOrderPage` and `CreatePurchaseOrderPage` respectively — `TransactionForm` handles only the shared UI structure.

---

## Phase 4: Inventory Migration

### Categories

Categories have a tree structure (`level`, `fullPath`, `hasChildren`, parent/child relationships). The list renders as a flat indented list — `CategoryList` handles tree rendering internally.

**`GenericListPage` works as-is** — the tree structure is encapsulated in the `listSlot`. No special handling needed in the generic scaffold.

**Local state that stays in `CategoriesPage`:** `smartDeleteOpen`, `categoryToDelete`, `deleteError`. These are Categories-specific and stay as `useState`. `useEntityWorkspace` handles selection/keyboard/standard dialogs; the smart-delete flow is an additional local layer.

**`CategoryService`** extends `BaseCrudService<Category, CreateCategoryDto, UpdateCategoryDto, CategoryQueryDto>`. Entity-specific methods (tree queries, `getProductCount`, smart-delete dependency check) stay in the concrete service.

### Products

Products fit the generic engine cleanly — flat list, standard master-detail workspace, three-tab workspace card (Details, Movement History, Order History).

**`ProductImportDialog`** is passed via the `dialogs` slot — no changes to the generic engine needed.

**`ProductService`** extends `BaseCrudService`. Costing strategy pattern (`CostingStrategyFactory`, FIFO/LIFO/Average/Standard strategies) is untouched — it is inventory-specific business logic, not CRUD boilerplate.

### Stock Adjustments

Stock Adjustments are transaction-like (header + line items) but simpler than Sales/Purchase Orders — no partner entity, status is draft/confirmed only.

**`CreateStockAdjustmentPage`** reuses `TransactionForm` with a stock-adjustment config variant:
```ts
entityLabel: undefined   // no partner selector
lineItemColumns: ['Product', 'Adjustment Type', 'Quantity', 'Notes']
```

**`StockAdjustmentService`** extends `BaseCrudService`.

---

## Testing Strategy

### Backend

- `BaseCrudService` — dedicated unit test suite testing base behavior once (pagination, softDelete, restore, bulk ops, audit hook calls) using a mock repository and mock entity. This is the authoritative test for shared behavior.
- `BaseCrudController` — lightweight integration test covering all standard endpoints.
- Existing service specs (`customer.service.spec.ts`, `supplier.service.spec.ts`, etc.) — updated to remove redundant base-class tests, retain entity-specific method tests.

### Frontend

- `useEntityWorkspace` — dedicated test file covering selection, keyboard navigation, search focus preservation, standard dialog state transitions.
- `GenericListPage` — render test verifying slots render, error banner shows/hides, filter bar present.
- `TransactionForm` — tests for line item add/remove, total recalculation, submit/cancel behavior.
- Existing page-level filter/filterbar tests (`CustomersPage.filterbar.test.tsx`, etc.) — kept but simplified to test page config and wiring only, not generic behavior.
- Existing `*ContextHeader` and `*WorkspaceCard` tests (~30 files) — untouched, these components are not changing.

### Out of scope

E2E tests (Playwright/Cypress) — no existing E2E infrastructure in the project. Adding it is a separate concern. Success is defined by all existing unit tests passing plus new unit tests for the generic engine components.

---

## Impacted Files

### New files (backend)
- `backend/src/common/services/base-crud.service.ts`
- `backend/src/common/controllers/base-crud.controller.ts`
- `backend/src/common/dto/base-query.dto.ts`
- `backend/src/common/dto/base-contact.dto.ts`
- `backend/src/database/entities/base-transaction-header.entity.ts`
- `backend/src/database/entities/base-transaction-item.entity.ts`

### New files (frontend)
- `frontend/src/hooks/useEntityWorkspace.ts`
- `frontend/src/hooks/useEntityWorkspace.test.ts`
- `frontend/src/components/common/GenericListPage.tsx`
- `frontend/src/components/common/GenericListPage.test.tsx`
- `frontend/src/components/common/TransactionForm.tsx`
- `frontend/src/components/common/TransactionForm.test.tsx`

### Modified (backend — 11 services + 11 controllers)
All services/controllers for: Customer, Supplier, Product, Category, StockAdjustment, SalesOrder, PurchaseOrder, Invoice, Payment, GoodsReceivedNote, VendorPayment

### Modified (frontend — 17 pages)
All list pages for: Customers, Suppliers, Products, Categories, StockAdjustments, Orders, Invoices, Payments, PurchaseOrders, GoodsReceived, VendorPayments + CreateSalesOrderPage, CreatePurchaseOrderPage, CreateProductPage, CreateStockAdjustmentPage, CustomerFormPage, SupplierFormPage

### Deleted (frontend — after migration)
All per-entity hook trios: `useXxxPageState`, `useXxxSelection`, `useXxxActions` (27 files across the three modules)

---

## Success Criteria

- All 17 pages render and behave identically to before migration (no functional regression)
- All existing unit and filterbar tests pass
- New unit tests for `BaseCrudService`, `useEntityWorkspace`, `GenericListPage`, `TransactionForm` pass
- Each migrated list page is ≤80 lines
- No database migrations required
- Audit logs continue to fire correctly for all CRUD operations across all entities
