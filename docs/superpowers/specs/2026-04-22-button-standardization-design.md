# Button Standardization Design
**Issue:** #407  
**Date:** 2026-04-22  
**Scope:** Accounting, Sales, Purchasing, Inventory modules + shared common components

## Problem

Across the four target modules, raw MUI `Button` is used alongside the custom `AppButton` wrapper. This creates visual inconsistency and bypasses AppButton's semantic API (which maps intent → style rather than color → style).

## Goal

Replace all raw MUI `Button` usage in the four target modules with `AppButton`, ensuring AppButton's API is complete enough to cover every case without escape hatches.

---

## Part 1: AppButton Extensions

Two new variants added to `AppButtonVariant` in `frontend/src/components/common/AppButton.tsx`:

| New variant | MUI mapping | Use case |
|---|---|---|
| `'text'` | `variant="text"`, `color="inherit"` | Inline link-style buttons (e.g. AccountingEntryLink) |
| `'info'` | `variant="contained"`, `color="info"` | Info-severity confirm buttons (e.g. ConfirmationDialog) |

Updated type:
```ts
type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger' | 'warning' | 'success' | 'text' | 'info'
```

Switch cases to add in the `variant` switch block:
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

---

## Part 2: Prop Mapping Rules

Applied consistently across all 37 migrated files:

| Raw MUI `Button` props | `AppButton` equivalent |
|---|---|
| `variant="contained"` (primary action) | `variant="primary"` |
| `variant="outlined"` (cancel/secondary) | `variant="secondary"` |
| `variant="text"` | `variant="text"` |
| `variant="contained" color="error"` | `variant="danger"` |
| `variant="contained" color="warning"` | `variant="warning"` |
| `variant="contained" color="info"` | `variant="info"` |
| no variant (MUI default = outlined) | `variant="secondary"` |
| `size="small"` on filter/report actions | `size="filter"` |
| `size="small"` on form/dialog buttons | `size="small"` |
| `fullWidth`, `type`, `disabled`, `startIcon`, `onClick`, `sx` | passed through unchanged |

**Filter size rule:** Report pages use `size="filter"` (not `size="small"`) on filter action buttons to maintain the 40px height the filter bar system expects.

---

## Part 3: ConfirmationDialog Simplification

The current dynamic color + sx override:
```tsx
<Button
  onClick={onConfirm}
  variant="contained"
  color={severity === 'error' ? 'error' : 'warning'}
  disabled={loading}
  sx={{ bgcolor: getSeverityColor(), '&:hover': { ... } }}
>
```

Becomes:
```tsx
<AppButton
  variant={severity === 'error' ? 'danger' : severity}
  onClick={onConfirm}
  disabled={loading}
  loading={loading}
>
```

The `getSeverityColor()` helper and the `useTheme` import are removed as they are no longer needed. The `loading` prop on AppButton replaces the manual `'Processing...'` text swap.

---

## Part 4: Import Change Pattern

In every migrated file:

1. Remove `Button` from the MUI barrel import:
   ```ts
   // before
   import { Dialog, Button, Typography } from '@mui/material'
   // after
   import { Dialog, Typography } from '@mui/material'
   ```
   If `Button` was the only MUI import, remove the entire MUI import line.

2. Add AppButton import:
   ```ts
   import { AppButton } from '@/components/common/AppButton'
   ```

3. Replace all `<Button ...>` / `</Button>` with `<AppButton ...>` / `</AppButton>`.

---

## Part 5: Files to Migrate (37 total)

### Common components (3)
- `frontend/src/components/common/ConfirmationDialog.tsx`
- `frontend/src/components/common/NotificationPanel.tsx`
- `frontend/src/components/common/TransactionForm.tsx`

### Accounting components (8)
- `frontend/src/components/accounting/AccountingEntryLink.tsx`
- `frontend/src/components/accounting/AccountMappingDialog.tsx`
- `frontend/src/components/accounting/AccountMappingWarning.tsx`
- `frontend/src/components/accounting/BankReconciliationFormDialog.tsx`
- `frontend/src/components/accounting/ChartOfAccountFormDialog.tsx`
- `frontend/src/components/accounting/CreateSettlementDialog.tsx`
- `frontend/src/components/accounting/FiscalPeriodFormDialog.tsx`
- `frontend/src/components/accounting/GeneratePeriodsDialog.tsx`

### Sales pages (12)
- `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- `frontend/src/pages/sales/CustomerFormPage.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/sales/components/OrdersDialogs.tsx`

### Purchasing pages (6)
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/SupplierFormPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`

### Inventory pages (9)
- `frontend/src/pages/inventory/CreateProductPage.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/inventory/components/CategoryDialogs.tsx`

---

## Part 6: Testing & Validation

- **No new unit tests** — pure prop-substitution refactor, no logic changes
- **Type-check** after migration: `cd frontend && npm run type-check` — catches any leftover raw MUI `color`/`variant` props passed to AppButton
- **Lint**: `cd frontend && npm run lint`
- **Manual smoke test**: Verify Cancel/Submit buttons in at least one dialog per module, and one report filter bar

---

## Out of Scope

- Other modules: Auth, Settings, Users, Dashboard, PriceLists, AuditLogs, Backup
- Backend changes
- AppButton sort/loading behavior changes
- Any refactoring beyond the button replacement
