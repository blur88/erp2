# Button Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all raw MUI `Button` usage in the Accounting, Sales, Purchasing, and Inventory modules with the custom `AppButton` wrapper for consistent UI semantics.

**Architecture:** First extend `AppButton` with two missing variants (`text`, `info`), then migrate 37 files using a consistent prop-mapping rule. No logic changes — pure substitution. Validated by TypeScript type-check after migration.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest (frontend tests)

---

## Prop Mapping Reference

Use this table throughout every migration task:

| Raw MUI `Button` props | `AppButton` equivalent |
|---|---|
| `variant="contained"` (primary action) | `variant="primary"` |
| `variant="outlined"` | `variant="secondary"` |
| `variant="text"` | `variant="text"` |
| `variant="contained" color="error"` | `variant="danger"` |
| `variant="contained" color="warning"` | `variant="warning"` |
| `variant="contained" color="info"` | `variant="info"` |
| no variant (MUI default = outlined) | `variant="secondary"` |
| `size="small"` on export/filter bar buttons | `size="filter"` |
| `size="small"` on form/dialog buttons | `size="small"` |
| `fullWidth`, `type`, `disabled`, `startIcon`, `onClick`, `sx` | pass through unchanged |

**Export button rule:** In report pages, buttons like "Excel" / "PDF" with `size="small"` and `startIcon` are export/filter-bar buttons → use `size="filter"`.

**Import change pattern** (every file):
```tsx
// Remove Button from MUI import:
import { Dialog, Button, Typography } from '@mui/material'
// becomes:
import { Dialog, Typography } from '@mui/material'

// Add AppButton import:
import { AppButton } from '@/components/common/AppButton'

// Replace JSX tags:
// <Button ...> → <AppButton ...>
// </Button>   → </AppButton>
```

---

## Task 1: Extend AppButton with `text` and `info` variants

**Files:**
- Modify: `frontend/src/components/common/AppButton.tsx`

- [ ] **Step 1: Update the variant type**

In `frontend/src/components/common/AppButton.tsx`, line 8, change:
```ts
type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger' | 'warning' | 'success'
```
to:
```ts
type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger' | 'warning' | 'success' | 'text' | 'info'
```

- [ ] **Step 2: Add switch cases for the new variants**

In the `switch (variant)` block (around line 52), after the `case 'success':` block and before the `default:` case, add:
```ts
case 'text':
  muiVariant = 'text'
  muiColor = 'inherit'
  break
case 'info':
  muiVariant = 'contained'
  muiColor = 'info'
  break
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors related to AppButton.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/AppButton.tsx
git commit -m "feat(ui): add text and info variants to AppButton (issue #407)"
```

---

## Task 2: Migrate ConfirmationDialog

**Files:**
- Modify: `frontend/src/components/common/ConfirmationDialog.tsx`

- [ ] **Step 1: Update imports**

Replace lines 1–14:
```tsx
import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
} from '@mui/material'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import { default as ErrorIcon } from '@mui/icons-material/Error'
import { default as InfoIcon } from '@mui/icons-material/Info'
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Remove getSeverityColor and useTheme**

Remove the `const theme = useTheme()` line (line 39) and the entire `getSeverityColor` function (lines 52–61):
```tsx
// Delete these lines entirely:
const theme = useTheme()

const getSeverityColor = () => {
  switch (severity) {
    case 'error':
      return theme.palette.error.main
    case 'info':
      return theme.palette.info.main
    default:
      return theme.palette.warning.main
  }
}
```

- [ ] **Step 3: Replace the two Button usages in DialogActions (lines 99–120)**

Replace:
```tsx
<DialogActions sx={{ p: 3, pt: 1 }}>
  <Button
    onClick={onCancel}
    variant="outlined"
    disabled={loading}
  >
    {cancelText}
  </Button>
  <Button
    onClick={onConfirm}
    variant="contained"
    color={severity === 'error' ? 'error' : 'warning'}
    disabled={loading}
    sx={{
      bgcolor: getSeverityColor(),
      '&:hover': {
        bgcolor: getSeverityColor(),
        filter: 'brightness(0.9)'
      }
    }}
  >
    {loading ? 'Processing...' : confirmText}
  </Button>
