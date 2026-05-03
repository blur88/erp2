# Design: Scroll Wrapper for Settings & Audit Log Pages (Issue #512)

## Overview

13 pages in the settings and audit-log sections lack a scrollable container, causing content to be cut off on smaller screens or when lists grow. The fix wraps each page in `GenericOverviewPage`, matching the pattern already used by `DashboardPage`.

## Reference Implementation

`frontend/src/pages/dashboard/DashboardPage.tsx` wraps its entire return in `<GenericOverviewPage>`, which provides:

```tsx
<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', mr: { xs: -2, sm: -3 }, pr: { xs: 2, sm: 3 } }}>
  {children}
</Box>
```

## Changes Per File

### 12 Pages — Fragment swap

Replace root `<>` with `<GenericOverviewPage>` and add the import.

| File | Current root |
|------|-------------|
| `frontend/src/pages/settings/CompanySettingsPage.tsx` | `<>` |
| `frontend/src/pages/settings/InventoryCostingPage.tsx` | `<>` |
| `frontend/src/pages/settings/StockLevelSettingsPage.tsx` | `<>` |
| `frontend/src/pages/settings/RegionalSettingsPage.tsx` | `<>` |
| `frontend/src/pages/settings/PriceListsPage.tsx` | `<>` |
| `frontend/src/pages/settings/PaymentMethodsPage.tsx` | `<>` |
| `frontend/src/pages/settings/PrintSettingsPage.tsx` | `<>` |
| `frontend/src/pages/settings/DocumentNumbersPage.tsx` | `<>` |
| `frontend/src/pages/settings/UserManagementPage.tsx` | `<>` |
| `frontend/src/pages/settings/RoleManagementPage.tsx` | `<>` |
| `frontend/src/pages/settings/SecuritySettingsPage.tsx` | `<>` |
| `frontend/src/pages/settings/BackupManagement.tsx` | `<>` |

### 1 Page — Root Box swap

`frontend/src/pages/audit-logs/AuditLogsPage.tsx` currently has:

```tsx
<Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
  {/* sidebar */}
  {/* main content column */}
</Box>
```

Replace the outer `Box` with `<GenericOverviewPage>`. Drop `height: '100%'` — `GenericOverviewPage` handles flex sizing via `flex: 1, minHeight: 0`. The inner horizontal flex row (sidebar + content) becomes a direct child and scrolls with the page.

## What Does Not Change

- No backend changes
- No routing changes
- No test changes — existing tests mock at the component level and are unaffected by adding a wrapper

## Implementation Steps

For each of the 13 files:
1. Add `import GenericOverviewPage from '@/components/common/GenericOverviewPage'`
2. Replace root element with `<GenericOverviewPage>` / `</GenericOverviewPage>`
3. For `AuditLogsPage.tsx` specifically: remove the `height: '100%'` and `display: 'flex'` from the outer Box being replaced
