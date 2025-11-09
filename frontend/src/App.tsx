import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppSelector } from './hooks/useRedux'
import { selectTheme } from './store/slices/themeSlice'

// Layouts
import MainLayout from './components/common/MainLayout'

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
const SettingsPage = React.lazy(() => import('./pages/settings/SettingsPage'))
const UserManagementPage = React.lazy(() => import('./pages/settings/UserManagementPage'))
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
          {/* Main Routes */}
          <Route
            path="/*"
            element={
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
                    <Route path="/reports/sales/product-summary" element={<SalesByProductSummary />} />
                    <Route path="/reports/sales/product-details" element={<SalesByProductDetails />} />
                    <Route path="/reports/sales/order-summary" element={<SalesOrderSummary />} />
                    <Route path="/reports/sales/order-profit" element={<SalesOrderProfitReport />} />
                    <Route path="/reports/sales/customer-payment-summary" element={<CustomerPaymentSummary />} />
                    <Route path="/reports/sales/payment-by-order" element={<CustomerPaymentByOrder />} />

                    {/* Settings */}
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/settings/users" element={<UserManagementPage />} />

                    {/* Default redirect */}
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    
                    {/* 404 page */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
              </MainLayout>
            }
          />
        </Routes>
      </Suspense>
    </Box>
  )
}

export default App