</DialogActions>
```
With:
```tsx
<DialogActions sx={{ p: 3, pt: 1 }}>
  <AppButton
    variant="secondary"
    onClick={onCancel}
    disabled={loading}
  >
    {cancelText}
  </AppButton>
  <AppButton
    variant={severity === 'error' ? 'danger' : severity}
    onClick={onConfirm}
    disabled={loading}
    loading={loading}
  >
    {confirmText}
  </AppButton>
</DialogActions>
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/common/ConfirmationDialog.tsx
git commit -m "feat(ui): migrate ConfirmationDialog to AppButton (issue #407)"
```

---

## Task 3: Migrate NotificationPanel and TransactionForm

**Files:**
- Modify: `frontend/src/components/common/NotificationPanel.tsx`
- Modify: `frontend/src/components/common/TransactionForm.tsx`

### NotificationPanel.tsx

- [ ] **Step 1: Update imports**

Remove `Button` from the MUI import (line 13) and add AppButton import after the last import:
```tsx
// Remove Button from this block:
import {
  ...,
  Button,  // ← remove this line
  ...
} from '@mui/material'

// Add after existing imports:
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 2: Replace "Mark all read" button (around line 169)**

Replace:
```tsx
<Button
  size="small"
  startIcon={<MarkReadIcon />}
  onClick={handleMarkAllAsRead}
  sx={{ fontSize: '0.75rem' }}
>
  Mark all read
</Button>
```
With:
```tsx
<AppButton
  size="small"
  startIcon={<MarkReadIcon />}
  onClick={handleMarkAllAsRead}
  sx={{ fontSize: '0.75rem' }}
>
  Mark all read
</AppButton>
```

- [ ] **Step 3: Replace "View All Notifications" button (around line 310)**

Replace:
```tsx
<Button
  size="small"
  onClick={onClose}
  fullWidth
  sx={{ fontSize: '0.875rem' }}
>
  View All Notifications
</Button>
```
With:
```tsx
<AppButton
  size="small"
  onClick={onClose}
  fullWidth
  sx={{ fontSize: '0.875rem' }}
>
  View All Notifications
</AppButton>
```

### TransactionForm.tsx

- [ ] **Step 4: Update imports in TransactionForm.tsx**

Remove `Button` from MUI import and add:
```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 5: Replace "Add Line Item" button (around line 230)**

Replace:
```tsx
<Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddLineItem}>
  Add Line Item
</Button>
```
With:
```tsx
<AppButton variant="secondary" startIcon={<AddIcon />} onClick={handleAddLineItem}>
  Add Line Item
</AppButton>
```

- [ ] **Step 6: Replace Cancel and Submit buttons (around lines 295–300)**

Replace:
```tsx
<Button variant="outlined" onClick={onCancel}>
  Cancel
</Button>
<Button type="submit" variant="contained" disabled={isSubmitting}>
  {children}
</Button>
```
With:
```tsx
<AppButton variant="secondary" onClick={onCancel}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" disabled={isSubmitting}>
  {children}
</AppButton>
```

- [ ] **Step 7: Type-check and commit**

```bash
cd frontend && npm run type-check
git add frontend/src/components/common/NotificationPanel.tsx frontend/src/components/common/TransactionForm.tsx
git commit -m "feat(ui): migrate NotificationPanel and TransactionForm to AppButton (issue #407)"
```

---

## Task 4: Migrate Accounting Components

**Files:**
- Modify: `frontend/src/components/accounting/AccountingEntryLink.tsx`
- Modify: `frontend/src/components/accounting/AccountMappingDialog.tsx`
- Modify: `frontend/src/components/accounting/AccountMappingWarning.tsx`
- Modify: `frontend/src/components/accounting/BankReconciliationFormDialog.tsx`
- Modify: `frontend/src/components/accounting/ChartOfAccountFormDialog.tsx`
- Modify: `frontend/src/components/accounting/CreateSettlementDialog.tsx`
- Modify: `frontend/src/components/accounting/FiscalPeriodFormDialog.tsx`
- Modify: `frontend/src/components/accounting/GeneratePeriodsDialog.tsx`

In each file: remove `Button` from its MUI import and add `import { AppButton } from '@/components/common/AppButton'`.

### AccountingEntryLink.tsx

- [ ] **Step 1: Update imports and replace buttons**

Remove `Button` from MUI import. Add AppButton import.

Replace the `variant="text"` button (around line 43):
```tsx
// Before:
<Button variant="text" size="small" sx={{ ml: 2 }} onClick={handleClick}>
  {label}
