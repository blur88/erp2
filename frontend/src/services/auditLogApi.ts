export interface AuditLogFilters {
  page?: number
  limit?: number
  search?: string
  action?: string
  entityType?: string
  entityId?: string
  userId?: string
  username?: string
  startDate?: string
  endDate?: string
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
  ipAddress?: string
}

export interface AuditLogStatistics {
  total: number
  byAction: Array<{ action: string; count: number }>
  byEntityType: Array<{ entityType: string; count: number }>
  topUsers: Array<{ userId: string; username: string; count: number }>
}

