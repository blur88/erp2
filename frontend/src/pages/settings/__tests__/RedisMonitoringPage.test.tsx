import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'

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

import RedisMonitoringPage, { toInstant } from '../RedisMonitoringPage'

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

// The page's DateTimePickers throw without a localization context.
const renderPage = () => {
  primeQuery(detail())
  return render(
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <RedisMonitoringPage />
    </LocalizationProvider>,
  )
}

// The custom bounds render only when range === 'custom'.
const selectCustomRange = async () => {
  await userEvent.click(screen.getByRole('combobox', { name: /range/i }))
  await userEvent.click(await screen.findByRole('option', { name: /custom/i }))
}

// The last args the page passed to the query hook.
const queryArgs = () =>
  mockUseGetRedisMemoryDetailQuery.mock.calls.at(-1)?.[0] as {
    from?: string
    to?: string
  }

/**
 * Fill a DateTimePicker by addressing each section by name.
 *
 * A picker has no <input>: every segment is a `spinbutton` inside the field's
 * `group`, individually addressable by its accessible name. No `format` prop
 * is supplied (the stored dateFormat preference covers calendar dates only and
 * has no time component), so the SECTION ORDER and the SECTION SET are both the
 * adapter's locale default. Meridiem is filled whenever the segment exists —
 * a 12-hour locale renders one, a 24-hour locale does not.
 */
const setPicker = async (
  name: RegExp,
  parts: {
    day: string
    month: string
    year: string
    hours: string
    minutes: string
    meridiem?: 'AM' | 'PM'
  },
) => {
  const field = screen.getByRole('group', { name })

  for (const [section, value] of [
    [/day/i, parts.day],
    [/month/i, parts.month],
    [/year/i, parts.year],
    [/hours?/i, parts.hours],
    [/minutes?/i, parts.minutes],
  ] as const) {
    const segment = within(field).getByRole('spinbutton', { name: section })
    await userEvent.click(segment)
    await userEvent.keyboard(value)
  }

  // Present only under a 12-hour locale. Leaving it unset there would keep the
  // value incomplete, so fill it whenever the segment exists.
  const meridiem = within(field).queryByRole('spinbutton', { name: /meridiem/i })
  if (meridiem) {
    await userEvent.click(meridiem)
    await userEvent.keyboard(parts.meridiem ?? 'AM')
  }
}

describe('Redis monitoring custom range', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // TZ must be fixed before the process starts: Node caches the zone on first
  // use, so a per-test stubEnv does not reliably re-zone Date. Rather than
  // depend on ambient TZ at all, derive the expectation from a locally
  // constructed Date — correct under any runner timezone.
  const expectedInstant = (y: number, m: number, d: number, h: number, min: number) =>
    new Date(y, m - 1, d, h, min).toISOString()

  it('converts local wall time to a UTC instant', async () => {
    renderPage()
    await selectCustomRange()
    await setPicker(/^from$/i, {
      day: '01',
      month: '08',
      year: '2026',
      hours: '09',
      minutes: '30',
      meridiem: 'AM',
    })
    await waitFor(() => {
      expect(queryArgs()?.from).toBe(expectedInstant(2026, 8, 1, 9, 30))
    })
  })

  it('sends only the filled bound when one endpoint is empty', async () => {
    renderPage()
    await selectCustomRange()
    await setPicker(/^from$/i, {
      day: '01',
      month: '08',
      year: '2026',
      hours: '09',
      minutes: '30',
      meridiem: 'AM',
    })
    await waitFor(() => {
      expect(queryArgs()?.from).toBe(expectedInstant(2026, 8, 1, 9, 30))
      expect(queryArgs()?.to).toBeUndefined()
    })
  })

  it('omits both bounds when neither endpoint is set', async () => {
    renderPage()
    await selectCustomRange()
    expect(queryArgs()?.from).toBeUndefined()
    expect(queryArgs()?.to).toBeUndefined()
  })

  it('never leaks a preset value into a custom-mode request', async () => {
    renderPage()
    await selectCustomRange()
    // rangeQuery returns {} in custom mode, so a hybrid window is impossible.
    expect(queryArgs()?.from).toBeUndefined()
  })

  it('omits an incomplete bound rather than sending a partial instant', async () => {
    renderPage()
    await selectCustomRange()
    // Day only: the remaining sections stay empty, so the picker reports null
    // rather than a Date. This exercises the null branch of toInstant, NOT the
    // NaN branch — see the separate unit test below for why they differ.
    const field = screen.getByRole('group', { name: /^from$/i })
    await userEvent.click(within(field).getByRole('spinbutton', { name: /day/i }))
    await userEvent.keyboard('01')

    expect(queryArgs()?.from).toBeUndefined()
  })
})

describe('toInstant', () => {
  it('returns undefined for a null bound', () => {
    expect(toInstant(null)).toBeUndefined()
  })

  it('returns undefined for an Invalid Date instead of throwing', () => {
    // .toISOString() on an Invalid Date throws RangeError; the guard exists so
    // a picker holding one cannot take the page down.
    expect(() => toInstant(new Date(NaN))).not.toThrow()
    expect(toInstant(new Date(NaN))).toBeUndefined()
  })

  it('converts a real Date to an ISO instant', () => {
    const d = new Date(2026, 7, 1, 9, 30)
    expect(toInstant(d)).toBe(d.toISOString())
  })
})
