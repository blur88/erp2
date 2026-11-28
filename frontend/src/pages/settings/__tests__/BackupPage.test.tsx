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
}))

vi.mock('@/store/api/backupApi', () => ({
  useGetBackupStatusQuery: (...args: unknown[]) => hooks.status(...args),
  useListBackupsQuery: (...args: unknown[]) => hooks.list(...args),
  useStartBackupMutation: () => hooks.start(),
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
    ...overrides,
  }
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
}: { statusValue?: Status; listValue?: Record<string, unknown> | undefined; listError?: boolean; listLoading?: boolean } = {}) {
  hooks.status.mockReturnValue({ data: statusValue, isError: false, refetch: hooks.refetchStatus })
  hooks.list.mockReturnValue({ data: listValue, isLoading: listLoading, isError: listError, refetch: hooks.refetchList })
  hooks.start.mockReturnValue([hooks.trigger, { isLoading: false }])
}

beforeEach(() => {
  authState.role = 'admin'
  hooks.status.mockReset()
  hooks.list.mockReset()
  hooks.start.mockReset()
  hooks.refetchList.mockReset()
  hooks.refetchStatus.mockReset()
  hooks.trigger.mockReset()
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
