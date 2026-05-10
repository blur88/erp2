# Purchasing Module AppButton Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all raw MUI `Button` and `IconButton` usages for command actions in the Purchasing module with `AppButton`, matching the Sales module pattern.

**Architecture:** Pure mechanical refactor — no logic changes, no new components, no new props. Each file is updated independently: remove MUI `Button`/`IconButton` imports, remove `actionIconSx` constants, swap elements to `AppButton` with the correct `variant` and `startIcon`.

**Tech Stack:** React 19, Material-UI v7, `AppButton` at `@/components/common/AppButton`

---

## Files Modified

| File | Change |
|------|--------|
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Retry button in error Alert |
| `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx` | Edit + Delete icon buttons in header bar |
| `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` | Edit + Delete + Print icon buttons; Pay/Unpay/Return/Receive workflow buttons |
| `frontend/src/pages/purchasing/components/GRNContextHeader.tsx` | Print icon button in header bar |
| `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx` | Print icon button in header bar |

---

### Task 1: Refactor PurchasingPage.tsx — Retry button

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

- [ ] **Step 1: Replace Button import with AppButton**

In `frontend/src/pages/purchasing/PurchasingPage.tsx`, make these changes:

Remove `Button` from the MUI import block (line 17):
```tsx
// Before
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  Button,
  useTheme,
} from '@mui/material'
```
```tsx
// After
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  useTheme,
} from '@mui/material'
```

Add AppButton import after the `useNavigate` import (after line 41):
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Replace the Retry Button**

Find the Alert action at line 229 and replace:
```tsx
// Before
action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>}
```
```tsx
// After
action={<AppButton size="small" variant="secondary" onClick={() => window.location.reload()}>Retry</AppButton>}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "purchasing\|PurchasingPage" | head -20
```
Expected: no errors for this file.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "refactor(purchasing): replace Button with AppButton in PurchasingPage"
```

---

### Task 2: Refactor SupplierContextHeader.tsx — Edit + Delete buttons

**Files:**
- Modify: `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
- Test: `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`

- [ ] **Step 1: Run existing tests to confirm baseline**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```
Expected: all 5 tests pass.

- [ ] **Step 2: Update imports**

Replace the MUI import block at the top of `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`:

```tsx
// Before
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```
```tsx
// After
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

Add AppButton import after the Grid import:
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 3: Remove actionIconSx constant**

Delete the entire `actionIconSx` constant (lines 28–34):
```tsx
// Remove this block entirely:
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 4: Replace the header bar icon buttons**

Find the `<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>` section containing the two IconButtons and replace it:

```tsx
// Before
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
  <IconButton
    size="small"
    title="Edit Supplier"
    onClick={onEdit}
    sx={{ ...actionIconSx, color: 'primary.main' }}
  >
    <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
  <IconButton
    size="small"
    title="Delete Supplier"
    onClick={onDelete}
    sx={{ ...actionIconSx, color: 'error.main' }}
  >
    <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
</Box>
```
```tsx
// After
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<EditIcon />}
    title="Edit Supplier"
    onClick={onEdit}
  >
    Edit
  </AppButton>
  <AppButton
    size="small"
    variant="danger"
    startIcon={<DeleteIcon />}
    title="Delete Supplier"
    onClick={onDelete}
  >
    Delete
  </AppButton>
</Box>
```

- [ ] **Step 5: Run tests to confirm they still pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```
Expected: all 5 tests pass (tests use `getByTitle` which still works with AppButton).

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "SupplierContextHeader" | head -20
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/purchasing/components/SupplierContextHeader.tsx
git commit -m "refactor(purchasing): replace IconButton with AppButton in SupplierContextHeader"
```

---

### Task 3: Refactor PurchaseOrderContextHeader.tsx — all buttons

**Files:**
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`

- [ ] **Step 1: Update imports**

Replace the MUI import block:
```tsx
// Before
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```
```tsx
// After
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

Add AppButton import after the Grid import:
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Remove actionIconSx constant**

Delete the entire `actionIconSx` constant (lines 43–49):
```tsx
// Remove this block entirely:
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace header bar icon buttons (Edit, Delete, Print)**

Find the `<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>` in the header bar and replace:

```tsx
// Before
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
  <IconButton size="small" title="Edit Order" onClick={onEditClick} sx={{ ...actionIconSx, color: 'primary.main' }}>
    <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
  <IconButton size="small" title="Delete Order" onClick={onDeleteClick} sx={{ ...actionIconSx, color: 'error.main' }}>
    <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
  <IconButton size="small" title="Print Purchase Order" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
    <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
</Box>
```
```tsx
// After
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<EditIcon />}
    title="Edit Order"
    onClick={onEditClick}
  >
    Edit
  </AppButton>
  <AppButton
    size="small"
    variant="danger"
    startIcon={<DeleteIcon />}
    title="Delete Order"
    onClick={onDeleteClick}
  >
    Delete
  </AppButton>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<PrintIcon />}
    title="Print Purchase Order"
    onClick={onPrint}
  >
    Print
  </AppButton>
</Box>
```

- [ ] **Step 4: Replace workflow buttons (Pay/Unpay, Return/Receive)**

Find the `<Stack direction="row" ...>` inside the Payment and Receiving table row and replace:

