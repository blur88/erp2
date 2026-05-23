import React, { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Box, Drawer } from '@mui/material'
import { useTheme } from '@mui/material/styles'

import { DRAWER_WIDTH_COLLAPSED, DRAWER_WIDTH_EXPANDED } from '@/constants/layout'

import Sidebar from './Sidebar'
import TopBar from './TopBar'

const MainLayout: React.FC = () => {
  const theme = useTheme()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('sidebar-collapsed') === 'true'
  })

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleDrawerToggle = () => {
    setMobileOpen(open => !open)
  }

  const handleToggleCollapse = () => {
    setCollapsed(current => {
      const next = !current
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', height: '100vh' }}>
      <TopBar collapsed={collapsed} onMobileMenuOpen={handleDrawerToggle} />

      <Box
        component="nav"
        sx={{
          width: { lg: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED },
          flexShrink: { lg: 0 },
        }}
      >
        <Drawer
          key={location.pathname}
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: false }}
          sx={{
            display: { xs: 'block', lg: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH_EXPANDED,
            },
          }}
        >
          <Sidebar collapsed={false} onItemClick={handleDrawerToggle} />
        </Drawer>

        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              bgcolor: theme.palette.background.default,
              boxSizing: 'border-box',
              width: collapsed ? DRAWER_WIDTH_COLLAPSED : DRAWER_WIDTH_EXPANDED,
              transition: 'width 0.22s ease',
              overflowX: 'hidden',
            },
          }}
          open
        >
          <Sidebar collapsed={collapsed} onToggleCollapse={handleToggleCollapse} />
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          pt: 11,
          px: { xs: 2, sm: 3 },
          pb: 3,
          bgcolor: 'background.default',
          minHeight: '100%',
          overflow: 'auto',
          maxWidth: '100%',
        }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}

export default MainLayout
