import React from 'react'
import type { RouteObject } from 'react-router-dom'
import { sessionReady } from '@/session'

const LoginPage = React.lazy(() => import('./LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./MandatoryPasswordChangePage'))

// What the session runtime found at startup decides whether these forms render
// or RootLayout shows the storage-unavailable screen in their place, so that is
// known before the first render.
async function sessionLoader() {
  await sessionReady()
  return null
}

export const authRoutes: RouteObject[] = [
  { path: '/login', loader: sessionLoader, element: <LoginPage /> },
  { path: '/change-password-required', loader: sessionLoader, element: <MandatoryPasswordChangePage /> },
]
