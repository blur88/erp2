import React, { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Badge,
  useMediaQuery,
  useTheme,
  Tooltip,
  Divider,
  ListItemIcon,
} from '@mui/material'
import {
  Menu as MenuIcon,
  Notifications as NotificationsIcon,
  Settings as SettingsIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Person as PersonIcon,
  Logout as LogoutIcon,
} from '@mui/icons-material'

import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { toggleTheme, selectThemeMode } from '@/store/slices/themeSlice'
import { selectUnreadCount } from '@/store/slices/notificationSlice'
import { logout as logoutAction, selectRefreshToken } from '@/store/slices/authSlice'

import Sidebar from './Sidebar'
import NotificationPanel from './NotificationPanel'
import SystemStatus from './SystemStatus'

const DRAWER_WIDTH = 280

const MainLayout: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'))
  const dispatch = useAppDispatch()
  const themeMode = useAppSelector(selectThemeMode)
  const unreadCount = useAppSelector(selectUnreadCount)
  const location = useLocation()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [notificationAnchorEl, setNotificationAnchorEl] = useState<null | HTMLElement>(null)
  const [userMenuAnchorEl, setUserMenuAnchorEl] = useState<null | HTMLElement>(null)

  const navigate = useNavigate()
  const currentUser = useAppSelector((state) => state.auth?.user || null)
  const refreshToken = useAppSelector(selectRefreshToken)

  useEffect(() => {
    setMobileOpen(false)
    setUserMenuAnchorEl(null)
  }, [location.pathname])

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen)
  }

  const handleNotificationOpen = (event: React.MouseEvent<HTMLElement>) => {
    setNotificationAnchorEl(event.currentTarget)
  }

  const handleNotificationClose = () => {
    setNotificationAnchorEl(null)
  }

  const handleThemeToggle = () => {
    dispatch(toggleTheme())
  }

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setUserMenuAnchorEl(event.currentTarget)
  }

  const handleUserMenuClose = () => {
    setUserMenuAnchorEl(null)
  }

  const handleLogout = async () => {
    handleUserMenuClose()
    if (refreshToken) {
      await dispatch(logoutAction(refreshToken))
    }
    navigate('/login')
  }

  const getUserInitials = () => {
    if (!currentUser) return 'U'

    const firstName = currentUser.firstName?.trim() || ''
    const lastName = currentUser.lastName?.trim() || ''

    const firstInitial = firstName.charAt(0).toUpperCase()
    const lastInitial = lastName.charAt(0).toUpperCase()

    if (firstInitial && lastInitial) {
      return `${firstInitial}${lastInitial}`
    }

    if (firstInitial) {
      return firstInitial
    }

    if (lastInitial) {
      return lastInitial
    }

    return currentUser.username?.charAt(0).toUpperCase() || 'U'
  }

  const getUserDisplayName = () => {
    if (!currentUser) return 'User'

    if (currentUser.fullName && currentUser.fullName.trim()) {
      return currentUser.fullName
    }

    const firstName = currentUser.firstName?.trim() || ''
    const lastName = currentUser.lastName?.trim() || ''

    if (firstName || lastName) {
      return `${firstName} ${lastName}`.trim()
    }

    return currentUser.username || 'User'
  }

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'error'
      case 'manager':
        return 'warning'
      case 'sales_staff':
        return 'info'
      case 'inventory_staff':
        return 'success'
      case 'procurement_staff':
        return 'primary'
      default:
        return 'default'
    }
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        sx={{
          width: { lg: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { lg: `${DRAWER_WIDTH}px` },
          bgcolor: 'background.paper',
          color: 'text.primary',
          boxShadow: '0px 1px 3px rgba(0, 0, 0, 0.08)',
          borderBottom: '1px solid',
          borderBottomColor: 'divider',
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { lg: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
            ERP System
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SystemStatus />

            <Tooltip title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}>
              <IconButton onClick={handleThemeToggle} color="inherit">
                {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Notifications">
              <IconButton onClick={handleNotificationOpen} color="inherit">
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            <IconButton
              onClick={handleUserMenuOpen}
              sx={{ ml: 1 }}
              aria-label="Account menu"
              aria-controls={Boolean(userMenuAnchorEl) ? 'user-menu' : undefined}
              aria-haspopup="true"
              aria-expanded={Boolean(userMenuAnchorEl) ? 'true' : undefined}
            >
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  bgcolor: 'primary.main',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                }}
              >
                {getUserInitials()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}>
        <Drawer
          key={location.pathname}
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: false,
          }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          <Sidebar onItemClick={handleDrawerToggle} />
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
          open
        >
          <Sidebar />
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          pt: 8,
          px: { xs: 2, sm: 3 },
          pb: 3,
          bgcolor: 'background.default',
          minHeight: '100vh',
          overflow: 'hidden',
          maxWidth: '100%',
        }}
      >
        <Outlet />
      </Box>

      <NotificationPanel
        anchorEl={notificationAnchorEl}
        open={Boolean(notificationAnchorEl)}
        onClose={handleNotificationClose}
      />

      <Menu
        id="user-menu"
        anchorEl={userMenuAnchorEl}
        open={Boolean(userMenuAnchorEl)}
        onClose={handleUserMenuClose}
        keepMounted={false}
        disablePortal={false}
        disableScrollLock={true}
        disableAutoFocusItem={false}
        transitionDuration={0}
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
            elevation: 3,
            sx: {
              mt: 1.5,
              minWidth: 220,
              overflow: 'visible',
              filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
              zIndex: 1300,
            },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" fontWeight={600}>
            {getUserDisplayName()}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {currentUser?.email}
          </Typography>
          <Box sx={{ mt: 0.5 }}>
            <Typography
              variant="caption"
              sx={{
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: `${getRoleBadgeColor(currentUser?.role)}.main`,
                color: 'white',
                fontWeight: 600,
                textTransform: 'uppercase',
                fontSize: '0.625rem',
              }}
            >
              {currentUser?.role?.replace('_', ' ')}
            </Typography>
          </Box>
        </Box>

        <MenuItem onClick={() => navigate('/settings/users')}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          User Management
        </MenuItem>

        <MenuItem onClick={() => navigate('/settings/company')}>
          <ListItemIcon>
            <SettingsIcon fontSize="small" />
          </ListItemIcon>
          Settings
        </MenuItem>

        <Divider />

        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" color="error" />
          </ListItemIcon>
          Logout
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default MainLayout
