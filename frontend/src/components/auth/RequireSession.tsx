import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/useRedux'
import { selectIsAuthenticated } from '@/store/slices/authSlice'

// Wraps the element of the protected branch of the router. `authLoader` decides
// on a navigation; this covers a tab that is already on a protected route when
// its session ends, for whatever reason (ended or changed in another tab, a
// failed refresh, sign-out). Nothing is requested and nothing reloads.
const RequireSession: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true })
  }, [isAuthenticated, navigate])

  return isAuthenticated ? <>{children}</> : null
}

export default RequireSession
