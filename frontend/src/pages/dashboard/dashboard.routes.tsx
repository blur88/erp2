import React from 'react'
import type { RouteObject } from 'react-router-dom'

const DashboardPage = React.lazy(() => import('./DashboardPage'))

export const dashboardRoutes: RouteObject[] = [
  { path: '/dashboard', element: <DashboardPage />, handle: { title: 'Dashboard' } },
]
