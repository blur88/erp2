# Dark Mode Standardization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove light mode entirely from the frontend, standardize on the existing dark theme, and eliminate all theme toggle logic and conditional `palette.mode` styling.

**Architecture:** Delete `themeSlice.ts` and `lightTheme`/`createAppTheme` from `theme.ts`, then simplify the three consumers (`ThemeWrapper`, `RootLayout`, `MainLayout`) to use the static dark theme. Finally, perform a mechanical find-and-replace across 26 report/page files to strip `palette.mode` ternaries, keeping the dark-branch value.

**Tech Stack:** React 19, MUI v7, Redux Toolkit + redux-persist, Vitest

---

## Chunk 1: Core Infrastructure (theme.ts, themeSlice, store)

### Task 1: Clean up `theme.ts`

**Files:**
- Modify: `frontend/src/styles/theme.ts`

- [ ] **Step 1: Delete `lightTheme` and `createAppTheme`**

  In `frontend/src/styles/theme.ts`, delete the entire `lightTheme` block (the `const lightTheme = createTheme({...})` block), delete `createAppTheme`, and delete the `const theme = darkTheme` alias.

  Update the export statement from:
  ```ts
  export { lightTheme, darkTheme }
  ```
  to:
  ```ts
  export { darkTheme }
  ```

  Keep `colors`, `baseThemeOptions`, and `darkTheme` exactly as-is.

- [ ] **Step 2: Verify TypeScript**

  Run: `cd frontend && npm run type-check`
  Expected: errors about `lightTheme` being referenced in `ThemeWrapper.tsx` (which imports `{ lightTheme, darkTheme }`). These will be fixed in Task 3. No other new errors.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/styles/theme.ts
  git commit -m "refactor: remove lightTheme and createAppTheme from theme.ts"
  ```

---

### Task 2: Delete `themeSlice.ts` and update the Redux store

**Files:**
- Delete: `frontend/src/store/slices/themeSlice.ts`
- Modify: `frontend/src/store/index.ts`

- [ ] **Step 1: Delete the slice file**

  ```bash
  rm frontend/src/store/slices/themeSlice.ts
  ```

- [ ] **Step 2: Update `store/index.ts`**

  In `frontend/src/store/index.ts`, make these changes:

  1. Remove the import line:
     ```ts
     import themeSlice from './slices/themeSlice'
     ```

  2. Remove `theme: themeSlice,` from `rootReducer`.

  3. In `persistConfig.whitelist`, remove `'theme'`:
     ```ts
     whitelist: ['auth', 'notifications'],
     ```

  4. Bump the persist version from `5` to `6`:
     ```ts
     version: 6,
     ```

  5. Inside the `migrate` function, remove only the `theme:` property from the resolved object. The `if (state)` guard and the trailing `return Promise.resolve(state)` fallback must be kept intact. The inner return should become:
     ```ts
     return Promise.resolve({
       ...state,
       notifications: {
         notifications: capped,
         unreadCount,
       },
     })
     ```
     The full function structure stays:
     ```ts
     migrate: (state: any) => {
       // ...comments...
       if (state) {
         const notifications: any[] = state.notifications?.notifications ?? []
         const capped = notifications.slice(0, 50)
         const unreadCount = capped.filter((n: any) => !n.read).length
         return Promise.resolve({
           ...state,
           notifications: {
             notifications: capped,
             unreadCount,
           },
         })
       }
       return Promise.resolve(state)
     },
     ```

- [ ] **Step 3: Verify TypeScript**

  Run: `cd frontend && npm run type-check`
  Expected: errors in `ThemeWrapper.tsx`, `RootLayout.tsx`, and `MainLayout.tsx` about missing `selectThemeMode`/`selectTheme`/`toggleTheme` imports. No errors in `store/index.ts` itself.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/store/slices/themeSlice.ts frontend/src/store/index.ts
  git commit -m "refactor: delete themeSlice and clean up redux-persist config"
  ```

---

### Task 3: Simplify `ThemeWrapper.tsx`

**Files:**
- Modify: `frontend/src/components/common/ThemeWrapper.tsx`

- [ ] **Step 1: Replace dynamic theme with static dark theme**

  Replace the entire file content with:
  ```tsx
  import React from 'react'
  import { ThemeProvider } from '@mui/material/styles'
  import { darkTheme } from '@/styles/theme'

  interface ThemeWrapperProps {
    children: React.ReactNode
  }

  const ThemeWrapper: React.FC<ThemeWrapperProps> = ({ children }) => {
    return <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>
  }

  export default ThemeWrapper
  ```