</Button>
// After:
<AppButton variant="text" size="small" sx={{ ml: 2 }} onClick={handleClick}>
  {label}
</AppButton>
```

Replace the default `variant="outlined"` button (around line 115):
```tsx
// Before:
<Button
  variant="outlined"
  size="small"
  onClick={handleClick}
  {...rest}
>
  {label}
</Button>
// After:
<AppButton
  variant="secondary"
  size="small"
  onClick={handleClick}
  {...rest}
>
  {label}
</AppButton>
```

### AccountMappingDialog.tsx

- [ ] **Step 2: Update imports and replace buttons (around lines 247–256)**

```tsx
// Before:
<Button onClick={onClose} disabled={submitting}>
  Cancel
</Button>
<Button
  onClick={handleSubmit}
  variant="contained"
  disabled={submitting}
>
  Save Mappings
</Button>
// After:
<AppButton variant="secondary" onClick={onClose} disabled={submitting}>
  Cancel
</AppButton>
<AppButton variant="primary" onClick={handleSubmit} disabled={submitting}>
  Save Mappings
</AppButton>
```

### AccountMappingWarning.tsx

- [ ] **Step 3: Update imports and replace button (around lines 61–68)**

```tsx
// Before:
import { Alert, AlertTitle, Typography, Button } from '@mui/material'
// After:
import { Alert, AlertTitle, Typography } from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
```

```tsx
// Before:
<Button
  variant="contained"
  size="small"
  onClick={onSetupMappings}
>
  Set Up Mappings
</Button>
// After:
<AppButton variant="primary" size="small" onClick={onSetupMappings}>
  Set Up Mappings
</AppButton>
```

### BankReconciliationFormDialog.tsx

- [ ] **Step 4: Update imports and replace buttons (around lines 225–230)**

```tsx
// Before:
<Button onClick={handleClose} color="inherit" disabled={submitting}>
  Cancel
</Button>
<Button onClick={handleSubmit} variant="contained" disabled={submitting}>
  Save
</Button>
// After:
<AppButton variant="secondary" onClick={handleClose} disabled={submitting}>
  Cancel
</AppButton>
<AppButton variant="primary" onClick={handleSubmit} disabled={submitting}>
  Save
</AppButton>
```

### ChartOfAccountFormDialog.tsx

- [ ] **Step 5: Update imports and replace buttons (around lines 355–364)**

```tsx
// Before:
<Button onClick={onClose} disabled={submitting}>
  Cancel
</Button>
<Button
  type="submit"
  variant="contained"
  disabled={submitting}
>
  {isEditing ? 'Update' : 'Create'}
</Button>
// After:
<AppButton variant="secondary" onClick={onClose} disabled={submitting}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" disabled={submitting}>
  {isEditing ? 'Update' : 'Create'}
</AppButton>
```

### CreateSettlementDialog.tsx

- [ ] **Step 6: Update imports and replace buttons (around lines 195–202)**

```tsx
// Before:
<Button onClick={onClose}>Cancel</Button>
<Button
  variant="contained"
  onClick={handleSubmit}
  disabled={submitting || selectedPayments.length === 0}
>
  Create Settlement
</Button>
// After:
<AppButton variant="secondary" onClick={onClose}>Cancel</AppButton>
<AppButton
  variant="primary"
  onClick={handleSubmit}
  disabled={submitting || selectedPayments.length === 0}
>
  Create Settlement
</AppButton>
```

### FiscalPeriodFormDialog.tsx

- [ ] **Step 7: Update imports and replace buttons (around lines 215–224)**

```tsx
// Before:
<Button onClick={handleClose} color="inherit" disabled={submitting}>
  Cancel
</Button>
<Button
  type="submit"
  variant="contained"
  disabled={submitting}
>
  {isEditing ? 'Update Period' : 'Create Period'}
</Button>
// After:
<AppButton variant="secondary" onClick={handleClose} disabled={submitting}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" disabled={submitting}>
  {isEditing ? 'Update Period' : 'Create Period'}
</AppButton>
```

### GeneratePeriodsDialog.tsx

- [ ] **Step 8: Update imports and replace buttons (around lines 133–142)**

```tsx
// Before:
<Button onClick={handleClose} color="inherit">
  Cancel
