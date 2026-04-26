# Workspace Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract three shared abstractions — `useJournalEntryRef`, `EntityContextHeaderBar`, and `EntityStatusChip` — to eliminate copy-paste patterns across 7 workspace hooks and 20+ context headers, closing issue #450 in a single PR.

**Architecture:** Create three new files in `frontend/src/hooks/` and `frontend/src/components/common/`, then migrate all consumers in one pass. `useEntityWorkspace` is not modified — the new hook composes on top of it. All changes are mechanical refactors with identical runtime behavior.

**Tech Stack:** React 19, MUI v7, RTK Query (`useLazyGetJournalEntriesQuery` from `@/store/api/accountingApi`), TypeScript (strict: false), Vitest

---

## File Map

### New files
- `frontend/src/hooks/useJournalEntryRef.ts` — shared journal entry fetch hook
- `frontend/src/components/common/EntityContextHeaderBar.tsx` — shared header bar component
- `frontend/src/components/common/EntityStatusChip.tsx` — centralized status chip

### Modified — workspace hooks (7)
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`
- `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`

### Modified — context headers (20)
**Sales:** `InvoiceContextHeader.tsx`, `PaymentContextHeader.tsx`, `OrderContextHeader.tsx`, `CustomerContextHeader.tsx`
**Purchasing:** `PurchaseOrderContextHeader.tsx`, `GRNContextHeader.tsx`, `VendorPaymentContextHeader.tsx`, `SupplierContextHeader.tsx`
**Inventory:** `StockAdjustmentContextHeader.tsx`, `ProductContextHeader.tsx`, `CategoryContextHeader.tsx`
**Accounting:** `JournalEntryContextHeader.tsx`, `SettlementContextHeader.tsx`, `ExpenseContextHeader.tsx`, `FundTransferContextHeader.tsx`, `OwnerEquityContextHeader.tsx`, `ChartOfAccountContextHeader.tsx`, `FiscalPeriodContextHeader.tsx`, `AccountMappingContextHeader.tsx`, `BankReconciliationContextHeader.tsx`

### Existing tests to re-run after each task
- `frontend/src/pages/sales/components/__tests__/InvoiceContextHeader.test.tsx`
- `frontend/src/pages/sales/components/__tests__/OrderContextHeader.test.tsx`
- `frontend/src/pages/sales/components/__tests__/PaymentContextHeader.test.tsx`
- `frontend/src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx`
- `frontend/src/pages/purchasing/components/__tests__/GRNContextHeader.test.tsx`
- `frontend/src/pages/purchasing/components/__tests__/PurchaseOrderContextHeader.test.tsx`
- `frontend/src/pages/purchasing/components/__tests__/SupplierContextHeader.test.tsx`
- `frontend/src/pages/purchasing/components/__tests__/VendorPaymentContextHeader.test.tsx`
- `frontend/src/pages/inventory/components/CategoryContextHeader.test.tsx`

---

## Task 1: Create `useJournalEntryRef` hook

**Files:**
- Create: `frontend/src/hooks/useJournalEntryRef.ts`

- [ ] **Step 1: Write the hook file**

```typescript
// frontend/src/hooks/useJournalEntryRef.ts
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'

