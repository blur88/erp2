# Design Spec: Fulfillment-Only Customer Metrics

## Status
- **Date:** 2026-05-08
- **Issue:** #544
- **Status:** Draft

## Problem Statement
Customers currently see a discrepancy in their "Account Summary" (Customer Profile Header). The `Total Orders` and `Total Sales` metrics include all created orders, even those that are unfulfilled, deleted, or cancelled. This leads to inflated statistics and confusion when compared to the active order list.

For example, Customer B1 shows 9 orders in the summary but only 3 in the order list (the 3 fulfilled ones).

## Success Criteria
- The "Account Summary" reflects only **fulfilled** orders.
- Deleting or unfulfilling an order correctly decrements the customer's metrics.
- Restoring or fulfilling an order correctly increments the customer's metrics.
- `First Purchase Date` and `Last Purchase Date` reflect the `orderDate` of fulfilled orders only.
- `Average Order Value` is correctly derived from fulfilled totals.

## Proposed Architecture

### 1. Data Logic Changes
The metric update logic will be shifted from the **Creation** phase to the **Fulfillment** phase.

#### Customer Metrics Refinement:
- `totalOrders`: Count of orders where `isFulfilled = true` and `deletedAt` is NULL.
- `totalSales`: Sum of `totalAmount` from orders where `isFulfilled = true` and `deletedAt` is NULL.
- `firstPurchaseDate`: The `orderDate` of the oldest fulfilled order.
- `lastPurchaseDate`: The `orderDate` of the newest fulfilled order.

### 2. Implementation Plan

#### Backend Changes
1. **`CustomerService`**:
   - Update `recalculateAllCustomerTotals` and `updateCustomerMetrics` to filter `SalesOrder` records by `isFulfilled: true`.
2. **`SalesOrderService`**:
   - Remove the call to `updateCustomerSalesMetrics` in the `create` method. Metrics should not update on creation.
3. **`SalesOrderFulfillmentService`**:
   - In `fulfillOrder`, trigger a customer metric refresh after the order status is set to `isFulfilled = true`.
   - In `unfulfillOrder`, trigger a customer metric refresh after the order status is set to `isFulfilled = false`.
4. **`SalesOrderLifecycleService`**:
   - In `delete` (soft-delete), if the order was fulfilled, trigger a customer metric refresh.
   - In `restore`, if the order is fulfilled, trigger a customer metric refresh.
   - In `permanentDelete`, ensure metrics are refreshed if the deleted order was fulfilled.

#### Data Migration / Correction
- Execute `CustomerService.recalculateAllCustomerTotals()` to synchronize existing data across all customers.

## Verification Plan

### Automated Tests
- **Unit Test (`customer.service.spec.ts`)**: Verify that recalculation logic correctly ignores unfulfilled orders.
- **Integration Test (`sales-order.service.spec.ts`)**: 
  - Create order -> Verify metrics are 0.
  - Fulfill order -> Verify metrics increment.
  - Unfulfill order -> Verify metrics decrement.
  - Delete fulfilled order -> Verify metrics decrement.

### Manual Verification
- View Customer B1 profile.
- Confirm "Account Summary" matches the count of fulfilled orders in the list.
- Fulfill a pending order and observe the count increasing.
