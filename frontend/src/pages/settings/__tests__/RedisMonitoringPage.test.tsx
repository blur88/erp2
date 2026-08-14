import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: { datasets: { label: string }[] } }) => (
    <div data-testid="line-chart" data-datasets={data.datasets.map((set) => set.label).join('|')} />
  ),
}))

const mockUseGetRedisMemoryDetailQuery = vi.fn()
vi.mock('@/store/api/redisMonitoringApi', () => ({
  useGetRedisMemoryDetailQuery: (...args: unknown[]) =>
    mockUseGetRedisMemoryDetailQuery(...args),
}))

import RedisMonitoringPage from '../RedisMonitoringPage'

function detail(overrides: Record<string, unknown> = {}) {
  return {
    samples: [
      {
        at: '2026-08-01T00:00:00.000Z',
        ok: true,
        failureReason: null,
        usedBytes: 2_800_000,
        maxBytes: 268435456,
        utilizationPercent: 1.04,
        evictedKeys: 0,
        oomErrors: 0,
        instanceId: 'erp_backend',
      },
    ],
    historyAvailable: true,
    truncated: false,
    totalMatching: 1,
    appliedInstanceFilter: 'current',
    knownInstances: [
      {
        instanceId: 'erp_backend',
        firstSampleAt: '2026-08-01T00:00:00.000Z',
        lastSampleAt: '2026-08-02T00:00:00.000Z',
        sampleCount: 1440,
        current: true,
      },
    ],
    windowStats: {
      from: null,
      to: null,
      perInstance: [
        {
          instanceId: 'erp_backend',
          sampleCount: 1440,
          validSampleCount: 1440,
          peakUsedBytes: 2_800_000,
          peakUtilizationPercent: 1.04,
          firstSampleAt: '2026-08-01T00:00:00.000Z',
          lastSampleAt: '2026-08-02T00:00:00.000Z',
          distinctMaxBytes: [268435456],
          evictedKeys: { delta: 0, resetObserved: false },
          oomErrors: { delta: 0, resetObserved: false },
        },
      ],
    },
    configuration: {
      intervalMs: 60000,
      capacity: 1440,
      windowSamples: 5,
      thresholdPercent: 80,
      commandTimeoutMs: 1000,
      staleAfterMs: 120000,
      retentionDays: 90,
      maxRows: 5000,
      instanceId: 'erp_backend',
      instanceIdSource: 'configured',
    },
    counters: {
      oomErrors: { available: true, value: 0, lastDelta: 0, lastChangedAt: null },
      evictedKeys: { available: true, value: 0, lastDelta: 0, lastChangedAt: null },
    },
    ...overrides,
  }
}

function primeQuery(data: unknown, extra: Record<string, unknown> = {}) {
  mockUseGetRedisMemoryDetailQuery.mockReturnValue({
    data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  })
}

describe('RedisMonitoringPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the peak from windowStats, not from the sample list', () => {
    primeQuery(
      detail({
        samples: [
          {
            at: '2026-08-02T00:00:00.000Z',
            ok: true,
            failureReason: null,
            usedBytes: 1_000_000,
            maxBytes: 268435456,
            utilizationPercent: 0.37,
            evictedKeys: 0,
            oomErrors: 0,
            instanceId: 'erp_backend',
          },
        ],
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            {
              instanceId: 'erp_backend',
              sampleCount: 5100,
              validSampleCount: 5100,
              peakUsedBytes: 250_000_000,
              peakUtilizationPercent: 93.13,
              firstSampleAt: '2026-07-01T00:00:00.000Z',
              lastSampleAt: '2026-08-02T00:00:00.000Z',
              distinctMaxBytes: [268435456],
              evictedKeys: { delta: 0, resetObserved: false },
              oomErrors: { delta: 0, resetObserved: false },
            },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('peak-utilization')).toHaveTextContent('93.13')
    expect(screen.queryByTestId('peak-utilization')).not.toHaveTextContent('0.37')
  })

  it('shows a truncation notice distinguishing chart coverage from stat coverage', () => {
    primeQuery(detail({ truncated: true, totalMatching: 43200 }))

    render(<RedisMonitoringPage />)

    const notice = screen.getByTestId('truncation-notice')
    expect(notice).toHaveTextContent('43,200')
    expect(notice).toHaveTextContent(/statistics cover the full window/i)
  })

  it('flags a non-configured instance id as a history-fragmentation risk', () => {
    primeQuery(
      detail({
        configuration: { ...detail().configuration, instanceIdSource: 'hostname' },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('identity-warning')).toBeInTheDocument()
  })

  it('does not warn when the instance id is configured', () => {
    primeQuery(detail())

    render(<RedisMonitoringPage />)

    expect(screen.queryByTestId('identity-warning')).not.toBeInTheDocument()
  })

  it('renders non-zero evicted keys as an error, not a warning', () => {
    primeQuery(
      detail({
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            {
              ...detail().windowStats.perInstance[0],
              evictedKeys: { delta: 12, resetObserved: false },
            },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('evicted-keys')).toHaveAttribute('data-severity', 'error')
  })

  it('distinguishes an unmeasured counter from a measured zero', () => {
    primeQuery(
      detail({
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            {
              ...detail().windowStats.perInstance[0],
              evictedKeys: { delta: null, resetObserved: false },
            },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('evicted-keys')).toHaveTextContent(/no data/i)
    expect(screen.getByTestId('evicted-keys')).not.toHaveTextContent(/^0$/)
  })

  it('renders one dataset per instance and never joins them', () => {
    primeQuery(
      detail({
        appliedInstanceFilter: 'all',
        samples: [
          { ...detail().samples[0], instanceId: 'erp_backend' },
          { ...detail().samples[0], instanceId: 'erp_backend_staging' },
        ],
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            { ...detail().windowStats.perInstance[0], instanceId: 'erp_backend' },
            { ...detail().windowStats.perInstance[0], instanceId: 'erp_backend_staging' },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('line-chart')).toHaveAttribute(
      'data-datasets',
      'erp_backend|erp_backend_staging',
    )
  })

  it('renders a stat block per instance when showing all instances', () => {
    primeQuery(
      detail({
        appliedInstanceFilter: 'all',
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            { ...detail().windowStats.perInstance[0], instanceId: 'erp_backend' },
            { ...detail().windowStats.perInstance[0], instanceId: 'erp_backend_staging' },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getAllByTestId(/^instance-stats-/)).toHaveLength(2)
  })

  it('hides live counters when not viewing the current instance', () => {
    primeQuery(detail({ appliedInstanceFilter: 'all' }))

    render(<RedisMonitoringPage />)

    expect(screen.queryByTestId('live-counters')).not.toBeInTheDocument()
  })

  it('labels live counters as current-instance-only when viewing the current instance', () => {
    primeQuery(detail())

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('live-counters')).toHaveTextContent(/current instance/i)
  })

  it('flags a cap change within the window', () => {
    primeQuery(
      detail({
        windowStats: {
          from: null,
          to: null,
          perInstance: [
            {
              ...detail().windowStats.perInstance[0],
              distinctMaxBytes: [268435456, 536870912],
            },
          ],
        },
      }),
    )

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('cap-changed-notice')).toBeInTheDocument()
  })

  it('renders a loading state without crashing', () => {
    mockUseGetRedisMemoryDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    })

    render(<RedisMonitoringPage />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders an error state without crashing', () => {
    mockUseGetRedisMemoryDetailQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    })

    render(<RedisMonitoringPage />)

    expect(screen.getByTestId('load-error')).toBeInTheDocument()
  })
})