- [ ] **Step 2: Verify TypeScript**

  Run: `cd frontend && npm run type-check`
  Expected: `ThemeWrapper.tsx` errors are gone. Remaining errors are in `RootLayout.tsx` and `MainLayout.tsx`.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/components/common/ThemeWrapper.tsx
  git commit -m "refactor: simplify ThemeWrapper to static dark theme provider"
  ```

---

### Task 4: Update `RootLayout.tsx`

**Files:**
- Modify: `frontend/src/RootLayout.tsx`

- [ ] **Step 1: Remove theme selector and hardcode data-theme**

  In `frontend/src/RootLayout.tsx`:

  1. Remove this import line:
     ```ts
     import { selectTheme } from './store/slices/themeSlice'
     ```

  2. Remove this line from the component body:
     ```ts
     const theme = useAppSelector(selectTheme)
     ```

  3. Replace the `useEffect` that sets `data-theme`:
     ```ts
     // Before:
     useEffect(() => {
       document.documentElement.setAttribute('data-theme', theme.mode)
     }, [theme.mode])

     // After:
     useEffect(() => {
       document.documentElement.setAttribute('data-theme', 'dark')
     }, [])
     ```

  4. If `useAppDispatch` or `useAppSelector` is no longer needed (check: `dispatch` is still used for `logoutAction` and `clearAuth`; `useAppSelector` is still used for `selectIsAuthenticated` and `selectRememberMe`) — leave those imports in place.

- [ ] **Step 2: Verify TypeScript**

  Run: `cd frontend && npm run type-check`
  Expected: `RootLayout.tsx` errors gone. Only `MainLayout.tsx` errors remain.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/RootLayout.tsx
  git commit -m "refactor: hardcode data-theme=dark in RootLayout"
  ```

---

