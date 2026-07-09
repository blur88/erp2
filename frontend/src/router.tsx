import React from 'react'
import { Navigate, createBrowserRouter, redirect } from 'react-router-dom'
import RouteErrorBoundary from './components/errors/RouteErrorBoundary'
import MainLayout from './components/common/MainLayout'
import RootLayout from './RootLayout'
import { store, persistor } from './store'
import { authRoutes } from './pages/auth/auth.routes'
import { dashboardRoutes } from './pages/dashboard/dashboard.routes'
import { inventoryRoutes } from './pages/inventory/inventory.routes'
import { salesRoutes } from './pages/sales/sales.routes'
import { purchasingRoutes } from './pages/purchasing/purchasing.routes'
import { settingsRoutes } from './pages/settings/settings.routes'
import { auditLogsRoutes } from './pages/audit-logs/audit-logs.routes'


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
      ...authRoutes,
      {
        loader: authLoader,
        element: <MainLayout />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          ...dashboardRoutes,
          ...inventoryRoutes,
          ...salesRoutes,
          ...purchasingRoutes,
          ...settingsRoutes,
          ...auditLogsRoutes,
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
])
