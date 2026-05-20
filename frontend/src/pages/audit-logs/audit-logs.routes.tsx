import React from 'react'
import type { RouteObject } from 'react-router-dom'

const AuditLogsPage = React.lazy(() => import('./AuditLogsPage'))

export const auditLogsRoutes: RouteObject[] = [
  { path: '/audit-logs', element: <AuditLogsPage />, handle: { title: 'Audit Logs' } },
]
