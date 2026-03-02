import React from 'react'
import { Navigate, createBrowserRouter, redirect } from 'react-router-dom'
import MainLayout from './components/common/MainLayout'
import RootLayout from './RootLayout'
import { store } from './store'

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

const AuditLogsPage = React.lazy(() => import('./pages/audit-logs/AuditLogsPage'))

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

const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))

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
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/change-password-required', element: <MandatoryPasswordChangePage /> },
      {
        loader: authLoader,
        element: <MainLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },

          { path: '/inventory', element: <InventoryPage /> },
          { path: '/inventory/products', element: <ProductsPage /> },
          { path: '/inventory/products/create', element: <CreateProductPage /> },
          { path: '/inventory/products/:id/edit', element: <CreateProductPage /> },
          { path: '/inventory/categories', element: <CategoriesPage /> },
          { path: '/inventory/stock-adjustments', element: <StockAdjustmentsPage /> },
          { path: '/inventory/stock-adjustments/create', element: <CreateStockAdjustmentPage /> },
          { path: '/inventory/stock-adjustments/:id/edit', element: <CreateStockAdjustmentPage /> },

          { path: '/sales', element: <SalesPage /> },
          { path: '/sales/customers', element: <CustomersPage /> },
          { path: '/sales/orders', element: <OrdersPage /> },
          { path: '/sales/orders/create', element: <CreateSalesOrderPage /> },
          { path: '/sales/orders/:id/edit', element: <CreateSalesOrderPage /> },
          { path: '/sales/invoices', element: <InvoicesPage /> },
          { path: '/sales/payments', element: <PaymentsPage /> },

          { path: '/purchasing', element: <PurchasingPage /> },
          { path: '/purchasing/suppliers', element: <SuppliersPage /> },
          { path: '/purchasing/orders', element: <PurchaseOrdersPage /> },
          { path: '/purchasing/orders/create', element: <CreatePurchaseOrderPage /> },
          { path: '/purchasing/orders/:id/edit', element: <CreatePurchaseOrderPage /> },
          { path: '/purchasing/goods-received', element: <GoodsReceivedPage /> },
          { path: '/purchasing/vendor-payments', element: <VendorPaymentsPage /> },

          { path: '/reports/inventory/summary', element: <InventorySummaryReport /> },
          { path: '/reports/inventory/historical', element: <HistoricalInventoryReport /> },
          { path: '/reports/inventory/movement-summary', element: <MovementSummaryReport /> },
          { path: '/reports/inventory/price-list', element: <PriceListReport /> },
          { path: '/reports/inventory/product-cost', element: <ProductCostReport /> },

          { path: '/reports/purchasing/order-summary', element: <PurchaseOrderSummary /> },
          { path: '/reports/purchasing/order-status', element: <PurchaseOrderStatusReport /> },
          { path: '/reports/purchasing/order-details', element: <PurchaseOrderDetailsReport /> },
          { path: '/reports/purchasing/payment-details', element: <VendorPaymentDetailsReport /> },
          { path: '/reports/purchasing/vendor-purchase-list', element: <VendorProductListReport /> },

          { path: '/reports/sales/product-summary', element: <SalesByProductSummary /> },
          { path: '/reports/sales/product-details', element: <SalesByProductDetails /> },
          { path: '/reports/sales/order-summary', element: <SalesOrderSummary /> },
          { path: '/reports/sales/order-profit', element: <SalesOrderProfitReport /> },
          { path: '/reports/sales/customer-payment-summary', element: <CustomerPaymentSummary /> },
          { path: '/reports/sales/payment-by-order', element: <CustomerPaymentByOrder /> },
          { path: '/reports/sales/payment-details', element: <CustomerPaymentDetails /> },
          { path: '/reports/sales/order-history', element: <CustomerOrderHistory /> },
          { path: '/reports/sales/product-customer', element: <ProductCustomerReport /> },

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

          { path: '/audit-logs', element: <AuditLogsPage /> },

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

          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