</Button>
<Button
  type="submit"
  variant="contained"
  disabled={submitting}
>
  Generate Periods
</Button>
// After:
<AppButton variant="secondary" onClick={handleClose}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" disabled={submitting}>
  Generate Periods
</AppButton>
```

- [ ] **Step 9: Type-check and commit**

```bash
cd frontend && npm run type-check
git add frontend/src/components/accounting/
git commit -m "feat(ui): migrate accounting components to AppButton (issue #407)"
```

---

## Task 5: Migrate Inventory Pages

**Files:**
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`
- Modify: `frontend/src/pages/inventory/components/CategoryDialogs.tsx`

In each file: remove `Button` from MUI import, add `import { AppButton } from '@/components/common/AppButton'`.

### CreateProductPage.tsx

- [ ] **Step 1: Replace form action buttons (lines 200–208)**

```tsx
// Before:
<Button variant="outlined" fullWidth onClick={onCancel} disabled={loading}>
  Cancel
</Button>
<Button type="submit" variant="contained" fullWidth disabled={disabled}>
  {isEditing ? 'Update Product' : 'Create Product'}
</Button>
// After:
<AppButton variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" fullWidth disabled={disabled}>
  {isEditing ? 'Update Product' : 'Create Product'}
</AppButton>
```

### CategoryDialogs.tsx

- [ ] **Step 2: Replace dialog buttons (around lines 162–167)**

```tsx
// Before:
<Button onClick={onDialogClose} disabled={submitting}>
  Cancel
</Button>
<Button type="submit" variant="contained" disabled={submitting}>
  {dialogMode === 'create' ? 'Create' : 'Update'}
</Button>
// After:
<AppButton variant="secondary" onClick={onDialogClose} disabled={submitting}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" disabled={submitting}>
  {dialogMode === 'create' ? 'Create' : 'Update'}
</AppButton>
```

### Report Pages (HistoricalInventoryReport, InventorySummaryReport, MovementSummaryReport, PriceListReport, ProductCostReport)

Each of these 5 report pages follows an identical pattern with three sets of buttons:

1. **Export buttons** (Excel + PDF, `size="small"` with `startIcon`) → `size="filter"`
2. **Column selector "Apply" button** (typically `variant="contained"`) → `variant="primary"`
3. **Product dialog Cancel/Done buttons** → `variant="secondary"` / `variant="primary"`

- [ ] **Step 3: Migrate HistoricalInventoryReport.tsx**

Export buttons (around line 775):
```tsx
// Before:
<Button size="small" startIcon={<ExcelIcon />} onClick={handleExportExcel}>Excel</Button>
<Button size="small" startIcon={<PdfIcon />} onClick={handleExportPDF}>PDF</Button>
// After:
<AppButton size="filter" startIcon={<ExcelIcon />} onClick={handleExportExcel}>Excel</AppButton>
<AppButton size="filter" startIcon={<PdfIcon />} onClick={handleExportPDF}>PDF</AppButton>
```

Column selector Apply button (around line 1023):
```tsx
// Before:
<Button variant="contained" onClick={handleApplyColumns}>Apply</Button>
// After:
<AppButton variant="primary" onClick={handleApplyColumns}>Apply</AppButton>
```

Product dialog buttons (around line 1263):
```tsx
// Before:
<Button onClick={handleProductDialogClose}>Cancel</Button>
<Button onClick={handleProductDialogConfirm} variant="contained">Done</Button>
// After:
<AppButton variant="secondary" onClick={handleProductDialogClose}>Cancel</AppButton>
<AppButton variant="primary" onClick={handleProductDialogConfirm}>Done</AppButton>
```

- [ ] **Step 4: Migrate InventorySummaryReport.tsx** (buttons at ~941, ~1201, ~1441)

Export buttons (`size="small"` with startIcon, ~941): `size="filter"`, no explicit variant → omit variant.
Apply button (`variant="contained"`, ~1201): `variant="primary"`.
Product dialog Cancel (~1441): `variant="secondary"`. Done: `variant="primary"`.

- [ ] **Step 5: Migrate MovementSummaryReport.tsx** (buttons at ~762, ~1015, ~1255)

Export buttons (`size="small"` with startIcon, ~762): `size="filter"`, no explicit variant → omit variant.
Apply button (`variant="contained"`, ~1015): `variant="primary"`.
Product dialog Cancel (~1255): `variant="secondary"`. Done: `variant="primary"`.

