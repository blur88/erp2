# Remove Manual Invoice Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "New Invoice" button, create/edit dialog stubs, unimplemented delete action, and the `POST /invoices` backend endpoint — enforcing the Sales Order → Invoice auto-creation as the only invoice creation path.

**Architecture:** Three frontend files lose dead state/UI code; `salesApi.ts` loses the unused mutation; the backend controller loses the `@Post()` endpoint. `CreateInvoiceDto` is retained because `invoice.service.ts` uses it internally for `duplicateInvoice`.

**Tech Stack:** React 19, TypeScript, RTK Query, NestJS 11

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/pages/sales/InvoicesPage.tsx` | Remove `primaryAction`, remove create/edit dialog props |
| `frontend/src/pages/sales/components/InvoicesDialogs.tsx` | Remove create/edit dialog props + JSX blocks |
| `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` | Remove `createDialog`, `editDialog`, `handleAddInvoice`, `handleEditAction`, `handleDeleteAction` state/logic |
| `frontend/src/store/api/salesApi.ts` | Remove `createInvoice` mutation and exported hook |
| `backend/src/modules/sales/controllers/invoice.controller.ts` | Remove `@Post()` createInvoice endpoint |

---

### Task 1: Remove `createInvoice` mutation from `salesApi.ts`

**Files:**
- Modify: `frontend/src/store/api/salesApi.ts:269-273` (mutation definition)
- Modify: `frontend/src/store/api/salesApi.ts:415` (exported hook)

- [ ] **Step 1: Remove the mutation definition**

In `frontend/src/store/api/salesApi.ts`, delete lines 269–273:

```ts
// DELETE these lines:
createInvoice: builder.mutation<Invoice, Partial<Invoice>>({
  query: (body) => ({ url: '/invoices', method: 'POST', data: body }),
  transformResponse: normalizeSingle<Invoice>,
  invalidatesTags: ['Invoice'],
}),
```

- [ ] **Step 2: Remove the exported hook**

In the same file at the exports block (~line 415), delete:

```ts
useCreateInvoiceMutation,
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "createInvoice\|error"
```

Expected: no output (no errors referencing `createInvoice`)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/store/api/salesApi.ts
git commit -m "feat: remove unused createInvoice RTK mutation (issue #387)"
```

---

### Task 2: Remove create/edit dialog state from `useInvoicesWorkspace.ts`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`

- [ ] **Step 1: Remove `createDialog` and `editDialog` state declarations**

Delete lines 63–64:

```ts
// DELETE these lines:
const [createDialog, setCreateDialog] = useState(false)
const [editDialog, setEditDialog] = useState(false)
```

- [ ] **Step 2: Simplify `onEnter` in the `useEntityWorkspace` config**

The current `onEnter` opens `editDialog`. Replace it to be a no-op:

```ts
// BEFORE:
onEnter: () => {
  if (selectedInvoice) {
    setEditDialog(true)
  }
},

// AFTER:
onEnter: () => {},
```

- [ ] **Step 3: Simplify `onEscape` in the `useEntityWorkspace` config**

Remove the dialog-clearing calls from `onEscape`:

```ts
// BEFORE:
onEscape: () => {
  workspaceRef.current?.setFocusedIndex(-1)
  dispatch(setSelectedInvoice(null))
  setCreateDialog(false)
  setEditDialog(false)
},

// AFTER:
onEscape: () => {
  workspaceRef.current?.setFocusedIndex(-1)
  dispatch(setSelectedInvoice(null))
},
```

- [ ] **Step 4: Remove `handleDeleteAction` function**

Delete lines 247–251:

```ts
// DELETE these lines:
const handleDeleteAction = () => {
  if (selectedInvoice) {
    showError('Delete functionality will be implemented later')
  }
}
```

Also remove the `showError` import if it's now unused. Check:

```bash
grep -n "showError" frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts
```

If no other uses remain, remove this from the destructure at line 62:

```ts
// BEFORE:
const { showError } = useNotification()

// AFTER: (delete the entire line if showError is the only thing destructured,
//         or remove just showError from the destructure)
```

