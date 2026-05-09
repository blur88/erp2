# Customer & Supplier Workspace — Navigation & Tab Styling

**Issue:** #548  
**Date:** 2026-05-10

## Problem

Three bugs on the Customer and Supplier workspace pages:

1. **Order rows navigate to the edit page** instead of the orders list with the order highlighted.
2. **Payment rows are not clickable** — they should navigate to the payments list with the payment highlighted.
3. **Tab height is too tall** — the `Tabs`/`Tab` components use MUI's default 48px `minHeight`; it should be more compact.

## Scope

Two files only:

- `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`
- `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`

No backend changes. No new hooks.

## Design

### 1. Order navigation

**Customer workspace (Orders tab):**  
Change `onClick` from `navigate('/sales/orders/${order.id}/edit')` to `navigate('/sales/orders?highlight=${order.id}')`.

**Supplier workspace (Purchase Orders tab):**  
Change `onClick` from `navigate('/purchasing/orders/${po.id}/edit')` to `navigate('/purchasing/orders?highlight=${po.id}')`.

Both `useOrdersWorkspace` and `usePurchaseOrdersWorkspace` already configure `highlightParam: 'highlight'` in `useEntityWorkspace`, so the destination pages will auto-select and scroll to the correct row.

### 2. Payment links

**Customer workspace (Payments tab):**  
Add `hover`, `cursor: 'pointer'`, and `onClick={() => navigate('/sales/payments', { state: { highlightPaymentId: payment.id } })}` to each payment `TableRow`.  
`usePaymentsWorkspace` already configures `locationStateHighlightKey: 'highlightPaymentId'`, so this will highlight the correct payment.

**Supplier workspace (Payments tab):**  
Add `hover`, `cursor: 'pointer'`, and `onClick={() => navigate('/purchasing/vendor-payments?vpId=${payment.id}')}` to each payment `TableRow`.  
`useVendorPaymentsWorkspace` already configures `highlightParam: 'vpId'`.

### 3. Tab height

On both `<Tabs>` and each `<Tab>` in both workspace cards, add `sx={{ minHeight: 36 }}`. This reduces the tab strip from MUI's default 48px to a compact 36px consistent with the dense table style used elsewhere.

## No-change areas

- The GRN tab in `SupplierWorkspaceCard` already navigates to the PO edit page via `grn.purchaseOrder?.id` — the issue does not ask to change this behaviour.
- The Invoice tab in `CustomerWorkspaceCard` also navigates to the sales order edit page — the issue does not ask to change this either.
