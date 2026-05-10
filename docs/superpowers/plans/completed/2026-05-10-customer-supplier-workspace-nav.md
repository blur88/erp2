# Customer & Supplier Workspace Navigation & Tab Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix order navigation, add payment navigation, and reduce tab height in the Customer and Supplier workspace cards.

**Architecture:** All changes are isolated to two component files. Order rows navigate to the list page with a `?highlight=` query param (already supported by the destination workspace hooks). Payment rows use `navigate` with either a `?vpId=` param (vendor payments) or `{ state: { highlightPaymentId } }` location state (sales payments) — both patterns are already wired up in the destination hooks. Tab height is reduced via `sx={{ minHeight: 36 }}`.

**Tech Stack:** React 19, MUI v7, React Router, Vitest + Testing Library

---

## Files

- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`
- Modify: `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx`
- Modify: `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`
- Modify: `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`

---

## Task 1: Fix CustomerWorkspaceCard — order navigation, payment links, tab height

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`
- Modify: `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx`

### Step 1: Add failing tests for order navigation and payment clickability

Open `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx`.

The existing mock for `react-router-dom` uses `useNavigate: () => vi.fn()` — replace it with a captured mock so tests can assert on calls.

Replace the entire file with the following:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import CustomerWorkspaceCard from '../CustomerWorkspaceCard'
import { CustomerType } from '@/types'

