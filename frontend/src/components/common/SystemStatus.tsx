import React, { useEffect, useState } from 'react'
import { keyframes } from '@emotion/react'
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Popover,
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

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'unknown'
  message: string
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

const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(1.3); }
`

const SystemStatus: React.FC = () => {
  const theme = useTheme()
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [frontendStatus, setFrontendStatus] = useState<'healthy' | 'unknown'>('healthy')

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await ApiService.get<HealthResponse>('/health')
      const healthData = response as HealthResponse
      setHealth(healthData)
      setFrontendStatus('healthy')
    } catch (error) {
      setHealth(null)
      console.error('Health check failed:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    checkHealth()

    const interval = setInterval(checkHealth, 30000)

    return () => clearInterval(interval)
  }, [])

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
    void checkHealth()
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)

  const getStatusColor = (status: string): 'success' | 'error' | 'warning' | 'default' => {
    switch (status) {
      case 'healthy':
        return 'success'
      case 'unhealthy':
        return 'error'
      case 'degraded':
        return 'warning'
      default:
        return 'default'
    }
  }

  const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' | 'unknown' => {
    if (loading && !health) return 'unknown'
    if (!health) return 'unknown'
    return health.status
  }

  const getDotColor = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy':
        return theme.palette.success.main
      case 'degraded':
        return theme.palette.warning.main
      case 'unhealthy':
        return theme.palette.error.main
      default:
        return theme.palette.text.secondary
    }
  }

  const getTooltipText = (status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'): string => {
    switch (status) {
      case 'healthy':
        return 'System: Healthy - All services operational'
      case 'degraded':
        return 'System: Degraded - One or more services affected'
      case 'unhealthy':
        return 'System: Unhealthy - Backend may be offline'
      default:
        return 'System: Unknown - Checking status...'
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
          color="inherit"
          size="small"
          sx={{ '&:hover': { bgcolor: theme.palette.action.hover, borderRadius: '8px' } }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex' }}>
            <DnsRoundedIcon sx={{ fontSize: 22, color: theme.palette.text.secondary }} />
            <Box
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
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        slotProps={{
          paper: {
            sx: {
              width: 350,
              mt: 1,
            },
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              System Status
            </Typography>
            {loading && <CircularProgress size={20} />}
          </Box>

          {health && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{
                  color: "text.secondary"
                }}>
                  Overall Status
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={health.status.toUpperCase()}
                    color={getStatusColor(health.status)}
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      ml: 1
                    }}>
                    Uptime: {formatUptime(health.uptime)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Services
              </Typography>

              <List sx={{ p: 0 }}>
                <ListItem sx={{ px: 0, py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <NginxIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Frontend</Typography>
                        <Chip
                          label={frontendStatus.toUpperCase()}
                          color={getStatusColor(frontendStatus)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        Web server running
                      </Typography>
                    }
                  />
                </ListItem>

                <ListItem sx={{ px: 0, py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <BackendIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Backend API</Typography>
                        <Chip
                          label={health.services.backend.status.toUpperCase()}
                          color={getStatusColor(health.services.backend.status)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {health.services.backend.message}
                      </Typography>
                    }
                  />
                </ListItem>

                <ListItem sx={{ px: 0, py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <DatabaseIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">PostgreSQL</Typography>
                        <Chip
                          label={health.services.database.status.toUpperCase()}
                          color={getStatusColor(health.services.database.status)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {health.services.database.message}
                      </Typography>
                    }
                  />
                </ListItem>

                <ListItem sx={{ px: 0, py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <RedisIcon fontSize="small" color="action" />
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">Redis</Typography>
                        <Chip
                          label={health.services.redis.status.toUpperCase()}
                          color={getStatusColor(health.services.redis.status)}
                          size="small"
                          sx={{ height: 20, fontSize: '0.65rem' }}
                        />
                      </Box>
                    }
                    secondary={
                      <Typography variant="caption" sx={{
                        color: "text.secondary"
                      }}>
                        {health.services.redis.message}
                      </Typography>
                    }
                  />
                </ListItem>
              </List>
            </>
          )}

          {!health && !loading && (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <InfoIcon color="disabled" sx={{ fontSize: 32, mb: 1 }} />
              <Typography variant="body2" sx={{
                color: "text.secondary"
              }}>
                Unable to fetch system health information
              </Typography>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  );
}

export default SystemStatus