export interface JournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useJournalEntryRef(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>,
): {
  journalEntryRef: JournalEntryRef | null
  journalEntryRefLoading: boolean
  navigateToJournalEntry: () => void
} {
  const navigate = useNavigate()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRef, setJournalEntryRef] = useState<JournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const validSources = sources.filter(
    (s): s is { sourceType: string; sourceId: string } => Boolean(s.sourceId),
  )

  // Stringify for stable dependency — avoid object identity issues
  const sourcesKey = validSources.map((s) => `${s.sourceType}:${s.sourceId}`).join(',')

  useEffect(() => {
    if (validSources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of validSources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            limit: 1,
          }).unwrap()

          if (cancelled) return

          const entry = response.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }
        if (!cancelled) setJournalEntryRef(null)
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchJournalEntries, sourcesKey])

  const navigateToJournalEntry = useCallback(() => {
    if (!journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`,
    )
  }, [journalEntryRef, navigate])

  return { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|useJournalEntryRef"
```

Expected: no errors mentioning `useJournalEntryRef`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useJournalEntryRef.ts
git commit -m "feat(hooks): add useJournalEntryRef shared hook (issue #450)"
```

---

## Task 2: Create `EntityStatusChip` component

**Files:**
- Create: `frontend/src/components/common/EntityStatusChip.tsx`

- [ ] **Step 1: Write the component file**

```tsx
// frontend/src/components/common/EntityStatusChip.tsx
import { Chip } from '@mui/material'

interface EntityStatusChipProps {
  status: string
}

type MuiChipColor = 'default' | 'success' | 'warning' | 'error' | 'info'

interface StatusConfig {
  color: MuiChipColor
  label: string
}

const STATUS_MAP: Record<string, StatusConfig> = {
  paid: { color: 'success', label: 'Paid' },
  completed: { color: 'success', label: 'Completed' },
  posted: { color: 'success', label: 'Posted' },
  received: { color: 'success', label: 'Received' },
  partial_paid: { color: 'warning', label: 'Partial Paid' },
  pending: { color: 'warning', label: 'Pending' },
  draft: { color: 'warning', label: 'Draft' },
  cancelled: { color: 'default', label: 'Cancelled' },
  refunded: { color: 'default', label: 'Refunded' },
  reversed: { color: 'error', label: 'Reversed' },
  failed: { color: 'error', label: 'Failed' },
  overpaid: { color: 'info', label: 'Overpaid' },
}

function toTitleCase(str: string): string {
  return str
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function EntityStatusChip({ status }: EntityStatusChipProps) {
  const config = STATUS_MAP[status.toLowerCase()]
  return (
    <Chip
      size="small"
      color={config?.color ?? 'default'}
      label={config?.label ?? toTitleCase(status)}
      sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}
    />
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|EntityStatusChip"
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/EntityStatusChip.tsx
git commit -m "feat(components): add EntityStatusChip centralized status chip (issue #450)"
```

---

## Task 3: Create `EntityContextHeaderBar` component

**Files:**
- Create: `frontend/src/components/common/EntityContextHeaderBar.tsx`

- [ ] **Step 1: Write the component file**

```tsx
// frontend/src/components/common/EntityContextHeaderBar.tsx
import type { ReactNode } from 'react'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'

interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
  journalEntryRef?: JournalEntryRef | null
  journalEntryRefLoading?: boolean
  onNavigateToJournalEntry?: () => void
}

export function EntityContextHeaderBar({
  title,
  statusChip,
  actions,
  journalEntryRef,
  journalEntryRefLoading,
  onNavigateToJournalEntry,
}: EntityContextHeaderBarProps) {
  return (
    <Box
      sx={{
        p: TABLE_STYLES.cell.padding.px,
        borderBottom: TABLE_STYLES.cell.border,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </Typography>
        {statusChip}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {actions}
        {journalEntryRefLoading && !journalEntryRef && (
          <CircularProgress size={16} sx={{ mx: 0.5 }} />
        )}
        {journalEntryRef && (
          <Tooltip title={`Journal Entry: ${journalEntryRef.referenceNumber}`}>
            <IconButton size="small" onClick={onNavigateToJournalEntry}>
              <MenuBookIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|EntityContextHeaderBar"
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/EntityContextHeaderBar.tsx
git commit -m "feat(components): add EntityContextHeaderBar shared header bar (issue #450)"
```

---

## Task 4: Migrate sales workspace hooks

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`

- [ ] **Step 1: Migrate `useInvoicesWorkspace.ts`**

In `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`:

1. Add import (alongside existing imports):
```typescript
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
```

2. Remove: the local `InvoiceJournalEntryRef` interface (or keep if exported and used by the context header — check first with `grep -n "InvoiceJournalEntryRef" frontend/src/pages/sales/components/InvoiceContextHeader.tsx`)

3. Remove: `const [journalEntryRef, setJournalEntryRef] = useState<...>(null)` and `const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)`

4. Remove: `const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()` (if only used for journal entries)

5. Remove: the entire `useEffect` block that fetches journal entries (lines 98–160)

6. Remove: the `navigateToJournalEntry` arrow function / useCallback

7. Add after the `useEntityWorkspace` call:
```typescript
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'invoice', sourceId: selectedInvoice?.id },
  { sourceType: 'sales_order', sourceId: selectedInvoice?.salesOrder?.id },
])
```

8. The return statement is unchanged — `journalEntryRef`, `journalEntryRefLoading`, `navigateToJournalEntry` are already returned by name.

- [ ] **Step 2: Migrate `usePaymentsWorkspace.ts`**

Apply the same pattern. The sources array for payments is:
```typescript
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'payment', sourceId: selectedPayment?.id },
])
```

Remove the local state, useEffect, and navigateToJournalEntry. Remove `useLazyGetJournalEntriesQuery` import if unused after removal.

- [ ] **Step 3: Migrate `useOrdersWorkspace.ts`**

Check the sources used:
```bash
grep -A 10 "sourceType.*sales_order\|sourceType.*order" frontend/src/pages/sales/hooks/useOrdersWorkspace.ts
```

Apply the same pattern using whatever sourceType/sourceId the existing useEffect uses.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|useInvoicesWorkspace|usePaymentsWorkspace|useOrdersWorkspace"
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts \
        frontend/src/pages/sales/hooks/useOrdersWorkspace.ts
git commit -m "refactor(sales): migrate workspace hooks to useJournalEntryRef (issue #450)"
```

---

## Task 5: Migrate purchasing and inventory workspace hooks

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`

- [ ] **Step 1: Migrate `usePurchaseOrdersWorkspace.ts`**

This hook has a dynamic multi-source array built from `selectedOrder.goodsReceivedNotes` and `selectedOrder.vendorPayments`. Replace the entire journal entry block with:

```typescript
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'

// Build sources from related entities
const journalSources = [
  ...(selectedOrder?.goodsReceivedNotes ?? []).map((grn: any) => ({
    sourceType: 'goods_received_note',
    sourceId: grn.id as string | undefined,
  })),
  ...(selectedOrder?.vendorPayments ?? []).map((payment: any) => ({
    sourceType: 'vendor_payment',
    sourceId: payment.id as string | undefined,
  })),
]

const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } =
  useJournalEntryRef(journalSources)
```

Remove the local state, useEffect, and navigateToJournalEntry useCallback. Remove `useLazyGetJournalEntriesQuery` import if unused.

- [ ] **Step 2: Migrate `useGRNWorkspace.ts`**

Sources for GRN:
```typescript
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'goods_received_note', sourceId: selectedGRN?.id },
])
```

- [ ] **Step 3: Migrate `useVendorPaymentsWorkspace.ts`**

Sources for vendor payments:
```typescript
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'vendor_payment', sourceId: selectedPayment?.id },
])
```

- [ ] **Step 4: Migrate `useStockAdjustmentsWorkspace.ts`**

Sources for stock adjustments:
```typescript
const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } = useJournalEntryRef([
  { sourceType: 'stock_adjustment', sourceId: selectedAdjustment?.id },
])
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|usePurchaseOrders|useGRN|useVendorPayments|useStockAdjustments"
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts \
        frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts \
        frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts \
        frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts
git commit -m "refactor(purchasing,inventory): migrate workspace hooks to useJournalEntryRef (issue #450)"
```

---

## Task 6: Migrate sales context headers

**Files:**
- Modify: `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/PaymentContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`

For **each** file, apply this migration pattern:

**Remove:**
- Local `STATUS_COLORS` map, `statusColor` function, or inline ternary chip color logic
- The outer `Box` with `display: 'flex', justifyContent: 'space-between'` that wraps the title and actions
- The inline `MenuBook` IconButton for journal entry navigation (if present)
- Imports for `MenuBook`, `CircularProgress` (if only used for journal entry)

**Add imports:**
```typescript
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
```

**Replace the outer Box with `EntityContextHeaderBar`:**
```tsx
<EntityContextHeaderBar
  title="Invoice Details - {selectedInvoice.invoiceNumber}"
  statusChip={<EntityStatusChip status={isOverpaid ? 'overpaid' : selectedInvoice.status} />}
  actions={
    <AppButton size="small" variant="secondary" startIcon={<PrintIcon />} onClick={onPrint}>
      Print
    </AppButton>
  }
  journalEntryRef={journalEntryRef}
  journalEntryRefLoading={journalEntryRefLoading}
  onNavigateToJournalEntry={onNavigateToJournalEntry}
/>
```

**Entity-specific titles and status expressions:**

| Header | title prop | statusChip status expression |
|---|---|---|
| `InvoiceContextHeader` | `Invoice Details - {selectedInvoice.invoiceNumber}` | `isOverpaid ? 'overpaid' : selectedInvoice.status` |
| `PaymentContextHeader` | `Payment Details - {selectedPayment.paymentNumber}` | `selectedPayment.status` |
| `OrderContextHeader` | `Order Details - {selectedOrder.orderNumber}` | `selectedOrder.status` |
| `CustomerContextHeader` | `Customer Details - {selectedCustomer.name}` | no status chip (omit prop) |

For `OrderContextHeader` the `actions` prop will contain the full conditional button group (Edit, Delete, Print, Pay/Unpay, Fulfill/Unfulfill) — pass all of it as `actions`, unchanged.

- [ ] **Step 1: Migrate `InvoiceContextHeader.tsx`** (apply pattern above)

- [ ] **Step 2: Migrate `PaymentContextHeader.tsx`** (apply pattern above)

- [ ] **Step 3: Migrate `OrderContextHeader.tsx`** (apply pattern above — pass all conditional action buttons as `actions`)

- [ ] **Step 4: Migrate `CustomerContextHeader.tsx`** (outer shell only — no status chip, no journal entry)

- [ ] **Step 5: Run existing tests**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/ --reporter=verbose 2>&1 | tail -30
```

Expected: all pass

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS"
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/components/InvoiceContextHeader.tsx \
        frontend/src/pages/sales/components/PaymentContextHeader.tsx \
        frontend/src/pages/sales/components/OrderContextHeader.tsx \
        frontend/src/pages/sales/components/CustomerContextHeader.tsx
git commit -m "refactor(sales): migrate context headers to EntityContextHeaderBar + EntityStatusChip (issue #450)"
```

---

## Task 7: Migrate purchasing context headers

**Files:**
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`
- Modify: `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`

Apply the same migration pattern from Task 6.

**Entity-specific titles and status expressions:**

| Header | title prop | statusChip status expression |
|---|---|---|
| `PurchaseOrderContextHeader` | `Purchase Order Details - {selectedOrder.orderNumber}` | `selectedOrder.status` |
| `GRNContextHeader` | `Goods Received Note - {selectedGRN.grnNumber}` | `selectedGRN.status` |
| `VendorPaymentContextHeader` | `Vendor Payment Details - {selectedPayment.paymentNumber}` | `selectedPayment.status` |
| `SupplierContextHeader` | `Supplier Details - {selectedSupplier.name}` | no status chip (omit) |

For `PurchaseOrderContextHeader`, pass the Receive/Return conditional buttons as `actions` unchanged.

- [ ] **Step 1: Migrate `PurchaseOrderContextHeader.tsx`**

- [ ] **Step 2: Migrate `GRNContextHeader.tsx`**

- [ ] **Step 3: Migrate `VendorPaymentContextHeader.tsx`**

- [ ] **Step 4: Migrate `SupplierContextHeader.tsx`**

- [ ] **Step 5: Run existing tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/ --reporter=verbose 2>&1 | tail -30
```

Expected: all pass

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS"
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx \
        frontend/src/pages/purchasing/components/GRNContextHeader.tsx \
        frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx \
        frontend/src/pages/purchasing/components/SupplierContextHeader.tsx
git commit -m "refactor(purchasing): migrate context headers to EntityContextHeaderBar + EntityStatusChip (issue #450)"
```

---

## Task 8: Migrate inventory context headers

**Files:**
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`
- Modify: `frontend/src/pages/inventory/components/ProductContextHeader.tsx`
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

Apply the same migration pattern.

**Entity-specific titles and status expressions:**

| Header | title prop | statusChip status expression |
|---|---|---|
| `StockAdjustmentContextHeader` | `Stock Adjustment - {selectedAdjustment.referenceNumber}` | `selectedAdjustment.status` |
| `ProductContextHeader` | `Product Details - {selectedProduct.name}` | no status chip (omit) |
| `CategoryContextHeader` | `Category Details - {selectedCategory.name}` | no status chip (omit) |

- [ ] **Step 1: Migrate `StockAdjustmentContextHeader.tsx`**

- [ ] **Step 2: Migrate `ProductContextHeader.tsx`**

- [ ] **Step 3: Migrate `CategoryContextHeader.tsx`**

- [ ] **Step 4: Run existing tests**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: all pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS"
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx \
        frontend/src/pages/inventory/components/ProductContextHeader.tsx \
        frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "refactor(inventory): migrate context headers to EntityContextHeaderBar + EntityStatusChip (issue #450)"
```

---

## Task 9: Migrate accounting context headers

**Files:**
- Modify: `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/SettlementContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/ExpenseContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/FundTransferContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/OwnerEquityContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/FiscalPeriodContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/AccountMappingContextHeader.tsx`
- Modify: `frontend/src/pages/accounting/components/BankReconciliationContextHeader.tsx`

Apply the same migration pattern. Key notes:

- `JournalEntryContextHeader` has a local `statusColor()` function — replace `<Chip ... color={statusColor(selectedEntry.status)} />` with `<EntityStatusChip status={selectedEntry.status} />`
- `SettlementContextHeader` has a local `STATUS_COLORS` map — replace with `EntityStatusChip`
- The remaining accounting headers (Expense, FundTransfer, OwnerEquity, etc.) have no journal entry props and no status chip — migrate outer shell only

For each file, check actual title and status field:
```bash
grep -n "Typography.*variant.*tableHeader\|entityNumber\|referenceNumber\|\.status" \
  frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx | head -10
```

- [ ] **Step 1: Migrate `JournalEntryContextHeader.tsx`** (has local statusColor function — replace with EntityStatusChip)

- [ ] **Step 2: Migrate `SettlementContextHeader.tsx`** (has local STATUS_COLORS map — replace with EntityStatusChip)

- [ ] **Step 3: Migrate `ExpenseContextHeader.tsx`** (outer shell only)

- [ ] **Step 4: Migrate `FundTransferContextHeader.tsx`** (outer shell only)

- [ ] **Step 5: Migrate `OwnerEquityContextHeader.tsx`** (outer shell only)

- [ ] **Step 6: Migrate remaining accounting headers** (`ChartOfAccountContextHeader`, `FiscalPeriodContextHeader`, `AccountMappingContextHeader`, `BankReconciliationContextHeader`) — outer shell only

- [ ] **Step 7: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS"
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/accounting/components/
git commit -m "refactor(accounting): migrate context headers to EntityContextHeaderBar + EntityStatusChip (issue #450)"
```

---

## Task 10: Final verification and PR

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS"
```

Expected: no errors

- [ ] **Step 2: Run all context header tests**

```bash
cd frontend && npx vitest run \
  src/pages/sales/components/__tests__/ \
  src/pages/purchasing/components/__tests__/ \
  src/pages/inventory/components/CategoryContextHeader.test.tsx \
  --reporter=verbose 2>&1 | tail -40
```

Expected: all pass

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -v "^$" | tail -20
```

Expected: no new errors

- [ ] **Step 4: Open PR**

```bash
gh pr create \
  --title "refactor(workspace): consolidate shared patterns — useJournalEntryRef, EntityContextHeaderBar, EntityStatusChip" \
  --body "$(cat <<'EOF'
## Summary

- Extracts `useJournalEntryRef` hook — eliminates copy-paste journal entry fetch logic from 7 workspace hooks
- Adds `EntityContextHeaderBar` component — standardizes the header bar (title, status, actions, journal entry icon) across 20 context headers
- Adds `EntityStatusChip` component — centralizes status → color/label mapping, replaces 5 different local patterns across ~20 files

All changes are mechanical refactors. Runtime behavior is identical.

Closes #450

## Test plan

- [ ] All existing context header tests pass
- [ ] TypeScript check passes with no new errors
- [ ] Journal Entry icon appears consistently (same position) across all workspace pages
- [ ] Status chips render correct colors on all workspace pages
EOF
)"
```

---

## Quick Reference

**New shared types:**
```typescript
// from @/hooks/useJournalEntryRef
interface JournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

// EntityContextHeaderBar props
interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
  journalEntryRef?: JournalEntryRef | null
  journalEntryRefLoading?: boolean
  onNavigateToJournalEntry?: () => void
}
```

**Standard migration pattern for each context header:**
1. Add imports for `EntityContextHeaderBar` and `EntityStatusChip`
2. Replace the outer `Box` (with `justifyContent: 'space-between'`) and its contents with `<EntityContextHeaderBar>`
3. Replace local `<Chip>` status logic with `<EntityStatusChip status={...} />`
4. Remove: local STATUS_COLORS, statusColor(), inline ternaries, MenuBook IconButton, CircularProgress for journal entry loading
5. Everything below the header bar (detail tables, info rows) is untouched
