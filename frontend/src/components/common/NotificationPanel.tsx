import React from 'react'
import {
  Box,
  Typography,
  ListItemButton,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  Divider,
  Chip,
  Badge,
  Tooltip,
} from '@mui/material'
import { default as MarkReadIcon } from '@mui/icons-material/MarkEmailRead'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as InfoIcon } from '@mui/icons-material/Info'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import { default as ErrorIcon } from '@mui/icons-material/Error'
import { default as SuccessIcon } from '@mui/icons-material/CheckCircle'
import { default as CopyIcon } from '@mui/icons-material/ContentCopy'
import { default as CheckIcon } from '@mui/icons-material/Check'
import { formatDistanceToNow } from 'date-fns'

import { copyToClipboard } from '@/utils/clipboard'
import { useNotifications } from '@/hooks/useNotification'
import { useAppDispatch } from '@/hooks/useRedux'
import { markAsRead, markAllAsRead, removeNotification } from '@/store/slices/notificationSlice'
import type { Notification } from '@/types'
import { AppButton } from '@/components/common/AppButton'
import TopBarUtilityPanel from './TopBarUtilityPanel'

interface NotificationPanelProps {
  anchorEl: HTMLElement | null
  onClose: () => void
}

const getNotificationIcon = (type: Notification['type']) => {
  switch (type) {
    case 'success':
      return <SuccessIcon sx={{ color: 'success.main' }} />
    case 'warning':
      return <WarningIcon sx={{ color: 'warning.main' }} />
    case 'error':
      return <ErrorIcon sx={{ color: 'error.main' }} />
    default:
      return <InfoIcon sx={{ color: 'info.main' }} />
  }
}

const getNotificationColor = (type: Notification['type']): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  switch (type) {
    case 'success':
      return 'success'
    case 'warning':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'info'
  }
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({
  anchorEl,
  onClose,
}) => {
  const { notifications } = useNotifications()
  const dispatch = useAppDispatch()
  const [copiedId, setCopiedId] = React.useState<string | null>(null)
  const copyTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const popoverPaperRef = React.useRef<HTMLDivElement | null>(null)

  const unreadNotifications = notifications.filter(n => !n.read)
  const recentNotifications = notifications.slice(0, 10)

  const handleMarkAsRead = (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch(markAsRead(notificationId))
  }

  const handleRemoveNotification = (notificationId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    dispatch(removeNotification(notificationId))
  }

  const handleMarkAllAsRead = () => {
    dispatch(markAllAsRead())
  }

  const handleCopy = async (notificationId: string, message: string, event: React.MouseEvent) => {
    event.stopPropagation()
    const success = await copyToClipboard(message, popoverPaperRef.current!)
    if (success) {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      setCopiedId(notificationId)
      copyTimeoutRef.current = setTimeout(() => setCopiedId(null), 1500)
    }
  }

  React.useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read) {
      dispatch(markAsRead(notification.id))
    }
    onClose()
  }

  return (
    <TopBarUtilityPanel
      anchorEl={anchorEl}
      onClose={onClose}
      title="Notifications"
      width={400}
      maxHeight={600}
      paperRef={popoverPaperRef}
      headerAction={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {unreadNotifications.length > 0 && (
            <Badge badgeContent={unreadNotifications.length} color="error" />
          )}
          {unreadNotifications.length > 0 && (
            <AppButton
              size="small"
              startIcon={<MarkReadIcon />}
              onClick={handleMarkAllAsRead}
              sx={{ fontSize: '0.75rem' }}
            >
              Mark all read
            </AppButton>
          )}
        </Box>
      }
    >
      <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
        {recentNotifications.length === 0 ? (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No notifications yet
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {recentNotifications.map((notification, index) => (
              <React.Fragment key={notification.id}>
                <ListItemButton
                  onClick={() => handleNotificationClick(notification)}
                  sx={{
                    py: 2,
                    px: 2,
                    bgcolor: notification.read ? 'transparent' : 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    {getNotificationIcon(notification.type)}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Typography
                          variant="subtitle2"
                          sx={{ fontWeight: notification.read ? 400 : 600, flexGrow: 1 }}
                        >
                          {notification.title}
                        </Typography>
                        <Chip
                          label={notification.type}
                          size="small"
                          color={getNotificationColor(notification.type)}
                          variant={notification.read ? 'outlined' : 'filled'}
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      </Box>
                    }
                    secondary={
                      <Box>
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
                          {notification.message}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                          {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
                        </Typography>
                      </Box>
                    }
                    slotProps={{ secondary: { component: 'div' } }}
                  />
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Tooltip title="Copy message" placement="left">
                      <IconButton
                        size="small"
                        onClick={(e) => handleCopy(notification.id, notification.message, e)}
                        aria-label="Copy message"
                      >
                        {copiedId === notification.id ? (
                          <CheckIcon fontSize="small" color="success" />
                        ) : (
                          <CopyIcon fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                    {!notification.read && (
                      <IconButton size="small" onClick={(e) => handleMarkAsRead(notification.id, e)} title="Mark as read">
                        <MarkReadIcon fontSize="small" />
                      </IconButton>
                    )}
                    <IconButton size="small" onClick={(e) => handleRemoveNotification(notification.id, e)} title="Remove">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </ListItemButton>
                {index < recentNotifications.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>
      {notifications.length > 10 && (
        <>
          <Divider />
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <AppButton size="small" onClick={onClose} fullWidth sx={{ fontSize: '0.875rem' }}>
              View All Notifications
            </AppButton>
          </Box>
        </>
      )}
    </TopBarUtilityPanel>
  )
}

export default NotificationPanel
