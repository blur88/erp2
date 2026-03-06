import { createApi } from '@reduxjs/toolkit/query/react'

import type { AuditLog, PaginatedResponse } from '@/types'
import type { AuditLogFilters, AuditLogStatistics } from '@/services/auditLogApi'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated } from './normalizers'

export const auditLogApiSlice = createApi({
  reducerPath: 'auditLogApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['AuditLog', 'AuditLogStats'],
  endpoints: (builder) => ({
    getAuditLogs: builder.query<PaginatedResponse<AuditLog>, AuditLogFilters | undefined>({
      query: (params) => ({ url: '/audit-logs', params: (params ?? {}) as Record<string, unknown> }),
      transformResponse: normalizePaginated<AuditLog>,
      providesTags: ['AuditLog'],
    }),
    getAuditLogsByEntity: builder.query<AuditLog[], { entityType: string; entityId: string }>({
      query: ({ entityType, entityId }) => ({ url: `/audit-logs/entity/${entityType}/${entityId}` }),
      transformResponse: (response: any) => response?.data ?? [],
      providesTags: ['AuditLog'],
    }),
    getAuditLogsByUser: builder.query<AuditLog[], string>({
      query: (userId) => ({ url: `/audit-logs/user/${userId}` }),
      transformResponse: (response: any) => response?.data ?? [],
      providesTags: ['AuditLog'],
    }),
    getAuditLogStatistics: builder.query<AuditLogStatistics, { startDate?: string; endDate?: string } | undefined>({
      query: (params) => ({
        url: '/audit-logs/statistics',
        params: (params ?? {}) as Record<string, unknown>,
      }),
      providesTags: ['AuditLogStats'],
    }),
  }),
})

export const {
  useGetAuditLogsQuery,
  useGetAuditLogsByEntityQuery,
  useGetAuditLogsByUserQuery,
  useGetAuditLogStatisticsQuery,
} = auditLogApiSlice
