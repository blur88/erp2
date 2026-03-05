# Customers Page Improvement Design

**Date:** 2026-03-05
**Status:** Approved

## Overview

Improve the customers page to match standard ERP UX patterns. Key changes: add a dedicated customer profile page with tabs, improve the list page with active/inactive filtering and sortable columns, and remove the cramped view dialog.

## Goals

- Replace the customer view dialog with a dedicated profile page at `/sales/customers/:id`
- Add Active/Inactive filter and sortable columns to the list page
- Surface existing backend endpoints (sales history, outstanding invoices) in the UI
- Keep it simple: no charts, no new backend work

## Section 1: List Page Improvements

**File:** `frontend/src/pages/sales/CustomersPage.tsx`

**Changes:**
1. **Clickable customer name** — navigates to `/sales/customers/:id` (primary CTA). View icon also navigates there.
2. **Remove view dialog** — remove `isViewOpen` state and the Customer Details Dialog block entirely.
3. **Active/Inactive filter** — add a third filter control (All / Active / Inactive) mapping to existing `isActive` query param supported by the backend.
4. **Sortable columns** — clicking column headers (Name, Total Orders, Total Sales, Last Purchase) toggles ASC/DESC using existing `sortBy`/`sortOrder` params already in Redux and backend.

No new backend work required.

## Section 2: Customer Profile Page

**New file:** `frontend/src/pages/sales/CustomerProfilePage.tsx`

**Layout:**
```
[ <- Back to Customers ]                    [ Edit ] [ Delete ]

  John Doe                     [Active] [Business]
  +1 234 567 890
  123 Main St, New York, NY 10001

[ Overview ] [ Orders ] [ Invoices ]

(tab content)
```

**Overview tab:**
- 4 stat cards: Total Orders, Total Sales, Avg Order Value, Last Purchase
- Below cards: Price List, First Purchase, Notes (if any)
- Data from: `GET /customers/:id` + `GET /customers/:id/statistics`

**Orders tab:**
- Table: Order #, Date, Status, Total
- Each row links to `/sales/orders/:orderId`
- Data from: `GET /customers/:id/sales-history` (existing endpoint)
- Fetched lazily on first tab open

**Invoices tab:**
- Table: Invoice #, Date, Amount, Status
- Each row links to the sales order for payment processing
- Data from: `GET /customers/:id/outstanding-invoices` (existing endpoint)
- Fetched lazily on first tab open

**Edit/Delete:**
- Edit: opens existing create/edit form dialog, refreshes data on close
- Delete: uses `ConfirmationDialog`, redirects to `/sales/customers` on success with same detailed error handling as list page

## Section 3: Routing & Navigation

**Router change** — add to `frontend/src/router.tsx` after the `/sales/customers` route:
```tsx
{ path: '/sales/customers/:id', element: <CustomerProfilePage /> }
```

**Navigation flow:**
- List: click name or view icon → `navigate('/sales/customers/:id')`
- Profile: Back button → `navigate('/sales/customers')`
- Profile: delete success → `navigate('/sales/customers')`
- Profile: invoice row → `navigate('/sales/orders/:orderId')`

No sidebar changes needed.

## Section 4: Error Handling & Edge Cases

- **404 on profile load** — inline error message + "Back to Customers" button
- **Loading state** — skeleton cards while fetching
- **Delete with dependencies** — same detailed error message as list page
- **Empty Orders tab** — "No orders found" empty state
- **Empty Invoices tab** — "No outstanding invoices" empty state
- **Sortable columns** — clicking active sort column toggles ASC/DESC; state persists in Redux filters

## Section 5: Testing

**New test file:** `frontend/src/pages/sales/CustomerProfilePage.test.tsx`
- Renders overview tab with mocked customer data
- Tabs switch correctly
- Back button navigates to `/sales/customers`
- Delete redirects to list after success

**Existing test file:** `frontend/src/__tests__/router.test.tsx` (or `CustomersPage.test.tsx` if it exists)
- Active/inactive filter dispatches correct Redux action
- Sortable column headers toggle sort order
- Clicking customer name navigates to profile URL

## Files to Change

| File | Change |
|------|--------|
| `frontend/src/router.tsx` | Add `/sales/customers/:id` route |
| `frontend/src/pages/sales/CustomersPage.tsx` | Add filters, sortable columns, remove view dialog, navigate on name click |
| `frontend/src/pages/sales/CustomerProfilePage.tsx` | New file |
| `frontend/src/pages/sales/CustomerProfilePage.test.tsx` | New test file |

## What We Are NOT Doing

- No email field (entity change not needed)
- No charts or purchase trend visualizations
- No export to CSV
- No new backend endpoints
- No sidebar navigation changes
