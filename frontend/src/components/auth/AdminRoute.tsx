import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAppSelector } from '@/hooks/useRedux'
import ProtectedRoute from './ProtectedRoute'

interface AdminRouteProps {
  children: React.ReactNode
}

const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  return (
    <ProtectedRoute>
      <AdminGuard>{children}</AdminGuard>
    </ProtectedRoute>
  )
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.auth?.user)

  // Fail closed: render admin content only once the user is loaded AND is an admin.
  // A missing/unhydrated user must not fall through to the admin page.
  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default AdminRoute
