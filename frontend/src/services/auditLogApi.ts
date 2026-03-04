import { ApiService } from './api'
import type { AuditLog, PaginatedResponse } from '@/types'

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

export const auditLogApi = {
  /**
   * Get all audit logs with filtering and pagination
   */
  async getAuditLogs(filters: AuditLogFilters = {}) {
    return ApiService.get<PaginatedResponse<AuditLog>>('/audit-logs', {
      params: filters,
    })
  },

  /**
   * Get audit logs for a specific entity
   */
  async getAuditLogsByEntity(entityType: string, entityId: string) {
    const response = await ApiService.get<{ data: AuditLog[] }>(
      `/audit-logs/entity/${entityType}/${entityId}`
    )
    return response.data
  },

  /**
   * Get audit logs for a specific user
   */
  async getAuditLogsByUser(userId: string) {
    const response = await ApiService.get<{ data: AuditLog[] }>(`/audit-logs/user/${userId}`)
    return response.data
  },

  /**
   * Get audit log statistics
   */
  async getStatistics(startDate?: string, endDate?: string) {
    return ApiService.get<AuditLogStatistics>('/audit-logs/statistics', {
      params: { startDate, endDate },
    })
  },
}
