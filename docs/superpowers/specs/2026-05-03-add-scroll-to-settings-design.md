# Design: Add scroll function to Settings and Audit Log pages

## Problem Statement
Several settings and audit log pages in the ERP system do not have a scrollable container. This leads to poor user experience on smaller screens or when the content (like tables or long forms) exceeds the viewport height.

## Proposed Solution
Wrap the target pages in the `GenericOverviewPage` component. This component provides a `Box` with `overflow: 'auto'` and `flex: 1`, which is the established pattern in the `DashboardPage`.

## Target Pages
- Company Settings (`CompanySettingsPage.tsx`)
- Inventory Costing Settings (`InventoryCostingPage.tsx`)
- Stock Level Settings (`StockLevelSettingsPage.tsx`)
- Regional Settings (`RegionalSettingsPage.tsx`)
- Price Lists (`PriceListsPage.tsx`)
- Payment Methods (`PaymentMethodsPage.tsx`)
- Print Settings (`PrintSettingsPage.tsx`)
- Document Numbers Settings (`DocumentNumbersPage.tsx`)
- User Management (`UserManagementPage.tsx`)
- Roles & Permissions (`RoleManagementPage.tsx`)
- Security Settings (`SecuritySettingsPage.tsx`)
- Backup & Restore Management (`BackupManagement.tsx`)
- Audit Logs (`AuditLogsPage.tsx`)

## Implementation Details
1. Import `GenericOverviewPage` from `@/components/common/GenericOverviewPage`.
2. Wrap the entire return content of each page component with `<GenericOverviewPage>`.
3. Ensure `PageHeader` is inside the wrapper.

## Verification Plan
- Manually verify that each page is scrollable when content overflows.
- Ensure layout remains consistent with the Dashboard page.
