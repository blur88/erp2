# SO/PO Auto-Highlight Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After creating a Sales Order or Purchase Order, the list page should automatically highlight the new order and show its details panel.

**Architecture:** Both `OrdersPage` and `PurchaseOrdersPage` receive `location.state.highlightOrderId` via React Router after creation, but a race condition causes the highlight effect to run before orders load. `OrdersPage` already has a `pendingOrderToSelect` state (line 160) that correctly waits for orders to load — we extend it to initialize from `location.state.highlightOrderId`. `PurchaseOrdersPage` gets the same pattern added. The old `location.state`-based highlight effects are removed from both files.

**Tech Stack:** React 18, React Router v6, Redux Toolkit, TypeScript

---

### Task 1: Fix OrdersPage — initialize `pendingOrderToSelect` from `location.state`

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx:160`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx:846-915` (two highlight effects)

**Step 1: Update `pendingOrderToSelect` initial value to read from `location.state`**

Find line 160 in `OrdersPage.tsx`:
```typescript
const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(null)
```

Replace with:
```typescript
const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(
  (location.state as { highlightOrderId?: string })?.highlightOrderId ?? null
)
```

**Step 2: Clear `location.state` on mount to prevent re-trigger on browser back/forward**

Find the mount useEffect (around line 222, it has `useEffect(() => {` with `[]` deps or similar). Add a new small effect right after the `pendingOrderToSelect` state declaration (after line 160), before other effects:

```typescript
// Clear location.state so browser back/forward doesn't re-trigger highlight
useEffect(() => {
  if ((location.state as { highlightOrderId?: string })?.highlightOrderId) {
    navigate(location.pathname, { replace: true, state: {} })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Step 3: Remove the old `location.state`-based highlight effect**

Remove lines 889-915 entirely (the `// Handle navigation from invoice page with highlightOrderId` effect). The existing `pendingOrderToSelect` effect at lines 876-887 already handles waiting for orders to load and selecting the order — no changes needed there.

**Step 4: Update the auto-focus effect to not guard on `hasHighlightOrderId` using location.state**

At line 848-849, the first auto-focus effect reads `location.state` for `hasHighlightOrderId`. Since we've cleared `location.state` on mount, change the guard to use `pendingOrderToSelect`:

Find:
```typescript
const state = location.state as { highlightOrderId?: string }
const hasHighlightOrderId = !!state?.highlightOrderId || !!processedHighlightRef.current
```

Replace with:
```typescript
const hasHighlightOrderId = !!pendingOrderToSelect || !!processedHighlightRef.current
```

Also update the dependency array on that effect (line 873). Remove `location.state`, add `pendingOrderToSelect`:
```typescript
}, [orders, focusedOrderIndex, selectedOrder, dispatch, pendingOrderToSelect])
```

**Step 5: Manual test**
1. Run frontend: `cd frontend && npm run dev` (or use Docker)
2. Navigate to Sales Orders list
3. Click "New Order", fill in the form, submit
4. Verify: list page loads with the new order highlighted (blue background) and its details shown in the right panel

**Step 6: Commit**
```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git commit -m "fix: auto-highlight newly created sales order on list page"
```

---

### Task 2: Fix PurchaseOrdersPage — add `pendingHighlightId` local state pattern

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:167` (near ref declarations)
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:679-739` (two highlight effects)

**Step 1: Add `pendingHighlightId` state initialized from `location.state`**

Find the ref declarations around line 167:
```typescript
const processedHighlightRef = useRef<string | null>(null)
const userHasNavigatedRef = useRef(false)
```

Add a new state declaration just before these refs:
```typescript
const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(
  (location.state as { highlightOrderId?: string })?.highlightOrderId ?? null
)
```

**Step 2: Clear `location.state` on mount**

Add a new effect right after the state declarations (before the first existing useEffect). Place it near the top of the component's effects section:

```typescript
// Clear location.state so browser back/forward doesn't re-trigger highlight
useEffect(() => {
  if ((location.state as { highlightOrderId?: string })?.highlightOrderId) {
    navigate(location.pathname, { replace: true, state: {} })
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Step 3: Add new effect to handle pending highlight (waits for orders to load)**

Add this effect after the "Clear selection when no orders exist" effect (after line 713):

```typescript
// Handle pending highlight after orders load (set from location.state on mount)
useEffect(() => {
  if (!pendingHighlightId || purchaseOrders.length === 0) return
  const orderIndex = purchaseOrders.findIndex((o: any) => o.id === pendingHighlightId)
  if (orderIndex >= 0) {
    dispatch(setSelectedPurchaseOrder(purchaseOrders[orderIndex]))
    setFocusedOrderIndex(orderIndex)
    processedHighlightRef.current = pendingHighlightId
    userHasNavigatedRef.current = false
    setPendingHighlightId(null)
  }
}, [purchaseOrders, pendingHighlightId, dispatch])
```

**Step 4: Remove the old `location.state`-based highlight effect**

Remove lines 715-739 entirely (the `// Handle navigation from create/edit page with highlightOrderId` effect).

**Step 5: Update the auto-focus effect to use `pendingHighlightId` instead of `location.state`**

At lines 682-683, find:
```typescript
const state = location.state as { highlightOrderId?: string }
const hasHighlightOrderId = !!state?.highlightOrderId || !!processedHighlightRef.current
```

Replace with:
```typescript
const hasHighlightOrderId = !!pendingHighlightId || !!processedHighlightRef.current
```

Update the dependency array (line 705). Remove `location.state`, add `pendingHighlightId`:
```typescript
}, [purchaseOrders, focusedOrderIndex, selectedOrder, dispatch, searchParams, pendingHighlightId])
```

**Step 6: Manual test**
1. Navigate to Purchase Orders list
2. Click "New Purchase Order", fill in the form, submit
3. Verify: list page loads with the new PO highlighted and its details shown in the right panel

**Step 7: Commit**
```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "fix: auto-highlight newly created purchase order on list page"
```

---

### Task 3: Verify both fixes work end-to-end

**Step 1: Type-check**
```bash
cd frontend && npm run type-check
```
Expected: no errors related to the changed files

**Step 2: Test edge cases manually**
- Create a SO → verify highlight works
- Create a PO → verify highlight works
- Navigate away from list and back (without creating) → verify no unwanted highlight
- Use browser back button after creation → verify no duplicate highlight

**Step 3: Final commit if any cleanup needed**
```bash
git add -p
git commit -m "fix: cleanup highlight race condition in SO/PO list pages"
```