- [ ] **Step 6: Migrate PriceListReport.tsx** (buttons at ~802, ~968, ~1208)

Export buttons (`size="small"` with startIcon, ~802): `size="filter"`, no explicit variant → omit variant.
Apply button (`variant="contained"`, ~968): `variant="primary"`.
Product dialog Cancel (~1208): `variant="secondary"`. Done: `variant="primary"`.

- [ ] **Step 7: Migrate ProductCostReport.tsx** (buttons at ~787, ~1019, ~1259)

Export buttons (`size="small"` with startIcon, ~787): `size="filter"`, no explicit variant → omit variant.
Apply button (`variant="contained"`, ~1019): `variant="primary"`.
Product dialog Cancel (~1259): `variant="secondary"`. Done: `variant="primary"`.

- [ ] **Step 8: Type-check and commit**

```bash
cd frontend && npm run type-check
git add frontend/src/pages/inventory/
git commit -m "feat(ui): migrate inventory pages to AppButton (issue #407)"
```

---

## Task 6: Migrate Purchasing Pages

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/SupplierFormPage.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

In each file: remove `Button` from MUI import, add `import { AppButton } from '@/components/common/AppButton'`.

### CreatePurchaseOrderPage.tsx

- [ ] **Step 1: Replace "Add Item" button (around line 469)**

```tsx
// Before:
<Button startIcon={<AddIcon />} onClick={addItem} variant="outlined">
  Add Item
</Button>
// After:
<AppButton variant="secondary" startIcon={<AddIcon />} onClick={addItem}>
  Add Item
</AppButton>
```

- [ ] **Step 2: Replace form action buttons (around lines 908–926)**

```tsx
// Before:
<Button variant="outlined" fullWidth onClick={() => navigate('/purchasing/orders')} disabled={loading}>
  Cancel
</Button>
<Button type="submit" variant="contained" fullWidth disabled={loading}>
  {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Order' : 'Create Order')}
</Button>
// After:
<AppButton variant="secondary" fullWidth onClick={() => navigate('/purchasing/orders')} disabled={loading}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" fullWidth disabled={loading}>
  {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Order' : 'Create Order')}
</AppButton>
```

### SupplierFormPage.tsx

- [ ] **Step 3: Replace form action buttons (around lines 333–351)**

```tsx
// Before:
<Button variant="outlined" fullWidth onClick={() => navigate('/purchasing/suppliers')} disabled={isSaving}>
  Cancel
</Button>
<Button type="submit" variant="contained" fullWidth disabled={isSaving || isCheckingDuplicate || hasCompanyNameDuplicate}>
  {isSaving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Supplier' : 'Create Supplier')}
</Button>
// After:
<AppButton variant="secondary" fullWidth onClick={() => navigate('/purchasing/suppliers')} disabled={isSaving}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" fullWidth disabled={isSaving || isCheckingDuplicate || hasCompanyNameDuplicate}>
  {isSaving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Supplier' : 'Create Supplier')}
</AppButton>
```

### Report Pages (PurchaseOrderDetailsReport, PurchaseOrderStatusReport, PurchaseOrderSummary, VendorPaymentDetailsReport, VendorProductListReport)

Each follows the same report pattern: export buttons → `size="filter"`, Apply button → `variant="primary"`, dialog Cancel/Done → `variant="secondary"` / `variant="primary"`.

- [ ] **Step 4: Migrate PurchaseOrderDetailsReport.tsx** (buttons at ~1016, ~1320, ~1560)

Export buttons (`size="small"` with startIcon): `size="filter"`, no explicit variant → omit variant (default secondary).
Apply button (`variant="contained"`): `variant="primary"`.
Product dialog Cancel: `variant="secondary"`, Done: `variant="primary"`.

- [ ] **Step 5: Migrate PurchaseOrderStatusReport.tsx** (buttons at ~941, ~1257, ~1497 — same pattern)

- [ ] **Step 6: Migrate PurchaseOrderSummary.tsx** (export buttons only at ~819)

Export buttons: `size="filter"`, no explicit variant → omit variant.

- [ ] **Step 7: Migrate VendorPaymentDetailsReport.tsx** (buttons at ~677 — export only)

Export buttons: `size="filter"`.

- [ ] **Step 8: Migrate VendorProductListReport.tsx** (buttons at ~906, ~1087, ~1327)

