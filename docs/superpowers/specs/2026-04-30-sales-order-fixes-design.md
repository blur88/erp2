# Design Spec: Sales Order Price and Journal Entry Reference Fixes

## Problem Statement
1.  **Price Overwrite on Edit:** When editing a Sales Order, the unit prices are sometimes overwritten with 0.00. This happens because the frontend `CreateSalesOrderPage` triggers a price re-calculation based on the customer's price list as soon as the customer is loaded, but if the pricing data is incomplete or the product wasn't originally from a price list, it defaults to 0.00.
2.  **Incomplete Journal Entry (JE) References:** Sales Orders, Invoices, and Payments only show one JE reference (usually the most direct one). Users need to see all related JEs (e.g., fulfillment + all payments) from any of these views.

## Proposed Changes

### 1. Backend: Sales Order Data Enrichment
-   **Mapper Update:** Update `mapSalesOrderToResponseDto` in `backend/src/modules/sales/services/sales-order.mapper.ts` to include "direct payments" in the `payments` array.
-   **Query Service Update:** In `SalesOrderQueryService.findById`, ensure `directPayments` are fetched and properly merged into the response DTO. This ensures that any component fetching a Sales Order has the complete list of related payments.

### 2. Frontend: Sales Order Edit Mode Stability
-   **Price Locking:** Modify `CreateSalesOrderPage.tsx` to prevent automatic price updates during the initial data load in edit mode.
-   **Manual Trigger:** Only trigger `getProductPrice` re-calculation when the `customerId` is changed via user interaction (e.g., selecting a new customer in the Autocomplete), not when it's set programmatically during form reset.

### 3. Frontend: Unified JE Reference Hooks
-   **Sales Order View:** Already uses `useJournalEntryRefs` which takes an array of sources. Since step 1 will provide all payments, this will naturally show all payment JEs plus the fulfillment JE.
-   **Invoice View:** Update `useInvoicesWorkspace.ts` to include the parent Sales Order's fulfillment JE in its `jeSources`.
-   **Payment View:** Update `usePaymentsWorkspace.ts` to include the related Sales Order's fulfillment JE if the payment is linked to one.

## Technical Details

### Backend Changes
-   **File:** `backend/src/modules/sales/services/sales-order.mapper.ts`
    -   Update `SalesOrderResponseDto` type if necessary (it already seems to have a `payments` array).
    -   Ensure `directPayments` (if provided) are included in the `payments` mapping.
-   **File:** `backend/src/modules/sales/services/sales-order-query.service.ts`
    -   Refine the `directPayments` lookup to be more robust.

### Frontend Changes
-   **File:** `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
    -   Introduce a ref or state variable `isInitialLoad` to track if the form is still populating data from a saved order.
    -   Wrap the `selectedCustomer` effect that updates prices to check `!isInitialLoad`.
-   **File:** `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
    -   The `jeSources` should include `{ sourceType: 'sales_order', sourceId: fullOrder?.id }` if `fullOrder?.isFulfilled`.
-   **File:** `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
    -   Currently only uses `{ sourceType: 'payment', sourceId: selectedPayment?.id }`.
    -   Change to use an array that includes the related Sales Order if available.

## Verification Plan

### Automated Tests
-   **Unit Test:** Add a test case to `backend/src/modules/sales/services/sales-order.service.spec.ts` (or query service equivalent) to verify that `findById` returns both invoice-linked and direct payments.
-   **Integration Test:** Add a frontend test in `CreateSalesOrderPage.test.tsx` to verify that opening an existing order for edit does not change the unit prices.

### Manual Verification
1.  Create a Sales Order with a specific price (not from a price list).
2.  Edit the Sales Order and verify the price remains the same.
3.  Fulfill the Sales Order (creates fulfillment JE).
4.  Record a direct payment (creates payment JE).
5.  Link to an invoice and record another payment (creates another payment JE).
6.  Verify that in Sales Order, Invoice, and Payment views, all 3 JEs (fulfillment + 2 payments) are visible and clickable.
