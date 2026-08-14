import React, { useEffect, useState } from 'react'
import { keyframes } from '@emotion/react'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { default as NginxIcon } from '@mui/icons-material/CloudQueue'
import { default as BackendIcon } from '@mui/icons-material/Computer'
import { default as DnsRoundedIcon } from '@mui/icons-material/DnsRounded'
import { default as InfoIcon } from '@mui/icons-material/InfoOutlined'
import { default as RedisIcon } from '@mui/icons-material/Memory'
import { default as DatabaseIcon } from '@mui/icons-material/Storage'

import { ApiService } from '@/services/api'
import { useAppSelector } from '@/hooks/useRedux'
import { selectCurrentUser } from '@/store/slices/authSlice'
import TopBarUtilityPanel from './TopBarUtilityPanel'
import { StatusChip } from '@/components/common/StatusChip'

interface PressureEpisode {
  startedAt: string
  recoveredAt: string | null
  peakUtilizationPercent: number | null
}

interface OomAlert {
  active: boolean
  observedValue: number | null
  acknowledgedValue: number | null
  incidentStartedAt: string | null
  lastIncreaseAt: string | null
  unacknowledgedDelta: number
  lastAcknowledgedAt: string | null
  lastAcknowledgedBy: string | null
  lastAcknowledgedByLabel: string | null
}

interface RedisAlertView {
  pressure: {
    active: boolean
    stale: boolean
    currentEpisode: PressureEpisode | null
    recentEpisodes: PressureEpisode[]
    state: string
  }
  oom: OomAlert
  severity: 'none' | 'warning' | 'critical'
  generatedAt: string
}

const ALERT_POLL_MS = 60000

interface RedisMemory {
  usedBytes: number
  /** null when Redis runs uncapped (`maxmemory:0`). */
  maxBytes: number | null
  /** null when no cap makes utilization undefined. */
  utilizationPercent: number | null
}

interface ServiceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  message: string
  /** Present on the redis service only; interim memory-pressure signal (#1036). */
  memory?: RedisMemory | null
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  environment: string
  services: {
    backend: ServiceHealth
    database: ServiceHealth
    redis: ServiceHealth
  }
}

interface SystemStatusProps {
  anchorEl: HTMLElement | null
  onOpen: (event: React.MouseEvent<HTMLElement>) => void
  onClose: () => void
}

