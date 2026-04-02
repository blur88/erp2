import React from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import SidebarUserMenu from './SidebarUserMenu'

interface SidebarFooterProps {
  collapsed: boolean
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed }) => {
  const theme = useTheme()

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.sidebar,
        borderTop: `1px solid ${theme.palette.divider}`,
        py: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: collapsed ? 'center' : 'stretch',
      }}
    >
      <SidebarUserMenu collapsed={collapsed} />
    </Box>
  )
}

export default SidebarFooter
