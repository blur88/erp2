import React, { useState, useEffect } from 'react'
import {
  IconButton,
  Popover,
  Box,
  Typography,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  CircularProgress,
} from '@mui/material'
import {
  Computer as BackendIcon,
  Storage as DatabaseIcon,
  Memory as RedisIcon,
  CloudQueue as NginxIcon,
  InfoOutlined as InfoIcon,
} from '@mui/icons-material'
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

const SystemStatus: React.FC = () => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [frontendStatus, setFrontendStatus] = useState<'healthy' | 'unknown'>('healthy')

  const checkHealth = async () => {
    setLoading(true)
    try {
      const response = await ApiService.get<HealthResponse>('/health')
      const healthData = response as any as HealthResponse
      setHealth(healthData)
      setFrontendStatus('healthy')
    } catch (error) {
      setHealth(null)
      console.error('Health check failed:', error)
    }
    setLoading(false)
  }

  useEffect(() => {
    // Initial check
    checkHealth()

    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000)

    return () => clearInterval(interval)
  }, [])

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
    checkHealth() // Refresh on open
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

  const getOverallStatus = (): 'healthy' | 'degraded' | 'unhealthy' => {
    if (!health) return 'unhealthy'
    return health.status
  }

  const formatUptime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `${hours}h ${minutes}m`
  }

  const overallStatus = getOverallStatus()

  return (
    <>
      <Tooltip title="System Status">
        <IconButton onClick={handleClick} color="inherit" size="small">
          <Chip
            label={overallStatus.toUpperCase()}
            color={getStatusColor(overallStatus)}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: '0.7rem',
              height: 24,
              cursor: 'pointer',
            }}
          />
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
        PaperProps={{
          sx: {
            width: 350,
            mt: 1,
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
                <Typography variant="caption" color="text.secondary">
                  Overall Status
                </Typography>
                <Box sx={{ mt: 0.5 }}>
                  <Chip
                    label={health.status.toUpperCase()}
                    color={getStatusColor(health.status)}
                    size="small"
                    sx={{ fontWeight: 600 }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    Uptime: {formatUptime(health.uptime)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
                Services
              </Typography>

              <List sx={{ p: 0 }}>
                {/* Frontend/NGINX */}
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
                      <Typography variant="caption" color="text.secondary">
                        Web server running
                      </Typography>
                    }
                  />
                </ListItem>

                {/* Backend */}
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
                      <Typography variant="caption" color="text.secondary">
                        {health.services.backend.message}
                      </Typography>
                    }
                  />
                </ListItem>

                {/* PostgreSQL */}
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
                      <Typography variant="caption" color="text.secondary">
                        {health.services.database.message}
                      </Typography>
                    }
                  />
                </ListItem>

                {/* Redis */}
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
                      <Typography variant="caption" color="text.secondary">
                        {health.services.redis.message}
                      </Typography>
                    }
                  />
                </ListItem>
              </List>

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoIcon fontSize="small" color="action" />
                <Typography variant="caption" color="text.secondary">
                  Last checked: {new Date(health.timestamp).toLocaleTimeString()}
                </Typography>
              </Box>
            </>
          )}

          {!health && !loading && (
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Typography variant="body2" color="error">
                Unable to fetch system status
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Backend may be offline
              </Typography>
            </Box>
          )}
        </Box>
      </Popover>
    </>
  )
}

export default SystemStatus
