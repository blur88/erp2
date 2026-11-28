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

