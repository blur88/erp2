# Design Spec: Account Mappings Page Refactor

## 1. Goal
Refactor the Account Mappings page UI and UX to follow the "gold standard" established by the Sales Order, Purchase Order, and Journal Entries pages. This includes architectural alignment (Redux-managed selection), UX improvements (keyboard navigation), and visual modernization (Context Header and Table layouts).

## 2. Architecture Changes

### 2.1 State Management
- **Redux Slice (`frontend/src/store/slices/accountingSlice.ts`):**
    - Add `selectedAccountMapping: AccountMapping | null` to the state.
    - Export `setSelectedAccountMapping` action.
    - Export `selectSelectedAccountMapping` selector.
- **Hook Migration (`frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts`):**
    - Transition to using `useEntityWorkspace` from `@/hooks/useEntityWorkspace`.
    - Handle Redux dispatching for selection within the hook.

### 2.2 Navigation & Interaction
- **Keyboard Shortcuts:** Implement standard navigation shortcuts via `useEntityWorkspace`:
    - `ArrowUp` / `ArrowDown`: Navigate through the mapping list.
    - `Enter`: Open the edit dialog for the selected mapping.
    - `Escape`: Clear the current selection.

## 3. UI Components Redesign

### 3.1 Account Mappings Table
- **Layout:** Switch to a one-column minimalist layout using `EntityTable`.
- **Columns:**
    - `Mapping Type`: Displays the mapping label (e.g., "Sales Revenue").
- **Purpose:** Follows the "Workspace" pattern where the list serves as a navigation sidebar, while details are shown on the right.

### 3.2 Account Mapping Context Header
- **Layout:** Transition from a simple header bar to a two-column `Grid/Table` layout (similar to `OrderContextHeader`).
- **Columns:**
    - **Mapping Info:** Name, Category, and Description.
    - **Account Details:** Mapped Account Code, Name, and Account Type.
- **Actions:** Standardized buttons for `Edit` and `Clear` (using `AppButton`).

### 3.3 Account Mapping Workspace Card
- **Layout:** Maintain the current simple details view (Mapped Account, Type, Description).
- **Styling:** Ensure spacing and typography match the minimalist aesthetic of the `OrderWorkspaceCard`.

### 3.4 Validation Alerts
- **Layout:** Continue using standard MUI `Alert` components at the top of the page for "Configuration Incomplete" messages, but ensure they are consistently styled with the rest of the app.

## 4. Page Layout (`AccountMappingsPage.tsx`)
- Utilize `GenericListPage` properties consistently:
    - `primaryAction` for editing.
    - `secondaryAction` for refreshing data.
    - Standardized filter bar configuration.

## 5. Success Criteria
- The Account Mappings page is visually indistinguishable in structure from the Sales/Purchasing management pages.
- Keyboard navigation works seamlessly for selecting and editing mappings.
- Selection state is preserved correctly in Redux.