const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
`

const SystemStatus: React.FC<SystemStatusProps> = ({ anchorEl, onOpen, onClose }) => {
  const theme = useTheme()
  const currentUser = useAppSelector(selectCurrentUser)
  const isAdmin = currentUser?.role === 'admin'
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [alerts, setAlerts] = useState<RedisAlertView | null>(null)
  const [alertsUnavailable, setAlertsUnavailable] = useState(false)
  const [acknowledging, setAcknowledging] = useState(false)
  const [ackError, setAckError] = useState<string | null>(null)
  const frontendStatus = 'healthy' as const

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await ApiService.get<HealthResponse>('/health')
      setHealth(response as HealthResponse)
    } catch (error) {
      setHealth(null)
      console.error('Health check failed:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchAlerts = async () => {
    if (!isAdmin) return
    try {
      const response = await ApiService.get<RedisAlertView>('/health/redis-alerts')
      setAlerts(response as RedisAlertView)
      setAlertsUnavailable(false)
    } catch {
      // Preserve the last known alert state. Clearing it would make a sticky
      // red OOM indicator vanish on a single transient request failure —
      // exactly the disappearance stickiness exists to prevent. The staleness
      // is surfaced instead.
      setAlertsUnavailable(true)
    }
  }

  useEffect(() => {
    if (!isAdmin) {
      setAlerts(null)
      return
    }
    void fetchAlerts()
    const interval = setInterval(() => {
      // Polling pauses while the tab is hidden; visibility change refetches.
      if (document.visibilityState === 'visible') void fetchAlerts()
    }, ALERT_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchAlerts()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [isAdmin])

  const handleAcknowledge = async () => {
    if (!alerts?.oom.active || alerts.oom.observedValue === null) return
    setAcknowledging(true)
    setAckError(null)
    try {
      const response = await ApiService.post<RedisAlertView>(
        '/health/redis-alerts/oom/acknowledge',
        { observedValue: alerts.oom.observedValue },
      )
      setAlerts(response as RedisAlertView)
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        // The counter moved between render and click. Re-read so the operator
        // sees the newer incident rather than a raw error.
        await fetchAlerts()
      } else {
        // Any other failure (network, 500, 403) did NOT acknowledge anything.
        // Keep the alert visible and offer a retry; treating these as 409
        // would silently discard a still-unacknowledged incident.
        setAckError('Acknowledgement failed. Please retry.')
      }
    } finally {
      setAcknowledging(false)
    }
  }

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    onOpen(event)
    void checkHealth()
  }

  const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' => {
    if (alerts?.severity === 'critical') return 'unhealthy'
    if (loading && !health) return 'unknown'
    if (!health) return 'unknown'
    if (alerts?.severity === 'warning' && health.status === 'healthy') return 'degraded'
    return health.status
  }

  const getDotColor = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy': return theme.palette.success.main
      case 'degraded': return theme.palette.warning.main
      case 'unhealthy': return theme.palette.error.main
      default: return theme.palette.text.secondary
    }
  }

  const getTooltipText = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy': return 'System: Healthy - All services operational'
      case 'degraded': return 'System: Degraded - One or more services affected'
      case 'unhealthy': return 'System: Unhealthy - Backend may be offline'
      default: return 'System: Unknown - Checking status...'
    }
  }

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const overallStatus = getOverallStatus()
  const dotColor = getDotColor(overallStatus)
  const tooltipText = getTooltipText(overallStatus)
  const shouldPulse = overallStatus === 'degraded' || overallStatus === 'unhealthy'

  return (
    <>
      <Tooltip title={tooltipText}>
        <IconButton
          onClick={handleClick}
          size="small"
          sx={{
            color: theme.palette.text.secondary,
            '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' },
          }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <DnsRoundedIcon sx={{ fontSize: 22 }} />
            <Box
              data-testid="system-status-dot"
              data-status={overallStatus}
              sx={{
                position: 'absolute',
                top: 2,
                right: 2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: dotColor,
                animation: shouldPulse ? `${statusPulse} 1.8s ease-in-out infinite` : 'none',
                '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
              }}
            />
          </Box>
        </IconButton>
      </Tooltip>
      <TopBarUtilityPanel
        anchorEl={anchorEl}
        onClose={onClose}
        title="System Status"
        width={350}
        headerAction={loading ? <CircularProgress size={20} /> : undefined}
      >
        <Box sx={{ p: 2 }}>
          {health && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Overall Status</Typography>
                <Box sx={{ mt: 0.5 }}>
                  <StatusChip status={health.status} label={health.status.toUpperCase()} sx={{ fontWeight: 600 }} />
                  <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                    Uptime: {formatUptime(health.uptime)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>Services</Typography>

              <List sx={{ p: 0 }}>
                {[
                  { icon: <NginxIcon fontSize="small" color="action" />, label: 'Frontend', status: frontendStatus, message: 'Web server running' },
                  { icon: <BackendIcon fontSize="small" color="action" />, label: 'Backend API', status: health.services.backend.status, message: health.services.backend.message },
                  { icon: <DatabaseIcon fontSize="small" color="action" />, label: 'PostgreSQL', status: health.services.database.status, message: health.services.database.message },
                  { icon: <RedisIcon fontSize="small" color="action" />, label: 'Redis', status: health.services.redis.status, message: health.services.redis.message },
                ].map(({ icon, label, status, message }) => (
                  <ListItem key={label} sx={{ px: 0, py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 40 }}>{icon}</ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Typography variant="body2">{label}</Typography>
                          <StatusChip status={status} label={status.toUpperCase()} sx={{ height: 20, fontSize: '0.65rem' }} />
                        </Box>
                      }
                      secondary={<Typography variant="caption" sx={{ color: 'text.secondary' }}>{message}</Typography>}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {isAdmin && alerts && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Redis Alerts
                </Typography>

                {alertsUnavailable && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'warning.main' }}>
                    Alert state may be out of date — last update{' '}
                    {new Date(alerts.generatedAt).toLocaleTimeString()}
                  </Typography>
                )}

                {alerts.pressure.active ? (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    Sustained memory pressure since{' '}
                    {new Date(alerts.pressure.currentEpisode?.startedAt ?? '').toLocaleString()}
                    {alerts.pressure.currentEpisode?.peakUtilizationPercent !== null &&
                      ` — peak ${alerts.pressure.currentEpisode?.peakUtilizationPercent}%`}
                    {alerts.pressure.stale && ' — stale, no live confirmation'}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    No active memory pressure
                  </Typography>
                )}

                {alerts.oom.active ? (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      {alerts.oom.unacknowledgedDelta} OOM error
                      {alerts.oom.unacknowledgedDelta === 1 ? '' : 's'} since{' '}
                      {new Date(alerts.oom.incidentStartedAt ?? '').toLocaleString()}
                    </Typography>
                    <Button
                      size="small"
                      onClick={handleAcknowledge}
                      disabled={acknowledging}
                      sx={{ mt: 0.5 }}
                    >
                      Acknowledge
                    </Button>
                    {ackError && (
                      <Typography variant="caption" sx={{ display: 'block', color: 'error.main' }}>
                        {ackError}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  alerts.oom.lastAcknowledgedAt && (
                    // "Acknowledged", never "recovered": an OOM event cannot
                    // recover, only be acknowledged.
                    <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                      OOM errors acknowledged{' '}
                      {new Date(alerts.oom.lastAcknowledgedAt).toLocaleString()}
                      {alerts.oom.lastAcknowledgedByLabel &&
                        ` by ${alerts.oom.lastAcknowledgedByLabel}`}
                    </Typography>
                  )
                )}

                {alerts.pressure.recentEpisodes.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Recent pressure episodes
                    </Typography>
                    <List dense disablePadding>
                      {[...alerts.pressure.recentEpisodes]
                        .reverse()
                        .slice(0, 5)
                        .map((episode) => (
                          <ListItem key={episode.startedAt} disablePadding>
                            <ListItemText
                              slotProps={{ primary: { variant: 'caption' } }}
                              // Pressure "recovers"; the OOM wording above is
                              // deliberately different.
                              primary={`${new Date(episode.startedAt).toLocaleString()} — recovered ${
                                episode.recoveredAt
                                  ? new Date(episode.recoveredAt).toLocaleTimeString()
                                  : 'n/a'
                              }${
                                episode.peakUtilizationPercent !== null
                                  ? ` (peak ${episode.peakUtilizationPercent}%)`
                                  : ''
                              }`}
                            />
                          </ListItem>
                        ))}
                    </List>
                  </Box>
                )}
              </Box>
            </>
          )}

          {!health && !loading && (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <InfoIcon color="disabled" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Unable to fetch system health information
              </Typography>
            </Box>
          )}
        </Box>
      </TopBarUtilityPanel>
    </>
  )
}

export default SystemStatus
