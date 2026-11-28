import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const authState = vi.hoisted(() => ({ role: 'admin' as string }))

vi.mock('@/hooks/useRedux', () => ({
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({ auth: { user: { role: authState.role } } }),
}))

const hooks = vi.hoisted(() => ({
  status: vi.fn(),
  list: vi.fn(),
  start: vi.fn(),
  refetchList: vi.fn(),
  refetchStatus: vi.fn(() => Promise.resolve()),
  trigger: vi.fn(),
  settings: vi.fn(),
  saveSettings: vi.fn(),
  saveTrigger: vi.fn(),
}))

vi.mock('@/store/api/backupApi', () => ({
  useGetBackupStatusQuery: (...args: unknown[]) => hooks.status(...args),
  useListBackupsQuery: (...args: unknown[]) => hooks.list(...args),
  useStartBackupMutation: () => hooks.start(),
  useGetBackupSettingsQuery: (...args: unknown[]) => hooks.settings(...args),
  useUpdateBackupSettingsMutation: () => hooks.saveSettings(),
}))

import BackupPage from '../BackupPage'

type Status = Record<string, unknown>

function status(overrides: Partial<Status> = {}): Status {
  return {
    configured: true,
    missingSettings: [],
    running: null,
    lastAttempt: null,
    noAttemptSinceRestart: true,
    postgresClient: { state: 'compatible', clientMajor: 19, serverMajor: 19 },
    release: { version: '1.2.3', status: 'released', configurationError: null },
    startup: 'ready',
    startupError: null,
    scheduling: { state: 'scheduled', intervalMinutes: 30, nextRunAt: '2026-11-28T10:30:00.000Z' },
    heartbeat: { urlCount: 2, missingSettings: [], lastPing: null },
    ...overrides,
  }
}

const VALID_SETTINGS = {
  intervalMinutes: 30,
  retentionWindowHours: 24,
  retentionDailyCount: 7,
  retentionWeeklyCount: 4,
  retentionMonthlyCount: 12,
}

const listOk = {
  state: 'ok',
  backups: [
    {
      recoveryPoint: '20261128T101500123Z',
      release: '1.2.3',
      archiveSize: 2 * 1024 * 1024,
      postgres: { serverMajor: 19, clientMajor: 19 },
    },
  ],
  malformed: [],
  unreleasedCount: 0,
  rpo: { state: 'healthy', ageMinutes: 12, recoveryPoint: '20261128T101500123Z' },
  localCopy: { state: 'present', recoveryPoint: '20261128T101500123Z' },
}

function setHooks({
  statusValue = status(),
  listValue = listOk as Record<string, unknown>,
  listError = false,
  listLoading = false,
  settingsValue = { state: 'valid', settings: VALID_SETTINGS } as Record<string, unknown>,
}: {
  statusValue?: Status
  listValue?: Record<string, unknown> | undefined
  listError?: boolean
  listLoading?: boolean
  settingsValue?: Record<string, unknown>
} = {}) {
  hooks.status.mockReturnValue({ data: statusValue, isError: false, refetch: hooks.refetchStatus })
  hooks.list.mockReturnValue({ data: listValue, isLoading: listLoading, isError: listError, refetch: hooks.refetchList })
  hooks.start.mockReturnValue([hooks.trigger, { isLoading: false }])
  hooks.settings.mockReturnValue({ data: settingsValue, isError: false })
  hooks.saveSettings.mockReturnValue([hooks.saveTrigger, { isLoading: false }])
}

beforeEach(() => {
  authState.role = 'admin'
  hooks.status.mockReset()
  hooks.list.mockReset()
  hooks.start.mockReset()
  hooks.refetchList.mockReset()
  hooks.refetchStatus.mockReset()
  hooks.trigger.mockReset()
  hooks.settings.mockReset()
  hooks.saveSettings.mockReset()
  hooks.saveTrigger.mockReset()
})

