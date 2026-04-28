import React from 'react'
import { Navigate, createBrowserRouter, redirect } from 'react-router-dom'
import RouteErrorBoundary from './components/errors/RouteErrorBoundary'
import MainLayout from './components/common/MainLayout'
import RootLayout from './RootLayout'
import { store, persistor } from './store'

const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./pages/auth/MandatoryPasswordChangePage'))
const DashboardPage = React.lazy(() => import('./pages/dashboard/DashboardPage'))

const InventoryPage = React.lazy(() => import('./pages/inventory/InventoryPage'))
const ProductsPage = React.lazy(() => import('./pages/inventory/ProductsPage'))
const CreateProductPage = React.lazy(() => import('./pages/inventory/CreateProductPage'))
const CategoriesPage = React.lazy(() => import('./pages/inventory/CategoriesPage'))
const StockAdjustmentsPage = React.lazy(() => import('./pages/inventory/StockAdjustmentsPage'))
const CreateStockAdjustmentPage = React.lazy(() => import('./pages/inventory/CreateStockAdjustmentPage'))

const SalesPage = React.lazy(() => import('./pages/sales/SalesPage'))
const CustomersPage = React.lazy(() => import('./pages/sales/CustomersPage'))
const CustomerFormPage = React.lazy(() => import('./pages/sales/CustomerFormPage'))
const OrdersPage = React.lazy(() => import('./pages/sales/OrdersPage'))
const CreateSalesOrderPage = React.lazy(() => import('./pages/sales/CreateSalesOrderPage'))
const InvoicesPage = React.lazy(() => import('./pages/sales/InvoicesPage'))
const PaymentsPage = React.lazy(() => import('./pages/sales/PaymentsPage'))

const SalesByProductSummary = React.lazy(() => import('./pages/sales/SalesByProductSummary'))
const SalesByProductDetails = React.lazy(() => import('./pages/sales/SalesByProductDetails'))
const SalesOrderSummary = React.lazy(() => import('./pages/sales/SalesOrderSummary'))
const SalesOrderProfitReport = React.lazy(() => import('./pages/sales/SalesOrderProfitReport'))
const CustomerPaymentSummary = React.lazy(() => import('./pages/sales/CustomerPaymentSummary'))
const CustomerPaymentByOrder = React.lazy(() => import('./pages/sales/CustomerPaymentByOrder'))
const CustomerPaymentDetails = React.lazy(() => import('./pages/sales/CustomerPaymentDetails'))
const CustomerOrderHistory = React.lazy(() => import('./pages/sales/CustomerOrderHistory'))
const ProductCustomerReport = React.lazy(() => import('./pages/sales/ProductCustomerReport'))

const PurchasingPage = React.lazy(() => import('./pages/purchasing/PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./pages/purchasing/SuppliersPage'))
const SupplierFormPage = React.lazy(() => import('./pages/purchasing/SupplierFormPage'))
const PurchaseOrdersPage = React.lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./pages/purchasing/CreatePurchaseOrderPage'))
const GoodsReceivedPage = React.lazy(() => import('./pages/purchasing/GoodsReceivedPage'))
const VendorPaymentsPage = React.lazy(() => import('./pages/purchasing/VendorPaymentsPage'))

const PurchaseOrderSummary = React.lazy(() => import('./pages/purchasing/PurchaseOrderSummary'))
const PurchaseOrderDetailsReport = React.lazy(() => import('./pages/purchasing/PurchaseOrderDetailsReport'))
const PurchaseOrderStatusReport = React.lazy(() => import('./pages/purchasing/PurchaseOrderStatusReport'))
const VendorPaymentDetailsReport = React.lazy(() => import('./pages/purchasing/VendorPaymentDetailsReport'))
const VendorProductListReport = React.lazy(() => import('./pages/purchasing/VendorProductListReport'))

const InventorySummaryReport = React.lazy(() => import('./pages/inventory/InventorySummaryReport'))
const HistoricalInventoryReport = React.lazy(() => import('./pages/inventory/HistoricalInventoryReport'))
const MovementSummaryReport = React.lazy(() => import('./pages/inventory/MovementSummaryReport'))
const PriceListReport = React.lazy(() => import('./pages/inventory/PriceListReport'))
const ProductCostReport = React.lazy(() => import('./pages/inventory/ProductCostReport'))

const CompanySettingsPage = React.lazy(() => import('./pages/settings/CompanySettingsPage'))
const InventoryCostingPage = React.lazy(() => import('./pages/settings/InventoryCostingPage'))
const StockLevelSettingsPage = React.lazy(() => import('./pages/settings/StockLevelSettingsPage'))
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

const AuditLogsPage = React.lazy(() => import('./pages/audit-logs/AuditLogsPage'))