- [ ] **Step 5: Remove dead entries from the return object**

In the `return { ... }` block at the bottom of the hook, delete:

```ts
// DELETE these lines:
createDialog,
setCreateDialog,
editDialog,
setEditDialog,
handleEditAction: () => {
  if (selectedInvoice) {
    setEditDialog(true)
  }
},
handleDeleteAction,
handleAddInvoice: () => {
  setCreateDialog(true)
},
```

- [ ] **Step 6: Verify TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error"
```

Expected: errors only for the props we haven't cleaned yet in `InvoicesPage` and `InvoicesDialogs` (those come next). No errors inside `useInvoicesWorkspace.ts` itself.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts
git commit -m "feat: remove manual invoice create/edit/delete stubs from workspace hook (issue #387)"
```

---

### Task 3: Remove create/edit dialogs from `InvoicesDialogs.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/components/InvoicesDialogs.tsx`

- [ ] **Step 1: Remove props from the interface**

```ts
// BEFORE:
interface InvoicesDialogsProps {
  createDialog: boolean
  editDialog: boolean
  deletedInvoicesDialogOpen: boolean
  printDialogOpen: boolean
  selectedInvoice: InvoiceListItem | null
  onCloseCreateDialog: () => void
  onCloseEditDialog: () => void
  onCloseDeletedInvoicesDialog: () => void
  onClosePrintDialog: () => void
}

// AFTER:
interface InvoicesDialogsProps {
  deletedInvoicesDialogOpen: boolean
  printDialogOpen: boolean
  selectedInvoice: InvoiceListItem | null
  onCloseDeletedInvoicesDialog: () => void
  onClosePrintDialog: () => void
}
```

- [ ] **Step 2: Remove props from the component signature**

```ts
// BEFORE:
const InvoicesDialogs: React.FC<InvoicesDialogsProps> = ({
  createDialog,
  editDialog,
  deletedInvoicesDialogOpen,
  printDialogOpen,
  selectedInvoice,
  onCloseCreateDialog,
  onCloseEditDialog,
  onCloseDeletedInvoicesDialog,
  onClosePrintDialog,
}) => {

// AFTER:
const InvoicesDialogs: React.FC<InvoicesDialogsProps> = ({
  deletedInvoicesDialogOpen,
  printDialogOpen,
  selectedInvoice,
  onCloseDeletedInvoicesDialog,
  onClosePrintDialog,
}) => {
```

- [ ] **Step 3: Remove the two placeholder Dialog blocks from JSX**

Delete the entire "Create New Invoice" dialog block (lines 35–44) and the "Edit Invoice" dialog block (lines 47–56), including their comments. The component body should now contain only:

```tsx
return (
  <>
    <DeletedInvoicesDialog open={deletedInvoicesDialogOpen} onClose={onCloseDeletedInvoicesDialog} />

    {selectedInvoice && (
      <InvoicePrint open={printDialogOpen} onClose={onClosePrintDialog} invoice={selectedInvoice as any} />
    )}
  </>
)
```

- [ ] **Step 4: Remove unused MUI imports**

The `Button`, `Dialog`, `DialogActions`, `DialogContent`, `DialogTitle`, `Typography` imports from MUI are no longer needed. Update line 2:

```ts
// BEFORE:
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

// AFTER: (delete the entire MUI import line — nothing from @mui/material is used)
```

