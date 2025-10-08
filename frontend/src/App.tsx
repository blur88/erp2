import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppSelector } from './hooks/useRedux'
import { selectTheme } from './store/slices/themeSlice'

// Layouts
import MainLayout from './components/common/MainLayout'
import NetworkStatus from './components/common/NetworkStatus'

// Main Pages (lazy loaded)
const DashboardPage = React.lazy(() => import('./pages/dashboard/DashboardPage'))
const InventoryPage = React.lazy(() => import('./pages/inventory/InventoryPage'))
const ProductsPage = React.lazy(() => import('./pages/inventory/ProductsPage'))
const CategoriesPage = React.lazy(() => import('./pages/inventory/CategoriesPage'))
const SalesPage = React.lazy(() => import('./pages/sales/SalesPage'))
const CustomersPage = React.lazy(() => import('./pages/sales/CustomersPage'))
const OrdersPage = React.lazy(() => import('./pages/sales/OrdersPage'))
const InvoicesPage = React.lazy(() => import('./pages/sales/InvoicesPage'))
const PaymentsPage = React.lazy(() => import('./pages/sales/PaymentsPage'))
const PurchasingPage = React.lazy(() => import('./pages/purchasing/PurchasingPage'))
const SuppliersPage = React.lazy(() => import('./pages/purchasing/SuppliersPage'))
const PurchaseOrdersPage = React.lazy(() => import('./pages/purchasing/PurchaseOrdersPage'))
const CreatePurchaseOrderPage = React.lazy(() => import('./pages/purchasing/CreatePurchaseOrderPage'))
const GRNPage = React.lazy(() => import('./pages/purchasing/GRNPage'))
const ReportsPage = React.lazy(() => import('./pages/reports/ReportsPage'))
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
      <NetworkStatus />
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
                    <Route path="/inventory/categories" element={<CategoriesPage />} />

                    {/* Sales Management */}
                    <Route path="/sales" element={<SalesPage />} />
                    <Route path="/sales/customers" element={<CustomersPage />} />
                    <Route path="/sales/orders" element={<OrdersPage />} />
                    <Route path="/sales/invoices" element={<InvoicesPage />} />
                    <Route path="/sales/payments" element={<PaymentsPage />} />

                    {/* Purchasing Management */}
                    <Route path="/purchasing" element={<PurchasingPage />} />
                    <Route path="/purchasing/suppliers" element={<SuppliersPage />} />
                    <Route path="/purchasing/orders" element={<PurchaseOrdersPage />} />
                    <Route path="/purchasing/orders/create" element={<CreatePurchaseOrderPage />} />
                    <Route path="/purchasing/orders/:id/edit" element={<CreatePurchaseOrderPage />} />
                    <Route path="/purchasing/grn" element={<GRNPage />} />

                    {/* Reports */}
                    <Route path="/reports" element={<ReportsPage />} />

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