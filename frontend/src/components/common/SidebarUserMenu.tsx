import React, { useRef, useState } from 'react'
import {
  Avatar,
  Box,
  Button,
  Divider,
  ListItemIcon,
  Menu,
  MenuItem,
  Popover,
  Typography,
} from '@mui/material'
import {
  Logout as LogoutIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/useRedux'
import {
  logout,
  selectCurrentUser,
  selectRefreshToken,
} from '@/store/slices/authSlice'
import { persistor } from '@/store'

// Local color constants intentionally duplicate the sidebar palette.
// The original sidebar colors are module-private, so this keeps the scope
// small for the sidebar footer refactor.
const COLORS = {
  icon: '#6B7280',
  hoverText: '#CBD5E1',
  text: '#9CA3AF',
  mutedText: '#6B7280',
  menuBg: '#1E1E1E',
  border: '#1F2937',
} as const

interface SidebarUserMenuProps {
  collapsed: boolean
}

const SidebarUserMenu: React.FC<SidebarUserMenuProps> = ({ collapsed }) => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const user = useSelector(selectCurrentUser)
  const refreshToken = useSelector(selectRefreshToken)
  const [menuAnchorEl, setMenuAnchorEl] = useState<HTMLElement | null>(null)
  const [logoutAnchorEl, setLogoutAnchorEl] = useState<HTMLElement | null>(null)
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null)

  if (!user) return null

  const { username, firstName, lastName } = user
  const initials = (
    (firstName?.[0] ?? '') + (lastName?.[0] ?? '') || username?.[0] || 'U'
  ).toUpperCase()
  const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'

  const handleAvatarClick = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget)
  }

  const handleMenuClose = () => {
    setMenuAnchorEl(null)
  }

  const handleSettingsClick = () => {
    handleMenuClose()
    navigate('/settings')
  }

  const handleLogoutClick = () => {
    setLogoutAnchorEl(triggerButtonRef.current)
    handleMenuClose()
  }

  const handleLogoutCancel = () => {
    setLogoutAnchorEl(null)
  }

  const handleLogoutConfirm = async () => {
    setLogoutAnchorEl(null)
    if (refreshToken) {
      await dispatch(logout(refreshToken))
    }
    await persistor.purge()
    // No navigate('/login') here — ProtectedRoute detects isAuthenticated === false
    // and handles the redirect, preserving the 'from' location state for post-login return.
  }

  const avatarElement = (
    <Avatar
      sx={{
        width: 32,
        height: 32,
        bgcolor: 'primary.main',
        fontSize: '0.75rem',
        cursor: 'pointer',
        '&:hover': { filter: 'brightness(1.1)' },
      }}
    >
      {initials}
    </Avatar>
  )

  return (
    <>
      {collapsed ? (
        <Box
          sx={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="button"
            ref={triggerButtonRef}
            type="button"
            aria-label="Open user menu"
            aria-haspopup="true"
            onClick={handleAvatarClick}
            sx={{
              width: 40,
              height: 40,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {avatarElement}
          </Box>
        </Box>
      ) : (
        <Box
          component="button"
          ref={triggerButtonRef}
          type="button"
          sx={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            height: '40px',
            px: 2,
            cursor: 'pointer',
            background: 'transparent',
            border: 'none',
            textAlign: 'left',
            transition: 'background-color 0.15s ease, transform 0.15s ease',
            '&:hover': {
              backgroundColor: '#1E1E1E',
              transform: 'translateX(1px)',
            },
          }}
          onClick={handleAvatarClick}
          aria-label="Open user menu"
          aria-haspopup="true"
        >
          {avatarElement}
          <Box sx={{ ml: 1.5, flex: 1, minWidth: 0 }}>
            <Typography
              noWrap
              sx={{
                color: '#FFFFFF',
                fontSize: '0.875rem',
                lineHeight: 1.3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {username}
            </Typography>
            <Typography
              sx={{
                color: COLORS.mutedText,
                fontSize: '0.7rem',
                lineHeight: 1.2,
                mt: '4px',
              }}
            >
              v{version}
            </Typography>
          </Box>
        </Box>
      )}

      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: {
            minWidth: 220,
            bgcolor: COLORS.menuBg,
            borderRadius: 1,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          },
        }}
        transformOrigin={{ horizontal: 'left', vertical: 'bottom' }}
        anchorOrigin={{ horizontal: 'left', vertical: 'top' }}
      >
        <Box sx={{ px: 2, py: 1, cursor: 'default', userSelect: 'none' }}>
          <Typography sx={{ color: COLORS.text, fontSize: '0.75rem' }}>
            {username}
          </Typography>
        </Box>

        <Divider sx={{ borderColor: COLORS.border }} />

        <MenuItem
          onClick={handleSettingsClick}
          sx={{
            minHeight: 40,
            alignItems: 'center',
            '& .MuiListItemIcon-root': { color: COLORS.icon },
            '&:hover .MuiListItemIcon-root': { color: COLORS.hoverText },
          }}
        >
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>

        <MenuItem
          onClick={handleLogoutClick}
          sx={{
            minHeight: 40,
            alignItems: 'center',
            '& .MuiListItemIcon-root': { color: COLORS.icon },
            '&:hover .MuiListItemIcon-root': { color: COLORS.hoverText },
          }}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          Logout
        </MenuItem>

        <Divider sx={{ borderColor: COLORS.border }} />

        <Box sx={{ px: 2, py: 1, mt: '4px' }}>
          <Typography sx={{ color: COLORS.mutedText, fontSize: '0.65rem' }}>
            v{version}
          </Typography>
        </Box>
      </Menu>

      <Popover
        open={Boolean(logoutAnchorEl)}
        anchorEl={logoutAnchorEl}
        onClose={handleLogoutCancel}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        PaperProps={{
          sx: {
            bgcolor: COLORS.menuBg,
            border: `1px solid ${COLORS.border}`,
            p: 2,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ color: '#FFFFFF', fontSize: '0.875rem' }}>
            Log out?
          </Typography>
          <Button size="small" onClick={handleLogoutCancel} aria-label="Cancel">
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            color="error"
            onClick={handleLogoutConfirm}
            aria-label="Logout"
          >
            Logout
          </Button>
        </Box>
      </Popover>
    </>
  )
}

export default SidebarUserMenu
