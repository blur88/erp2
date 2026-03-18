import React, { useState } from 'react'
import {
  Avatar,
  Box,
  IconButton,
  ListItemButton,
  Tooltip,
  Typography,
} from '@mui/material'
import ConfirmationDialog from './ConfirmationDialog'
import { Logout as LogoutIcon } from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  logout,
  selectCurrentUser,
  selectRefreshToken,
} from '@/store/slices/authSlice'
import type { AppDispatch } from '@/store'
import { persistor } from '@/store'

const COLORS = {
  border: '#1F2937',
  hoverBg: '#1E1E1E',
  activeText: '#FFFFFF',
  sectionLabel: '#6B7280',
  icon: '#6B7280',
  hoverText: '#CBD5E1',
} as const

interface SidebarFooterProps {
  collapsed: boolean
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed }) => {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const user = useSelector(selectCurrentUser)
  const refreshToken = useSelector(selectRefreshToken)
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (!user) return null

  const { username, firstName, lastName } = user
  const initials = ((firstName?.[0] ?? '') + (lastName?.[0] ?? '') || username?.[0] || 'U').toUpperCase()
  const version = __APP_VERSION__ || '0.0.0'

  const handleLogoutConfirm = async () => {
    setConfirmOpen(false)
    if (refreshToken) {
      await dispatch(logout(refreshToken))
    }
    await persistor.purge()
    navigate('/login')
  }

  const confirmDialog = (
    <ConfirmationDialog
      open={confirmOpen}
      title="Logout"
      message="Are you sure you want to log out?"
      confirmText="Logout"
      cancelText="Cancel"
      severity="warning"
      onConfirm={handleLogoutConfirm}
      onCancel={() => setConfirmOpen(false)}
    />
  )

  if (collapsed) {
    return (
      <>
      <Box
        sx={{
          borderTop: `1px solid ${COLORS.border}`,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <Tooltip title={username} placement="right">
          <Box
            tabIndex={0}
            role="img"
            aria-label={username}
            sx={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'default',
              outline: 'none',
            }}
          >
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main', fontSize: '0.75rem' }}>
              {initials}
            </Avatar>
          </Box>
        </Tooltip>
        <Tooltip title="Logout" placement="right">
          <IconButton
            onClick={() => setConfirmOpen(true)}
            aria-label="Logout"
            size="small"
            sx={{
              width: 40,
              height: 40,
              borderRadius: 1,
              color: COLORS.icon,
              '&:hover': {
                bgcolor: COLORS.hoverBg,
                color: COLORS.hoverText,
              },
            }}
          >
            <LogoutIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </Box>
      {confirmDialog}
      </>
    )
  }

  return (
    <>
    <Box sx={{ borderTop: `1px solid ${COLORS.border}` }}>
      <ListItemButton
        onClick={() => setConfirmOpen(true)}
        aria-label={`Logout ${username}`}
        sx={{
          px: 2,
          py: 1.5,
          '&:hover': {
            bgcolor: COLORS.hoverBg,
            '& svg': { color: COLORS.hoverText },
          },
        }}
      >
        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: 'primary.main',
            fontSize: '0.75rem',
            flexShrink: 0,
          }}
        >
          {initials}
        </Avatar>
        <Box sx={{ ml: 1.5, flex: 1, minWidth: 0 }}>
          <Typography
            noWrap
            sx={{ color: COLORS.activeText, fontSize: '0.875rem', lineHeight: 1.3 }}
          >
            {username}
          </Typography>
          <Typography
            sx={{
              color: COLORS.sectionLabel,
              fontSize: '0.7rem',
              lineHeight: 1.2,
              mt: '2px',
            }}
          >
            v{version}
          </Typography>
        </Box>
        <Tooltip title="Logout">
          <LogoutIcon sx={{ color: COLORS.icon, fontSize: 18, flexShrink: 0 }} />
        </Tooltip>
      </ListItemButton>
    </Box>
    {confirmDialog}
    </>
  )
}

export default SidebarFooter