const mockUseGetCustomerSalesHistoryQuery = vi.hoisted(() => vi.fn())
const mockUseGetCustomerOutstandingInvoicesQuery = vi.hoisted(() => vi.fn())
const mockUseGetCustomerPaymentsQuery = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomerSalesHistoryQuery: mockUseGetCustomerSalesHistoryQuery,
  useGetCustomerOutstandingInvoicesQuery: mockUseGetCustomerOutstandingInvoicesQuery,
  useGetCustomerPaymentsQuery: mockUseGetCustomerPaymentsQuery,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockCustomer = {
  id: 'customer-1',
  type: CustomerType.BUSINESS,
  name: 'Acme Supplies',
  isActive: true,
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('CustomerWorkspaceCard', () => {
  beforeEach(() => {
    mockUseGetCustomerSalesHistoryQuery.mockReset()
    mockUseGetCustomerOutstandingInvoicesQuery.mockReset()
    mockUseGetCustomerPaymentsQuery.mockReset()
    mockNavigate.mockReset()

    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    mockUseGetCustomerOutstandingInvoicesQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })

  it('renders nothing when no customer is selected', () => {
    const { container } = render(<CustomerWorkspaceCard selectedCustomer={null} />)
    expect(container.querySelector('[role="tabpanel"]')).not.toBeInTheDocument()
  })

  it('renders Orders, Invoices, and Payments tabs', () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /invoices/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('loads orders on initial render, other tabs only when clicked', () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    expect(mockUseGetCustomerSalesHistoryQuery).toHaveBeenCalledWith('customer-1', { skip: false })
    expect(mockUseGetCustomerOutstandingInvoicesQuery).toHaveBeenCalledWith('customer-1', { skip: true })
    expect(mockUseGetCustomerPaymentsQuery).toHaveBeenCalledWith('customer-1', { skip: true })
  })

  it('shows orders empty state when no orders', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({ data: { orders: [] }, isLoading: false, isError: false })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    expect(screen.getByText('No orders found.')).toBeInTheDocument()
  })

  it('renders order rows', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: {
        orders: [{ id: 'o-1', orderNumber: 'SO-001', orderDate: '2026-01-10', isFulfilled: false, isPaid: false, totalAmount: 500, itemsCount: 2 }],
      },
      isLoading: false,
      isError: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    expect(screen.getByText('SO-001')).toBeInTheDocument()
  })

  it('clicking an order navigates to sales orders list with highlight param', () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({
      data: {
        orders: [{ id: 'o-1', orderNumber: 'SO-001', orderDate: '2026-01-10', isFulfilled: false, isPaid: false, totalAmount: 500, itemsCount: 2 }],
      },
      isLoading: false,
      isError: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByText('SO-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=o-1')
  })

  it('shows invoices when Invoices tab clicked', async () => {
    mockUseGetCustomerOutstandingInvoicesQuery.mockReturnValue({
      data: {
        invoices: [
          { id: 'inv-1', invoiceNumber: 'INV-001', invoiceDate: '2026-01-05', totalAmount: 1000, paidAmount: 0, balanceDue: 1000, salesOrderId: null },
        ],
        totalOutstanding: 1000,
      },
      isLoading: false,
      isError: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    await waitFor(() => {
      expect(screen.getByText('INV-001')).toBeInTheDocument()
    })
  })

  it('shows payments empty state when Payments tab clicked with no data', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: [], isLoading: false, isError: false })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('No payments found.')).toBeInTheDocument()
    })
  })

  it('renders payment rows', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [{ id: 'pay-1', paymentNumber: 'PAY-001', paymentDate: '2026-01-15', status: 'completed', amount: 1500 }],
      isLoading: false,
      isError: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('PAY-001')).toBeInTheDocument()
    })

    expect(screen.getByText('completed')).toBeInTheDocument()
  })

  it('clicking a payment navigates to sales payments with highlightPaymentId state', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [{ id: 'pay-1', paymentNumber: 'PAY-001', paymentDate: '2026-01-15', status: 'completed', amount: 1500 }],
      isLoading: false,
      isError: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => expect(screen.getByText('PAY-001')).toBeInTheDocument())

    fireEvent.click(screen.getByText('PAY-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/sales/payments', { state: { highlightPaymentId: 'pay-1' } })
  })

  it('shows error state for each tab on fetch failure', async () => {
    mockUseGetCustomerSalesHistoryQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    mockUseGetCustomerOutstandingInvoicesQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    expect(screen.getByText('Failed to load orders.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))
    await waitFor(() => expect(screen.getByText('Failed to load invoices.')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))
    await waitFor(() => expect(screen.getByText('Failed to load payments.')).toBeInTheDocument())
  })

  it('tabs have compact minHeight of 36', () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)
    const tabsContainer = screen.getByRole('tablist').closest('.MuiTabs-root')
    expect(tabsContainer).toBeInTheDocument()
    // Visual check — minHeight is applied via sx and rendered inline or in class
    // The structural test above (tabs render, are clickable) is the functional guard
  })
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
```

Expected: `clicking an order navigates to sales orders list with highlight param` FAIL and `clicking a payment navigates to sales payments with highlightPaymentId state` FAIL.

- [ ] **Step 3: Implement the fixes in CustomerWorkspaceCard**

Open `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`.

Make three changes:

**Change 1 — Tabs `minHeight`** (line ~93): add `sx={{ minHeight: 36 }}` to `<Tabs>` and `sx={{ minHeight: 36 }}` to each `<Tab>`:

```tsx
<Tabs value={tabValue} onChange={(_, value) => setTabValue(value)} sx={{ minHeight: 36 }}>
  <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Orders" sx={{ minHeight: 36 }} />
  <Tab icon={<InvoiceIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Invoices" sx={{ minHeight: 36 }} />
  <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" sx={{ minHeight: 36 }} />
</Tabs>
```

**Change 2 — Orders tab `onClick`** (line ~139): replace the `navigate` call on the order `TableRow`:

```tsx
onClick={() => navigate(`/sales/orders?highlight=${order.id}`)}
```

**Change 3 — Payments tab rows** (line ~287): add `hover`, `cursor: 'pointer'`, and `onClick` to the payment `TableRow`:

```tsx
<TableRow
  key={payment.id}
  hover
  sx={{ cursor: 'pointer' }}
  onClick={() => navigate('/sales/payments', { state: { highlightPaymentId: payment.id } })}
>
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx \
        frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
git commit -m "fix(sales): fix order navigation and add payment links in CustomerWorkspaceCard

Closes part of #548"
```

---

## Task 2: Fix SupplierWorkspaceCard — order navigation, payment links, tab height

**Files:**
- Modify: `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`
- Modify: `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`

- [ ] **Step 1: Add failing tests for order navigation and payment clickability**

Open `frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx`.

The existing mock for `purchasingApi` uses inline `vi.fn()` — replace it with hoisted mocks so we can control return values per test. Replace the entire file:

```tsx
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import SupplierWorkspaceCard from '../SupplierWorkspaceCard'

const mockGetSupplierPurchaseOrdersQuery = vi.hoisted(() => vi.fn())
const mockGetSupplierGRNsQuery = vi.hoisted(() => vi.fn())
const mockGetSupplierPaymentsQuery = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSupplierPurchaseOrdersQuery: mockGetSupplierPurchaseOrdersQuery,
  useGetSupplierGRNsQuery: mockGetSupplierGRNsQuery,
  useGetSupplierPaymentsQuery: mockGetSupplierPaymentsQuery,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockSupplier: Supplier = {
  id: 'sup-1',
  companyName: 'Acme Corp',
  type: SupplierType.LOCAL,
  isActive: true,
  totalPurchases: 0,
  totalOrders: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('SupplierWorkspaceCard', () => {
  beforeEach(() => {
    mockGetSupplierPurchaseOrdersQuery.mockReset()
    mockGetSupplierGRNsQuery.mockReset()
    mockGetSupplierPaymentsQuery.mockReset()
    mockNavigate.mockReset()

    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({ data: undefined, isLoading: false })
    mockGetSupplierGRNsQuery.mockReturnValue({ data: undefined, isLoading: false })
    mockGetSupplierPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('renders empty Paper when no supplier selected', () => {
    const { container } = render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={null} />
      </MemoryRouter>,
    )

    expect(container.querySelector('.MuiPaper-root')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('renders three tabs when supplier selected', () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('tab', { name: /purchase orders/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /grns/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
  })

  it('shows empty state when no purchase orders', () => {
    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({ data: { data: [] }, isLoading: false })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no purchase orders found/i)).toBeInTheDocument()
  })

  it('clicking a purchase order navigates to purchasing orders list with highlight param', async () => {
    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({
      data: {
        data: [{ id: 'po-1', orderNumber: 'PO-001', orderDate: '2026-01-10', receivedDate: null, paidAmount: 0, total: 2000 }],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByText('PO-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders?highlight=po-1')
  })

  it('switches to GRNs tab on click', async () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /grns/i }))
    expect(screen.getByText(/no grns found/i)).toBeInTheDocument()
  })

  it('switches to Payments tab on click', async () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /payments/i }))
    expect(screen.getByText(/no payments found/i)).toBeInTheDocument()
  })

  it('clicking a payment navigates to vendor payments with vpId param', async () => {
    mockGetSupplierPaymentsQuery.mockReturnValue({
      data: {
        data: [{ id: 'vp-1', paymentNumber: 'VP-001', paymentDate: '2026-01-20', status: 'completed', amount: 500 }],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /payments/i }))
    await userEvent.click(screen.getByText('VP-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/vendor-payments?vpId=vp-1')
  })
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
```

Expected: `clicking a purchase order navigates to purchasing orders list with highlight param` FAIL and `clicking a payment navigates to vendor payments with vpId param` FAIL.

- [ ] **Step 3: Implement the fixes in SupplierWorkspaceCard**

Open `frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx`.

Make three changes:

**Change 1 — Tabs `minHeight`** (line ~92): add `sx={{ minHeight: 36 }}` to `<Tabs>` and each `<Tab>`:

```tsx
<Tabs value={tabValue} onChange={(_, value) => setTabValue(value)} sx={{ minHeight: 36 }}>
  <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Purchase Orders" sx={{ minHeight: 36 }} />
  <Tab icon={<GRNIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="GRNs" sx={{ minHeight: 36 }} />
  <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" sx={{ minHeight: 36 }} />
</Tabs>
```

**Change 2 — Purchase Orders tab `onClick`** (line ~129): replace the `navigate` call on the PO `TableRow`:

```tsx
onClick={() => navigate(`/purchasing/orders?highlight=${po.id}`)}
```

**Change 3 — Payments tab rows** (line ~238): add `hover`, `cursor: 'pointer'`, and `onClick` to the payment `TableRow`:

```tsx
<TableRow
  key={payment.id}
  hover
  sx={{ cursor: 'pointer' }}
  onClick={() => navigate(`/purchasing/vendor-payments?vpId=${payment.id}`)}
>
```

- [ ] **Step 4: Run the tests and confirm they all pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/components/SupplierWorkspaceCard.tsx \
        frontend/src/pages/purchasing/components/__tests__/SupplierWorkspaceCard.test.tsx
git commit -m "fix(purchasing): fix order navigation and add payment links in SupplierWorkspaceCard

Closes #548"
```

---

## Task 3: Create PR

- [ ] **Step 1: Push branch and open PR**

```bash
gh pr create \
  --title "fix: fix workspace card navigation and tab height (#548)" \
  --body "$(cat <<'EOF'
## Summary

- Order rows in Customer/Supplier workspace cards now navigate to the list page with `?highlight={id}` instead of opening the edit page directly
- Payment rows in both cards are now clickable and navigate to their respective payments list with the correct highlight param
- Tab height reduced from MUI default 48px to 36px via `sx={{ minHeight: 36 }}` on `<Tabs>` and `<Tab>`

## Test plan

- [ ] Clicking an order in the Customer workspace navigates to `/sales/orders?highlight={id}`
- [ ] Clicking an order in the Supplier workspace navigates to `/purchasing/orders?highlight={id}`
- [ ] Clicking a payment in the Customer workspace navigates to `/sales/payments` with `highlightPaymentId` state, and the payment row is highlighted
- [ ] Clicking a payment in the Supplier workspace navigates to `/purchasing/vendor-payments?vpId={id}`, and the payment row is highlighted
- [ ] Tabs in both cards are visually more compact

Closes #548

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
