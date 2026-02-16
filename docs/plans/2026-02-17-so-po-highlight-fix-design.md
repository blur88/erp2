# Design: Fix SO/PO Auto-Highlight After Creation

**Date:** 2026-02-17
**Branch:** feat/owner-equity-expenses

## Problem

After creating a Sales Order or Purchase Order, navigating back to the list page fails to highlight/select the newly created order and show its details panel.

**Root Cause:** Race condition — the highlight `useEffect` in `OrdersPage` and `PurchaseOrdersPage` depends on both `location.state.highlightOrderId` and `orders.length > 0` being true simultaneously. On navigation, orders are empty (API not yet fetched), so the effect skips. By the time orders load, `location.state` is still present but `processedHighlightRef` may block re-processing.

## Solution: Approach B — Capture `highlightOrderId` in Local State

**Core idea:** Read `location.state.highlightOrderId` once at component initialization into a stable `useState`. Effects then depend on this stable local state instead of the volatile `location.state`.

## Affected Files

- `frontend/src/pages/sales/OrdersPage.tsx`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

## Changes Per File (Identical Pattern)

### 1. Add local state
```typescript
const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(
  (location.state as any)?.highlightOrderId ?? null
);
```

### 2. Clear location.state on mount (prevents re-trigger on browser back/forward)
```typescript
useEffect(() => {
  if ((location.state as any)?.highlightOrderId) {
    navigate(location.pathname, { replace: true, state: {} });
  }
}, []); // eslint-disable-line react-hooks/exhaustive-deps
```

### 3. Replace existing highlight useEffect
```typescript
useEffect(() => {
  if (!pendingHighlightId || orders.length === 0) return;
  const orderIndex = orders.findIndex((o: any) => o.id === pendingHighlightId);
  if (orderIndex >= 0) {
    dispatch(setSelectedOrder(orders[orderIndex]));
    setFocusedOrderIndex(orderIndex);
    dispatch(fetchOrderById(orders[orderIndex].id) as any); // SO only
    setPendingHighlightId(null);
    processedHighlightRef.current = pendingHighlightId;
  }
}, [orders, pendingHighlightId, dispatch]);
```

### 4. Remove the old location.state-based highlight effect
The existing `useEffect` that reads `location.state?.highlightOrderId` is replaced entirely.

## Why This Works

`location.state` is read once at initialization into stable local state. The effect watches `[orders, pendingHighlightId]`. When orders eventually load asynchronously, the effect re-runs, finds the order by ID, selects it, and clears `pendingHighlightId`. No timing dependency on `location.state`.
