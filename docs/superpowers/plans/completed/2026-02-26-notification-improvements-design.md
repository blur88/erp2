# Notification Improvements Design

## Problem

1. Notification text is hard to copy — no dedicated copy mechanism, users must manually select text before the snackbar auto-dismisses.
2. Not all pages show notifications for user actions — some CRUD operations silently succeed or fail.

## Solution: Approach 1 — Copy Button + Audit All Pages

### Part 1: Copy Button on Snackbar

**Single-file change** in `frontend/src/hooks/useNotification.tsx`.

- Add a `ContentCopy` MUI icon button inside the `<Alert>` component, next to the close button
- On click: copy title + message to clipboard via `navigator.clipboard.writeText()`
- Visual feedback: swap icon to `Check` for ~1.5 seconds after copying
- Styling: small, subtle, does not compete with the close button
- Applies automatically to all 302+ existing notification call sites

### Part 2: Add Missing Notifications

Add `showSuccess` / `showError` to all pages with user actions that currently lack feedback. Follow existing convention:
- Success: `showSuccess('X done successfully')`
- Error: `showError(err?.response?.data?.message || 'Failed to X')`

**P1 — Zero feedback:**
- `SettlementsPage.tsx` — create/cancel settlement
- `InvoicesPage.tsx` — imports hook but never uses it
- `VendorPaymentsPage.tsx` — no hook, no notifications
- `GoodsReceivedPage.tsx` — no hook, no notifications

**P2 — Partial coverage:**
- `StockAdjustmentsPage.tsx` — missing delete/restore
- `PaymentsPage.tsx` — missing delete payment
- `ChartOfAccountsPage.tsx` — missing create/update/delete account
- `JournalEntriesPage.tsx` — missing delete
- `ExpensesPage.tsx` — missing delete/toggle status
- `OwnerEquityPage.tsx` — sparse coverage
- `AccountMappingsPage.tsx` — missing save/update

**P3 — Settings pages:**
- `PriceListsPage.tsx` — missing create/delete
- `PriceListDetailsPage.tsx` — verify coverage
- `PriceCostingPage.tsx` — missing save/update
- `DocumentNumbersPage.tsx` — missing save
- `RegionalSettingsPage.tsx` — missing save
- `PrintSettings/GeneralTab.tsx` — missing save

**Excluded:** Read-only report/dashboard pages (no user actions).

## Non-Goals

- No changes to notification timing/duration
- No notification system architecture changes
- No changes to the NotificationPanel history component
- No enrichment of existing notification message strings
