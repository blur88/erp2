---
title: Issue #313 — Add Payments Tab to CustomerWorkspaceCard
date: 2026-04-08
issue: https://github.com/blur88/erp2/issues/313
---

# Issue #313 — Add Payments Tab to CustomerWorkspaceCard

## Objective

Add a **Payments** tab to `CustomerWorkspaceCard.tsx`, mirroring the existing Payments tab in `SupplierWorkspaceCard.tsx`.

## Scope

Frontend-only change. No backend work required — the endpoint already exists.

## Architecture

### Files changed

| File | Change |
|------|--------|
| `frontend/src/store/api/salesApi.ts` | Add `getCustomerPayments` RTK Query endpoint |
| `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx` | Add Payments tab (index 2) |
| `frontend/src/pages/sales/components/__tests__/CustomerWorkspaceCard.test.tsx` | Update tab count assertion; add lazy-load test for Payments tab |

### API endpoint

```
GET /payments/customer/:customerId
```

Response: `PaymentSummaryDto[]`

```ts
{
  id: string
  paymentNumber: string
  paymentDate: Date
  amount: number
  paymentMethodId: string
  status: PaymentStatus  // 'completed' | 'pending' | 'refunded' | ...
}
```

### RTK Query endpoint

Add to `salesApi.ts`:

```ts
getCustomerPayments: builder.query<{ data: PaymentSummaryDto[]; total: number }, string>({
  query: (id) => ({ url: `/payments/customer/${id}` }),
  providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
})
```

### CustomerWorkspaceCard changes

- Import `Payment as PaymentIcon` from `@mui/icons-material`
- Import `useGetCustomerPaymentsQuery` from `salesApi`
- Add RTK Query call with `skip: !supplierId || tabValue !== 2`
- Add tab at index 2: icon `<PaymentIcon />`, label "Payments"
- Add `TabPanel` at index 2 with loading / empty / table states

### Payments table columns

| Column | Field | Align |
|--------|-------|-------|
| Payment # | `paymentNumber` | left |
| Date | `paymentDate` | left |
| Status | `status` | left |
| Amount | `amount` | right |

No row click navigation (no payment detail page).

## Test changes

- Update `toHaveLength(2)` → `toHaveLength(3)` in existing tab count assertion
- Add test: Payments tab not fetched on initial load; fetched once after clicking the tab; not re-fetched on second click

## Design reference

Mirrors `SupplierWorkspaceCard.tsx` Payments tab exactly.
