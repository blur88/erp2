# Design Spec: Fiscal Periods UI/UX Refactor

Refactor the Fiscal Periods page to align with the "Gold Standard" UI/UX patterns established in the Sales and Purchase Order pages. This refactor focuses on architectural consistency, simplified navigation, and standardizing shared components.

## Goals
- **Architectural Alignment:** Move selection state to Redux and use `useEntityWorkspace` for logic.
- **Simplified Navigation:** Implement a single-column reference table.
- **Component Standardization:** Use `EntityTable` and `EntityContextHeaderBar`.
- **Keyboard Support:** Enable full arrow-key and shortcut navigation.

## 1. Architecture Changes

### State Management (`accountingSlice.ts`)
- Add `selectedFiscalPeriod` to the `AccountingState`.
- Add `setSelectedFiscalPeriod` reducer to handle selection.
- Add `selectSelectedFiscalPeriod` selector for component consumption.

### Logic Layer (`useFiscalPeriodsWorkspace.ts`)
- Replace bespoke selection/navigation logic with the `useEntityWorkspace` hook.
- Configuration for `useEntityWorkspace`:
    - `entities`: Current list of fiscal periods.
    - `selectedEntity`: From Redux.
    - `selectEntity`: Dispatcher for `setSelectedFiscalPeriod`.
    - `routes`: Create/Edit routes (though Edit remains a dialog, this satisfies the hook).
- Maintain custom methods for domain-specific actions: `handleGenerate`, `handleClose`, and `handleReopen`.

## 2. UI Component Changes

### Main Page (`FiscalPeriodsPage.tsx`)
- Switch from local `useState` for selection to Redux-backed state.
- Bind `GenericListPage` properties (filters, handlers, sort) to the standardized workspace output.

### Table (`FiscalPeriodsTable.tsx`)
- Replace the manual `<Table>` implementation with the shared `EntityTable` component.
- **Columns:**
    - `Reference`: Displays `period.code` (e.g., "2024-01").
- Enable `focusedIndex` and `listRef` for keyboard navigation.

### Context Header (`FiscalPeriodContextHeader.tsx`)
- **Title:** `selected.name` (e.g., "January 2024").
- **Status:** Displayed via `EntityStatusChip`.
- **Primary Actions:** Close/Reopen, Edit, Delete.
- **Sub-header Table:** Show "Date Range" (Start Date - End Date).

### Workspace Card (`FiscalPeriodWorkspaceCard.tsx`)
- Act as the "Details" pane.
- Display:
    - Start Date
    - End Date
    - Fiscal Year
    - Duration (Days)

## 3. User Experience Improvements
- **Single-Column Navigation:** Focus on the period code for quick scanning.
- **Keyboard Shortcuts:**
    - `Up/Down`: Navigate through periods.
    - `Enter`: Trigger the Edit dialog.
    - `Escape`: Clear selection.
    - `/`: Focus search.
- **Loading States:** Standardized `EntityTable` skeleton/loading states.

## 4. Verification Plan
- **Selection:** Verify clicking a row selects the period and updates the detail view.
- **Keyboard:** Verify arrow keys move focus and selection.
- **Persistence:** Verify selection survives list refetching (if standard pattern allows).
- **Actions:** Verify "Close", "Reopen", "Edit", and "Delete" still function correctly from the new Context Header.
- **Generation:** Verify "Generate Periods" dialog still works and refreshes the list.
