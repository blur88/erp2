# Remove Manual Invoice Creation (Issue #387)

## Overview

Invoices are now auto-created when a Sales Order is generated. The manual "New Invoice" button and all unimplemented stub actions (edit dialog, delete action) must be removed to prevent orphaned invoices and eliminate dead code.

## Scope

### Frontend

**`frontend/src/pages/sales/InvoicesPage.tsx`**
- Remove `primaryAction` prop from `<GenericListPage>` (removes "New Invoice" button)
- Remove `createDialog`, `editDialog`, `onCloseCreateDialog`, `onCloseEditDialog` props from `<InvoicesDialogs>`

**`frontend/src/pages/sales/components/InvoicesDialogs.tsx`**
- Remove `createDialog`, `editDialog`, `onCloseCreateDialog`, `onCloseEditDialog` from props interface
- Remove the two placeholder `<Dialog>` blocks (create and edit — both were unimplemented placeholders)

**`frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`**
- Remove `createDialog` + `setCreateDialog` state
- Remove `editDialog` + `setEditDialog` state
- Remove `handleAddInvoice`, `handleEditAction`, `handleDeleteAction` from return object
- Simplify `onEnter` (was opening editDialog) — remove dialog open call
- Simplify `onEscape` — remove `setCreateDialog(false)` and `setEditDialog(false)` calls

**`frontend/src/store/api/salesApi.ts`**
- Remove `createInvoice` mutation (defined but never called anywhere)

### Backend

**`backend/src/modules/sales/controllers/invoice.controller.ts`**
- Remove the `@Post()` / `createInvoice` endpoint (the auto-creation path via `SalesOrderService` is the sole invoice creation source)

**`backend/src/modules/sales/dto/invoice.dto.ts`**
- Remove `CreateInvoiceDto` if unused after removing the controller endpoint

## What Stays

- `editDialog` state removal leaves edit-invoice functionality absent — this is intentional; editing invoices is not currently implemented and is out of scope
- The `POST /invoices` backend endpoint has no external consumers (verified: `useCreateInvoiceMutation` is defined in `salesApi.ts` but never imported or called anywhere in the frontend)
- All other invoice actions (print, view deleted, payment navigation, journal entry navigation) are unaffected

## Data Flow After Change

```
Sales Order created → SalesOrderService auto-creates Invoice
                    ↓
        Invoice appears in Invoices page (read-only list)
```

Manual invoice creation path is eliminated entirely.

## Testing

- Verify "New Invoice" button no longer appears on Invoices page
- Verify no TypeScript errors (`npm run type-check` in frontend)
- Verify `POST /invoices` endpoint is removed from Swagger docs after backend rebuild
- Verify existing invoice list, print, payment, and journal entry navigation still work
