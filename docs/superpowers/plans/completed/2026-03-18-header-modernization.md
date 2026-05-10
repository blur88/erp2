# Header Modernization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modernize the sidebar brand header to show a company logo/name and update the AppBar to display the current page title derived from route metadata.

**Architecture:** Three independent changes: (1) add `handle.title` to all routes in `router.tsx`, (2) update `MainLayout.tsx` to read page title via `useMatches()`, (3) update `Sidebar.tsx` to fetch company settings and render a conditional logo/fallback plus a two-line identity stack. Each change is independently testable and committable.

**Tech Stack:** React 19, Material-UI v7, RTK Query (`useGetCompanySettingsQuery`), React Router v6 data router (`useMatches`, `handle` metadata), Vitest + React Testing Library

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/router.tsx` | Modify | Add `handle: { title }` to all 75 applicable route objects |
| `frontend/src/components/common/MainLayout.tsx` | Modify | Replace static AppBar title with `useMatches()`-derived page title |
| `frontend/src/components/common/Sidebar.tsx` | Modify | Fetch company settings; conditional logo/fallback; two-line text stack |
| `frontend/src/components/common/__tests__/MainLayout.test.tsx` | Create | Tests for AppBar page title resolution |
| `frontend/src/components/common/__tests__/Sidebar.test.tsx` | Modify | Add `vi.mock` for settingsApi; add logo/company name test cases |

---

## Task 1: Add route handle titles to router.tsx

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Open `frontend/src/router.tsx` and add `handle: { title }` to every applicable route**

  The `handle` field goes on each leaf route object alongside `path` and `element`. Redirect routes (`/` and `/accounting`) and the catch-all (`*`) do NOT get a handle. Auth routes (`/login`, `/change-password-required`) are outside `MainLayout` — skip them.

  Apply the following title mappings exactly (the complete list):

  ```ts
  // Main
  { path: '/dashboard', element: <DashboardPage />, handle: { title: 'Dashboard' } },

  // Inventory
  { path: '/inventory', element: <InventoryPage />, handle: { title: 'Inventory' } },
  { path: '/inventory/products', element: <ProductsPage />, handle: { title: 'Products' } },
  { path: '/inventory/products/create', element: <CreateProductPage />, handle: { title: 'Create Product' } },
  { path: '/inventory/products/:id/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
  { path: '/inventory/categories', element: <CategoriesPage />, handle: { title: 'Categories' } },
  { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage />, handle: { title: 'Stock Adjustments' } },
  { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage />, handle: { title: 'Create Stock Adjustment' } },
  { path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },

  // Sales
  { path: '/sales', element: <SalesPage />, handle: { title: 'Sales' } },
  { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
  { path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } },
  { path: '/sales/orders', element: <OrdersPage />, handle: { title: 'Sales Orders' } },
  { path: '/sales/orders/create', element: <CreateSalesOrderPage />, handle: { title: 'Create Sales Order' } },
  { path: '/sales/orders/:id/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
  { path: '/sales/invoices', element: <InvoicesPage />, handle: { title: 'Invoices' } },
  { path: '/sales/payments', element: <PaymentsPage />, handle: { title: 'Payments' } },

  // Purchasing
  { path: '/purchasing', element: <PurchasingPage />, handle: { title: 'Purchasing' } },
  { path: '/purchasing/suppliers', element: <SuppliersPage />, handle: { title: 'Suppliers' } },
  { path: '/purchasing/orders', element: <PurchaseOrdersPage />, handle: { title: 'Purchase Orders' } },
  { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage />, handle: { title: 'Create Purchase Order' } },
  { path: '/purchasing/orders/:id/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
  { path: '/purchasing/goods-received', element: <GoodsReceivedPage />, handle: { title: 'Goods Received' } },
  { path: '/purchasing/vendor-payments', element: <VendorPaymentsPage />, handle: { title: 'Vendor Payments' } },

  // Inventory Reports
  { path: '/reports/inventory/summary', element: <InventorySummaryReport />, handle: { title: 'Inventory Summary' } },
  { path: '/reports/inventory/historical', element: <HistoricalInventoryReport />, handle: { title: 'Historical Inventory' } },
  { path: '/reports/inventory/movement-summary', element: <MovementSummaryReport />, handle: { title: 'Inventory Movement Summary' } },
  { path: '/reports/inventory/price-list', element: <PriceListReport />, handle: { title: 'Product Price List' } },
  { path: '/reports/inventory/product-cost', element: <ProductCostReport />, handle: { title: 'Product Cost Report' } },

  // Purchasing Reports
  { path: '/reports/purchasing/order-summary', element: <PurchaseOrderSummary />, handle: { title: 'Purchase Order Summary' } },
  { path: '/reports/purchasing/order-status', element: <PurchaseOrderStatusReport />, handle: { title: 'Purchase Order Status' } },
  { path: '/reports/purchasing/order-details', element: <PurchaseOrderDetailsReport />, handle: { title: 'Purchase Order Details' } },
  { path: '/reports/purchasing/payment-details', element: <VendorPaymentDetailsReport />, handle: { title: 'Vendor Payment Details' } },
  { path: '/reports/purchasing/vendor-purchase-list', element: <VendorProductListReport />, handle: { title: 'Vendor Product List' } },

  // Sales Reports
  { path: '/reports/sales/product-summary', element: <SalesByProductSummary />, handle: { title: 'Sales by Product Summary' } },
  { path: '/reports/sales/product-details', element: <SalesByProductDetails />, handle: { title: 'Sales by Product Details' } },
  { path: '/reports/sales/order-summary', element: <SalesOrderSummary />, handle: { title: 'Sales Order Summary' } },
  { path: '/reports/sales/order-profit', element: <SalesOrderProfitReport />, handle: { title: 'Sales Order Profit Report' } },
  { path: '/reports/sales/customer-payment-summary', element: <CustomerPaymentSummary />, handle: { title: 'Customer Payment Summary' } },
  { path: '/reports/sales/payment-by-order', element: <CustomerPaymentByOrder />, handle: { title: 'Customer Payment by Order' } },
  { path: '/reports/sales/payment-details', element: <CustomerPaymentDetails />, handle: { title: 'Customer Payment Details' } },
  { path: '/reports/sales/order-history', element: <CustomerOrderHistory />, handle: { title: 'Customer Order History' } },
  { path: '/reports/sales/product-customer', element: <ProductCustomerReport />, handle: { title: 'Product Customer Report' } },

  // Settings
  { path: '/settings/company', element: <CompanySettingsPage />, handle: { title: 'Company' } },
  { path: '/settings/price-costing', element: <PriceCostingPage />, handle: { title: 'Inventory Costing' } },
  { path: '/settings/regional', element: <RegionalSettingsPage />, handle: { title: 'Regional' } },
  { path: '/settings/price-lists', element: <PriceListsPage />, handle: { title: 'Price Lists' } },
  { path: '/settings/price-lists/:id', element: <PriceListDetailsPage />, handle: { title: 'Price List Details' } },
  { path: '/settings/payment-methods', element: <PaymentMethodsPage />, handle: { title: 'Payment Methods' } },
  { path: '/settings/print', element: <PrintSettingsPage />, handle: { title: 'Print Settings' } },
  { path: '/settings/document-numbers', element: <DocumentNumbersPage />, handle: { title: 'Document Numbers' } },
  { path: '/settings/users', element: <UserManagementPage />, handle: { title: 'Users' } },
  { path: '/settings/roles', element: <RoleManagementPage />, handle: { title: 'Roles & Permissions' } },
  { path: '/settings/security', element: <SecuritySettingsPage />, handle: { title: 'Security' } },
  { path: '/settings/backup', element: <BackupManagement />, handle: { title: 'Backup & Restore' } },

  // Audit
  { path: '/audit-logs', element: <AuditLogsPage />, handle: { title: 'Audit Logs' } },

  // Accounting
  { path: '/accounting/dashboard', element: <AccountingDashboardPage />, handle: { title: 'Dashboard' } },
  { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage />, handle: { title: 'Chart of Accounts' } },
  { path: '/accounting/fiscal-periods', element: <FiscalPeriodsPage />, handle: { title: 'Fiscal Periods' } },
  { path: '/accounting/journal-entries', element: <JournalEntriesPage />, handle: { title: 'Journal Entries' } },
  { path: '/accounting/journal-entries/new', element: <JournalEntryFormPage />, handle: { title: 'Create Journal Entry' } },
  { path: '/accounting/journal-entries/:id/edit', element: <JournalEntryFormPage />, handle: { title: 'Edit Journal Entry' } },
  { path: '/accounting/journal-entries/:id', element: <JournalEntryDetailsPage />, handle: { title: 'Journal Entry' } },
  { path: '/accounting/account-mappings', element: <AccountMappingsPage />, handle: { title: 'Account Mappings' } },
  { path: '/accounting/settlements', element: <SettlementsPage />, handle: { title: 'Settlements' } },
  { path: '/accounting/owner-equity', element: <OwnerEquityPage />, handle: { title: "Owner's Equity" } },
  { path: '/accounting/expenses', element: <ExpensesPage />, handle: { title: 'Expenses' } },
  { path: '/accounting/fund-transfers', element: <FundTransfersPage />, handle: { title: 'Fund Transfers' } },
  { path: '/accounting/bank-reconciliations', element: <BankReconciliationsPage />, handle: { title: 'Bank Reconciliation' } },
  { path: '/accounting/bank-reconciliations/new', element: <BankReconciliationsPage />, handle: { title: 'New Bank Reconciliation' } },
  { path: '/accounting/bank-reconciliations/:id', element: <BankReconciliationDetailsPage />, handle: { title: 'Bank Reconciliation' } },
  { path: '/accounting/reports/trial-balance', element: <TrialBalancePage />, handle: { title: 'Trial Balance' } },
  { path: '/accounting/reports/balance-sheet', element: <BalanceSheetPage />, handle: { title: 'Balance Sheet' } },
  { path: '/accounting/reports/profit-loss', element: <ProfitAndLossPage />, handle: { title: 'Profit & Loss' } },
  { path: '/accounting/reports/general-ledger', element: <GeneralLedgerPage />, handle: { title: 'General Ledger' } },
  { path: '/accounting/reports/account-activity', element: <AccountActivityPage />, handle: { title: 'Account Activity' } },
  ```

- [ ] **Step 2: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors. If TypeScript complains about `handle`, note that React Router v6's `RouteObject` type accepts `handle: unknown` — no type annotation needed here.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/router.tsx
  git commit -m "feat: add handle.title metadata to all routes"
  ```

---

## Task 2: Replace static AppBar title in MainLayout.tsx

**Files:**
- Modify: `frontend/src/components/common/MainLayout.tsx`
- Create: `frontend/src/components/common/__tests__/MainLayout.test.tsx`

- [ ] **Step 1: Write failing tests first**

  Create `frontend/src/components/common/__tests__/MainLayout.test.tsx`:

  ```tsx
  import { render, screen } from '@testing-library/react'
  import { MemoryRouter } from 'react-router-dom'
  import { Provider } from 'react-redux'
  import { configureStore } from '@reduxjs/toolkit'
  import { describe, expect, it, vi, beforeEach } from 'vitest'
  import MainLayout from '../MainLayout'

  // Mock all child components that have their own heavy dependencies
  vi.mock('../Sidebar', () => ({ default: () => <div data-testid="sidebar" /> }))
  vi.mock('../NotificationPanel', () => ({ default: () => null }))
  vi.mock('../SystemStatus', () => ({ default: () => null }))

  // Mock useMatches - we control what routes are "matched"
  const mockUseMatches = vi.fn()
  vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
    return { ...actual, useMatches: () => mockUseMatches() }
  })

  function makeStore() {
    return configureStore({
      reducer: {
        auth: (state = { user: { firstName: 'Test', lastName: 'User', role: 'admin' }, isAuthenticated: true, refreshToken: null }) => state,
        notifications: (state = { notifications: [], unreadCount: 0 }) => state,
      },
    })
  }

  function renderMainLayout() {
    return render(
      <Provider store={makeStore()}>
        <MemoryRouter>
          <MainLayout />
        </MemoryRouter>
      </Provider>
    )
  }

  describe('MainLayout AppBar title', () => {
    beforeEach(() => {
      mockUseMatches.mockReturnValue([])
    })

    it('shows handle.title from the deepest matched route', () => {
      mockUseMatches.mockReturnValue([
        { id: '0', pathname: '/', params: {}, data: null, handle: null },
        { id: '1', pathname: '/inventory/products', params: {}, data: null, handle: { title: 'Products' } },
      ])
      renderMainLayout()
      expect(screen.getByText('Products')).toBeInTheDocument()
    })

    it('uses title from non-leaf match when leaf has no handle', () => {
      mockUseMatches.mockReturnValue([
        { id: '0', pathname: '/', params: {}, data: null, handle: { title: 'Inventory' } },
        { id: '1', pathname: '/inventory/products', params: {}, data: null, handle: null },
      ])
      renderMainLayout()
      expect(screen.getByText('Inventory')).toBeInTheDocument()
    })

    it('falls back to ERP System when no route has a handle.title', () => {
      mockUseMatches.mockReturnValue([
        { id: '0', pathname: '/', params: {}, data: null, handle: null },
      ])
      renderMainLayout()
      expect(screen.getByText('ERP System')).toBeInTheDocument()
    })

    it('falls back to ERP System when match chain is empty', () => {
      mockUseMatches.mockReturnValue([])
      renderMainLayout()
      expect(screen.getByText('ERP System')).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/MainLayout.test.tsx --no-coverage
  ```

  Expected: FAIL — `MainLayout` still renders static "ERP System" for cases 1 and 2; cases 3 and 4 may pass already.

- [ ] **Step 3: Update MainLayout.tsx — add RouteHandle type and useMatches import**

  At the top of `MainLayout.tsx`, add `useMatches` to the react-router-dom import:

  ```ts
  import { Outlet, useLocation, useNavigate, useMatches } from 'react-router-dom'
  ```

  Above the `MainLayout` component function (at module scope, not inside the function), add:

  ```ts
  type RouteHandle = {
    title?: string
  }
  ```

  Inside the component (after the existing state declarations), add:

  ```ts
  const matches = useMatches()
  const pageTitle =
    [...matches].reverse().find(m => (m.handle as RouteHandle)?.title)?.handle?.title ?? 'ERP System'
  ```

  Note: the double `.handle` at the end is intentional — `.find()` returns the full match object, so `.handle?.title` reads the title from it. This is correct, not a typo.

- [ ] **Step 4: Replace the static Typography in the AppBar**

  Find this line in `MainLayout.tsx` (around line 193):
  ```tsx
  <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
    ERP System
  </Typography>
  ```

  Replace with:
  ```tsx
  <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
    {pageTitle}
  </Typography>
  ```

- [ ] **Step 5: Run tests to confirm they pass**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/MainLayout.test.tsx --no-coverage
  ```

  Expected: all 4 tests PASS.

- [ ] **Step 6: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/common/MainLayout.tsx \
          frontend/src/components/common/__tests__/MainLayout.test.tsx
  git commit -m "feat: replace static AppBar title with route-derived page title"
  ```

---

## Task 3: Modernize sidebar brand header

**Files:**
- Modify: `frontend/src/components/common/Sidebar.tsx`
- Modify: `frontend/src/components/common/__tests__/Sidebar.test.tsx`

- [ ] **Step 1: Add settingsApi mock to Sidebar.test.tsx and write new failing tests**

  Open `frontend/src/components/common/__tests__/Sidebar.test.tsx`.

  After the existing imports (do NOT add a duplicate `import { vi } from 'vitest'` — it's already imported), add the mock constant and `vi.mock` call before the `vi.mock('react-transition-group', ...)` block:

  ```ts
  const mockUseGetCompanySettingsQuery = vi.fn()

  vi.mock('@/store/api/settingsApi', () => ({
    useGetCompanySettingsQuery: () => mockUseGetCompanySettingsQuery(),
  }))
  ```

  Add a `beforeEach` that resets the mock to a default "no data" state. In the existing `describe('Sidebar', ...)` block, add/update the `beforeEach`:

  ```ts
  beforeEach(() => {
    localStorage.clear()
    mockUseGetCompanySettingsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: false })
  })
  ```

  Then add these new test cases at the end of the `describe` block:

  ```tsx
  describe('brand header', () => {
    it('renders ERP fallback mark when no logoUrl', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: 'Acme Corp', logoUrl: undefined },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar /></MemoryRouter>)
      expect(screen.getByText('ERP')).toBeInTheDocument()
      expect(screen.queryByRole('img')).not.toBeInTheDocument()
    })

    it('renders logo img with correct src and alt when logoUrl is set', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: 'Acme Corp', logoUrl: 'https://example.com/logo.png' },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar /></MemoryRouter>)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('src', 'https://example.com/logo.png')
      expect(img).toHaveAttribute('alt', 'Acme Corp')
    })

    it('uses fallback alt text when logoUrl is set but company.name is absent', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: undefined, logoUrl: 'https://example.com/logo.png' },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar /></MemoryRouter>)
      const img = screen.getByRole('img')
      expect(img).toHaveAttribute('alt', 'Company logo')
    })

    it('renders ERP fallback mark when image fires onError', async () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: 'Acme Corp', logoUrl: 'https://example.com/broken.png' },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar /></MemoryRouter>)
      const img = screen.getByRole('img')
      fireEvent.error(img)
      await waitFor(() => {
        expect(screen.queryByRole('img')).not.toBeInTheDocument()
        expect(screen.getByText('ERP')).toBeInTheDocument()
      })
    })

    it('always shows ERP System text when expanded', () => {
      render(<MemoryRouter><Sidebar collapsed={false} /></MemoryRouter>)
      expect(screen.getByText('ERP System')).toBeInTheDocument()
    })

    it('shows company name below app name when available and expanded', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: 'Acme Trading Sdn Bhd', logoUrl: undefined },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar collapsed={false} /></MemoryRouter>)
      expect(screen.getByText('Acme Trading Sdn Bhd')).toBeInTheDocument()
    })

    it('omits company name when company.name is unavailable', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: undefined, logoUrl: undefined },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar collapsed={false} /></MemoryRouter>)
      // ERP System is present but no second line
      expect(screen.getByText('ERP System')).toBeInTheDocument()
      // There should be no empty caption element — just assert the known-absent text
    })

    it('hides text stack and shows only mark when collapsed', () => {
      mockUseGetCompanySettingsQuery.mockReturnValue({
        data: { name: 'Acme Corp', logoUrl: undefined },
        isLoading: false,
        isError: false,
      })
      render(<MemoryRouter><Sidebar collapsed={true} /></MemoryRouter>)
      expect(screen.queryByText('ERP System')).not.toBeInTheDocument()
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument()
      expect(screen.getByText('ERP')).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run tests to confirm new tests fail**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
  ```

  Expected: existing tests will error (no mock for settingsApi yet in the component) and new tests will fail.

- [ ] **Step 3: Update Sidebar.tsx — import and call useGetCompanySettingsQuery**

  Add to the existing import block at the top of `Sidebar.tsx`:

  ```ts
  import { useGetCompanySettingsQuery } from '@/store/api/settingsApi'
  ```

  Inside the `Sidebar` component function (after the existing state/hook calls), add:

  ```ts
  const { data: company } = useGetCompanySettingsQuery()
  const [imageError, setImageError] = React.useState(false)
  ```

  Reset `imageError` when `logoUrl` changes (prevents stale error state if admin updates the logo):

  ```ts
  React.useEffect(() => {
    setImageError(false)
  }, [company?.logoUrl])
  ```

- [ ] **Step 4: Replace the brand header in Sidebar.tsx**

  Find the brand header JSX (around line 1108–1133). It currently looks like:

  ```tsx
  <Box sx={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 1.5 }}>
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: 1,
        bgcolor: 'primary.main',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontWeight: 'bold',
        fontSize: '0.875rem',
        flexShrink: 0,
      }}
    >
      ERP
    </Box>
    {!collapsed && (
      <Typography
        variant="h6"
        sx={{ fontWeight: 600, color: SIDEBAR_COLORS.activeText, whiteSpace: 'nowrap' }}
      >
        ERP System
      </Typography>
    )}
  </Box>
  ```

  Replace with:

  ```tsx
  <Box sx={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 1.5 }}>
    {/* 36×36 brand mark — logo image or ERP fallback */}
    <Box
      sx={{
        width: 36,
        height: 36,
        borderRadius: 1,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...(company?.logoUrl && !imageError
          ? { bgcolor: 'rgba(255,255,255,0.04)' }
          : {
              bgcolor: 'primary.main',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '0.875rem',
            }),
      }}
    >
      {company?.logoUrl && !imageError ? (
        <img
          src={company.logoUrl}
          alt={company.name ?? 'Company logo'}
          onError={() => setImageError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        'ERP'
      )}
    </Box>

    {/* Two-line text stack — expanded mode only */}
    {!collapsed && (
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="h6"
          sx={{ fontWeight: 600, color: SIDEBAR_COLORS.activeText, whiteSpace: 'nowrap', lineHeight: 1.2 }}
        >
          ERP System
        </Typography>
        {company?.name && (
          <Typography
            variant="caption"
            noWrap
            sx={{ color: SIDEBAR_COLORS.text, display: 'block', lineHeight: 1.2 }}
          >
            {company.name}
          </Typography>
        )}
      </Box>
    )}
  </Box>
  ```

- [ ] **Step 5: Run all Sidebar tests**

  ```bash
  cd frontend && npx vitest run src/components/common/__tests__/Sidebar.test.tsx --no-coverage
  ```

  Expected: all tests PASS, including all pre-existing tests.

- [ ] **Step 6: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/components/common/Sidebar.tsx \
          frontend/src/components/common/__tests__/Sidebar.test.tsx
  git commit -m "feat: modernize sidebar header with company logo and name"
  ```

---

## Task 4: Run full test suite and final check

- [ ] **Step 1: Run all frontend tests**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass. If any router tests fail because they assert on static "ERP System" text in the AppBar or on exact route object shape, update those assertions to match the new content.

- [ ] **Step 2: Run TypeScript check one final time**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 3: Commit any router test fixes if needed**

  The router test file is at `frontend/src/__tests__/router.test.tsx` — verify this path exists before running git add.

  ```bash
  git add frontend/src/__tests__/router.test.tsx
  git commit -m "test: update router tests for handle metadata and dynamic AppBar title"
  ```
