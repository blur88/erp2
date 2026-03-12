# React Router DOM v7 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade react-router-dom from v6.20.1 to v7.13.1, migrating from `BrowserRouter` to `createBrowserRouter`/`RouterProvider` with auth guards in loaders.

**Architecture:** Replace `<BrowserRouter>` in `main.tsx` with `RouterProvider` fed by a new `src/router.tsx` file using `createBrowserRouter`. Auth guarding moves from the `ProtectedRoute` wrapper component into a loader function that reads Redux store state directly. All page components and hooks (`useNavigate`, `useParams`, etc.) are untouched.

**Tech Stack:** React 19, React Router DOM 7.13.1, Redux Toolkit, TypeScript 5, Vitest

---

### Task 1: Bump the package version

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update the version**

In `frontend/package.json`, change:
```json
"react-router-dom": "^6.20.1",
```
to:
```json
"react-router-dom": "7.13.1",
```

**Step 2: Install**

```bash
cd frontend && npm install
```

Expected: No peer dependency errors. `node_modules/react-router-dom/package.json` should show `"version": "7.13.1"`.

**Step 3: Verify TypeScript still compiles**

```bash
cd frontend && npm run type-check
```

Expected: Type errors related to the router (we haven't migrated yet) — but no unrelated regressions. Note down any new errors for later tasks.

**Step 4: Commit**

```bash
cd frontend && git add package.json package-lock.json
git commit -m "chore(deps): upgrade react-router-dom to 7.13.1"
```

---

### Task 2: Create src/router.tsx with createBrowserRouter

This is the new central routing config. It replaces the `<Routes>/<Route>` tree in `App.tsx`.

**Files:**
- Create: `frontend/src/router.tsx`
- Reference: `frontend/src/store/index.ts` (to import `store` for auth guard loader)

**Step 1: Read the store export**

Open `frontend/src/store/index.ts` and confirm the export name of the Redux store (should be `export const store = ...`). You need to import it in `router.tsx`.

**Step 2: Write the router file**

Create `frontend/src/router.tsx`:

```tsx
import React from 'react'
import { createBrowserRouter, redirect } from 'react-router-dom'
import { store } from './store'

// Layout components (not lazy — they're always needed)
import MainLayout from './components/common/MainLayout'

// Auth pages
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./pages/auth/MandatoryPasswordChangePage'))

// Dashboard
const DashboardPage = React.lazy(() => import('./pages/dashboard/DashboardPage'))

// Inventory
const InventoryPage = React.lazy(() => import('./pages/inventory/InventoryPage'))
const ProductsPage = React.lazy(() => import('./pages/inventory/ProductsPage'))
const CreateProductPage = React.lazy(() => import('./pages/inventory/CreateProductPage'))
const CategoriesPage = React.lazy(() => import('./pages/inventory/CategoriesPage'))
const StockAdjustmentsPage = React.lazy(() => import('./pages/inventory/StockAdjustmentsPage'))
const CreateStockAdjustmentPage = React.lazy(() => import('./pages/inventory/CreateStockAdjustmentPage'))

// Sales
const SalesPage = React.lazy(() => import('./pages/sales/SalesPage'))
const CustomersPage = React.lazy(() => import('./pages/sales/CustomersPage'))
const OrdersPage = React.lazy(() => import('./pages/sales/OrdersPage'))
const CreateSalesOrderPage = React.lazy(() => import('./pages/sales/CreateSalesOrderPage'))
const InvoicesPage = React.lazy(() => import('./pages/sales/InvoicesPage'))
const PaymentsPage = React.lazy(() => import('./pages/sales/PaymentsPage'))

// Sales reports
const SalesByProductSummary = React.lazy(() => import('./pages/sales/SalesByProductSummary'))
const SalesByProductDetails = React.lazy(() => import('./pages/sales/SalesByProductDetails'))
const SalesOrderSummary = React.lazy(() => import('./pages/sales/SalesOrderSummary'))
const SalesOrderProfitReport = React.lazy(() => import('./pages/sales/SalesOrderProfitReport'))
const CustomerPaymentSummary = React.lazy(() => import('./pages/sales/CustomerPaymentSummary'))
const CustomerPaymentByOrder = React.lazy(() => import('./pages/sales/CustomerPaymentByOrder'))
const CustomerPaymentDetails = React.lazy(() => import('./pages/sales/CustomerPaymentDetails'))
const CustomerOrderHistory = React.lazy(() => import('./pages/sales/CustomerOrderHistory'))
const ProductCustomerReport = React.lazy(() => import('./pages/sales/ProductCustomerReport'))

// Purchasing
const PurchasingPage = React.lazy(() => import('./pages/purchasing/PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./pages/purchasing/SuppliersPage'))
const PurchaseOrdersPage = React.lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./pages/purchasing/CreatePurchaseOrderPage'))
const GoodsReceivedPage = React.lazy(() => import('./pages/purchasing/GoodsReceivedPage'))
const VendorPaymentsPage = React.lazy(() => import('./pages/purchasing/VendorPaymentsPage'))

// Purchasing reports
const PurchaseOrderSummary = React.lazy(() => import('./pages/purchasing/PurchaseOrderSummary'))
const PurchaseOrderDetailsReport = React.lazy(() => import('./pages/purchasing/PurchaseOrderDetailsReport'))
const PurchaseOrderStatusReport = React.lazy(() => import('./pages/purchasing/PurchaseOrderStatusReport'))
const VendorPaymentDetailsReport = React.lazy(() => import('./pages/purchasing/VendorPaymentDetailsReport'))
const VendorProductListReport = React.lazy(() => import('./pages/purchasing/VendorProductListReport'))

// Inventory reports
const InventorySummaryReport = React.lazy(() => import('./pages/inventory/InventorySummaryReport'))
const HistoricalInventoryReport = React.lazy(() => import('./pages/inventory/HistoricalInventoryReport'))
const MovementSummaryReport = React.lazy(() => import('./pages/inventory/MovementSummaryReport'))
const PriceListReport = React.lazy(() => import('./pages/inventory/PriceListReport'))
const ProductCostReport = React.lazy(() => import('./pages/inventory/ProductCostReport'))

// Settings
const CompanySettingsPage = React.lazy(() => import('./pages/settings/CompanySettingsPage'))
const PriceCostingPage = React.lazy(() => import('./pages/settings/PriceCostingPage'))
const RegionalSettingsPage = React.lazy(() => import('./pages/settings/RegionalSettingsPage'))
const PrintSettingsPage = React.lazy(() => import('./pages/settings/PrintSettingsPage'))
const DocumentNumbersPage = React.lazy(() => import('./pages/settings/DocumentNumbersPage'))
const BackupManagement = React.lazy(() => import('./pages/settings/BackupManagement'))
const UserManagementPage = React.lazy(() => import('./pages/settings/UserManagementPage'))
const RoleManagementPage = React.lazy(() => import('./pages/settings/RoleManagementPage'))
const SecuritySettingsPage = React.lazy(() => import('./pages/settings/SecuritySettingsPage'))
const PriceListsPage = React.lazy(() => import('./pages/settings/PriceListsPage'))
const PriceListDetailsPage = React.lazy(() => import('./pages/settings/PriceListDetailsPage'))
const PaymentMethodsPage = React.lazy(() => import('./pages/settings/PaymentMethodsPage'))

// Audit logs
const AuditLogsPage = React.lazy(() => import('./pages/audit-logs/AuditLogsPage'))

// Accounting
const AccountingDashboardPage = React.lazy(() => import('./pages/accounting/AccountingDashboardPage'))
const ChartOfAccountsPage = React.lazy(() => import('./pages/accounting/ChartOfAccountsPage'))
const FiscalPeriodsPage = React.lazy(() => import('./pages/accounting/FiscalPeriodsPage'))
const JournalEntriesPage = React.lazy(() => import('./pages/accounting/JournalEntriesPage'))
const JournalEntryFormPage = React.lazy(() => import('./pages/accounting/JournalEntryFormPage'))
const JournalEntryDetailsPage = React.lazy(() => import('./pages/accounting/JournalEntryDetailsPage'))
const AccountMappingsPage = React.lazy(() => import('./pages/accounting/AccountMappingsPage'))
const BankReconciliationsPage = React.lazy(() => import('./pages/accounting/BankReconciliationsPage'))
const BankReconciliationDetailsPage = React.lazy(() => import('./pages/accounting/BankReconciliationDetailsPage'))
const SettlementsPage = React.lazy(() => import('./pages/accounting/SettlementsPage'))
const OwnerEquityPage = React.lazy(() => import('./pages/accounting/OwnerEquityPage'))
const ExpensesPage = React.lazy(() => import('./pages/accounting/ExpensesPage'))
const TrialBalancePage = React.lazy(() => import('./pages/accounting/reports/TrialBalancePage'))
const BalanceSheetPage = React.lazy(() => import('./pages/accounting/reports/BalanceSheetPage'))
const ProfitAndLossPage = React.lazy(() => import('./pages/accounting/reports/ProfitAndLossPage'))
const GeneralLedgerPage = React.lazy(() => import('./pages/accounting/reports/GeneralLedgerPage'))
const AccountActivityPage = React.lazy(() => import('./pages/accounting/reports/AccountActivityPage'))

// 404
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))

// Root layout — imported from App.tsx after Task 3 refactor
import RootLayout from './RootLayout'

/**
 * Auth guard loader: reads Redux store directly (synchronous).
 * Returns redirect to /login if not authenticated.
 * Also handles mandatory password change redirect.
 */
function authLoader({ request }: { request: Request }) {
  const { auth } = store.getState()
  const url = new URL(request.url)

  if (!auth.isAuthenticated) {
    return redirect('/login')
  }

  if (auth.user?.requiresPasswordChange && url.pathname !== '/change-password-required') {
    return redirect('/change-password-required')
  }

  return null
}

export const router = createBrowserRouter([
  {
    // Root layout wraps everything (provides idle timer, theme, IdleWarningDialog)
    element: <RootLayout />,
    children: [
      // Public routes
      { path: '/login', element: <LoginPage /> },
      { path: '/change-password-required', element: <MandatoryPasswordChangePage /> },

      // Protected routes — all behind authLoader, all inside MainLayout
      {
        loader: authLoader,
        element: <MainLayout />,
        children: [
          { index: true, path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },

          // Inventory
          { path: '/inventory', element: <InventoryPage /> },
          { path: '/inventory/products', element: <ProductsPage /> },
          { path: '/inventory/products/create', element: <CreateProductPage /> },
          { path: '/inventory/products/:id/edit', element: <CreateProductPage /> },
          { path: '/inventory/categories', element: <CategoriesPage /> },
          { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage /> },
          { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage /> },
          { path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage /> },

          // Sales
          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/customers', element: <CustomersPage /> },
          { path: '/sales/orders', element: <OrdersPage /> },
          { path: '/sales/orders/create', element: <CreateSalesOrderPage /> },
          { path: '/sales/orders/:id/edit', element: <CreateSalesOrderPage /> },
          { path: '/sales/invoices', element: <InvoicesPage /> },
          { path: '/sales/payments', element: <PaymentsPage /> },

          // Purchasing
          { path: '/purchasing', element: <PurchasingPage /> },
          { path: '/purchasing/suppliers', element: <SuppliersPage /> },
          { path: '/purchasing/orders', element: <PurchaseOrdersPage /> },
          { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage /> },
          { path: '/purchasing/orders/:id/edit', element: <CreatePurchaseOrderPage /> },
          { path: '/purchasing/goods-received', element: <GoodsReceivedPage /> },
          { path: '/purchasing/vendor-payments', element: <VendorPaymentsPage /> },

          // Reports - Inventory
          { path: '/reports/inventory/summary', element: <InventorySummaryReport /> },
          { path: '/reports/inventory/historical', element: <HistoricalInventoryReport /> },
          { path: '/reports/inventory/movement-summary', element: <MovementSummaryReport /> },
          { path: '/reports/inventory/price-list', element: <PriceListReport /> },
          { path: '/reports/inventory/product-cost', element: <ProductCostReport /> },

          // Reports - Purchasing
          { path: '/reports/purchasing/order-summary', element: <PurchaseOrderSummary /> },
          { path: '/reports/purchasing/order-status', element: <PurchaseOrderStatusReport /> },
          { path: '/reports/purchasing/order-details', element: <PurchaseOrderDetailsReport /> },
          { path: '/reports/purchasing/payment-details', element: <VendorPaymentDetailsReport /> },
          { path: '/reports/purchasing/vendor-purchase-list', element: <VendorProductListReport /> },

          // Reports - Sales
          { path: '/reports/sales/product-summary', element: <SalesByProductSummary /> },
          { path: '/reports/sales/product-details', element: <SalesByProductDetails /> },
          { path: '/reports/sales/order-summary', element: <SalesOrderSummary /> },
          { path: '/reports/sales/order-profit', element: <SalesOrderProfitReport /> },
          { path: '/reports/sales/customer-payment-summary', element: <CustomerPaymentSummary /> },
          { path: '/reports/sales/payment-by-order', element: <CustomerPaymentByOrder /> },
          { path: '/reports/sales/payment-details', element: <CustomerPaymentDetails /> },
          { path: '/reports/sales/order-history', element: <CustomerOrderHistory /> },
          { path: '/reports/sales/product-customer', element: <ProductCustomerReport /> },

          // Settings
          { path: '/settings/company', element: <CompanySettingsPage /> },
          { path: '/settings/price-costing', element: <PriceCostingPage /> },
          { path: '/settings/regional', element: <RegionalSettingsPage /> },
          { path: '/settings/price-lists', element: <PriceListsPage /> },
          { path: '/settings/price-lists/:id', element: <PriceListDetailsPage /> },
          { path: '/settings/payment-methods', element: <PaymentMethodsPage /> },
          { path: '/settings/print', element: <PrintSettingsPage /> },
          { path: '/settings/document-numbers', element: <DocumentNumbersPage /> },
          { path: '/settings/users', element: <UserManagementPage /> },
          { path: '/settings/roles', element: <RoleManagementPage /> },
          { path: '/settings/security', element: <SecuritySettingsPage /> },
          { path: '/settings/backup', element: <BackupManagement /> },

          // Audit logs
          { path: '/audit-logs', element: <AuditLogsPage /> },

          // Accounting
          { path: '/accounting', element: <Navigate to="/accounting/dashboard" replace /> },
          { path: '/accounting/dashboard', element: <AccountingDashboardPage /> },
          { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage /> },
          { path: '/accounting/fiscal-periods', element: <FiscalPeriodsPage /> },
          { path: '/accounting/journal-entries', element: <JournalEntriesPage /> },
          { path: '/accounting/journal-entries/new', element: <JournalEntryFormPage /> },
          { path: '/accounting/journal-entries/:id/edit', element: <JournalEntryFormPage /> },
          { path: '/accounting/journal-entries/:id', element: <JournalEntryDetailsPage /> },
          { path: '/accounting/account-mappings', element: <AccountMappingsPage /> },
          { path: '/accounting/settlements', element: <SettlementsPage /> },
          { path: '/accounting/owner-equity', element: <OwnerEquityPage /> },
          { path: '/accounting/expenses', element: <ExpensesPage /> },
          { path: '/accounting/bank-reconciliations', element: <BankReconciliationsPage /> },
          { path: '/accounting/bank-reconciliations/new', element: <BankReconciliationsPage /> },
          { path: '/accounting/bank-reconciliations/:id', element: <BankReconciliationDetailsPage /> },
          { path: '/accounting/reports/trial-balance', element: <TrialBalancePage /> },
          { path: '/accounting/reports/balance-sheet', element: <BalanceSheetPage /> },
          { path: '/accounting/reports/profit-loss', element: <ProfitAndLossPage /> },
          { path: '/accounting/reports/general-ledger', element: <GeneralLedgerPage /> },
          { path: '/accounting/reports/account-activity', element: <AccountActivityPage /> },

          // 404
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
```

> **Note on `Navigate` import:** Add `import { Navigate } from 'react-router-dom'` at the top of the file alongside the `createBrowserRouter` and `redirect` imports.

> **Note on `MainLayout`:** In v7 with `createBrowserRouter`, layout routes render their children via `<Outlet />`. Open `frontend/src/components/common/MainLayout.tsx` and check if it already renders `children` prop. If it renders `{children}`, you need to change it to use `<Outlet />` from react-router-dom instead — see Task 4.

**Step 3: Commit (partial — file created but not yet wired up)**

```bash
cd frontend && git add src/router.tsx
git commit -m "feat: add createBrowserRouter config in src/router.tsx"
```

---

### Task 3: Extract RootLayout from App.tsx

`App.tsx` currently acts as both the root component AND the route tree renderer. We need to split it: the idle timer / auth state / IdleWarningDialog logic stays, but it becomes a layout component that renders `<Outlet />` for child routes instead of `<Routes>`.

**Files:**
- Create: `frontend/src/RootLayout.tsx`
- Modify: `frontend/src/App.tsx` (gutted — becomes a re-export or deleted)

**Step 1: Create RootLayout.tsx**

Create `frontend/src/RootLayout.tsx` with all the idle timer logic from `App.tsx`, replacing the `<Routes>` tree with `<Outlet />`:

```tsx
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Box, LinearProgress, Suspense } from '@mui/material'
import { useAppSelector, useAppDispatch } from './hooks/useRedux'
import { useRegionalSettings } from '@/hooks/useRegionalSettings'
import { selectTheme } from './store/slices/themeSlice'
import { selectIsAuthenticated, selectRememberMe, logout as logoutAction, clearAuth } from './store/slices/authSlice'
import { useIdleTimer } from './hooks/useIdleTimer'
import IdleWarningDialog from './components/auth/IdleWarningDialog'

const PageLoader = () => (
  <Box sx={{ width: '100%', position: 'fixed', top: 0, zIndex: 9999 }}>
    <LinearProgress />
  </Box>
)

export default function RootLayout() {
  const theme = useAppSelector(selectTheme)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const rememberMe = useAppSelector(selectRememberMe)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()

  const [showIdleWarning, setShowIdleWarning] = useState(false)

  useRegionalSettings(isAuthenticated)

  const IDLE_TIMEOUT = 30 * 60 * 1000
  const WARNING_TIME = 2 * 60 * 1000

  const handleAutoLogout = useCallback(async () => {
    setShowIdleWarning(false)
    const state = (window as any).store?.getState()
    const refreshToken = state?.auth?.refreshToken
    try {
      if (refreshToken) {
        await dispatch(logoutAction(refreshToken)).unwrap()
      }
    } catch (error) {
      console.error('Server logout failed:', error)
    } finally {
      dispatch(clearAuth())
      navigate('/login', { replace: true })
    }
  }, [dispatch, navigate])

  const activityEvents = useMemo(
    () => ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'],
    []
  )

  const handleIdle = useCallback(() => { setShowIdleWarning(true) }, [])
  const handleTimeout = useCallback(() => { handleAutoLogout() }, [handleAutoLogout])
  const handleActive = useCallback(() => { setShowIdleWarning(false) }, [])

  const { remainingTime, reset } = useIdleTimer({
    timeout: IDLE_TIMEOUT,
    warningTime: WARNING_TIME,
    enabled: isAuthenticated && location.pathname !== '/login' && !rememberMe,
    onIdle: handleIdle,
    onTimeout: handleTimeout,
    onActive: handleActive,
    events: activityEvents,
  })

  const handleStayLoggedIn = () => {
    setShowIdleWarning(false)
    reset()
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme.mode)
  }, [theme.mode])

  useEffect(() => {
    if (!isAuthenticated) {
      setShowIdleWarning(false)
    }
  }, [isAuthenticated])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <IdleWarningDialog
        open={showIdleWarning}
        remainingSeconds={remainingTime}
        totalWarningSeconds={WARNING_TIME / 1000}
        onStayLoggedIn={handleStayLoggedIn}
        onLogout={handleAutoLogout}
      />
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Box>
  )
}
```

**Step 2: Gut App.tsx**

Replace the contents of `frontend/src/App.tsx` with a simple re-export so any code importing `App` still works:

```tsx
export { default } from './RootLayout'
```

> **Why keep App.tsx?** `main.tsx` currently imports `App`. We'll update `main.tsx` in Task 5, but keeping `App.tsx` as a re-export avoids a cascade of changes across tasks.

**Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new errors (or only errors from router.tsx which hasn't imported RootLayout yet — that's fine).

**Step 4: Commit**

```bash
cd frontend && git add src/RootLayout.tsx src/App.tsx
git commit -m "refactor: extract RootLayout from App for data router compatibility"
```

---

### Task 4: Update MainLayout to use Outlet

In the data router pattern, layout route components render child routes via `<Outlet />` instead of `{children}`. `MainLayout` needs to support this.

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`

**Step 1: Read the file**

Open `frontend/src/components/common/MainLayout.tsx` and find how it currently renders its content — look for `{children}` or a `children` prop.

**Step 2: Add Outlet support**

If `MainLayout` accepts `children` prop, you have two options:

**Option A** — Keep children prop AND add Outlet (supports both usages — safest):

Find the JSX where `{children}` is rendered and replace it with:
```tsx
{children ?? <Outlet />}
```

Add the import at the top:
```tsx
import { Outlet } from 'react-router-dom'
```

Also update the props interface to make `children` optional:
```tsx
interface MainLayoutProps {
  children?: React.ReactNode
}
```

**Option B** — Replace children with Outlet entirely (simpler, but only if MainLayout is only used as a route layout):

Replace `{children}` with `<Outlet />` and remove the `children` prop entirely.

> **Which to choose:** Check if `MainLayout` is used anywhere outside of `App.tsx` with explicit children passed in. If it is, use Option A. If it's only used as a route wrapper in App.tsx, use Option B.

**Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No new errors.

**Step 4: Commit**

```bash
cd frontend && git add src/components/common/MainLayout.tsx
git commit -m "refactor: support Outlet in MainLayout for data router layout routes"
```

---

### Task 5: Update main.tsx to use RouterProvider

Swap out `<BrowserRouter>` for `<RouterProvider>` wired to the new router config.

**Files:**
- Modify: `frontend/src/main.tsx`

**Step 1: Update the imports**

Remove:
```tsx
import { BrowserRouter } from 'react-router-dom'
```

Add:
```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from './router'
```

**Step 2: Replace BrowserRouter in the render tree**

Remove the `routerFutureFlags` const and `<BrowserRouter future={routerFutureFlags}>` wrapper entirely.

Replace `<App />` (which was inside BrowserRouter) with `<RouterProvider router={router} />`.

The full render call should look like:

```tsx
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <ThemeWrapper>
          <CssBaseline />
          <LocalizationProvider dateAdapter={AdapterDateFns}>
            <NotificationProvider>
              <WebSocketProvider>
                <RouterProvider router={router} />
              </WebSocketProvider>
            </NotificationProvider>
          </LocalizationProvider>
        </ThemeWrapper>
      </QueryClientProvider>
    </Provider>
  </React.StrictMode>,
)
```

> **Important:** `RouterProvider` provides its own router context — there is no wrapping `<BrowserRouter>` needed. The `App` import can also be removed from `main.tsx` since `RouterProvider` takes care of rendering.

**Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: Clean.

**Step 4: Commit**

```bash
cd frontend && git add src/main.tsx
git commit -m "feat: wire RouterProvider to createBrowserRouter in main.tsx"
```

---

### Task 6: Update test setup for v7

The test setup file (`src/test/setup.ts`) mocks `BrowserRouter` and `MemoryRouter` with v6 future flags. In v7, those flags are defaults and the mock is unnecessary. The mock also needs to stay consistent with how v7 exports work.

**Files:**
- Modify: `frontend/src/test/setup.ts`

**Step 1: Remove the future flags mock**

In `src/test/setup.ts`, remove this entire block (lines ~10-46):

```ts
const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
}

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');

  const BrowserRouter = ({ future, children, ...props }: any) =>
    createElement(
      actual.BrowserRouter as any,
      {
        ...props,
        future: future ?? routerFutureFlags,
      },
      children
    );

  const MemoryRouter = ({ future, children, ...props }: any) =>
    createElement(
      actual.MemoryRouter as any,
      {
        ...props,
        future: future ?? routerFutureFlags,
      },
      children
    );

  return {
    ...actual,
    BrowserRouter,
    MemoryRouter,
  };
});
```

Also remove the `createElement` import from react if it's no longer used (check if `createElement` appears elsewhere in the file first).

**Step 2: Run all tests**

```bash
cd frontend && npm run test
```

Expected: All tests pass. If any test fails, check the error — it's likely a test that used `BrowserRouter` directly (the 3 test files using `MemoryRouter` should be unaffected, but verify).

**Step 3: Commit**

```bash
cd frontend && git add src/test/setup.ts
git commit -m "test: remove v6 future flags mock from test setup (v7 defaults)"
```

---

### Task 7: Simplify ProtectedRoute

`ProtectedRoute` now only wraps children in component tests — the route-level auth guard has moved to the loader in `router.tsx`. The component can be simplified to a thin wrapper, or kept as-is since it's used in `ProtectedRoute.test.tsx`.

**Files:**
- Modify: `frontend/src/components/auth/ProtectedRoute.tsx`
- Reference: `frontend/src/components/auth/__tests__/ProtectedRoute.test.tsx`

**Step 1: Read ProtectedRoute.test.tsx**

Open the test file. Understand what it's testing — if it's testing the auth redirect behavior (which now lives in the loader), those tests may need updating or deletion.

**Step 2: Decide what to keep**

If the test only tests the ProtectedRoute component itself (checking it renders children when authenticated, redirects when not), keep the component for now and let the tests continue to pass as integration tests.

If you want to remove the component entirely, delete the file and the test file, and update any import references.

> **Recommended:** Keep `ProtectedRoute.tsx` unchanged for now. The loader handles production routing; the component is no longer in the render tree but its test still validates auth redirect logic in isolation. This is fine.

**Step 3: Run the ProtectedRoute test specifically**

```bash
cd frontend && npx vitest run src/components/auth/__tests__/ProtectedRoute.test.tsx
```

Expected: PASS (the test uses MemoryRouter, unaffected by the migration).

**Step 4: Commit if any changes were made**

```bash
cd frontend && git add src/components/auth/ProtectedRoute.tsx
git commit -m "refactor: simplify ProtectedRoute now that auth guard lives in router loader"
```

---

### Task 8: Full test run and smoke test

**Step 1: Run full test suite**

```bash
cd frontend && npm run test
```

Expected: All tests pass with no failures.

**Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

**Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: No new errors.

**Step 4: Dev server smoke test**

```bash
cd frontend && npm run dev
```

Open the app in a browser and manually verify:
- [ ] `/login` page loads
- [ ] Login with `admin / Admin@123!` succeeds and redirects to `/dashboard`
- [ ] Navigation to `/inventory/products`, `/sales/orders`, `/accounting/journal-entries` works
- [ ] `/accounting` redirects to `/accounting/dashboard`
- [ ] Navigating to a protected route while logged out redirects to `/login`
- [ ] Idle timeout warning dialog appears after inactivity (or mock the timer)
- [ ] Unknown route (e.g. `/gibberish`) shows NotFoundPage

**Step 5: Final commit**

```bash
cd frontend && git add -A
git commit -m "feat: complete react-router-dom v6 → v7 migration with createBrowserRouter"
```

---

## Summary of Changed Files

| File | Change |
|------|--------|
| `frontend/package.json` | Version bump to 7.13.1 |
| `frontend/src/main.tsx` | `BrowserRouter` → `RouterProvider` |
| `frontend/src/router.tsx` | **New** — full `createBrowserRouter` config + auth loader |
| `frontend/src/RootLayout.tsx` | **New** — idle timer + layout extracted from App.tsx |
| `frontend/src/App.tsx` | Gutted to re-export RootLayout |
| `frontend/src/components/common/MainLayout.tsx` | Add `Outlet` support |
| `frontend/src/test/setup.ts` | Remove v6 future flags mock |
| `frontend/src/components/auth/ProtectedRoute.tsx` | Optional simplification |

**Files NOT changed:** All 59+ page components using `useNavigate`, `useParams`, `useLocation`, `useSearchParams` — these hooks work identically in v7.
