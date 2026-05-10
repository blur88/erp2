# Design Spec: Systemic XSS Prevention in Reports

## Problem Statement
The application contains a systemic Cross-Site Scripting (XSS) vulnerability across multiple report summary pages. These pages manually construct HTML strings by concatenating dynamic data (such as report titles, customer names, and record values) and then pass these strings to `document.write` in a new window for printing. This pattern allows for arbitrary HTML and JavaScript injection if any of the dynamic values are malicious.

Security Alert #36 specifically flagged `SalesOrderSummary.tsx` and `RegionalSettingsPage.tsx`, but the pattern exists in at least 18 report pages.

## Proposed Changes

### 1. Centralized Security Utility
Create a new utility file `frontend/src/utils/security.ts` containing a robust HTML escaping function.

```typescript
/**
 * Escapes special characters for use in HTML to prevent XSS.
 */
export const escapeHtml = (unsafe: string | number | boolean | null | undefined): string => {
  if (unsafe === null || unsafe === undefined) return '';
  const str = String(unsafe);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### 2. Systemic Application in Report Pages
Update all report pages to use `escapeHtml` for all dynamic data injected into the print HTML template. This includes:
- Report Titles
- Table Headers
- Table Cell Values
- Group Labels
- Date Range Text

### 3. Hardening Input/Error Displays
Update `RegionalSettingsPage.tsx` and other pages flagged by CodeQL to explicitly sanitize or cast network-provided error messages to ensure they are handled as plain text, satisfying the security scanner's requirements.

## Impacted Files
- `frontend/src/utils/security.ts` (New)
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/settings/RegionalSettingsPage.tsx`

## Verification Plan

### Automated Tests
- Create a unit test for `escapeHtml` in `frontend/src/utils/__tests__/security.test.ts`.
- Verify that it correctly escapes `<`, `>`, `&`, `"`, and `'`.

### Manual Verification
- Generate a report with a title containing `<script>alert('xss')</script>`.
- Verify that the title is displayed as literal text in the print preview and no script is executed.
- Repeat for other dynamic fields like customer names if possible.
