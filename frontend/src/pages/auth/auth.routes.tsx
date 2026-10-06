import React from 'react'
import { redirect, type RouteObject } from 'react-router-dom'
import { sessionReady } from '@/session'
import { store } from '@/store'
import type { RootState } from '@/store'

const LoginPage = React.lazy(() => import('./LoginPage'))
const MandatoryPasswordChangePage = React.lazy(() => import('./MandatoryPasswordChangePage'))

// What the session runtime found at startup decides whether these forms render
// or RootLayout shows the storage-unavailable screen in their place, so that is
// known before the first render.
async function sessionLoader() {
  await sessionReady()
  return null
}

// The mandatory change needs the session it changes the password of. Opened
// without one it goes to the sign-in form; the page itself leaves when the
// session ends while it is open. RootLayout covers the storage-unavailable state.
async function passwordChangeLoader() {
  await sessionReady()
  const { auth } = store.getState() as unknown as RootState
  if (!auth.storageUnavailable && !auth.isAuthenticated) return redirect('/login')
  return null
}

export const authRoutes: RouteObject[] = [
  { path: '/login', loader: sessionLoader, element: <LoginPage /> },
  { path: '/change-password-required', loader: passwordChangeLoader, element: <MandatoryPasswordChangePage /> },
]
