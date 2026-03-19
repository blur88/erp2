import React from 'react'
import { Box } from '@mui/material'
import SidebarUserMenu from './SidebarUserMenu'

interface SidebarFooterProps {
  collapsed: boolean
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({ collapsed }) => {
  return (
    <Box
      sx={{
        backgroundColor: '#141414',
        borderTop: '1px solid #1F2937',
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
