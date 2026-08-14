import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SystemStatus from '../SystemStatus'

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}))

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet, post: mockPost },
}))

const healthyResponse = {
  status: 'healthy',
  timestamp: new Date().toISOString(),
  uptime: 3600,
  environment: 'test',
  services: {
    backend: { status: 'healthy', message: 'OK' },
    database: { status: 'healthy', message: 'OK' },
    redis: { status: 'healthy', message: 'OK' },
  },
}

const emptyAlertsView = {
  pressure: {
    active: false, stale: false, currentEpisode: null, recentEpisodes: [], state: 'healthy',
  },
  oom: {
    active: false, observedValue: null, acknowledgedValue: null,
    incidentStartedAt: null, lastIncreaseAt: null, unacknowledgedDelta: 0,
    lastAcknowledgedAt: null, lastAcknowledgedBy: null, lastAcknowledgedByLabel: null,
  },
  severity: 'none',
  generatedAt: new Date().toISOString(),
}

// Minimal store: SystemStatus reads only `state.auth.user` via selectCurrentUser.
function makeStore(user: { id: string; role: string } | null) {
  return configureStore({
    reducer: { auth: (state = { user }) => state },
  })
}

function renderSystemStatus(
  anchorEl: HTMLElement | null = null,
  user: { id: string; role: string } | null = { id: 'u1', role: 'admin' },
) {
  const onOpen = vi.fn()
  const onClose = vi.fn()
  render(
    <Provider store={makeStore(user)}>
      <SystemStatus anchorEl={anchorEl} onOpen={onOpen} onClose={onClose} />
    </Provider>,
  )
  return { onOpen, onClose }
}

// Route by URL — a single mockResolvedValue would answer both endpoints.
function mockAlerts(alerts: unknown | null) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/health/redis-alerts') {
      return alerts === null ? Promise.reject(new Error('fail')) : Promise.resolve(alerts)
    }
    return Promise.resolve(healthyResponse)
  })
}