```tsx
// Before
<Stack
  direction="row"
  spacing={1}
  sx={{
    alignItems: "center",
    justifyContent: "center"
  }}>
  <Button
    variant="contained"
    size="small"
    color={hasPayment ? 'warning' : 'primary'}
    onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
    disabled={(hasPayment && isReceived) || isLoading}
    sx={{ minWidth: 110 }}
  >
    {hasPayment ? 'Unpay' : 'Pay'}
  </Button>
  {isReceived ? (
    <Button variant="contained" size="small" color="warning" sx={{ minWidth: 110 }} onClick={onReturn} disabled={!selectedOrder.items || selectedOrder.items.length === 0 || isLoading}>
      Return
    </Button>
  ) : (
    <Button
      variant="contained"
      size="small"
      color="success"
      sx={{ minWidth: 110 }}
      onClick={onReceive}
      disabled={
        !selectedOrder.items ||
        selectedOrder.items.length === 0 ||
        isLoading ||
        !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
      }
    >
      Receive
    </Button>
  )}
</Stack>
```
```tsx
// After
<Stack
  direction="row"
  spacing={1}
  sx={{
    alignItems: 'center',
    justifyContent: 'center',
  }}
>
  <AppButton
    variant={hasPayment ? 'warning' : 'primary'}
    size="small"
    onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
    disabled={(hasPayment && isReceived) || isLoading}
    sx={{ minWidth: 110 }}
  >
    {hasPayment ? 'Unpay' : 'Pay'}
  </AppButton>
  {isReceived ? (
    <AppButton
      variant="warning"
      size="small"
      sx={{ minWidth: 110 }}
      onClick={onReturn}
      disabled={!selectedOrder.items || selectedOrder.items.length === 0 || isLoading}
    >
      Return
    </AppButton>
  ) : (
    <AppButton
      variant="success"
      size="small"
      sx={{ minWidth: 110 }}
      onClick={onReceive}
      disabled={
        !selectedOrder.items ||
        selectedOrder.items.length === 0 ||
        isLoading ||
        !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
      }
    >
      Receive
    </AppButton>
  )}
</Stack>
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "PurchaseOrderContextHeader" | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx
git commit -m "refactor(purchasing): replace Button/IconButton with AppButton in PurchaseOrderContextHeader"
```

---

### Task 4: Refactor GRNContextHeader.tsx — Print button

**Files:**
- Modify: `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`

- [ ] **Step 1: Update imports**

Replace the MUI import block:
```tsx
// Before
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```
```tsx
// After
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

Add AppButton import after the Grid import:
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Remove actionIconSx constant**

Delete the entire `actionIconSx` constant (lines 31–37):
```tsx
// Remove this block entirely:
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace the Print icon button**

Find the header bar Box and replace:
```tsx
// Before
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
  <IconButton size="small" title="Print GRN" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
    <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
</Box>
```
```tsx
// After
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<PrintIcon />}
    title="Print GRN"
    onClick={onPrint}
  >
    Print
  </AppButton>
</Box>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "GRNContextHeader" | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/components/GRNContextHeader.tsx
git commit -m "refactor(purchasing): replace IconButton with AppButton in GRNContextHeader"
```

---

### Task 5: Refactor VendorPaymentContextHeader.tsx — Print button

**Files:**
- Modify: `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`

- [ ] **Step 1: Update imports**

Replace the MUI import block:
```tsx
// Before
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```
```tsx
// After
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

Add AppButton import after the Grid import:
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Remove actionIconSx constant**

Delete the entire `actionIconSx` constant (lines 31–37):
```tsx
// Remove this block entirely:
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace the Print icon button**

Find the header bar Box and replace:
```tsx
// Before
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
  <IconButton size="small" title="Print Payment" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
    <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
  </IconButton>
</Box>
```
```tsx
// After
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<PrintIcon />}
    title="Print Payment"
    onClick={onPrint}
  >
    Print
  </AppButton>
</Box>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "VendorPaymentContextHeader" | head -20
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx
git commit -m "refactor(purchasing): replace IconButton with AppButton in VendorPaymentContextHeader"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run SupplierContextHeader tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx
```
Expected: 5/5 tests pass.

- [ ] **Step 2: Full type-check**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```
Expected: `Found 0 errors.`

- [ ] **Step 3: Grep to confirm no remaining raw Button/IconButton in target files**

```bash
grep -n "IconButton\|<Button" \
  frontend/src/pages/purchasing/PurchasingPage.tsx \
  frontend/src/pages/purchasing/components/SupplierContextHeader.tsx \
  frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx \
  frontend/src/pages/purchasing/components/GRNContextHeader.tsx \
  frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx
```
Expected: no output (zero matches).

- [ ] **Step 4: Close issue via PR**

```bash
gh pr create \
  --title "refactor(purchasing): standardize buttons with AppButton (#368)" \
  --body "$(cat <<'EOF'
## Summary
- Replace `Button`/`IconButton` with `AppButton` across all Purchasing module context headers and overview page
- Covers: `PurchasingPage`, `SupplierContextHeader`, `PurchaseOrderContextHeader`, `GRNContextHeader`, `VendorPaymentContextHeader`
- Follows same pattern as Sales module AppButton standardization (PR #369)

## Test plan
- [ ] `SupplierContextHeader` unit tests pass unchanged
- [ ] Full type-check passes with 0 errors
- [ ] No raw `Button`/`IconButton` remaining in target files

Closes #368
EOF
)"
```