const AccountingDashboardPage = React.lazy(() => import('./pages/accounting/AccountingDashboardPage'))
const ChartOfAccountsPage = React.lazy(() => import('./pages/accounting/ChartOfAccountsPage'))
const FiscalPeriodsPage = React.lazy(() => import('./pages/accounting/FiscalPeriodsPage'))
const JournalEntriesPage = React.lazy(() => import('./pages/accounting/JournalEntriesPage'))
const AccountMappingsPage = React.lazy(() => import('./pages/accounting/AccountMappingsPage'))
const BankReconciliationsPage = React.lazy(() => import('./pages/accounting/BankReconciliationsPage'))
const SettlementsPage = React.lazy(() => import('./pages/accounting/SettlementsPage'))
const OwnerEquityPage = React.lazy(() => import('./pages/accounting/OwnerEquityPage'))
const ExpensesPage = React.lazy(() => import('./pages/accounting/ExpensesPage'))
const FundTransfersPage = React.lazy(() => import('./pages/accounting/FundTransfersPage'))
const TrialBalancePage = React.lazy(() => import('./pages/accounting/reports/TrialBalancePage'))
const BalanceSheetPage = React.lazy(() => import('./pages/accounting/reports/BalanceSheetPage'))
const ProfitAndLossPage = React.lazy(() => import('./pages/accounting/reports/ProfitAndLossPage'))
const GeneralLedgerPage = React.lazy(() => import('./pages/accounting/reports/GeneralLedgerPage'))
const AccountActivityPage = React.lazy(() => import('./pages/accounting/reports/AccountActivityPage'))

const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))

function waitForRehydration(): Promise<void> {
  if (persistor.getState().bootstrapped) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        unsubscribe()
        resolve()
      }
    })
  })
}