### Task 5: Remove theme toggle from `MainLayout.tsx`

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`

- [ ] **Step 1: Remove toggle imports and logic**

  In `frontend/src/components/common/MainLayout.tsx`:

  1. Remove these two icon imports:
     ```ts
     DarkMode as DarkModeIcon,
     LightMode as LightModeIcon,
     ```

  2. Remove this import:
     ```ts
     import { toggleTheme, selectThemeMode } from '@/store/slices/themeSlice'
     ```

  3. Remove these two lines from the component body:
     ```ts
     const themeMode = useAppSelector(selectThemeMode)
     ```
     and
     ```ts
     const handleThemeToggle = () => {
       dispatch(toggleTheme())
     }
     ```

  4. Remove the `Tooltip` + `IconButton` block for the theme toggle (around lines 208–212):
     ```tsx
     <Tooltip title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}>
       <IconButton onClick={handleThemeToggle} color="inherit">
         {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
       </IconButton>
     </Tooltip>
     ```

- [ ] **Step 2: Verify TypeScript — all clear**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 3: Run tests**

  Run: `cd frontend && npm run test`
  Expected: all tests pass. (No tests cover the toggle button directly.)

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/components/common/MainLayout.tsx
  git commit -m "refactor: remove theme toggle button and logic from MainLayout"
  ```

---

## Chunk 2: Conditional Styling Audit

### Task 6: Strip `palette.mode` ternaries — Inventory files (5 files)

**Files:**
- Modify: `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- Modify: `frontend/src/pages/inventory/InventorySummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- Modify: `frontend/src/pages/inventory/PriceListReport.tsx`
- Modify: `frontend/src/pages/inventory/ProductCostReport.tsx`

**Transformation rule:** For every expression matching:
```ts
theme.palette.mode === 'dark' ? darkValue : lightValue
```
Replace with `darkValue` (remove the ternary entirely).

For the inverse form:
```ts
theme.palette.mode === 'light' ? lightValue : darkValue
```
Replace with `darkValue`.

If the resulting style value is the MUI dark-theme default (e.g., `background.paper` already provides `#1e1e1e`), the entire style property can be deleted — use judgement.

- [ ] **Step 1: Edit each file**

  For each of the 5 inventory files, open the file, find every `palette.mode` occurrence (line numbers from grep output — see below), and apply the transformation rule.

  Line references:
  - `HistoricalInventoryReport.tsx`: lines 864, 916, 965, 1003
  - `InventorySummaryReport.tsx`: lines 1028, 1082, 1141, 1181
  - `MovementSummaryReport.tsx`: lines 845, 898, 947, 989
  - `PriceListReport.tsx`: lines 892, 928
  - `ProductCostReport.tsx`: lines 877, 946

- [ ] **Step 2: Verify no palette.mode remains**

  ```bash
  grep -n "palette\.mode" \
    frontend/src/pages/inventory/HistoricalInventoryReport.tsx \
    frontend/src/pages/inventory/InventorySummaryReport.tsx \
    frontend/src/pages/inventory/MovementSummaryReport.tsx \
    frontend/src/pages/inventory/PriceListReport.tsx \
    frontend/src/pages/inventory/ProductCostReport.tsx
  ```
  Expected: no output.

- [ ] **Step 3: Type-check**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/inventory/
  git commit -m "refactor: remove palette.mode ternaries from inventory report pages"
  ```

---

### Task 7: Strip `palette.mode` ternaries — Purchasing files (5 files)

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- Modify: `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- Modify: `frontend/src/pages/purchasing/VendorProductListReport.tsx`

- [ ] **Step 1: Edit each file**

  Apply the transformation rule (keep dark-branch value) to every `palette.mode` occurrence.

  Line references:
  - `PurchaseOrderDetailsReport.tsx`: lines 1090, 1156, 1240, 1284
  - `PurchaseOrderStatusReport.tsx`: lines 1024, 1087, 1171, 1222
  - `PurchaseOrderSummary.tsx`: lines 881, 943, 1022, 1073
  - `VendorPaymentDetailsReport.tsx`: lines 757, 811, 855, 888
  - `VendorProductListReport.tsx`: (check via grep — line numbers not pre-captured)

- [ ] **Step 2: Verify no palette.mode remains**

  ```bash
  grep -n "palette\.mode" frontend/src/pages/purchasing/
  ```
  Expected: no output.

- [ ] **Step 3: Type-check**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/purchasing/
  git commit -m "refactor: remove palette.mode ternaries from purchasing report pages"
  ```

---

### Task 8: Strip `palette.mode` ternaries — Sales files (9 files)

**Files:**
- Modify: `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- Modify: `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- Modify: `frontend/src/pages/sales/ProductCustomerReport.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductDetails.tsx`
- Modify: `frontend/src/pages/sales/SalesByProductSummary.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- Modify: `frontend/src/pages/sales/SalesOrderSummary.tsx`

- [ ] **Step 1: Edit each file**

  Apply the transformation rule to every `palette.mode` occurrence across all sales files.
  Run this first to get exact line numbers:
  ```bash
  grep -n "palette\.mode" frontend/src/pages/sales/*.tsx
  ```

- [ ] **Step 2: Verify no palette.mode remains**

  ```bash
  grep -n "palette\.mode" frontend/src/pages/sales/
  ```
  Expected: no output.

- [ ] **Step 3: Type-check**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/sales/
  git commit -m "refactor: remove palette.mode ternaries from sales report pages"
  ```

---

### Task 9: Strip `palette.mode` ternaries — Accounting and other files (7 files)

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`
- Modify: `frontend/src/pages/accounting/AccountMappingsPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/AccountActivityPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/GeneralLedgerPage.tsx`
- Modify: `frontend/src/pages/accounting/reports/ProfitAndLossPage.tsx`
- Modify: `frontend/src/pages/audit-logs/components/DiffViewer.tsx`

- [ ] **Step 1: Update `getBalanceSheetTone` in `BalanceSheetPage.tsx`**

  `BalanceSheetPage.tsx` exports a helper function that branches on `mode`. Remove the `mode` parameter and hardcode the dark values:

  Before:
  ```ts
  export const getBalanceSheetTone = (mode: 'light' | 'dark') => ({
    surfaceSoft: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'grey.50',
    surfaceStrong: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.100',
    sectionAccent: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.100',
  });
  ```

  After:
  ```ts
  export const getBalanceSheetTone = () => ({
    surfaceSoft: 'rgba(255, 255, 255, 0.06)',
    surfaceStrong: 'rgba(255, 255, 255, 0.1)',
    sectionAccent: 'rgba(255, 255, 255, 0.08)',
  });
  ```

  Update both call sites (lines 82 and 255) from `getBalanceSheetTone(theme.palette.mode)` to `getBalanceSheetTone()`.

- [ ] **Step 2: Update `getGeneralLedgerTone` in `GeneralLedgerPage.tsx`**

  Same pattern — remove the `mode` parameter and hardcode dark values:

  Before:
  ```ts
  export const getGeneralLedgerTone = (mode: 'light' | 'dark') => ({
    surfaceSoft: mode === 'dark' ? 'rgba(255, 255, 255, 0.06)' : 'grey.50',
    surfaceStrong: mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'grey.100',
    tableHeader: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
  });
  ```

  After:
  ```ts
  export const getGeneralLedgerTone = () => ({
    surfaceSoft: 'rgba(255, 255, 255, 0.06)',
    surfaceStrong: 'rgba(255, 255, 255, 0.1)',
    tableHeader: 'rgba(255, 255, 255, 0.08)',
  });
  ```

  Update the call site (line 105) from `getGeneralLedgerTone(theme.palette.mode)` to `getGeneralLedgerTone()`.

- [ ] **Step 3: Edit remaining files — apply transformation rule**

  Apply the transformation rule (`theme.palette.mode === 'dark' ? darkValue : lightValue` → `darkValue`) to every remaining `palette.mode` occurrence.

  Note for `ProfitAndLossPage.tsx`: the ternaries are embedded inside `alpha()` calls, e.g.:
  ```ts
  alpha(theme.palette.info.main, theme.palette.mode === 'dark' ? 0.25 : 0.12)
  ```
  becomes:
  ```ts
  alpha(theme.palette.info.main, 0.25)
  ```

  Line references:
  - `AccountingDashboardPage.tsx`: lines 95, 99
  - `AccountMappingsPage.tsx`: lines 406, 456
  - `AccountActivityPage.tsx`: lines 412, 480, 490, 500, 510, 520, 531, 541, 562, 669, 697, 750
  - `BalanceSheetPage.tsx`: lines 533, 561, 589, 592 (lines 82 and 255 handled in Step 1)
  - `GeneralLedgerPage.tsx`: lines 341, 606 (line 105 handled in Step 2)
  - `ProfitAndLossPage.tsx`: lines 132, 421, 459
  - `DiffViewer.tsx`: lines 31, 36

- [ ] **Step 4: Verify no palette.mode remains in accounting/audit**

  ```bash
  grep -rn "palette\.mode" \
    frontend/src/pages/accounting/ \
    frontend/src/pages/audit-logs/
  ```
  Expected: no output.

- [ ] **Step 5: Type-check**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/accounting/ frontend/src/pages/audit-logs/
  git commit -m "refactor: remove palette.mode ternaries from accounting and audit-log pages"
  ```

---

## Chunk 3: Test Updates and Final Verification

### Task 10: Update `AccountActivityPage.test.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/reports/__tests__/AccountActivityPage.test.tsx`

- [ ] **Step 1: Update `renderWithProviders` helper**

  In `AccountActivityPage.test.tsx`, change `renderWithProviders`:

  Before:
  ```ts
  const renderWithProviders = (mode: 'light' | 'dark' = 'light') => {
    const theme = createTheme({ palette: { mode } })
    return render(
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <AccountActivityPage />
        </BrowserRouter>
      </ThemeProvider>,
    )
  }
  ```

  After:
  ```ts
  const renderWithProviders = () => {
    const theme = createTheme({ palette: { mode: 'dark' } })
    return render(
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <AccountActivityPage />
        </BrowserRouter>
      </ThemeProvider>,
    )
  }
  ```

- [ ] **Step 2: Remove explicit `'dark'` argument at call sites**

  Find any call to `renderWithProviders('dark')` in the file and change it to `renderWithProviders()`.

- [ ] **Step 3: Run the test file**

  Run: `cd frontend && npx vitest run src/pages/accounting/reports/__tests__/AccountActivityPage.test.tsx`
  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/accounting/reports/__tests__/AccountActivityPage.test.tsx
  git commit -m "test: update AccountActivityPage renderWithProviders to hardcode dark mode"
  ```

---

### Task 11: Final verification

- [ ] **Step 1: Full cleanup check**

  ```bash
  grep -r "palette\.mode\|lightTheme\|createAppTheme\|toggleTheme\|selectThemeMode\|selectTheme\b\|themeSlice" frontend/src
  ```
  Expected: zero results.

- [ ] **Step 2: TypeScript**

  Run: `cd frontend && npm run type-check`
  Expected: zero errors.

- [ ] **Step 3: Full test suite**

  Run: `cd frontend && npm run test`
  Expected: all tests pass.

- [ ] **Step 4: Lint**

  Run: `cd frontend && npm run lint`
  Expected: no errors or only pre-existing warnings.
