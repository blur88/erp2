import React from 'react'
import type { RouteObject } from 'react-router-dom'
import { sessionReady } from '@/session'

const LoginPage = React.lazy(() => import('./LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./MandatoryPasswordChangePage'))

// These pages show the form or the storage-unavailable screen depending on what
// the session runtime found at startup, so that is known before they render.
async function sessionLoader() {
  await sessionReady()
  return null
}

export const authRoutes: RouteObject[] = [
  { path: '/login', loader: sessionLoader, element: <LoginPage /> },
  { path: '/change-password-required', loader: sessionLoader, element: <MandatoryPasswordChangePage /> },
]