Export buttons: `size="filter"`.
Apply button: `variant="primary"`.
Product dialog Cancel/Done: `variant="secondary"` / `variant="primary"`.

- [ ] **Step 9: Type-check and commit**

```bash
cd frontend && npm run type-check
git add frontend/src/pages/purchasing/
git commit -m "feat(ui): migrate purchasing pages to AppButton (issue #407)"
```

---

## Task 7: Migrate Sales Pages

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerFormPage.tsx`
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`
- Modify: `frontend/src/pages/sales/components/OrdersDialogs.tsx`

In each file: remove `Button` from MUI import, add `import { AppButton } from '@/components/common/AppButton'`.

### CreateSalesOrderPage.tsx

- [ ] **Step 1: Replace "Add Item" button (around line 548)**

```tsx
// Before:
<Button startIcon={<AddIcon />} onClick={addItem} variant="outlined">
  Add Item
</Button>
// After:
<AppButton variant="secondary" startIcon={<AddIcon />} onClick={addItem}>
  Add Item
</AppButton>
```

- [ ] **Step 2: Replace form action buttons (around lines 1001–1019)**

```tsx
// Before:
<Button variant="outlined" fullWidth onClick={() => navigate('/sales/orders')} disabled={loading}>
  Cancel
</Button>
<Button type="submit" variant="contained" fullWidth disabled={loading}>
  {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Order' : 'Create Order')}
</Button>
// After:
<AppButton variant="secondary" fullWidth onClick={() => navigate('/sales/orders')} disabled={loading}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" fullWidth disabled={loading}>
  {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Order' : 'Create Order')}
</AppButton>
```

### CustomerFormPage.tsx

- [ ] **Step 3: Replace form action buttons (around lines 342–360)**

```tsx
// Before:
<Button variant="outlined" fullWidth onClick={() => navigate('/sales/customers')} disabled={isSaving}>
  Cancel
</Button>
<Button type="submit" variant="contained" fullWidth disabled={isSaving || hasPhoneDuplicate || isCheckingPhone}>
  {isSaving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Customer' : 'Create Customer')}
</Button>
// After:
<AppButton variant="secondary" fullWidth onClick={() => navigate('/sales/customers')} disabled={isSaving}>
  Cancel
</AppButton>
<AppButton variant="primary" type="submit" fullWidth disabled={isSaving || hasPhoneDuplicate || isCheckingPhone}>
  {isSaving ? (isEdit ? 'Updating...' : 'Creating...') : (isEdit ? 'Update Customer' : 'Create Customer')}
</AppButton>
```

### CustomerOrderHistory.tsx

- [ ] **Step 4: Replace export buttons (around line 1119)**

```tsx
// Before:
<Button size="small" startIcon={<ExcelIcon />} onClick={handleExportExcel}>Excel</Button>
<Button size="small" startIcon={<PdfIcon />} onClick={handleExportPDF}>PDF</Button>
// After:
<AppButton size="filter" startIcon={<ExcelIcon />} onClick={handleExportExcel}>Excel</AppButton>
<AppButton size="filter" startIcon={<PdfIcon />} onClick={handleExportPDF}>PDF</AppButton>
```

- [ ] **Step 5: Replace icon close button (around line 1450)**

```tsx
// Before:
<Button size="small" onClick={handleProductDialogClose} sx={{ minWidth: 'auto', p: 0.5 }}>
  <CloseIcon />
</Button>
// After:
<AppButton size="small" onClick={handleProductDialogClose} sx={{ minWidth: 'auto', p: 0.5 }}>
  <CloseIcon />
</AppButton>
```

- [ ] **Step 6: Replace product dialog Cancel/Done buttons (around line 1690)**

```tsx
// Before:
<Button onClick={handleProductDialogClose}>Cancel</Button>
<Button onClick={handleProductDialogClose} variant="contained">Done</Button>
// After:
<AppButton variant="secondary" onClick={handleProductDialogClose}>Cancel</AppButton>
<AppButton variant="primary" onClick={handleProductDialogClose}>Done</AppButton>
```

### CustomerPaymentByOrder, CustomerPaymentDetails, CustomerPaymentSummary

Each has export buttons + product dialog Cancel/Done. Same pattern.

- [ ] **Step 7: Migrate CustomerPaymentByOrder.tsx** (buttons at ~850, ~857)

