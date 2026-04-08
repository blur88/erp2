# Customer Payments Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Payments tab (index 2) to `CustomerWorkspaceCard.tsx`, mirroring the existing Payments tab in `SupplierWorkspaceCard.tsx`.

**Architecture:** Add a `getCustomerPayments` RTK Query endpoint to `salesApi.ts` that calls `GET /payments/customer/:id`. The `CustomerWorkspaceCard` is then refactored to use RTK Query (matching `SupplierWorkspaceCard`) and gains a third Payments tab using the new hook.

**Tech Stack:** React 19, RTK Query, Material-UI v7, Vitest

---

## File Map

| File | Change |
|------|--------|
| `frontend/src/store/api/salesApi.ts` | Add `getCustomerPayments` endpoint + export hook |
| `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx` | Switch to RTK Query; add Payments tab |
| `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx` | Update tab count; add Payments lazy-load test |

---

### Task 1: Add `getCustomerPayments` RTK Query endpoint

**Files:**
- Modify: `frontend/src/store/api/salesApi.ts`

- [ ] **Step 1: Add the endpoint inside the `endpoints` builder block**

In `salesApi.ts`, after the `bulkRestorePayments` endpoint (line ~325, just before the closing `}),` of the endpoints object), add:

```ts
    getCustomerPayments: builder.query<Payment[], string>({
      query: (id) => ({ url: `/payments/customer/${id}` }),
      transformResponse: (response: any): Payment[] => {
        if (Array.isArray(response)) return response
        return response?.data ?? []
      },
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),
```

- [ ] **Step 2: Export the generated hook**

In the destructured export at the bottom of `salesApi.ts`, add `useGetCustomerPaymentsQuery` to the list (after `useBulkRestorePaymentsMutation`):

```ts
  useGetCustomerPaymentsQuery,
} = salesApiSlice
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/store/api/salesApi.ts
git commit -m "feat(sales): add getCustomerPayments RTK Query endpoint"
```

---

### Task 2: Update `CustomerWorkspaceCard` — add Payments tab

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

The current component uses manual `api.get()` calls + `ordersLoaded`/`invoicesLoaded` state flags. We leave the existing Orders and Invoices tabs exactly as-is (they work) and add only the Payments tab via RTK Query, consistent with `SupplierWorkspaceCard`.

- [ ] **Step 1: Add new imports**

Replace the existing import block at the top of `CustomerWorkspaceCard.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import {
  Box,
  CircularProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import {
  AccountBalance as InvoiceIcon,
  Payment as PaymentIcon,
  ShoppingCart as OrdersIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'
import { useGetCustomerPaymentsQuery } from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
```

- [ ] **Step 2: Add RTK Query call for payments inside the component**

After the existing `useState` declarations (line ~86, after `const [invoicesLoaded, setInvoicesLoaded] = useState(false)`), add:

```tsx
  const customerId = selectedCustomer?.id ?? ''

  const { data: paymentsData, isLoading: paymentsLoading } = useGetCustomerPaymentsQuery(customerId, {
    skip: !customerId || tabValue !== 2,
  })

  const payments = paymentsData ?? []
```

- [ ] **Step 3: Add the Payments tab to the Tabs bar**

Replace the `<Tabs>` section:

```tsx
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Orders" />
          <Tab icon={<InvoiceIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Invoices" />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" />
        </Tabs>
      </Box>
```

- [ ] **Step 4: Add the Payments TabPanel**

After the closing `</TabPanel>` of the Invoices tab (line ~257), add:

```tsx
      <TabPanel value={tabValue} index={2}>
        {paymentsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : payments.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No payments found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>Payment #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {payment.paymentNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.status}</TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx
git commit -m "feat(sales): add Payments tab to CustomerWorkspaceCard"
```

---

### Task 3: Update tests

**Files:**
- Modify: `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Replace the entire content of `CustomerWorkspaceCard.test.tsx` with:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import CustomerWorkspaceCard from '../CustomerWorkspaceCard'
import { CustomerType } from '@/types'

const mockedApi = vi.hoisted(() => ({
  get: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  default: mockedApi,
}))

const mockUseGetCustomerPaymentsQuery = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomerPaymentsQuery: mockUseGetCustomerPaymentsQuery,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
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
    mockedApi.get.mockReset()
    mockUseGetCustomerPaymentsQuery.mockReset()

    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/sales-history')) {
        return Promise.resolve({ data: { orders: [] } })
      }
      return Promise.resolve({
        data: {
          data: {
            invoices: [],
            totalOutstanding: 0,
          },
        },
      })
    })

    // Default: skipped (not on payments tab)
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('renders Orders, Invoices, and Payments tabs', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    })

    expect(screen.getByRole('tab', { name: /invoices/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('lazy-loads orders on initial render and invoices only when tab clicked', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/sales-history')
    })

    expect(mockedApi.get).not.toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')

    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/customers/customer-1/outstanding-invoices')
    })

    // Switch away and back — should not re-fetch
    fireEvent.click(screen.getByRole('tab', { name: /orders/i }))
    fireEvent.click(screen.getByRole('tab', { name: /invoices/i }))

    expect(
      mockedApi.get.mock.calls.filter(([url]) => url === '/customers/customer-1/outstanding-invoices'),
    ).toHaveLength(1)
  })

  it('does not fetch payments until Payments tab is clicked', async () => {
    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /orders/i })).toBeInTheDocument()
    })

    // On initial render the hook is called with skip: true (tabValue !== 2)
    expect(mockUseGetCustomerPaymentsQuery).toHaveBeenCalledWith('customer-1', { skip: true })

    // Now simulate clicking Payments tab — update mock to return data
    mockUseGetCustomerPaymentsQuery.mockReturnValue({ data: [], isLoading: false })

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('No payments found.')).toBeInTheDocument()
    })
  })

  it('renders payment rows when payments data is available', async () => {
    mockUseGetCustomerPaymentsQuery.mockReturnValue({
      data: [
        {
          id: 'pay-1',
          paymentNumber: 'PAY-001',
          paymentDate: '2026-01-15',
          status: 'completed',
          amount: 1500,
        },
      ],
      isLoading: false,
    })

    render(<CustomerWorkspaceCard selectedCustomer={mockCustomer} />)

    fireEvent.click(screen.getByRole('tab', { name: /payments/i }))

    await waitFor(() => {
      expect(screen.getByText('PAY-001')).toBeInTheDocument()
    })

    expect(screen.getByText('completed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend
npx vitest run src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
```

Expected: tests fail because `useGetCustomerPaymentsQuery` is not yet in `salesApi.ts` and the Payments tab doesn't exist yet. (If Tasks 1 & 2 are already done, they should pass — that's fine too.)

- [ ] **Step 3: Run full test file after Tasks 1 & 2 are complete**

```bash
cd frontend
npx vitest run src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
```

Expected output:
```
✓ renders Orders, Invoices, and Payments tabs
✓ lazy-loads orders on initial render and invoices only when tab clicked
✓ does not fetch payments until Payments tab is clicked
✓ renders payment rows when payments data is available

Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx
git commit -m "test(sales): update CustomerWorkspaceCard tests for Payments tab"
```

---

### Task 4: Type-check and close issue

- [ ] **Step 1: Run TypeScript check**

```bash
cd frontend
npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Close the issue via PR**

Create a PR targeting `main` with body `Closes #313`.