- [ ] **Step 5: Verify TypeScript**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error"
```

Expected: errors only in `InvoicesPage.tsx` (still passing removed props). No errors in `InvoicesDialogs.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/components/InvoicesDialogs.tsx
git commit -m "feat: remove placeholder create/edit invoice dialogs (issue #387)"
```

---

### Task 4: Clean up `InvoicesPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`

- [ ] **Step 1: Remove `primaryAction` from `<GenericListPage>`**

Delete line 137:

```tsx
// DELETE this line:
primaryAction={{ label: 'New Invoice', onClick: workspace.handleAddInvoice }}
```

- [ ] **Step 2: Remove create/edit dialog props from `<InvoicesDialogs>`**

```tsx
// BEFORE:
<InvoicesDialogs
  createDialog={workspace.createDialog}
  editDialog={workspace.editDialog}
  deletedInvoicesDialogOpen={workspace.deletedInvoicesDialogOpen}
  printDialogOpen={workspace.printDialogOpen}
  selectedInvoice={selectedInvoice}
  onCloseCreateDialog={() => workspace.setCreateDialog(false)}
  onCloseEditDialog={() => workspace.setEditDialog(false)}
  onCloseDeletedInvoicesDialog={() => workspace.setDeletedInvoicesDialogOpen(false)}
  onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
/>

// AFTER:
<InvoicesDialogs
  deletedInvoicesDialogOpen={workspace.deletedInvoicesDialogOpen}
  printDialogOpen={workspace.printDialogOpen}
  selectedInvoice={selectedInvoice}
  onCloseDeletedInvoicesDialog={() => workspace.setDeletedInvoicesDialogOpen(false)}
  onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
/>
```

- [ ] **Step 3: Verify zero TypeScript errors**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/InvoicesPage.tsx
git commit -m "feat: remove New Invoice button from InvoicesPage (issue #387)"
```

---

### Task 5: Remove `@Post()` createInvoice endpoint from backend

**Files:**
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts:25,41-56`

- [ ] **Step 1: Remove the import of `CreateInvoiceDto` from the controller**

In the imports block at the top of the controller (line 25), remove `CreateInvoiceDto` from the destructure:

```ts
// BEFORE:
import {
  CreateInvoiceDto,
  UpdateInvoiceDto,
  ...
} from '../dto/invoice.dto';

// AFTER:
import {
  UpdateInvoiceDto,
  ...
} from '../dto/invoice.dto';
```

- [ ] **Step 2: Remove the `@Post()` endpoint**

Delete lines 41–56 entirely:

```ts
// DELETE this entire block:
@Post()
@ApiOperation({ summary: 'Create a new invoice' })
@ApiResponse({
  status: 201,
  description: 'Invoice created successfully',
  type: InvoiceResponseDto,
})
@ApiResponse({ status: 400, description: 'Invalid input data' })
@ApiResponse({ status: 404, description: 'Customer or sales order not found' })
async createInvoice(
  @Body() createInvoiceDto: CreateInvoiceDto,
  @CurrentUser('userId') currentUserId: string,
  @CurrentUser('username') currentUsername: string,
): Promise<InvoiceResponseDto> {
  return this.invoiceService.create(createInvoiceDto, currentUserId, currentUsername);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -i "error"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/sales/controllers/invoice.controller.ts
git commit -m "feat: remove POST /invoices endpoint — invoices auto-created from sales orders (issue #387)"
```

---

### Task 6: Run tests and create PR

- [ ] **Step 1: Run frontend type-check (final)**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "error"
```

Expected: no output.

- [ ] **Step 2: Run relevant frontend tests**

```bash
cd frontend && npx vitest run src/pages/sales 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 3: Run backend tests**

```bash
cd backend && npx jest src/modules/sales --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Create PR**

```bash
gh pr create \
  --title "Remove manual invoice creation (issue #387)" \
  --body "$(cat <<'EOF'
## Summary

- Removes the \"New Invoice\" button from the Invoices page
- Removes unimplemented create/edit dialog stubs and delete action stub
- Removes `POST /invoices` backend endpoint (invoices are auto-created by `SalesOrderService`)
- Removes unused `createInvoice` RTK mutation from `salesApi.ts`

`CreateInvoiceDto` is retained — still used by `InvoiceService.duplicateInvoice`.

## Test plan

- [ ] Invoices page loads without "New Invoice" button
- [ ] Print, View Deleted, payment navigation, and journal entry navigation still work
- [ ] `npm run type-check` passes in frontend
- [ ] Backend tests pass
- [ ] `POST /invoices` no longer appears in Swagger docs after rebuild

Closes #387
EOF
)"
```
