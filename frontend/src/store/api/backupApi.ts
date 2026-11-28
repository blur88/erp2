import { createApi } from '@reduxjs/toolkit/query/react'

import { axiosBaseQuery } from './baseQuery'

/** Mirrors the backend's sanitised Backup status (#2111). No secrets are ever sent. */
export type BackupStepName =
  | 'prepare'
  | 'version-check'
  | 'snapshot'
  | 'dump'
  | 'globals'
  | 'uploads-archive'
  | 'checks'
  | 'encrypt'
  | 'local-copy'
  | 'upload'
  | 'read-back'
  | 'manifest'
  | 'publish'

export interface BackupAttemptRecord {
  recoveryPoint: string
  startedAt: string
  endedAt: string | null
  result: 'succeeded' | 'failed'
  failedStep: BackupStepName | null
  error: string | null
}

export type PostgresClientView =
  | { state: 'unchecked' }
  | { state: 'compatible'; clientMajor: number; serverMajor: number }
  | { state: 'mismatch'; clientMajor: number; serverMajor: number }
  | { state: 'unavailable'; reason: string }

/** Mirrors the backend's scheduling state (#2112). */
export type BackupSchedulingStatus =
  | { state: 'scheduled'; intervalMinutes: number; nextRunAt: string }
  | { state: 'unavailable'; reason: string }

export interface BackupSettingsValues {
  intervalMinutes: number
  retentionWindowHours: number
  retentionDailyCount: number
  retentionWeeklyCount: number
  retentionMonthlyCount: number
}

export interface BackupSettingsFieldError {
  field: string
  message: string
}

/** A rejected save: the backend sends one entry per failing field as the response `message`. */
export type BackupSettingsRejection = BackupSettingsFieldError[]

export type StoredBackupSettings =
  | { state: 'valid'; settings: BackupSettingsValues }
  | { state: 'missing' }
  | { state: 'invalid'; errors: BackupSettingsFieldError[]; values: Record<string, unknown> }

export interface BackupStatus {
  configured: boolean
  missingSettings: string[]
  running: { recoveryPoint: string; startedAt: string } | null
  lastAttempt: BackupAttemptRecord | null
  noAttemptSinceRestart: boolean
  postgresClient: PostgresClientView
  release: { version: string; status: 'released' | 'development' | 'misconfigured'; configurationError: string | null }
  startup: 'starting' | 'ready' | 'failed'
  startupError: string | null
  scheduling: BackupSchedulingStatus
}

export interface BackupListItem {
  recoveryPoint: string
  release: string
  archiveSize: number
  postgres: { serverMajor: number; clientMajor: number }
}

export interface MalformedBackupItem {
  recoveryPoint: string
  reason: string
}

export type BackupListResponse =
  | { state: 'ok'; backups: BackupListItem[]; malformed: MalformedBackupItem[] }
  | { state: 'unavailable'; reason: string }

export interface BackupStartAccepted {
  recoveryPoint: string
  startedAt: string
}

export const backupApiSlice = createApi({
  reducerPath: 'backupApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['BackupStatus', 'BackupList', 'BackupSettings'],
  endpoints: (builder) => ({
    /** In-memory status only. Polling this never lists the bucket. */
    getBackupStatus: builder.query<BackupStatus, void>({
      query: () => ({ url: '/backups/status' }),
      providesTags: ['BackupStatus'],
    }),
    /** Lists from storage. Not polled; refetched when a run finishes. */
    listBackups: builder.query<BackupListResponse, void>({
      query: () => ({ url: '/backups' }),
      providesTags: ['BackupList'],
    }),
    startBackup: builder.mutation<BackupStartAccepted, void>({
      query: () => ({ url: '/backups', method: 'POST' }),
      invalidatesTags: ['BackupStatus'],
    }),
    /** Stored settings, or why they are missing or invalid. */
    getBackupSettings: builder.query<StoredBackupSettings, void>({
      query: () => ({ url: '/backups/settings' }),
      providesTags: ['BackupSettings'],
    }),
    /** A rejected save leaves the stored row alone; a valid save re-times scheduling. */
    updateBackupSettings: builder.mutation<BackupSettingsValues, BackupSettingsValues>({
      query: (body) => ({ url: '/backups/settings', method: 'PUT', body }),
      invalidatesTags: ['BackupSettings', 'BackupStatus'],
    }),
  }),
})

export const {
  useGetBackupStatusQuery,
  useListBackupsQuery,
  useStartBackupMutation,
  useGetBackupSettingsQuery,
  useUpdateBackupSettingsMutation,
} = backupApiSlice
