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

  if (user && user.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export default AdminRoute
