# Design Spec: Expenses Page UI/UX Refactor

## 1. Overview
The Expenses page currently uses a wide multi-column table layout and manages creation/editing through a dialog embedded directly in the main page component. To align with the project's "Gold Standard" (Sales Orders, Purchase Orders, and Journal Entries), we will refactor the Expenses page to use a Master-Detail layout.

## 2. Goals
- Refactor the Expenses page to use a Master-Detail layout (narrow list on the left, rich details on the right).
- Extract the New/Edit Expense form into a dedicated `ExpenseFormDialog` component.
- Polishing the UI components (`ExpenseContextHeader`, `ExpenseWorkspaceCard`, `ExpensesTable`) to match the quality and layout of the gold standard pages.
- Standardize workspace logic and keyboard navigation.

## 3. Architecture & Components

### 3.1 `ExpensesPage.tsx`
- **Main Container**: Continues to use `GenericListPage`.
- **Primary Action**: "New Expense" will trigger the `ExpenseFormDialog`.
- **Layout Slots**:
    - `listSlot`: Refactored `ExpensesTable` (narrow Master view).
    - `headerSlot`: Revamped `ExpenseContextHeader` (Detail header).
    - `workspaceSlot`: `ExpenseWorkspaceCard` (Detail content).
    - `dialogs`: `ExpensesDialogs` (for Post/Delete) and the new `ExpenseFormDialog`.

### 3.2 `ExpensesTable.tsx` (Master View)
- Refactor to use `EntityTable` from `@/components/common/EntityTable`.
- Narrow layout showing only the Reference Number and potentially a small status indicator.
- Support for focused index and keyboard navigation.

### 3.3 `ExpenseContextHeader.tsx` (Detail Header)
- Polished layout matching `OrderContextHeader`.
- **Top Bar**: Title (Reference Number), Status Chip, and Actions (Edit, Post, Delete).
- **Grid Section**: Two-column layout using MUI Tables.
    - **Column 1 (Info)**: Date, Vendor, Account.
    - **Column 2 (Payment/Total)**: Amount, Payment Method, Status details.
- **Journal Entry Refs**: Show links to related Journal Entries if the expense is posted.

### 3.4 `ExpenseWorkspaceCard.tsx` (Detail Content)
- Displays additional details like Description.
- If the expense is posted, show more transaction metadata.

### 3.5 `ExpenseFormDialog.tsx` (New Component)
- Extracted from `ExpensesPage.tsx`.
- Handles both New and Edit modes.
- Manages form state internally (or via props) and calls API mutations.

### 3.6 `useExpensesWorkspace.ts`
- Updated to support `focusedIndex` and keyboard navigation.
- Standardized selection logic (`handleSelect`, `handleToggleCheck`).
- Improved loading and error handling integration.

## 4. User Experience (UX) Improvements
- **Master-Detail Flow**: Selecting an expense in the left list immediately updates the right detail view.
- **Keyboard Navigation**: Arrow keys to navigate the list, Enter to select (if not already selected).
- **Consistency**: Buttons, spacing, and typography will strictly follow `TABLE_STYLES` and patterns from `OrderContextHeader`.

## 5. Technical Details
- **Tech Stack**: React (TypeScript), MUI, RTK Query.
- **Sorting**: Ensure the list supports sorting via `GenericListPage` sort props.
- **Persistence**: Selection state should ideally be preserved across refetches.

## 6. Testing Strategy
- **Unit Tests**:
    - `ExpenseFormDialog.test.tsx`: Test form validation, submission, and initial values.
    - `ExpenseContextHeader.test.tsx`: Test action buttons and data display.
- **Integration Tests**:
    - `ExpensesPage.test.tsx`: Update to verify Master-Detail interactions and selection logic.

## 7. Success Criteria
- Expenses page layout matches `Sales Orders` and `Purchase Orders`.
- New/Edit functionality remains functional and feels more polished.
- Code is cleaner due to component extraction.
