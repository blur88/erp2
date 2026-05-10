# Design Doc: Convert COA Chip to Plain Colored Text

Convert the status and account type displays in the Chart of Accounts (COA) from Material UI `Chip` components to plain colored text to align with existing patterns in the codebase (e.g., the Customers page).

## Problem Statement
The current COA detail and workspace views use `Chip` components for "Status" and "Account Type". The user prefers a cleaner "plain text" look while retaining the categorical colors for quick scanning.

## Proposed Changes

### 1. `ChartOfAccountContextHeader.tsx`
- Replace `Chip` for **Account Type** with a `Typography` or `Box` component.
- Color for Account Type will be derived from the existing `ACCOUNT_TYPE_COLORS` mapping.
- Replace `Chip` for **Status** with plain text colored `success.main` for Active and `text.disabled` for Inactive, matching `CustomerContextHeader.tsx`.

### 2. `ChartOfAccountWorkspaceCard.tsx`
- Replace `Chip` for **Account Type** in the Sub-Accounts table with plain text.
- Use the same coloring logic as the Context Header.

### 3. `accountTypeColors.ts` (if needed)
- Ensure the color mapping is optimized for text readability (e.g., using `main` theme variants).

## Implementation Details

### Context Header Update
```tsx
// Pattern for Status
<TableCell sx={{ ...valueCellSx, color: selected.isActive ? 'success.main' : 'text.disabled' }}>
  {selected.isActive ? 'Active' : 'Inactive'}
</TableCell>

// Pattern for Account Type
<TableCell sx={{ ...valueCellSx, color: `${ACCOUNT_TYPE_COLORS[selected.type]}.main` }}>
  {selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
</TableCell>
```

### Workspace Card Update
The Sub-Accounts table will follow the same pattern for the "Type" column.

## Verification Plan

### Manual Verification
- Navigate to Accounting > Chart of Accounts.
- Select an account.
- Verify "Account Type" and "Status" in the detail panel are plain text with correct colors.
- Verify "Account Type" in the Sub-Accounts table (if the selected account is a parent) is plain text with correct colors.

### Automated Tests
- Run existing tests for `ChartOfAccountsPage` and `ChartOfAccountContextHeader` to ensure no regressions.
- Update snapshots or specific text-content assertions if they were looking for `MuiChip` classes.
