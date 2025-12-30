import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppSelector } from './hooks/useRedux'
import { selectTheme } from './store/slices/themeSlice'

// Layouts
import MainLayout from './components/common/MainLayout'
import ProtectedRoute from './components/auth/ProtectedRoute'

// Auth Pages
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))

// Main Pages (lazy loaded)
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
const PurchasingPage = React.lazy(() => import('./pages/purchasing/PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./pages/purchasing/SuppliersPage'))
const PurchaseOrdersPage = React.lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./pages/purchasing/CreatePurchaseOrderPage'))
const GoodsReceivedPage = React.lazy(() => import('./pages/purchasing/GoodsReceivedPage'))
const VendorPaymentsPage = React.lazy(() => import('./pages/purchasing/VendorPaymentsPage'))
const SalesByProductSummary = React.lazy(() => import('./pages/sales/SalesByProductSummary'))
const SalesByProductDetails = React.lazy(() => import('./pages/sales/SalesByProductDetails'))
const SalesOrderSummary = React.lazy(() => import('./pages/sales/SalesOrderSummary'))
const SalesOrderProfitReport = React.lazy(() => import('./pages/sales/SalesOrderProfitReport'))
const CustomerPaymentSummary = React.lazy(() => import('./pages/sales/CustomerPaymentSummary'))
const CustomerPaymentByOrder = React.lazy(() => import('./pages/sales/CustomerPaymentByOrder'))
const CustomerPaymentDetails = React.lazy(() => import('./pages/sales/CustomerPaymentDetails'))
const CustomerOrderHistory = React.lazy(() => import('./pages/sales/CustomerOrderHistory'))
const ProductCustomerReport = React.lazy(() => import('./pages/sales/ProductCustomerReport'))
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
const PrintSettingsPage = React.lazy(() => import('./pages/settings/PrintSettingsPage'))
const DocumentNumbersPage = React.lazy(() => import('./pages/settings/DocumentNumbersPage'))
const BackupManagement = React.lazy(() => import('./pages/settings/BackupManagement'))
const UserManagementPage = React.lazy(() => import('./pages/settings/UserManagementPage'))
const RoleManagementPage = React.lazy(() => import('./pages/settings/RoleManagementPage'))
const SecuritySettingsPage = React.lazy(() => import('./pages/settings/SecuritySettingsPage'))
const AuditLogsPage = React.lazy(() => import('./pages/audit-logs/AuditLogsPage'))
const NotFoundPage = React.lazy(() => import('./pages/NotFoundPage'))

// Loading component
const PageLoader = () => (
  <Box sx={{ width: '100%', position: 'fixed', top: 0, zIndex: 9999 }}>
    <LinearProgress />
  </Box>
)


function App() {
  const theme = useAppSelector(selectTheme)

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme.mode)
  }, [theme.mode])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Routes>
                    {/* Dashboard */}
                    <Route path="/dashboard" element={<DashboardPage />} />

                    {/* Inventory Management */}
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/inventory/products" element={<ProductsPage />} />
                    <Route path="/inventory/products/create" element={<CreateProductPage />} />
                    <Route path="/inventory/products/:id/edit" element={<CreateProductPage />} />
                    <Route path="/inventory/categories" element={<CategoriesPage />} />
                    <Route path="/inventory/stock-adjustments" element={<StockAdjustmentsPage />} />
                    <Route path="/inventory/stock-adjustments/create" element={<CreateStockAdjustmentPage />} />
                    <Route path="/inventory/stock-adjustments/:id/edit" element={<CreateStockAdjustmentPage />} />

                    {/* Sales Management */}
                    <Route path="/sales" element={<SalesPage />} />
                    <Route path="/sales/customers" element={<CustomersPage />} />
                    <Route path="/sales/orders" element={<OrdersPage />} />
                    <Route path="/sales/orders/create" element={<CreateSalesOrderPage />} />
                    <Route path="/sales/orders/:id/edit" element={<CreateSalesOrderPage />} />
                    <Route path="/sales/invoices" element={<InvoicesPage />} />
                    <Route path="/sales/payments" element={<PaymentsPage />} />

                    {/* Purchasing Management */}
                    <Route path="/purchasing" element={<PurchasingPage />} />
                    <Route path="/purchasing/suppliers" element={<SuppliersPage />} />
                    <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
                    <Route path="/purchasing/orders/create" element={<CreatePurchaseOrderPage />} />
                    <Route path="/purchasing/orders/:id/edit" element={<CreatePurchaseOrderPage />} />
                    <Route path="/purchasing/goods-received" element={<GoodsReceivedPage />} />
                    <Route path="/purchasing/vendor-payments" element={<VendorPaymentsPage />} />

                    {/* Reports */}
                    <Route path="/reports/inventory/summary" element={<InventorySummaryReport />} />
                    <Route path="/reports/inventory/historical" element={<HistoricalInventoryReport />} />
                    <Route path="/reports/inventory/movement-summary" element={<MovementSummaryReport />} />
                    <Route path="/reports/inventory/price-list" element={<PriceListReport />} />
                    <Route path="/reports/inventory/product-cost" element={<ProductCostReport />} />
                    <Route path="/reports/purchasing/order-summary" element={<PurchaseOrderSummary />} />
                    <Route path="/reports/purchasing/order-status" element={<PurchaseOrderStatusReport />} />
                    <Route path="/reports/purchasing/order-details" element={<PurchaseOrderDetailsReport />} />
                    <Route path="/reports/purchasing/payment-details" element={<VendorPaymentDetailsReport />} />
                    <Route path="/reports/purchasing/vendor-purchase-list" element={<VendorProductListReport />} />
                    <Route path="/reports/sales/product-summary" element={<SalesByProductSummary />} />
                    <Route path="/reports/sales/product-details" element={<SalesByProductDetails />} />
                    <Route path="/reports/sales/order-summary" element={<SalesOrderSummary />} />
                    <Route path="/reports/sales/order-profit" element={<SalesOrderProfitReport />} />
                    <Route path="/reports/sales/customer-payment-summary" element={<CustomerPaymentSummary />} />
                    <Route path="/reports/sales/payment-by-order" element={<CustomerPaymentByOrder />} />
                    <Route path="/reports/sales/payment-details" element={<CustomerPaymentDetails />} />
                    <Route path="/reports/sales/order-history" element={<CustomerOrderHistory />} />
                    <Route path="/reports/sales/product-customer" element={<ProductCustomerReport />} />

                    {/* Settings */}
                    <Route path="/settings/company" element={<CompanySettingsPage />} />
                    <Route path="/settings/price-costing" element={<PriceCostingPage />} />
                    <Route path="/settings/print" element={<PrintSettingsPage />} />
                    <Route path="/settings/document-numbers" element={<DocumentNumbersPage />} />
                    <Route path="/settings/users" element={<UserManagementPage />} />
                    <Route path="/settings/roles" element={<RoleManagementPage />} />
                    <Route path="/settings/security" element={<SecuritySettingsPage />} />
                    <Route path="/settings/backup" element={<BackupManagement />} />

                    {/* Audit Logs */}
                    <Route path="/audit-logs" element={<AuditLogsPage />} />

                    {/* Default redirect */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    
                    {/* 404 page */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </MainLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Box>
  )
}

export default App