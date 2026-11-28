import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import PageHeader from '@/components/common/PageHeader'
import { useAppSelector } from '@/hooks/useRedux'
import {
  useGetBackupStatusQuery,
  useListBackupsQuery,
  useStartBackupMutation,
} from '@/store/api/backupApi'
import type { BackupStepName, BackupStatus } from '@/store/api/backupApi'

/** Status is polled only while a Backup runs. The bucket is listed separately, once per finished run. */
export const BACKUP_POLL_INTERVAL_MS = 2000

const STEP_LABELS: Record<BackupStepName, string> = {
  prepare: 'Preparing',
  'version-check': 'PostgreSQL version check',
  snapshot: 'Database snapshot',
  dump: 'Database dump',
  globals: 'Roles and globals',
  'uploads-archive': 'Uploads archive',
  checks: 'Checks',
  encrypt: 'Encryption',
  'local-copy': 'Local copy',
  upload: 'Upload',
  'read-back': 'Read-back check',
  manifest: 'Manifest',
  publish: 'Publishing',
}

const formatDate = (iso: string | null): string => (iso ? new Date(iso).toLocaleString() : '—')

const formatMiB = (bytes: number): string => `${(bytes / 2 ** 20).toFixed(1)} MiB`

export default function BackupPage() {
  const isAdmin = useAppSelector((state) => state.auth?.user?.role) === 'admin'

  /** Set after an accepted start (recoveryPoint) or a conflict (null). */
  const [watching, setWatching] = useState<{ recoveryPoint: string | null } | null>(null)
  const [startMessage, setStartMessage] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)

  /** True while a start is awaited or an attempt is running. Drives status polling only. */
  const [polling, setPolling] = useState(false)
  const { data: status, isError: statusError, refetch: refetchStatus } = useGetBackupStatusQuery(undefined, {
    skip: !isAdmin,
    pollingInterval: polling ? BACKUP_POLL_INTERVAL_MS : 0,
  })
  useEffect(() => {
    setPolling(watching !== null || Boolean(status?.running))
  }, [watching, status])

  const {
    data: list,
    isLoading: listLoading,
    isError: listError,
    refetch: refetchList,
  } = useListBackupsQuery(undefined, { skip: !isAdmin })

  const [startBackup, { isLoading: starting }] = useStartBackupMutation()

  // A run is finished when status shows no running attempt and, for an accepted start, its own attempt is recorded.
  useEffect(() => {
    if (!watching || !status) return
    const finished =
      !status.running &&
      (watching.recoveryPoint === null || status.lastAttempt?.recoveryPoint === watching.recoveryPoint)
    if (finished) setWatching(null)
  }, [watching, status])

  // The bucket is listed once when polling ends, never during it.
  const wasPolling = useRef(false)
  useEffect(() => {
    if (wasPolling.current && !polling) refetchList()
    wasPolling.current = polling
  }, [polling, refetchList])

  if (!isAdmin) {
    return (
      <Box sx={{ p: 3 }} data-testid="backup-page">
        <PageHeader title="Backup & Restore" />
        <Alert severity="warning">Administrator access is required to manage Backups.</Alert>
      </Box>
    )
  }

  const onBackUp = async () => {
    setConflict(false)
    setStartMessage(null)
    try {
      const accepted = await startBackup().unwrap()
      setWatching({ recoveryPoint: accepted.recoveryPoint })
    } catch (error: any) {
      if (error?.status === 409) {
        setConflict(true)
        // A 409 means a run is in progress. Read it from the server before watching, so a stale "idle" is not taken as the end of the run.
        await refetchStatus().catch(() => undefined)
        setWatching({ recoveryPoint: null })
      } else if (error?.status === 503) {
        setStartMessage('Backups are not configured or not ready yet.')
      } else {
        setStartMessage('The Backup could not be started.')
      }
    }
  }

  return (
    <Box sx={{ p: 3 }} data-testid="backup-page">
      <Stack spacing={3}>
        <PageHeader
          title="Backup & Restore"
          subtitle="Encrypted Backups published to off-host storage"
          primaryAction={{
            label: 'Back up now',
            onClick: onBackUp,
            disabled: starting || polling || (status ? !status.configured : true),
          }}
        />

        <StatusSection status={status} statusError={statusError} />

        {conflict && <Alert severity="info">A Backup is already running.</Alert>}
        {startMessage && <Alert severity="error">{startMessage}</Alert>}

        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Backups
          </Typography>
          <BackupListSection list={list} loading={listLoading} failed={listError} />
        </Paper>
      </Stack>
    </Box>
  )
}