describe('BackupPage (#2111)', () => {
  it('links to the Backup & Restore runbook, which is the only restore procedure', () => {
    setHooks()
    render(<BackupPage />)
    const link = screen.getByRole('link', { name: 'Backup & Restore runbook' })
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/blur88/erp2/blob/main/docs/deployment/BACKUP_RESTORE_RUNBOOK.md',
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  });

  it('lists Backups from storage', () => {
    setHooks()
    render(<BackupPage />)
    const table = screen.getByRole('table', { name: 'Backups' })
    expect(within(table).getByText('20261128T101500123Z')).toBeInTheDocument()
    expect(within(table).getByText('2.0 MiB')).toBeInTheDocument()
  });

  it('shows the empty state only when storage was read and holds no Backups', () => {
    setHooks({ listValue: { state: 'ok', backups: [], malformed: [] } })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-empty')).toHaveTextContent('No Backups yet.')
    expect(screen.queryByTestId('backup-unavailable')).not.toBeInTheDocument()
  })

  it('shows unavailable, never an empty list, when storage cannot be read', () => {
    setHooks({ listValue: { state: 'unavailable', reason: 'Backup storage is unavailable' } })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('backup-empty')).not.toBeInTheDocument()
  })

  it('shows unavailable when the list request itself fails', () => {
    setHooks({ listValue: undefined, listError: true })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-unavailable')).toBeInTheDocument()
  })

  it('reports malformed manifests separately from the list', () => {
    setHooks({
      listValue: {
        state: 'ok',
        backups: [],
        malformed: [{ recoveryPoint: '20261127T000000000Z', reason: 'manifest is not valid JSON' }],
      },
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-malformed')).toHaveTextContent('manifest is not valid JSON')
  })

  it('reads "no attempt since restart" after a restart', () => {
    setHooks()
    render(<BackupPage />)
    expect(screen.getByTestId('backup-no-attempt')).toHaveTextContent('No attempt since restart.')
  })

  it('shows the failing step and the sanitised error for the last attempt', () => {
    setHooks({
      statusValue: status({
        noAttemptSinceRestart: false,
        lastAttempt: {
          recoveryPoint: '20261128T101500123Z',
          startedAt: '2026-11-28T10:15:00.123Z',
          endedAt: '2026-11-28T10:16:00.000Z',
          result: 'failed',
          failedStep: 'upload',
          error: 'Upload to storage failed',
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-last-attempt')).toHaveTextContent('Failed at Upload: Upload to storage failed')
  })

  it('shows a failed retention pass separately from a successful last attempt', () => {
    setHooks({
      statusValue: status({
        noAttemptSinceRestart: false,
        lastAttempt: {
          recoveryPoint: '20261128T101500123Z',
          startedAt: '2026-11-28T10:15:00.123Z',
          endedAt: '2026-11-28T10:16:00.000Z',
          result: 'succeeded',
          failedStep: null,
          error: null,
        },
        lastRetention: {
          startedAt: '2026-11-28T10:16:00.000Z',
          endedAt: '2026-11-28T10:16:02.000Z',
          result: 'failed',
          expiredBackups: 0,
          orphanArchives: 0,
          prunedLocalCopies: 0,
          failedStep: 'list',
          message: 'Backup storage is unavailable',
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-last-attempt')).toHaveTextContent('Succeeded.')
    expect(screen.getByTestId('backup-retention')).toHaveTextContent(
      'Failed at Listing storage: Backup storage is unavailable',
    )
  })

  it('reports the counts of a succeeded retention pass', () => {
    setHooks({
      statusValue: status({
        lastRetention: {
          startedAt: '2026-11-28T10:16:00.000Z',
          endedAt: '2026-11-28T10:16:02.000Z',
          result: 'succeeded',
          expiredBackups: 2,
          orphanArchives: 1,
          prunedLocalCopies: 3,
          failedStep: null,
          message: null,
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-retention')).toHaveTextContent(
      'Expired Backups deleted: 2. Abandoned archives deleted: 1. Local copies pruned: 3.',
    )
  })

  it('explains why a retention pass was skipped', () => {
    setHooks({
      statusValue: status({
        lastRetention: {
          startedAt: '2026-11-28T10:16:00.000Z',
          endedAt: '2026-11-28T10:16:00.000Z',
          result: 'skipped',
          expiredBackups: 0,
          orphanArchives: 0,
          prunedLocalCopies: 0,
          failedStep: null,
          message: 'Backup settings are missing or invalid, so retention was skipped',
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-retention')).toHaveTextContent('Skipped: Backup settings are missing or invalid')
  })

  it('reads "no retention pass since restart" before the first pass', () => {
    setHooks()
    render(<BackupPage />)
    expect(screen.getByTestId('backup-retention')).toHaveTextContent('No retention pass since restart.')
  })

  it('names missing settings without showing values', () => {
    setHooks({ statusValue: status({ configured: false, missingSettings: ['BACKUP_S3_BUCKET'] }) })
    render(<BackupPage />)
    expect(screen.getByText(/Missing or invalid settings: BACKUP_S3_BUCKET/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeDisabled()
  })

  it('blocks Backups and says why on a PostgreSQL major mismatch', () => {
    setHooks({
      statusValue: status({ postgresClient: { state: 'mismatch', clientMajor: 18, serverMajor: 19 } }),
    })
    render(<BackupPage />)
    expect(screen.getByText(/does not match the database server major 19/)).toBeInTheDocument()
  })

  it('202 starts a Backup, then polls status until the run is recorded, then lists once', async () => {
    const user = userEvent.setup()
    hooks.trigger.mockReturnValue({
      unwrap: () => Promise.resolve({ recoveryPoint: '20261128T101500123Z', startedAt: '2026-11-28T10:15:00.123Z' }),
    })
    setHooks()
    const { rerender } = render(<BackupPage />)

    expect(hooks.status).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ pollingInterval: 0 }))
    await user.click(screen.getByRole('button', { name: 'Back up now' }))
    expect(hooks.trigger).toHaveBeenCalledTimes(1)

    rerender(<BackupPage />)
    expect(hooks.status).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ pollingInterval: 2000 }))
    expect(hooks.refetchList).not.toHaveBeenCalled()

    hooks.status.mockReturnValue({
      data: status({
        noAttemptSinceRestart: false,
        lastAttempt: {
          recoveryPoint: '20261128T101500123Z',
          startedAt: '2026-11-28T10:15:00.123Z',
          endedAt: '2026-11-28T10:15:30.000Z',
          result: 'succeeded',
          failedStep: null,
          error: null,
        },
      }),
      isError: false,
    })
    rerender(<BackupPage />)
    expect(hooks.status).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ pollingInterval: 0 }))
    expect(hooks.refetchList).toHaveBeenCalledTimes(1)
  })

  it('409 reports that a Backup is already running, reads the server, and polls until it ends', async () => {
    const user = userEvent.setup()
    hooks.trigger.mockReturnValue({ unwrap: () => Promise.reject({ status: 409 }) })
    // The page starts from a stale "idle" status; the server reports the running attempt on refetch.
    setHooks()
    hooks.refetchStatus.mockImplementation(() => {
      hooks.status.mockReturnValue({
        data: status({
          running: { recoveryPoint: '20261128T101500123Z', startedAt: '2026-11-28T10:15:00.123Z' },
        }),
        isError: false,
        refetch: hooks.refetchStatus,
      })
      return Promise.resolve()
    })
    const { rerender } = render(<BackupPage />)

    await user.click(screen.getByRole('button', { name: 'Back up now' }))
    expect(await screen.findByText('A Backup is already running.')).toBeInTheDocument()
    expect(hooks.refetchStatus).toHaveBeenCalledTimes(1)
    rerender(<BackupPage />)
    expect(hooks.status).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ pollingInterval: 2000 }))
    expect(screen.getByTestId('backup-running')).toBeInTheDocument()
  })

  it('shows the page only to administrators and makes no status or list request otherwise', () => {
    authState.role = 'manager'
    setHooks()
    render(<BackupPage />)
    expect(screen.getByText('Administrator access is required to manage Backups.')).toBeInTheDocument()
    expect(hooks.status).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ skip: true }))
    expect(hooks.list).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ skip: true }))
  })
})

describe('BackupPage scheduling and settings (#2112)', () => {
  it('shows the next scheduled run when scheduling is on', () => {
    setHooks()
    render(<BackupPage />)
    expect(screen.getByTestId('backup-scheduling')).toHaveTextContent(
      `Next scheduled run: ${new Date('2026-11-28T10:30:00.000Z').toLocaleString()}`,
    )
  })

  it('says scheduling is unavailable and gives the reason', () => {
    setHooks({
      statusValue: status({
        scheduling: { state: 'unavailable', reason: 'Backup settings are missing from the database.' },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-scheduling')).toHaveTextContent(
      'Scheduling unavailable: Backup settings are missing from the database.',
    )
  })

  it('keeps Back up now available while scheduling is unavailable', () => {
    setHooks({ statusValue: status({ scheduling: { state: 'unavailable', reason: 'Stored Backup settings are invalid (intervalMinutes).' } }) })
    render(<BackupPage />)
    expect(screen.getByRole('button', { name: 'Back up now' })).toBeEnabled()
  })

  it('pre-fills the form from the stored valid settings', () => {
    setHooks()
    render(<BackupPage />)
    expect(screen.getByLabelText('Interval (minutes)')).toHaveValue('30')
    expect(screen.getByLabelText('Hours kept in full (24-hour window)')).toHaveValue(24)
    expect(screen.getByLabelText('Daily Backups kept')).toHaveValue(7)
    expect(screen.getByLabelText('Weekly Backups kept')).toHaveValue(4)
    expect(screen.getByLabelText('Monthly Backups kept')).toHaveValue(12)
  })

  it('shows stored invalid settings with their errors and the raw values, and says scheduling is stopped', () => {
    setHooks({
      settingsValue: {
        state: 'invalid',
        errors: [{ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' }],
        values: { ...VALID_SETTINGS, intervalMinutes: 5 },
      },
    })
    render(<BackupPage />)
    const alert = screen.getByTestId('backup-settings-invalid')
    expect(alert).toHaveTextContent('intervalMinutes')
    expect(alert).toHaveTextContent('Scheduling is stopped')
    expect(screen.getByLabelText('Interval (minutes)')).toHaveValue('5')
    expect(screen.getByText('Interval must be 15 or 30 minutes')).toBeInTheDocument()
  })

  it('says settings are missing and shows defaults that are not saved until the administrator saves', () => {
    setHooks({ settingsValue: { state: 'missing' } })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-settings-missing')).toHaveTextContent('Backup settings are missing')
    expect(screen.getByLabelText('Interval (minutes)')).toHaveValue('30')
    expect(screen.getByText(/nothing is saved until you save/i)).toBeInTheDocument()
  })

  it('blocks a value that is not a whole number before any request is sent', async () => {
    const user = userEvent.setup()
    setHooks()
    render(<BackupPage />)
    const daily = screen.getByLabelText('Daily Backups kept')
    await user.clear(daily)
    await user.type(daily, '1.5')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(screen.getByText('Daily count must be a whole number')).toBeInTheDocument()
    expect(hooks.saveTrigger).not.toHaveBeenCalled()
  })

  it('shows the server field errors from a rejected save and does not say it was saved', async () => {
    const user = userEvent.setup()
    setHooks()
    hooks.saveTrigger.mockReturnValue({
      unwrap: () =>
        Promise.reject({
          status: 400,
          data: [{ field: 'retentionMonthlyCount', message: 'Monthly count must be between 1 and 120' }],
        }),
    })
    render(<BackupPage />)
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(await screen.findByText('Monthly count must be between 1 and 120')).toBeInTheDocument()
    expect(screen.queryByText('Settings saved.')).not.toBeInTheDocument()
  })

  it('saves valid values and reports that scheduling was updated', async () => {
    const user = userEvent.setup()
    setHooks()
    hooks.saveTrigger.mockReturnValue({ unwrap: () => Promise.resolve({ ...VALID_SETTINGS, intervalMinutes: 15 }) })
    render(<BackupPage />)
    await user.selectOptions(screen.getByLabelText('Interval (minutes)'), '15')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(hooks.saveTrigger).toHaveBeenCalledWith({ ...VALID_SETTINGS, intervalMinutes: 15 })
    expect(await screen.findByText('Settings saved. Scheduling is updated.')).toBeInTheDocument()
  })
})


describe('BackupPage protection (#2115)', () => {
  const RP = '20261128T101500123Z'
  const okList = (overrides: Record<string, unknown> = {}) => ({ ...listOk, ...overrides })
  const rpo = (state: string, ageMinutes: number | null, recoveryPoint: string | null = RP) => ({
    state,
    ageMinutes,
    recoveryPoint,
  })

  it('shows Healthy with the age and the Recovery point it is measured from', () => {
    setHooks({ listValue: okList({ rpo: rpo('healthy', 12) }) })
    render(<BackupPage />)
    const panel = screen.getByTestId('backup-rpo')
    expect(panel).toHaveAttribute('data-state', 'healthy')
    expect(within(panel).getByText('Healthy')).toBeInTheDocument()
    expect(within(panel).getByText(/12 minutes ago/)).toBeInTheDocument()
    expect(within(panel).getByText(new RegExp(RP))).toBeInTheDocument()
    expect(screen.queryByTestId('backup-rpo-warning')).not.toBeInTheDocument()
  })

  it('shows a warning from 45 minutes, before the RPO breach', () => {
    setHooks({ listValue: okList({ rpo: rpo('warning', 45) }) })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-rpo')).toHaveAttribute('data-state', 'warning')
    expect(screen.getByTestId('backup-rpo')).toHaveTextContent('Warning')
    expect(screen.getByTestId('backup-rpo-warning')).toHaveTextContent('45 minutes')
  })

  it('shows an RPO breach at 60 minutes or more', () => {
    setHooks({ listValue: okList({ rpo: rpo('breach', 75) }) })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-rpo')).toHaveAttribute('data-state', 'breach')
    expect(screen.getByTestId('backup-rpo')).toHaveTextContent('RPO breach')
    expect(screen.getByTestId('backup-rpo-warning')).toHaveTextContent('75 minutes')
  })

  it('shows Unknown, with no age, when the age cannot be established', () => {
    setHooks({ listValue: okList({ rpo: rpo('unknown', null, null) }) })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-rpo')).toHaveAttribute('data-state', 'unknown')
    expect(screen.getByTestId('backup-rpo')).toHaveTextContent('Unknown')
    expect(screen.queryByText(/minutes ago/)).not.toBeInTheDocument()
  })

  it('shows Unknown when storage is unreachable, and the storage warning', () => {
    setHooks({
      listValue: { state: 'unavailable', reason: 'Backup storage is unavailable', rpo: rpo('unknown', null, null), localCopy: { state: 'absent', recoveryPoint: null } },
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-rpo')).toHaveAttribute('data-state', 'unknown')
    expect(screen.getByTestId('backup-unavailable')).toBeInTheDocument()
  })

  it('shows Unknown without crashing while the list has not loaded', () => {
    setHooks()
    hooks.list.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: hooks.refetchList })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-rpo')).toHaveAttribute('data-state', 'unknown')
  })

  it('warns when no Verified Backup exists', () => {
    setHooks({
      listValue: okList({ backups: [], rpo: rpo('unknown', null, null), unreleasedCount: 0 }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-no-verified')).toHaveTextContent('No Verified Backup exists yet.')
  })

  it('lists unreleased Backups as not counting towards the RPO, and still warns that no Verified Backup exists', () => {
    setHooks({
      listValue: okList({
        backups: [{ ...listOk.backups[0], recoveryPoint: '20261128T110000000Z', release: 'unreleased' }],
        rpo: rpo('unknown', null, null),
        unreleasedCount: 1,
      }),
    })
    render(<BackupPage />)
    expect(within(screen.getByRole('table', { name: 'Backups' })).getByText('unreleased')).toBeInTheDocument()
    expect(screen.getByTestId('backup-unreleased')).toHaveTextContent(
      '1 unreleased Backup is listed but does not count towards the RPO.',
    )
    expect(screen.getByTestId('backup-no-verified')).toBeInTheDocument()
  })

  it('warns when the production build has no valid Release', () => {
    setHooks({
      statusValue: status({
        release: { version: 'unreleased', status: 'misconfigured', configurationError: 'APP_VERSION must be X.Y.Z in production' },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByText(/APP_VERSION must be X.Y.Z in production/)).toBeInTheDocument()
  })

  it('warns when a heartbeat URL is not configured, by variable name only', () => {
    setHooks({
      statusValue: status({ heartbeat: { urlCount: 1, missingSettings: ['BACKUP_HEARTBEAT_URL_SECONDARY'], lastPing: null } }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-heartbeat-config')).toHaveTextContent(
      'Heartbeat not configured: BACKUP_HEARTBEAT_URL_SECONDARY',
    )
  })

  it('reports a failed heartbeat as a monitoring problem, and says the Backup is still valid', () => {
    setHooks({
      statusValue: status({
        lastAttempt: {
          recoveryPoint: RP,
          startedAt: '2026-11-28T10:15:00.000Z',
          endedAt: '2026-11-28T10:20:00.000Z',
          result: 'succeeded',
          failedStep: null,
          error: null,
        },
        noAttemptSinceRestart: false,
        heartbeat: {
          urlCount: 2,
          missingSettings: [],
          lastPing: {
            recoveryPoint: RP,
            sentAt: '2026-11-28T10:20:00.000Z',
            result: 'failed',
            message: 'BACKUP_HEARTBEAT_URL_PRIMARY was not delivered (HTTP 503)',
          },
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-monitoring')).toHaveTextContent(
      'Monitoring problem: BACKUP_HEARTBEAT_URL_PRIMARY was not delivered (HTTP 503)',
    )
    expect(screen.getByTestId('backup-monitoring')).toHaveTextContent('The Backup itself is valid')
    expect(screen.getByTestId('backup-last-attempt')).toHaveTextContent('Succeeded.')
  })

  it('shows no monitoring problem after a heartbeat was sent', () => {
    setHooks({
      statusValue: status({
        heartbeat: {
          urlCount: 2,
          missingSettings: [],
          lastPing: { recoveryPoint: RP, sentAt: '2026-11-28T10:20:00.000Z', result: 'sent', message: null },
        },
      }),
    })
    render(<BackupPage />)
    expect(screen.queryByTestId('backup-monitoring')).not.toBeInTheDocument()
  })

  it('shows every configuration warning at once', () => {
    setHooks({
      statusValue: status({
        configured: false,
        missingSettings: ['BACKUP_S3_BUCKET'],
        postgresClient: { state: 'mismatch', clientMajor: 18, serverMajor: 19 },
        release: { version: 'unreleased', status: 'misconfigured', configurationError: 'APP_VERSION missing' },
        heartbeat: { urlCount: 1, missingSettings: ['BACKUP_HEARTBEAT_URL_SECONDARY'], lastPing: null },
      }),
      listValue: { state: 'unavailable', reason: 'Backup storage is unavailable', rpo: rpo('unknown', null, null), localCopy: { state: 'unconfigured' } },
      settingsValue: { state: 'invalid', errors: [{ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' }], values: { intervalMinutes: 20 } },
    })
    render(<BackupPage />)
    expect(screen.getByText(/Missing or invalid settings: BACKUP_S3_BUCKET/)).toBeInTheDocument()
    expect(screen.getByText(/does not match the database server major 19/)).toBeInTheDocument()
    expect(screen.getByText('APP_VERSION missing')).toBeInTheDocument()
    expect(screen.getByTestId('backup-heartbeat-config')).toBeInTheDocument()
    expect(screen.getByTestId('backup-unavailable')).toBeInTheDocument()
    expect(screen.getByTestId('backup-settings-invalid')).toBeInTheDocument()
  })

  it('shows the Local copy status: present with its Recovery point', () => {
    setHooks({ listValue: okList() })
    render(<BackupPage />)
    expect(screen.getByTestId('backup-local-copy')).toHaveTextContent(`Local copy: present for ${RP}`)
  })

  it('shows the Local copy as absent, unavailable or not configured', () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ state: 'absent', recoveryPoint: null }, 'Local copy: none kept on this machine.'],
      [{ state: 'unavailable', recoveryPoint: null }, 'Local copy: the directory could not be read.'],
      [{ state: 'unconfigured' }, 'Local copy: not configured.'],
    ]
    for (const [localCopy, text] of cases) {
      setHooks({ listValue: okList({ localCopy }) })
      const { unmount } = render(<BackupPage />)
      expect(screen.getByTestId('backup-local-copy')).toHaveTextContent(text)
      unmount()
    }
  })
})
