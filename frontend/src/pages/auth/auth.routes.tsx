import React from 'react'
import type { RouteObject } from 'react-router-dom'

const LoginPage = React.lazy(() => import('./LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./MandatoryPasswordChangePage'))

export const authRoutes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  { path: '/change-password-required', element: <MandatoryPasswordChangePage /> },
]
