import { createApi } from '@reduxjs/toolkit/query/react'

import { axiosBaseQuery } from './baseQuery'

export interface BackupLog {
  id: string
  filename: string
  filepath: string
  backupType: 'manual' | 'scheduled'
  status: 'in_progress' | 'completed' | 'failed'
  size: number
  databases: string[]
  startedAt: string
  completedAt: string | null
  createdBy: string
  metadata: Record<string, unknown> | null
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface BackupSchedule {
  id: string
  name: string
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'
  cronExpression: string | null
  time: string
  dayOfWeek: number | null
  dayOfMonth: number | null
  databases: string[]
  includeSettings: boolean
  retentionDays: number
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  createdBy: string
  notifications: {
    enabled: boolean
    email?: string
    onSuccess?: boolean
    onFailure?: boolean
  } | null
  createdAt: string
  updatedAt: string
}

export interface CreateBackupDto {
  backupType?: 'manual' | 'scheduled'
  databases?: string[]
  includeSettings?: boolean
  createdBy?: string
  description?: string
}

export interface RestoreBackupDto {
  confirmed: boolean
  restoredBy?: string
  note?: string
}

export interface CreateScheduleDto {
  name: string
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly'
  time?: string
  dayOfWeek?: number
  dayOfMonth?: number
  databases?: string[]
  includeSettings?: boolean
  retentionDays?: number
  enabled?: boolean
}

export interface UpdateScheduleDto {
  name?: string
  frequency?: 'hourly' | 'daily' | 'weekly' | 'monthly'
  time?: string
  dayOfWeek?: number
  dayOfMonth?: number
  databases?: string[]
  includeSettings?: boolean
  retentionDays?: number
  enabled?: boolean
}

export interface BackupSettings {
  id: string
  retentionDays: number
  autoCleanupEnabled: boolean
  cleanupTime: string
  maximumBackupsToKeep: number | null
  maximumTotalSize: number | null
  createdAt: string
  updatedAt: string
}

export interface UpdateBackupSettingsDto {
  retentionDays?: number
  autoCleanupEnabled?: boolean
  cleanupTime?: string
  maximumBackupsToKeep?: number | null
  maximumTotalSize?: number | null
}

const normalizeList = <T>(response: unknown): T[] => {
  if (!response) return []
  if (Array.isArray(response)) return response as T[]
  if (typeof response === 'object') {
    return Object.values(response as Record<string, T>).filter((item) => item != null)
  }
  return []
}

export const backupApiSlice = createApi({
  reducerPath: 'backupApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Backup', 'BackupSchedule', 'BackupSettings'],
  endpoints: (builder) => ({
    getBackups: builder.query<BackupLog[], void>({
      query: () => ({ url: '/backup/list' }),
      transformResponse: (response: unknown) => normalizeList<BackupLog>(response),
      providesTags: ['Backup'],
    }),
    createBackup: builder.mutation<BackupLog, CreateBackupDto>({
      query: (body) => ({ url: '/backup/create', method: 'POST', data: body }),
      invalidatesTags: ['Backup'],
    }),
    restoreBackup: builder.mutation<{ message: string; backup: BackupLog }, { id: string; dto: RestoreBackupDto }>({
      query: ({ id, dto }) => ({ url: `/backup/restore/${id}`, method: 'POST', data: dto }),
      invalidatesTags: ['Backup'],
    }),
    deleteBackup: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/backup/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Backup'],
    }),
    uploadBackup: builder.mutation<BackupLog, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('file', file)
        return {
          url: '/backup/upload',
          method: 'POST',
          data: formData,
          headers: { 'Content-Type': 'multipart/form-data' },
        }
      },
      invalidatesTags: ['Backup'],
    }),

    getSchedules: builder.query<BackupSchedule[], void>({
      query: () => ({ url: '/backup/schedule/list' }),
      transformResponse: (response: unknown) => normalizeList<BackupSchedule>(response),
      providesTags: ['BackupSchedule'],
    }),
    createSchedule: builder.mutation<BackupSchedule, CreateScheduleDto>({
      query: (body) => ({ url: '/backup/schedule', method: 'POST', data: body }),
      invalidatesTags: ['BackupSchedule'],
    }),
    updateSchedule: builder.mutation<BackupSchedule, { id: string; dto: UpdateScheduleDto }>({
      query: ({ id, dto }) => ({ url: `/backup/schedule/${id}`, method: 'POST', data: dto }),
      invalidatesTags: ['BackupSchedule'],
    }),
    deleteSchedule: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/backup/schedule/${id}`, method: 'DELETE' }),
      invalidatesTags: ['BackupSchedule'],
    }),
    toggleSchedule: builder.mutation<BackupSchedule, { id: string; enabled: boolean }>({
      query: ({ id, enabled }) => ({ url: `/backup/schedule/${id}/toggle`, method: 'POST', data: { enabled } }),
      invalidatesTags: ['BackupSchedule'],
    }),
    triggerSchedule: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/backup/schedule/${id}/trigger`, method: 'POST', data: {} }),
      invalidatesTags: ['Backup'],
    }),

    getBackupSettings: builder.query<BackupSettings, void>({
      query: () => ({ url: '/backup/settings' }),
      providesTags: ['BackupSettings'],
    }),
    updateBackupSettings: builder.mutation<BackupSettings, UpdateBackupSettingsDto>({
      query: (body) => ({ url: '/backup/settings', method: 'POST', data: body }),
      invalidatesTags: ['BackupSettings'],
    }),
    cleanupWithSettings: builder.mutation<{ message: string; deletedCount: number }, void>({
      query: () => ({ url: '/backup/cleanup-with-settings', method: 'POST', data: {} }),
      invalidatesTags: ['Backup'],
    }),
  }),
})

export const {
  useGetBackupsQuery,
  useCreateBackupMutation,
  useRestoreBackupMutation,
  useDeleteBackupMutation,
  useUploadBackupMutation,
  useGetSchedulesQuery,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
  useToggleScheduleMutation,
  useTriggerScheduleMutation,
  useGetBackupSettingsQuery,
  useUpdateBackupSettingsMutation,
  useCleanupWithSettingsMutation,
} = backupApiSlice
