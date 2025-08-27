import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAuth } from './hooks/useAuth'
import { useAppSelector } from './hooks/useRedux'
import { selectTheme } from './store/slices/themeSlice'

// Layouts
import MainLayout from './components/common/MainLayout'
import AuthLayout from './components/common/AuthLayout'

// Auth Pages (lazy loaded)
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))
const RegisterPage = React.lazy(() => import('./pages/auth/RegisterPage'))
const ForgotPasswordPage = React.lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('./pages/auth/ResetPasswordPage'))

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

// Protected Route Component
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <PageLoader />
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />
  }

  return <>{children}</>
}

// Auth Route Component (redirect if already authenticated)
const AuthRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <PageLoader />
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function App() {
  const { initialize } = useAuth()
  const theme = useAppSelector(selectTheme)

  useEffect(() => {
    // Initialize auth state from localStorage
    initialize()
  }, [initialize])

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme.mode)
  }, [theme.mode])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public Routes */}
          <Route
            path="/auth/*"
            element={
              <AuthRoute>
                <AuthLayout>
                  <Routes>
                    <Route path="login" element={<LoginPage />} />
                    <Route path="register" element={<RegisterPage />} />
                    <Route path="forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="reset-password" element={<ResetPasswordPage />} />
                    <Route path="*" element={<Navigate to="/auth/login" replace />} />
                  </Routes>
                </AuthLayout>
              </AuthRoute>
            }
          />

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
              </ProtectedRoute>
            }
          />
        </Routes>
      </Suspense>
    </Box>
  )
}

export default App