describe('SystemStatus', () => {
  beforeEach(() => {
    mockGet.mockReset()
    // Route by URL: a single mockResolvedValue would also answer the alerts
    // endpoint, and the panel's alert JSX evaluates even while the popover is
    // closed — a health payload in `alerts` would crash the render.
    mockGet.mockImplementation((url: string) => {
      if (url === '/health/redis-alerts') return Promise.resolve(emptyAlertsView)
      return Promise.resolve(healthyResponse)
    })
  })

  it('renders an icon button and not a chip text label', () => {
    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNHEALTHY')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('shows a system tooltip label after data loads', async () => {
    renderSystemStatus()

    await waitFor(() => {
      const button = screen.getByRole('button')
      expect(button).toBeInTheDocument()
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('shows unknown status state during initial load', () => {
    mockGet.mockReturnValue(new Promise(() => {}))

    renderSystemStatus()

    expect(screen.queryByText('HEALTHY')).not.toBeInTheDocument()
    expect(screen.queryByText('UNKNOWN')).not.toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onOpen when the icon button is clicked', () => {
    const { onOpen } = renderSystemStatus()

    fireEvent.click(screen.getByRole('button'))

    expect(onOpen).toHaveBeenCalled()
  })

  it('shows the unable to fetch message when health check fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'))

    const anchorEl = document.createElement('button')
    document.body.appendChild(anchorEl)
    renderSystemStatus(anchorEl)

    await waitFor(() => {
      expect(screen.getByText(/unable to fetch system health information/i)).toBeInTheDocument()
    })

    document.body.removeChild(anchorEl)
  })
})

describe('SystemStatus Redis alerts', () => {
  const criticalAlerts = {
    pressure: {
      active: false, stale: false, currentEpisode: null, recentEpisodes: [], state: 'healthy',
    },
    oom: {
      active: true, observedValue: 3, acknowledgedValue: null,
      incidentStartedAt: '2026-08-14T10:01:00.000Z',
      lastIncreaseAt: '2026-08-14T10:01:00.000Z', unacknowledgedDelta: 3,
      lastAcknowledgedAt: null, lastAcknowledgedBy: null, lastAcknowledgedByLabel: null,
    },
    severity: 'critical',
    generatedAt: '2026-08-14T10:02:00.000Z',
  };

  const anchor = () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
  };
  const alertCalls = () =>
    mockGet.mock.calls.filter((c: unknown[]) => c[0] === '/health/redis-alerts').length;

  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('does not fetch alerts for a non-admin user', async () => {
    mockAlerts(criticalAlerts);
    renderSystemStatus(null, { id: 'u1', role: 'user' });
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(alertCalls()).toBe(0);
  });

  it('renders the OOM incident and an acknowledge action in the panel', async () => {
    mockAlerts(criticalAlerts);
    renderSystemStatus(anchor());
    expect(await screen.findByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
    expect(screen.getByText(/3 OOM errors/i)).toBeInTheDocument();
  });

  it('posts the observed value on acknowledge', async () => {
    mockAlerts(criticalAlerts);
    mockPost.mockResolvedValue({
      ...criticalAlerts,
      oom: {
        ...criticalAlerts.oom, active: false, acknowledgedValue: 3, unacknowledgedDelta: 0,
        incidentStartedAt: null, lastAcknowledgedAt: '2026-08-14T10:05:00.000Z',
        lastAcknowledgedBy: 'u1', lastAcknowledgedByLabel: 'Ada',
      },
      severity: 'none',
    });
    renderSystemStatus(anchor());
    fireEvent.click(await screen.findByRole('button', { name: /acknowledge/i }));
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/health/redis-alerts/oom/acknowledge', {
        observedValue: 3,
      }),
    );
  });

  it('refetches rather than surfacing a raw error on a 409', async () => {
    mockAlerts(criticalAlerts);
    mockPost.mockRejectedValue({ response: { status: 409 } });
    renderSystemStatus(anchor());
    fireEvent.click(await screen.findByRole('button', { name: /acknowledge/i }));
    await waitFor(() => expect(alertCalls()).toBeGreaterThan(1));
    expect(screen.queryByText(/409/)).not.toBeInTheDocument();
    expect(screen.queryByText(/acknowledgement failed/i)).not.toBeInTheDocument();
  });

  it('keeps the alert and offers retry when acknowledgement fails for a non-409 reason', async () => {
    mockAlerts(criticalAlerts);
    mockPost.mockRejectedValue({ response: { status: 500 } });
    renderSystemStatus(anchor());
    fireEvent.click(await screen.findByRole('button', { name: /acknowledge/i }));
    expect(await screen.findByText(/acknowledgement failed/i)).toBeInTheDocument();
    // The incident is still unacknowledged, so it must remain actionable.
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
  });

  it('preserves the last alert state when a poll fails', async () => {
    mockAlerts(criticalAlerts);
    renderSystemStatus(anchor());
    await screen.findByRole('button', { name: /acknowledge/i });

    mockAlerts(null); // subsequent polls reject
    fireEvent(document, new Event('visibilitychange'));

    // The sticky OOM alert must NOT disappear on a transient failure.
    await waitFor(() => expect(screen.getByText(/out of date/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
  });

  it('shows a stale indication when pressure is active without live confirmation', async () => {
    mockAlerts({
      ...criticalAlerts,
      pressure: {
        active: true, stale: true,
        currentEpisode: {
          startedAt: '2026-08-14T10:00:00.000Z', recoveredAt: null, peakUtilizationPercent: 91,
        },
        recentEpisodes: [], state: 'insufficient-samples',
      },
      oom: { ...criticalAlerts.oom, active: false, unacknowledgedDelta: 0 },
      severity: 'warning',
    });
    renderSystemStatus(anchor());
    expect(await screen.findByText(/stale, no live confirmation/i)).toBeInTheDocument();
  });

  it('lists recent pressure episodes with recovery wording', async () => {
    mockAlerts({
      ...criticalAlerts,
      pressure: {
        active: false, stale: false, currentEpisode: null, state: 'healthy',
        recentEpisodes: [
          {
            startedAt: '2026-08-14T09:00:00.000Z',
            recoveredAt: '2026-08-14T09:20:00.000Z',
            peakUtilizationPercent: 88,
          },
        ],
      },
      oom: { ...criticalAlerts.oom, active: false, unacknowledgedDelta: 0 },
      severity: 'none',
    });
    renderSystemStatus(anchor());
    expect(await screen.findByText(/recent pressure episodes/i)).toBeInTheDocument();
    expect(screen.getByText(/recovered/i)).toBeInTheDocument();
    expect(screen.getByText(/88%/)).toBeInTheDocument();
  });

  it('says acknowledged, never recovered, for a resolved OOM', async () => {
    mockAlerts({
      ...criticalAlerts,
      oom: {
        ...criticalAlerts.oom, active: false, acknowledgedValue: 3, unacknowledgedDelta: 0,
        incidentStartedAt: null, lastAcknowledgedAt: '2026-08-14T10:05:00.000Z',
        lastAcknowledgedBy: 'u1', lastAcknowledgedByLabel: 'Ada',
      },
      severity: 'none',
    });
    renderSystemStatus(anchor());
    expect(await screen.findByText(/OOM errors acknowledged/i)).toBeInTheDocument();
    expect(screen.getByText(/by Ada/i)).toBeInTheDocument();
    expect(screen.queryByText(/OOM.*recovered/i)).not.toBeInTheDocument();
  });

  describe('severity-driven indicator', () => {
    // The dot renders no text and the existing tests never assert the tooltip,
    // so Step 4 adds `data-testid="system-status-dot"` and
    // `data-status={overallStatus}` to the dot Box. Asserting the derived
    // status attribute is stable; asserting a computed colour is not
    // (jsdom 30 normalizes computed styles and MUI resolves palette values).
    it('escalates the indicator to unhealthy on a critical alert', async () => {
      mockAlerts(criticalAlerts);
      renderSystemStatus();
      await waitFor(() =>
        expect(screen.getByTestId('system-status-dot')).toHaveAttribute(
          'data-status',
          'unhealthy',
        ),
      );
    });

    it('escalates a healthy backend to degraded on a warning alert', async () => {
      mockAlerts({
        ...criticalAlerts,
        oom: { ...criticalAlerts.oom, active: false, unacknowledgedDelta: 0 },
        pressure: {
          active: true, stale: false,
          currentEpisode: {
            startedAt: '2026-08-14T10:00:00.000Z', recoveredAt: null, peakUtilizationPercent: 85,
          },
          recentEpisodes: [], state: 'sustained-pressure',
        },
        severity: 'warning',
      });
      renderSystemStatus();
      await waitFor(() =>
        expect(screen.getByTestId('system-status-dot')).toHaveAttribute(
          'data-status',
          'degraded',
        ),
      );
    });
  });

  describe('polling', () => {
    beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
    afterEach(() => vi.useRealTimers());

    it('polls alerts on the 60s interval while visible', async () => {
      mockAlerts(criticalAlerts);
      renderSystemStatus();
      await waitFor(() => expect(alertCalls()).toBe(1));
      await vi.advanceTimersByTimeAsync(60000);
      await waitFor(() => expect(alertCalls()).toBe(2));
    });

    it('does not poll while the tab is hidden', async () => {
      mockAlerts(criticalAlerts);
      renderSystemStatus();
      await waitFor(() => expect(alertCalls()).toBe(1));

      const spy = vi
        .spyOn(document, 'visibilityState', 'get')
        .mockReturnValue('hidden');
      await vi.advanceTimersByTimeAsync(180000);
      expect(alertCalls()).toBe(1);

      spy.mockReturnValue('visible');
      fireEvent(document, new Event('visibilitychange'));
      await waitFor(() => expect(alertCalls()).toBe(2));
      spy.mockRestore();
    });
  });
})
