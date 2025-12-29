import React, { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
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
  Lock as LockIcon,
} from '@mui/icons-material'

import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { toggleTheme, selectThemeMode } from '@/store/slices/themeSlice'
import { selectUnreadCount } from '@/store/slices/notificationSlice'
import { logout as logoutAction } from '@/store/slices/authSlice'
import { useNavigate } from 'react-router-dom'

import Sidebar from './Sidebar'
import NotificationPanel from './NotificationPanel'
import SystemStatus from './SystemStatus'

interface MainLayoutProps {
  children: React.ReactNode
}

const DRAWER_WIDTH = 280

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
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

  // Close drawer on navigation to prevent overlay issues
  useEffect(() => {
    setMobileOpen(false)
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

  const handleUserMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUserMenuAnchorEl(event.currentTarget)
  }

  const handleUserMenuClose = () => {
    setUserMenuAnchorEl(null)
  }

  const handleLogout = async () => {
    handleUserMenuClose()
    const refreshToken = (window as any).store?.getState()?.auth?.refreshToken
    if (refreshToken) {
      await dispatch(logoutAction(refreshToken))
    }
    navigate('/login')
  }

  const handleChangePassword = () => {
    handleUserMenuClose()
    // Will be implemented when ChangePasswordDialog is added
    console.log('Change password clicked')
  }

  const handleProfile = () => {
    handleUserMenuClose()
    navigate('/profile')
  }

  // Get user initials for avatar
  const getUserInitials = () => {
    if (!currentUser) return 'U'
    const firstName = currentUser.firstName || ''
    const lastName = currentUser.lastName || ''
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || currentUser.username?.charAt(0).toUpperCase() || 'U'
  }

  // Get user display name
  const getUserDisplayName = () => {
    if (!currentUser) return 'User'
    return currentUser.fullName || `${currentUser.firstName} ${currentUser.lastName}` || currentUser.username
  }

  // Get role badge color
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
      {/* App Bar */}
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
          {/* Mobile menu button */}
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { lg: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Title */}
          <Typography
            variant="h6"
            noWrap
            component="div"
            sx={{ flexGrow: 1, fontWeight: 600 }}
          >
            ERP System
          </Typography>

          {/* Actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {/* System Status */}
            <SystemStatus />

            {/* Theme toggle */}
            <Tooltip title={`Switch to ${themeMode === 'light' ? 'dark' : 'light'} mode`}>
              <IconButton onClick={handleThemeToggle} color="inherit">
                {themeMode === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
              </IconButton>
            </Tooltip>

            {/* Notifications */}
            <Tooltip title="Notifications">
              <IconButton onClick={handleNotificationOpen} color="inherit">
                <Badge badgeContent={unreadCount} color="error">
                  <NotificationsIcon />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* User Menu */}
            <Tooltip title="Account">
              <IconButton onClick={handleUserMenuOpen} sx={{ ml: 1 }}>
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
            </Tooltip>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}
      >
        {/* Mobile drawer */}
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

        {/* Desktop drawer */}
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

      {/* Main content */}
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
        {children}
      </Box>


      {/* Notification Panel */}
      <NotificationPanel
        anchorEl={notificationAnchorEl}
        open={Boolean(notificationAnchorEl)}
        onClose={handleNotificationClose}
      />

      {/* User Menu */}
      <Menu
        anchorEl={userMenuAnchorEl}
        open={Boolean(userMenuAnchorEl)}
        onClose={handleUserMenuClose}
        onClick={handleUserMenuClose}
        PaperProps={{
          elevation: 3,
          sx: {
            mt: 1.5,
            minWidth: 220,
            overflow: 'visible',
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        {/* User Info Header */}
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

        {/* Menu Items */}
        <MenuItem onClick={handleProfile}>
          <ListItemIcon>
            <PersonIcon fontSize="small" />
          </ListItemIcon>
          My Profile
        </MenuItem>

        <MenuItem onClick={handleChangePassword}>
          <ListItemIcon>
            <LockIcon fontSize="small" />
          </ListItemIcon>
          Change Password
        </MenuItem>

        <MenuItem onClick={() => { handleUserMenuClose(); navigate('/settings/company'); }}>
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