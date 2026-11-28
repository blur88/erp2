import React, { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Link,
  Paper,
  Stack,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import PageHeader from '@/components/common/PageHeader'

/** The only restore procedure (#2113). It lives in the repository, so the link goes to the default branch. */
const BACKUP_RESTORE_RUNBOOK_URL = 'https://github.com/blur88/erp2/blob/main/docs/deployment/BACKUP_RESTORE_RUNBOOK.md'
import { useAppSelector } from '@/hooks/useRedux'
import {
  useGetBackupSettingsQuery,
  useGetBackupStatusQuery,
  useListBackupsQuery,
  useStartBackupMutation,
  useUpdateBackupSettingsMutation,
} from '@/store/api/backupApi'
import type {
  BackupListResponse,
  BackupLocalCopy,
  BackupRpoStatus,
  BackupSettingsRejection,
  BackupSettingsValues,
  BackupStatus,
  BackupRetentionRecord,
  BackupRetentionStep,
  BackupStepName,
  StoredBackupSettings,
} from '@/store/api/backupApi'

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

const RETENTION_STEP_LABELS: Record<BackupRetentionStep, string> = {
  settings: 'Reading settings',
  'local-copy': 'Pruning local copies',
  list: 'Listing storage',
  expire: 'Deleting expired Backups',
  orphans: 'Deleting abandoned archives',
  unexpected: 'Retention',
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
  const { data: storedSettings } = useGetBackupSettingsQuery(undefined, { skip: !isAdmin })
  const [saveSettings] = useUpdateBackupSettingsMutation()

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

        <Typography variant="body2" data-testid="backup-runbook">
          To restore from a Backup, follow the{' '}
          <Link href={BACKUP_RESTORE_RUNBOOK_URL} target="_blank" rel="noopener noreferrer">
            Backup & Restore runbook
          </Link>
          .
        </Typography>

        <ProtectionSection list={list} />

        <StatusSection status={status} statusError={statusError} />

        <SettingsSection stored={storedSettings} saveSettings={saveSettings} />

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
      <SchedulingLine scheduling={status.scheduling} />

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
      {status.heartbeat.missingSettings.length > 0 && (
        <Alert severity="warning" data-testid="backup-heartbeat-config">
          Heartbeat not configured: {status.heartbeat.missingSettings.join(', ')}. Off-site alerts are not sent for these.
        </Alert>
      )}
      {status.heartbeat.lastPing?.result === 'failed' && (
        <Alert severity="warning" data-testid="backup-monitoring">
          Monitoring problem: {status.heartbeat.lastPing.message ?? 'a heartbeat was not delivered'}. The Backup itself is
          valid; only the off-site alert ping failed.
        </Alert>
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

      <Box>
        <Typography variant="subtitle1" gutterBottom>
          Last retention pass
        </Typography>
        <RetentionResult retention={status.lastRetention} />
      </Box>
    </Stack>
  )
}

/** Shown apart from the last attempt: a retention failure does not change a Backup result (#2114). */
function RetentionResult({ retention }: { retention: BackupRetentionRecord | null }) {
  if (!retention) {
    return <Typography data-testid="backup-retention">No retention pass since restart.</Typography>
  }
  if (retention.result === 'skipped') {
    return (
      <Typography data-testid="backup-retention">
        Skipped: {retention.message ?? 'retention was not run.'}
      </Typography>
    )
  }
  if (retention.result === 'failed') {
    return (
      <Alert severity="warning" data-testid="backup-retention">
        Failed at {retention.failedStep ? RETENTION_STEP_LABELS[retention.failedStep] : 'an unknown step'}
        {retention.message ? `: ${retention.message}` : '.'} Backup results are unaffected.
      </Alert>
    )
  }
  return (
    <Typography data-testid="backup-retention">
      Expired Backups deleted: {retention.expiredBackups}. Abandoned archives deleted: {retention.orphanArchives}.
      Local copies pruned: {retention.prunedLocalCopies}.
    </Typography>
  )
}

const UNKNOWN_RPO: BackupRpoStatus = { state: 'unknown', ageMinutes: null, recoveryPoint: null }

const RPO_LABELS: Record<BackupRpoStatus['state'], string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  breach: 'RPO breach',
  unknown: 'Unknown',
}

const RPO_SEVERITY: Record<BackupRpoStatus['state'], 'success' | 'warning' | 'error' | 'info'> = {
  healthy: 'success',
  warning: 'warning',
  breach: 'error',
  unknown: 'info',
}

/** The RPO state, the Local copy, and the warnings about whether a Verified Backup exists (#2115). */
function ProtectionSection({ list }: { list: BackupListResponse | undefined }) {
  const rpo = list?.rpo ?? UNKNOWN_RPO
  const localCopy: BackupLocalCopy | null = list?.localCopy ?? null
  const unreleased = list?.state === 'ok' ? list.unreleasedCount : 0
  const noVerified = list?.state === 'ok' && rpo.recoveryPoint === null

  return (
    <Paper sx={{ p: 2 }} data-testid="backup-protection">
      <Typography variant="h6" gutterBottom>
        Protection
      </Typography>
      <Stack spacing={2}>
        <Box data-testid="backup-rpo" data-state={rpo.state}>
          <Alert severity={RPO_SEVERITY[rpo.state]} variant="outlined" icon={false}>
            <Typography component="span" sx={{ fontWeight: 600 }}>
              {RPO_LABELS[rpo.state]}
            </Typography>
            {rpo.state === 'unknown' ? (
              <Typography component="span"> The age of the newest Verified Backup cannot be established.</Typography>
            ) : (
              <Typography component="span">
                {' '}
                Newest Verified Backup: {rpo.recoveryPoint}, {rpo.ageMinutes} minutes ago.
              </Typography>
            )}
          </Alert>
        </Box>
        {rpo.state === 'warning' && (
          <Alert severity="warning" data-testid="backup-rpo-warning">
            The newest Verified Backup is {rpo.ageMinutes} minutes old. An RPO breach starts at 60 minutes.
          </Alert>
        )}
        {rpo.state === 'breach' && (
          <Alert severity="error" data-testid="backup-rpo-warning">
            The newest Verified Backup is {rpo.ageMinutes} minutes old, past the 60-minute RPO.
          </Alert>
        )}
        {noVerified && (
          <Alert severity="warning" data-testid="backup-no-verified">
            No Verified Backup exists yet. Run a Backup and wait for it to publish.
          </Alert>
        )}
        {unreleased > 0 && (
          <Typography data-testid="backup-unreleased">
            {unreleased} unreleased Backup{unreleased === 1 ? ' is' : 's are'} listed but{' '}
            {unreleased === 1 ? 'does' : 'do'} not count towards the RPO.
          </Typography>
        )}
        {localCopy && <LocalCopyLine localCopy={localCopy} />}
      </Stack>
    </Paper>
  )
}

function LocalCopyLine({ localCopy }: { localCopy: BackupLocalCopy }) {
  let text: string
  if (localCopy.state === 'present') text = `Local copy: present for ${localCopy.recoveryPoint}.`
  else if (localCopy.state === 'absent') text = 'Local copy: none kept on this machine.'
  else if (localCopy.state === 'unavailable') text = 'Local copy: the directory could not be read.'
  else text = 'Local copy: not configured.'
  return <Typography data-testid="backup-local-copy">{text}</Typography>
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

function SchedulingLine({ scheduling }: { scheduling: BackupStatus['scheduling'] | undefined }) {
  if (!scheduling) return null
  if (scheduling.state === 'unavailable') {
    return (
      <Alert severity="warning" data-testid="backup-scheduling">
        Scheduling unavailable: {scheduling.reason}
      </Alert>
    )
  }
  return (
    <Typography data-testid="backup-scheduling">
      Next scheduled run: {formatDate(scheduling.nextRunAt)}. Runs every {scheduling.intervalMinutes} minutes.
    </Typography>
  )
}

type SettingsField = keyof BackupSettingsValues

/** Field order, labels and the names used in messages. Bounds are enforced by the backend. */
const SETTINGS_FIELDS: { field: SettingsField; label: string; name: string; help?: string }[] = [
  { field: 'intervalMinutes', label: 'Interval (minutes)', name: 'Interval', help: 'Either 15 or 30 minutes' },
  { field: 'retentionWindowHours', label: 'Hours kept in full (24-hour window)', name: '24-hour window', help: 'Hours, 1 to 168' },
  { field: 'retentionDailyCount', label: 'Daily Backups kept', name: 'Daily count', help: '1 to 365' },
  { field: 'retentionWeeklyCount', label: 'Weekly Backups kept', name: 'Weekly count', help: '1 to 104' },
  { field: 'retentionMonthlyCount', label: 'Monthly Backups kept', name: 'Monthly count', help: '1 to 120' },
]

const DEFAULT_SETTINGS: BackupSettingsValues = {
  intervalMinutes: 30,
  retentionWindowHours: 24,
  retentionDailyCount: 7,
  retentionWeeklyCount: 4,
  retentionMonthlyCount: 12,
}

type FormValues = Record<SettingsField, string>

function toForm(values: object): FormValues {
  const form = {} as FormValues
  const raw = values as Record<string, unknown>
  for (const { field } of SETTINGS_FIELDS) {
    const value = raw[field]
    form[field] = value === undefined || value === null ? '' : String(value)
  }
  return form
}

/** Field messages for a stored row that failed validation, so each bad value is named beside its input. */
function storedFieldErrors(stored: StoredBackupSettings | undefined): Partial<Record<SettingsField, string>> {
  if (!stored || stored.state !== 'invalid') return {}
  const mapped: Partial<Record<SettingsField, string>> = {}
  for (const { field, message } of stored.errors) {
    if (SETTINGS_FIELDS.some((known) => known.field === field)) mapped[field as SettingsField] = message
  }
  return mapped
}

function settingsBanner(stored: StoredBackupSettings | undefined) {
  if (!stored) return null
  if (stored.state === 'missing') {
    return (
      <Alert severity="error" data-testid="backup-settings-missing">
        Backup settings are missing from the database. Scheduling is stopped until you save valid settings. The values
        below are defaults, and nothing is saved until you save.
      </Alert>
    )
  }
  if (stored.state === 'invalid') {
    const fields = stored.errors.map((error) => error.field).join(', ')
    return (
      <Alert severity="error" data-testid="backup-settings-invalid">
        Stored Backup settings are invalid ({fields}). Scheduling is stopped until you save valid settings. Manual
        Backups still work.
      </Alert>
    )
  }
  return null
}

function SettingsSection({
  stored,
  saveSettings,
}: {
  stored: StoredBackupSettings | undefined
  saveSettings: ReturnType<typeof useUpdateBackupSettingsMutation>[0]
}) {
  const initial = (): FormValues => {
    if (!stored) return toForm(DEFAULT_SETTINGS)
    if (stored.state === 'valid') return toForm(stored.settings)
    if (stored.state === 'invalid') return toForm(stored.values)
    return toForm(DEFAULT_SETTINGS)
  }
  const [form, setForm] = useState<FormValues>(initial)
  const [clientErrors, setClientErrors] = useState<Partial<Record<SettingsField, string>>>({})
  const [serverErrors, setServerErrors] = useState<Partial<Record<SettingsField, string>>>(() => storedFieldErrors(stored))
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  // Adopt a new server snapshot (after a save or a restore). Edits in progress are not overwritten by an unchanged snapshot.
  const snapshot = useRef(stored)
  useEffect(() => {
    if (snapshot.current === stored) return
    snapshot.current = stored
    setForm(initial())
    setClientErrors({})
    setServerErrors(storedFieldErrors(stored))
    setFormError(null)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stored])

  const update = (field: SettingsField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setSaved(false)
  }

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaved(false)
    setFormError(null)
    setServerErrors({})

    const nextClientErrors: Partial<Record<SettingsField, string>> = {}
    const payload = {} as BackupSettingsValues
    for (const { field, name } of SETTINGS_FIELDS) {
      const text = form[field].trim()
      if (!/^\d+$/.test(text)) {
        nextClientErrors[field] = `${name} must be a whole number`
      } else {
        payload[field] = Number(text)
      }
    }
    setClientErrors(nextClientErrors)
    if (Object.keys(nextClientErrors).length > 0) return

    setSaving(true)
    try {
      await saveSettings(payload).unwrap()
      setSaved(true)
    } catch (error: any) {
      if (error?.status === 400 && Array.isArray(error.data)) {
        const rejection = error.data as BackupSettingsRejection
        const mapped: Partial<Record<SettingsField, string>> = {}
        for (const { field, message } of rejection) {
          if (SETTINGS_FIELDS.some((known) => known.field === field)) mapped[field as SettingsField] = message
        }
        setServerErrors(mapped)
        setFormError('Fix the highlighted settings. Nothing was saved.')
      } else {
        setFormError('The settings could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Paper sx={{ p: 2 }} data-testid="backup-settings">
      <Typography variant="h6" gutterBottom>
        Settings
      </Typography>
      <Stack spacing={2}>
        {settingsBanner(stored)}
        <Box component="form" onSubmit={onSave} noValidate>
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              {SETTINGS_FIELDS.map(({ field, label, help }) => {
                const message = clientErrors[field] ?? serverErrors[field]
                const isInterval = field === 'intervalMinutes'
                return isInterval ? (
                  <TextField
                    key={field}
                    select
                    label={label}
                    value={form[field]}
                    onChange={(event) => update(field, event.target.value)}
                    error={Boolean(message)}
                    helperText={message ?? help}
                    slotProps={{ select: { native: true } }}
                  >
                    {/* A stored value outside 15 and 30 is shown as it is, so it is never silently replaced by the first option. */}
                    {!['15', '30'].includes(form[field]) && (
                      <option value={form[field]}>{form[field] || 'Not set'} (invalid)</option>
                    )}
                    <option value="15">15</option>
                    <option value="30">30</option>
                  </TextField>
                ) : (
                  <TextField
                    key={field}
                    label={label}
                    type="number"
                    value={form[field]}
                    onChange={(event) => update(field, event.target.value)}
                    error={Boolean(message)}
                    helperText={message ?? help}
                    slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  />
                )
              })}
            </Box>
            {formError && <Alert severity="error">{formError}</Alert>}
            {saved && <Alert severity="success">Settings saved. Scheduling is updated.</Alert>}
            <Box>
              <Button type="submit" variant="contained" disabled={saving}>
                Save settings
              </Button>
            </Box>
          </Stack>
        </Box>
      </Stack>
    </Paper>
  )
}

