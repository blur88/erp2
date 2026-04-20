# COA Page Refactor — Design Spec
**Issue:** #399  
**Date:** 2026-04-21

## Goal

Reduce visual crowding in the Chart of Accounts page and improve the master-detail workflow by simplifying the list and making the detail panel context-aware.

## 1. Master List — ChartOfAccountsTable

**Change:** Remove the Type and Status chip columns. Keep only Code and Name.

**Rationale:** Type and status information is redundant in the list — it's better surfaced in the detail panel where space allows proper display. A two-column list scans faster.

**File:** `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`

- Remove `type` and `status` column definitions from `COLUMNS`
- No other changes to this component

## 2. Context Header — ChartOfAccountContextHeader

**Change:** Replace the single-line header bar with a 2-column grid layout.

**File:** `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`

**Column 1 (left):**
- Code
- Name
- Account Type (Chip, colored by type)
- Parent Account (name, or "—" if root)
- Cash Equivalent (Yes / No)

**Column 2 (right):**
- Current Balance (formatted currency)
- Status Chip (Active / Inactive)
- Last Updated (formatted date)
- Created Date (formatted date)

**Actions:** Edit and Delete buttons remain top-right, unchanged.

**Empty state:** Unchanged — "Select an account to view details" centered in the panel.

## 3. Workspace Card — ChartOfAccountWorkspaceCard

**Change:** Replace static key-value table with context-aware content based on whether the selected account has children.

**File:** `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`

### Header Account (children.length > 0)

Show a **Sub-Accounts** table with columns: Code, Name, Type chip, Balance.  
Data sourced from `selected.children` (already in hierarchy data — no extra API call).  
Empty state: "No sub-accounts."

### Leaf Account (no children)

Show a **Recent Activity** table with columns: Date, Reference, Description, Debit, Credit, Balance.  
Data fetched from the new `getChartOfAccountRecentActivity` RTK Query endpoint (limit 10).  
Loading state: skeleton rows.  
Empty state: "No recent activity."

## 4. Backend — New Endpoint

**`GET /accounting/chart-of-accounts/:id/recent-activity`**

Query param: `limit` (optional, default 10, max 50)

**Controller:** `ChartOfAccountsController` (`chart-of-accounts.controller.ts`)  
Route must be declared before `:id` — place it as `@Get(':id/recent-activity')` which NestJS handles correctly since the suffix disambiguates.

**Service:** `ChartOfAccountsService` (`chart-of-accounts.service.ts`)  
New method `getRecentActivity(id, limit)`:
- Verify account exists (throw 404 if not)
- Query `JournalEntryLine` joined to `JournalEntry`
- Filter: `journalEntry.status = POSTED`, `jel.accountId = id`
- Order: `journalEntry.date DESC`, then `jel.id DESC` (stable sort)
- Limit to N rows
- Calculate running balance: use `account.currentBalance` as the end balance and walk backwards (debit/credit sign depends on account type normal balance)

**Response DTO:** `RecentActivityItemDto`
```
{
  date: string           // ISO date
  reference: string      // journal entry reference number
  description: string    // journal entry description
  debit: number | null
  credit: number | null
  balance: number        // running balance after this entry
}
```

**Frontend:** New RTK Query endpoint `getChartOfAccountRecentActivity` in `accountingApi.ts`:
```
query: ({ id, limit }) => ({ url: `/accounting/chart-of-accounts/${id}/recent-activity`, params: { limit } })
```
Tag: `{ type: 'ChartOfAccount', id }` — auto-invalidated on account mutations.

## 5. Files Changed

| File | Change |
|------|--------|
| `frontend/.../ChartOfAccountsTable.tsx` | Remove type + status columns |
| `frontend/.../ChartOfAccountContextHeader.tsx` | Rewrite to 2-col grid |
| `frontend/.../ChartOfAccountWorkspaceCard.tsx` | Context-aware sub-accounts or recent activity |
| `frontend/src/store/api/accountingApi.ts` | Add `getChartOfAccountRecentActivity` query |
| `backend/.../chart-of-accounts.controller.ts` | Add `GET :id/recent-activity` route |
| `backend/.../chart-of-accounts.service.ts` | Add `getRecentActivity` method |
| `backend/.../chart-of-account.dto.ts` | Add `RecentActivityItemDto` |

## 6. Out of Scope

- No changes to the filter bar
- No changes to the form dialog or delete dialog
- No changes to the accounts seeding or restore flows
- No changes to the `currentBalance` calculation (already computed in the hierarchy response)
