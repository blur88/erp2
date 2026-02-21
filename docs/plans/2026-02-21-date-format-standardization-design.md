# Design: Standardize Frontend Date Display to DD/MM/YYYY

**Date:** 2026-02-21
**Status:** Approved
**Scope:** Frontend only — no backend, database, or API changes

## Problem

The frontend displays dates inconsistently across the application:
- Core utilities use `en-MY` locale → outputs like `"Feb 20, 2026"`
- Accounting/inventory report pages use `en-US` locale directly
- ~48 files bypass the shared `formatDate` utility and call `toLocaleDateString` inline
- Mix of locales (`en-MY`, `en-US`) produces inconsistent output

## Goal

All **displayed/read-only** dates throughout the frontend show `DD/MM/YYYY` format (e.g., `20/02/2026`). Dates with times show `DD/MM/YYYY HH:mm` (e.g., `20/02/2026 14:30`).

## Out of Scope

- HTML `<input type="date">` field values — must remain `YYYY-MM-DD` (browser requirement)
- `getCurrentDate()` and `getDateDaysAgo()` utilities — already return `YYYY-MM-DD` for form inputs, correct as-is
- API request/response payloads — ISO strings for backend communication unaffected
- Chart.js date axis labels — managed by `chartjs-adapter-date-fns` independently

## Approach: Update Central Formatters + Fix Bypass Files

### Phase 1 — Update `/frontend/src/utils/formatters.ts`

Change `formatDate` and `formatDateTime` to use `en-GB` locale with `2-digit` day/month:

```typescript
// formatDate — display-only dates
export const formatDate = (date: Date | string | null | undefined): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (!dateObj || isNaN(dateObj.getTime())) return '-'
  return dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  // Output: "20/02/2026"
}

// formatDateTime — display-only dates with time
export const formatDateTime = (date: Date | string | null | undefined): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  if (!dateObj || isNaN(dateObj.getTime())) return '-'
  const datePart = dateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const timePart = dateObj.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
  return `${datePart} ${timePart}`
  // Output: "20/02/2026 14:30"
}
```

This automatically fixes all 41 files (196 occurrences) that already import `formatDate`/`formatDateTime`.

### Phase 2 — Fix Bypass Files (~48 files)

Files that call `toLocaleDateString` directly instead of using shared utilities. Update them to import and use `formatDate`/`formatDateTime`.

Key clusters:

**Accounting reports (5 files):**
- `src/pages/accounting/reports/TrialBalancePage.tsx`
- `src/pages/accounting/reports/BalanceSheetPage.tsx`
- `src/pages/accounting/reports/GeneralLedgerPage.tsx`
- `src/pages/accounting/reports/ProfitAndLossPage.tsx`
- `src/pages/accounting/reports/AccountActivityPage.tsx`

**Purchasing reports (3 files):**
- `src/pages/purchasing/VendorProductListReport.tsx`
- `src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `src/pages/purchasing/PurchaseOrderStatusReport.tsx`

**Export utilities:**
- `src/utils/exportUtils.ts` — uses `en-MY` directly, update to use `formatDate`

**date-fns usage:**
- `src/pages/purchasing/PurchasingPage.tsx` — uses `date-fns format()`, replace with `formatDate`

**Remaining inline callers:**
- Various pages across inventory, sales, settings, and other modules

## Testing

- Visual inspection of tables, report pages, invoice/PO detail pages, and dashboard
- Verify date picker inputs (`<input type="date">`) still work correctly after changes
- No existing unit tests need updating (date display is not currently unit-tested)

## Success Criteria

- All read-only date displays show `DD/MM/YYYY` (e.g., `20/02/2026`)
- All date-time displays show `DD/MM/YYYY HH:mm` (e.g., `20/02/2026 14:30`)
- Date picker inputs (`<input type="date">`) remain functional
- No console errors related to date formatting
