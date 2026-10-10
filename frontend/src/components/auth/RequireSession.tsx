import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/useRedux'
import { selectCurrentUser, selectIsAuthenticated } from '@/store/slices/authSlice'

// Wraps the element of the protected branch of the router and makes both of
// `authLoader`'s decisions again at render. `authLoader` decides on a
// navigation; this covers a tab that is already on a protected route when its
// session ends, for whatever reason (ended or changed in another tab, a failed
// refresh, sign-out), and one whose session turns out to need a password change
// without a navigation: after a storage-waiting recovery the loaders have not
// run for that session yet, and the shell would render until they had (#1361).
// Nothing is requested and nothing reloads.
const RequireSession: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const mustChangePassword = useAppSelector((state) => Boolean(selectCurrentUser(state)?.requiresPasswordChange))
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true })
    else if (mustChangePassword) navigate('/change-password-required', { replace: true })
  }, [isAuthenticated, mustChangePassword, navigate])

  return isAuthenticated && !mustChangePassword ? <>{children}</> : null
}

export default RequireSession
