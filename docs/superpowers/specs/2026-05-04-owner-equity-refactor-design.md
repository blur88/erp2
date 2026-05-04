# Design Spec: Owner Equity Page UI/UX Refactor

## 1. Overview
Refactor the Owner Equity page to align with the "Gold Standard" established by the Sales Order, Purchase Order, and Journal Entries pages. This includes adopting standardized components for layout, state management, and keyboard-driven navigation.

## 2. Motivation
The current Owner Equity page uses a custom implementation that lacks the polished UX (keyboard shortcuts, scannability) found in newer modules. Standardizing this page will improve user productivity and simplify future maintenance.

## 3. Design

### 3.1 Architecture & State Management
*   **Standardized Workspace Hook:** Replace `useOwnerEquityWorkspace` with `useEntityWorkspace`.
    *   Integrate standard selection, focus, and highlight logic.
    *   Enable keyboard shortcuts: `ArrowUp/Down` for navigation, `Enter` for edit/view, `Esc` to clear selection.
*   **Linked Records:** Implement `useJournalEntryRefs` to fetch and display linked Journal Entries dynamically in the header actions.

### 3.2 UI Components

#### OwnerEquityTable (List View)
*   **Simplified List:** Convert to use the `EntityTable` wrapper.
*   **Columns:** Show **Reference Number** only, maximizing scannability in the left panel.
*   **UX:** Support `focusedIndex` for keyboard selection.

#### OwnerEquityContextHeader (Middle Section)
*   **Standard Header Bar:** Use `EntityContextHeaderBar` for the title and actions.
*   **Two-Column Grid Layout:** Replace the current simple table with a `Grid` layout:
    *   **Left Column (Transaction Information):**
        *   Date
        *   Type (Capital Injection / Owner Drawing)
        *   Description (Full text)
    *   **Right Column (Financials & Links):**
        *   Amount (Currency formatted)
        *   Payment Method
        *   Journal Entry Link (using standard ref pattern)
*   **Actions:** Move buttons (Edit, Post, Delete, Reverse) into the header bar's `actions` slot.

#### OwnerEquityWorkspaceCard (Right Section)
*   Refine to display supplementary metadata (Audit info, full description) in a style consistent with `JournalEntryWorkspaceCard`.

### 3.3 Data Flow
*   `OwnerEquityPage` orchestrates `useFilterBar` and `useEntityWorkspace`.
*   Dialogs remain in `OwnerEquityDialogs`, controlled by the standardized workspace state.

## 4. Verification Plan

### 4.1 Automated Tests
*   Update `OwnerEquityPage.test.tsx` to verify keyboard navigation.
*   Update component tests for `OwnerEquityTable` and `OwnerEquityContextHeader`.

### 4.2 Manual Verification
*   Verify that clicking a transaction updates the header and workspace card.
*   Verify that keyboard arrows navigate the list.
*   Verify that the "Journal Entry" link correctly navigates to the accounting module.