async function authLoader({ request }: { request: Request }) {
  await waitForRehydration()

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
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/change-password-required', element: <MandatoryPasswordChangePage /> },
      {
        loader: authLoader,
        element: <MainLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage />, handle: { title: 'Dashboard' } },

          { path: '/inventory', element: <InventoryPage />, handle: { title: 'Inventory' } },
          { path: '/inventory/products', element: <ProductsPage />, handle: { title: 'Products' } },
          { path: '/inventory/products/create', element: <CreateProductPage />, handle: { title: 'Create Product' } },
          { path: '/inventory/products/:id/edit', element: <CreateProductPage />, handle: { title: 'Edit Product' } },
          { path: '/inventory/categories', element: <CategoriesPage />, handle: { title: 'Categories' } },
          { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage />, handle: { title: 'Stock Adjustments' } },
          { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage />, handle: { title: 'Create Stock Adjustment' } },
          { path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage />, handle: { title: 'Edit Stock Adjustment' } },

          { path: '/sales', element: <SalesPage />, handle: { title: 'Sales' } },
          { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
          { path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } },
          { path: '/sales/customers/:id/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
          { path: '/sales/orders', element: <OrdersPage />, handle: { title: 'Sales Orders' } },
          { path: '/sales/orders/create', element: <CreateSalesOrderPage />, handle: { title: 'Create Sales Order' } },
          { path: '/sales/orders/:id/edit', element: <CreateSalesOrderPage />, handle: { title: 'Edit Sales Order' } },
          { path: '/sales/invoices', element: <InvoicesPage />, handle: { title: 'Invoices' } },
          { path: '/sales/payments', element: <PaymentsPage />, handle: { title: 'Payments' } },

          { path: '/purchasing', element: <PurchasingPage />, handle: { title: 'Purchasing' } },
          { path: '/purchasing/suppliers/create', element: <SupplierFormPage />, handle: { title: 'New Supplier' } },
          { path: '/purchasing/suppliers/:id/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
          { path: '/purchasing/suppliers', element: <SuppliersPage />, handle: { title: 'Suppliers' } },
          { path: '/purchasing/orders', element: <PurchaseOrdersPage />, handle: { title: 'Purchase Orders' } },
          { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage />, handle: { title: 'Create Purchase Order' } },
          { path: '/purchasing/orders/:id/edit', element: <CreatePurchaseOrderPage />, handle: { title: 'Edit Purchase Order' } },
          { path: '/purchasing/goods-received', element: <GoodsReceivedPage />, handle: { title: 'Goods Received' } },
          { path: '/purchasing/vendor-payments', element: <VendorPaymentsPage />, handle: { title: 'Vendor Payments' } },

          { path: '/reports/inventory/summary', element: <InventorySummaryReport />, handle: { title: 'Inventory Summary' } },
          { path: '/reports/inventory/historical', element: <HistoricalInventoryReport />, handle: { title: 'Historical Inventory' } },
          { path: '/reports/inventory/movement-summary', element: <MovementSummaryReport />, handle: { title: 'Inventory Movement Summary' } },
          { path: '/reports/inventory/price-list', element: <PriceListReport />, handle: { title: 'Product Price List' } },
          { path: '/reports/inventory/product-cost', element: <ProductCostReport />, handle: { title: 'Product Cost Report' } },

          { path: '/reports/purchasing/order-summary', element: <PurchaseOrderSummary />, handle: { title: 'Purchase Order Summary' } },
          { path: '/reports/purchasing/order-status', element: <PurchaseOrderStatusReport />, handle: { title: 'Purchase Order Status' } },
          { path: '/reports/purchasing/order-details', element: <PurchaseOrderDetailsReport />, handle: { title: 'Purchase Order Details' } },
          { path: '/reports/purchasing/payment-details', element: <VendorPaymentDetailsReport />, handle: { title: 'Vendor Payment Details' } },
          { path: '/reports/purchasing/vendor-purchase-list', element: <VendorProductListReport />, handle: { title: 'Vendor Product List' } },

          { path: '/reports/sales/product-summary', element: <SalesByProductSummary />, handle: { title: 'Sales by Product Summary' } },
          { path: '/reports/sales/product-details', element: <SalesByProductDetails />, handle: { title: 'Sales by Product Details' } },
          { path: '/reports/sales/order-summary', element: <SalesOrderSummary />, handle: { title: 'Sales Order Summary' } },
          { path: '/reports/sales/order-profit', element: <SalesOrderProfitReport />, handle: { title: 'Sales Order Profit Report' } },
          { path: '/reports/sales/customer-payment-summary', element: <CustomerPaymentSummary />, handle: { title: 'Customer Payment Summary' } },
          { path: '/reports/sales/payment-by-order', element: <CustomerPaymentByOrder />, handle: { title: 'Customer Payment by Order' } },
          { path: '/reports/sales/payment-details', element: <CustomerPaymentDetails />, handle: { title: 'Customer Payment Details' } },
          { path: '/reports/sales/order-history', element: <CustomerOrderHistory />, handle: { title: 'Customer Order History' } },
          { path: '/reports/sales/product-customer', element: <ProductCustomerReport />, handle: { title: 'Product Customer Report' } },

          { path: '/settings/company', element: <CompanySettingsPage />, handle: { title: 'Company' } },
          { path: '/settings/price-costing', element: <Navigate to="/settings/inventory-costing" replace /> },
          { path: '/settings/inventory-costing', element: <InventoryCostingPage />, handle: { title: 'Inventory Costing' } },
          { path: '/settings/stock-levels', element: <StockLevelSettingsPage />, handle: { title: 'Stock Levels' } },
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

          { path: '/audit-logs', element: <AuditLogsPage />, handle: { title: 'Audit Logs' } },

          { path: '/accounting', element: <Navigate to="/accounting/dashboard" replace /> },
          { path: '/accounting/dashboard', element: <AccountingDashboardPage />, handle: { title: 'Dashboard' } },
          { path: '/accounting/chart-of-accounts', element: <ChartOfAccountsPage />, handle: { title: 'Chart of Accounts' } },
          { path: '/accounting/fiscal-periods', element: <FiscalPeriodsPage />, handle: { title: 'Fiscal Periods' } },
          { path: '/accounting/journal-entries', element: <JournalEntriesPage />, handle: { title: 'Journal Entries' } },
          { path: '/accounting/journal-entries/:id', element: <Navigate to="/accounting/journal-entries" replace /> },
          { path: '/accounting/account-mappings', element: <AccountMappingsPage />, handle: { title: 'Account Mappings' } },
          { path: '/accounting/settlements', element: <SettlementsPage />, handle: { title: 'Settlements' } },
          { path: '/accounting/owner-equity', element: <OwnerEquityPage />, handle: { title: "Owner's Equity" } },
          { path: '/accounting/expenses', element: <ExpensesPage />, handle: { title: 'Expenses' } },
          { path: '/accounting/fund-transfers', element: <FundTransfersPage />, handle: { title: 'Fund Transfers' } },
          { path: '/accounting/bank-reconciliations', element: <BankReconciliationsPage />, handle: { title: 'Bank Reconciliation' } },
          { path: '/accounting/bank-reconciliations/new', element: <BankReconciliationsPage />, handle: { title: 'New Bank Reconciliation' } },
          { path: '/accounting/bank-reconciliations/:id', element: <Navigate to="/accounting/bank-reconciliations" replace /> },
          { path: '/accounting/reports/trial-balance', element: <TrialBalancePage />, handle: { title: 'Trial Balance' } },
          { path: '/accounting/reports/balance-sheet', element: <BalanceSheetPage />, handle: { title: 'Balance Sheet' } },
          { path: '/accounting/reports/profit-loss', element: <ProfitAndLossPage />, handle: { title: 'Profit & Loss' } },
          { path: '/accounting/reports/general-ledger', element: <GeneralLedgerPage />, handle: { title: 'General Ledger' } },
          { path: '/accounting/reports/account-activity', element: <AccountActivityPage />, handle: { title: 'Account Activity' } },

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