Export buttons: `size="filter"`. Product dialog: `variant="secondary"` / `variant="primary"`.

- [ ] **Step 8: Migrate CustomerPaymentDetails.tsx** (buttons at ~758, ~765)

Export buttons: `size="filter"`. Product dialog: `variant="secondary"` / `variant="primary"`.

- [ ] **Step 9: Migrate CustomerPaymentSummary.tsx** (buttons at ~740, ~747)

Export buttons: `size="filter"`. Product dialog: `variant="secondary"` / `variant="primary"`.

### ProductCustomerReport, SalesByProductDetails, SalesByProductSummary

Each has export buttons, Apply button, and product dialog Cancel/Done.

- [ ] **Step 10: Migrate ProductCustomerReport.tsx** (buttons at ~1067, ~1396, ~1636)

Export buttons: `size="filter"`. Apply: `variant="primary"`. Dialog Cancel/Done: `variant="secondary"` / `variant="primary"`.

- [ ] **Step 11: Migrate SalesByProductDetails.tsx** (buttons at ~1089, ~1443, ~1683)

Same mapping as ProductCustomerReport.

- [ ] **Step 12: Migrate SalesByProductSummary.tsx** (buttons at ~1044, ~1445, ~1685)

Same mapping as ProductCustomerReport.

### SalesOrderProfitReport and SalesOrderSummary

Export buttons only.

- [ ] **Step 13: Migrate SalesOrderProfitReport.tsx** (buttons at ~837)

Export buttons: `size="filter"`.

- [ ] **Step 14: Migrate SalesOrderSummary.tsx** (buttons at ~889)

Export buttons: `size="filter"`.

### OrdersDialogs.tsx

- [ ] **Step 15: Replace Close button (line 249)**

```tsx
// Before:
<Button onClick={onCloseViewDialog}>Close</Button>
// After:
<AppButton variant="secondary" onClick={onCloseViewDialog}>Close</AppButton>
```

- [ ] **Step 16: Type-check and commit**

```bash
cd frontend && npm run type-check
git add frontend/src/pages/sales/
git commit -m "feat(ui): migrate sales pages to AppButton (issue #407)"
```

---

## Task 8: Final Validation

- [ ] **Step 1: Full type-check**

```bash
cd frontend && npm run type-check
```
Expected: zero errors.

- [ ] **Step 2: Lint**

```bash
cd frontend && npm run lint
```
Expected: zero errors.

- [ ] **Step 3: Verify no raw MUI Button remains in target modules**

```bash
grep -rn "from '@mui/material'" \
  frontend/src/pages/sales/ \
  frontend/src/pages/purchasing/ \
  frontend/src/pages/inventory/ \
  frontend/src/components/accounting/ \
  frontend/src/components/common/ConfirmationDialog.tsx \
  frontend/src/components/common/NotificationPanel.tsx \
  frontend/src/components/common/TransactionForm.tsx \
  | grep "Button"
```
Expected: no results (only AppButton should remain).

- [ ] **Step 4: Commit final validation**

```bash
git commit --allow-empty -m "chore: verify button standardization complete (issue #407)"
```

---

## Task 9: Open PR

- [ ] **Step 1: Push branch and open PR**

```bash
git push -u origin HEAD
gh pr create \
  --title "feat(ui): standardize buttons to AppButton across 4 modules (issue #407)" \
  --body "$(cat <<'EOF'
## Summary
- Extends `AppButton` with two new semantic variants: `text` and `info`
- Migrates 37 files across Accounting, Sales, Purchasing, and Inventory modules from raw MUI `Button` to `AppButton`
- Simplifies `ConfirmationDialog` confirm button: replaces dynamic color + sx override with `variant` derived from `severity`

## Files Changed
- `frontend/src/components/common/AppButton.tsx` — new `text` and `info` variants
- 37 component/page files — import + JSX substitution only, no logic changes

## Test plan
- [ ] `npm run type-check` passes
- [ ] `npm run lint` passes
- [ ] Manual: Cancel/Submit buttons work in ChartOfAccountFormDialog
- [ ] Manual: ConfirmationDialog shows correct colors for warning, error, info severity
- [ ] Manual: Export (Excel/PDF) buttons work on a report page
- [ ] Manual: Form cancel/submit work on CreateSalesOrderPage

Closes #407
EOF
)"
```