function StatusSection({ status, statusError }: { status: BackupStatus | undefined; statusError: boolean }) {
  if (statusError) {
    return <Alert severity="error">Backup status could not be loaded.</Alert>
  }
  if (!status) {
    return <CircularProgress size={20} aria-label="Loading Backup status" />
  }

  const lastAttempt = status.lastAttempt
  const client = status.postgresClient

  return (
    <Stack spacing={2} data-testid="backup-status">
      {!status.configured && (
        <Alert severity="warning">
          Backups are not configured. Missing or invalid settings: {status.missingSettings.join(', ')}.
        </Alert>
      )}
      {status.startup === 'failed' && (
        <Alert severity="error">{status.startupError ?? 'Backups are disabled.'}</Alert>
      )}
      {status.release.status === 'misconfigured' && (
        <Alert severity="error">{status.release.configurationError}</Alert>
      )}
      {status.release.status === 'development' && (
        <Alert severity="info">Development build: Backups are labelled unreleased.</Alert>
      )}
      {client.state === 'mismatch' && (
        <Alert severity="error">
          PostgreSQL client major {client.clientMajor} does not match the database server major {client.serverMajor}.
          Backups are blocked until the images match.
        </Alert>
      )}
      {client.state === 'unavailable' && (
        <Alert severity="warning">PostgreSQL version check could not run: {client.reason}</Alert>
      )}

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Last attempt
        </Typography>
        {status.running && (
          <Typography data-testid="backup-running">Running since {formatDate(status.running.startedAt)}.</Typography>
        )}
        {status.noAttemptSinceRestart || !lastAttempt ? (
          <Typography data-testid="backup-no-attempt">No attempt since restart.</Typography>
        ) : lastAttempt.result === 'succeeded' ? (
          <Typography data-testid="backup-last-attempt">
            Succeeded. Started {formatDate(lastAttempt.startedAt)}, ended {formatDate(lastAttempt.endedAt)}.
          </Typography>
        ) : (
          <Alert severity="error" data-testid="backup-last-attempt">
            Failed at {lastAttempt.failedStep ? STEP_LABELS[lastAttempt.failedStep] : 'an unknown step'}
            {lastAttempt.error ? `: ${lastAttempt.error}` : '.'} Started {formatDate(lastAttempt.startedAt)}.
          </Alert>
        )}
      </Box>
    </Stack>
  )
}

function BackupListSection({
  list,
  loading,
  failed,
}: {
  list: ReturnType<typeof useListBackupsQuery>['data']
  loading: boolean
  failed: boolean
}) {
  if (loading) return <CircularProgress size={20} aria-label="Loading Backups" />
  if (failed || list?.state === 'unavailable') {
    return (
      <Alert severity="error" data-testid="backup-unavailable">
        Backup storage is unavailable. The Backups could not be listed, so this is not an empty list.
      </Alert>
    )
  }
  if (!list) return null

  return (
    <>
      {list.malformed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="backup-malformed">
          {list.malformed.length} Backup{list.malformed.length === 1 ? ' has' : 's have'} a malformed manifest and
          {list.malformed.length === 1 ? ' is' : ' are'} not listed as valid:{' '}
          {list.malformed.map((item) => `${item.recoveryPoint} (${item.reason})`).join('; ')}
        </Alert>
      )}
      {list.backups.length === 0 ? (
        <Typography data-testid="backup-empty">No Backups yet.</Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Backups">
            <TableHead>
              <TableRow>
                <TableCell>Recovery point (UTC)</TableCell>
                <TableCell>Release</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell>PostgreSQL (server / client)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {list.backups.map((backup) => (
                <TableRow key={backup.recoveryPoint}>
                  <TableCell>{backup.recoveryPoint}</TableCell>
                  <TableCell>{backup.release}</TableCell>
                  <TableCell align="right">{formatMiB(backup.archiveSize)}</TableCell>
                  <TableCell>
                    {backup.postgres.serverMajor} / {backup.postgres.clientMajor}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
