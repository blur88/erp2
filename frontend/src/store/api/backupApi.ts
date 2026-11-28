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
  tagTypes: ['BackupStatus', 'BackupList'],
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
  }),
})

export const {
  useGetBackupStatusQuery,
  useListBackupsQuery,
  useStartBackupMutation,
} = backupApiSlice
