# Owner's Equity & Expense Management Design

**Date**: 2026-02-16
**Status**: Approved

## Overview

Two new standalone modules within the accounting system:
1. **Owner's Equity Transactions** -- capital injections and owner drawings
2. **Expense Management** -- simple expense recording with auto-posting

Both auto-post journal entries using existing payment method account mappings.

---

## Module 1: Owner's Equity Transactions

### Entity: `OwnerEquityTransaction`

Table: `owner_equity_transactions`

| Field | Type | Notes |
|---|---|---|
| id | UUID | BaseEntity PK |
| transactionDate | date | Transaction date |
| type | enum | `CAPITAL_INJECTION`, `OWNER_DRAWING` |
| amount | decimal(12,4) | Always positive |
| paymentMethodId | UUID FK | PaymentMethod entity |
| description | text | Free text |
| referenceNumber | varchar unique | Auto: `EQ-YYYY-NNN` |
| status | enum | `DRAFT`, `POSTED` |
| journalEntryId | UUID FK nullable | Auto-posted journal entry |

### Auto-Posting

**Capital Injection** (owner puts money in):
- DR: Payment Method Account (via `payment_<code>` mapping)
- CR: Owner's Equity (via `equity_owners_equity` mapping)

**Owner Drawing** (owner takes money out):
- DR: Drawings (via `equity_drawings` mapping)
- CR: Payment Method Account (via `payment_<code>` mapping)

### Account Mappings (new)
- `equity_owners_equity` -> Owner's Equity (3000)
- `equity_drawings` -> Drawings (3200)

### API Endpoints
- `GET /api/accounting/owner-equity` -- list with filters
- `POST /api/accounting/owner-equity` -- create
- `GET /api/accounting/owner-equity/:id` -- get by ID
- `PATCH /api/accounting/owner-equity/:id` -- update (draft only)
- `DELETE /api/accounting/owner-equity/:id` -- soft delete (draft only)
- `POST /api/accounting/owner-equity/:id/post` -- post and auto-create journal entry
- `POST /api/accounting/owner-equity/bulk-post` -- bulk post
- `POST /api/accounting/owner-equity/bulk-delete` -- bulk delete

### Frontend: `/accounting/owner-equity`
- List view with filters (type, date range, status)
- Create/edit dialog: type, date, amount, payment method, description
- Bulk post/delete
- Keyboard shortcuts (Ctrl+F, N, Ctrl+R, Escape)

---

## Module 2: Expense Management

### Entity: `Expense`

Table: `expenses`

| Field | Type | Notes |
|---|---|---|
| id | UUID | BaseEntity PK |
| expenseDate | date | Expense date |
| expenseAccountId | UUID FK | COA expense account (5000-5950) |
| amount | decimal(12,4) | Always positive |
| paymentMethodId | UUID FK | PaymentMethod entity |
| description | text | What the expense is for |
| referenceNumber | varchar unique | Auto: `EXP-YYYY-NNN` |
| vendor | varchar nullable | Optional payee name (free text) |
| status | enum | `DRAFT`, `POSTED` |
| journalEntryId | UUID FK nullable | Auto-posted journal entry |

### Auto-Posting

**Expense recorded**:
- DR: Selected Expense Account (user picks from EXPENSE-type COA accounts)
- CR: Payment Method Account (via `payment_<code>` mapping)

### API Endpoints
- `GET /api/accounting/expenses` -- list with filters
- `POST /api/accounting/expenses` -- create
- `GET /api/accounting/expenses/:id` -- get by ID
- `PATCH /api/accounting/expenses/:id` -- update (draft only)
- `DELETE /api/accounting/expenses/:id` -- soft delete (draft only)
- `POST /api/accounting/expenses/:id/post` -- post and auto-create journal entry
- `POST /api/accounting/expenses/bulk-post` -- bulk post
- `POST /api/accounting/expenses/bulk-delete` -- bulk delete

### Frontend: `/accounting/expenses`
- List view with filters (expense account, payment method, date range, status)
- Create/edit dialog: date, expense account dropdown (EXPENSE type only), amount, payment method, vendor, description
- Summary totals at top
- Bulk post/delete
- Keyboard shortcuts (Ctrl+F, N, Ctrl+R, Escape)

---

## Integration

### Source Types (for journal entry traceability)
- `owner_equity_transaction` -- new
- `expense` -- new

### RBAC
- View: All authenticated users
- Create/Edit/Post: Admin, Manager
- Delete: Admin only

### Sidebar Placement
Under **Accounting** group, after "Settlements":
- Owner's Equity -> `/accounting/owner-equity`
- Expenses -> `/accounting/expenses`

### Fiscal Period
- Transactions must fall within an OPEN fiscal period
- Validated during posting

### Testing
- Backend unit tests for both services
- Frontend component tests for both pages
