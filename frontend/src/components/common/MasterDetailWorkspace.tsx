import React from 'react'
import { Box } from '@mui/material'

interface MasterDetailWorkspaceProps {
  listSlot: React.ReactNode
  headerSlot: React.ReactNode
  workspaceSlot: React.ReactNode
  isMobile: boolean
}

const MasterDetailWorkspace: React.FC<MasterDetailWorkspaceProps> = ({
  listSlot,
  headerSlot,
  workspaceSlot,
  isMobile,
}) => {
  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {listSlot}
        {headerSlot}
        {workspaceSlot}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 324px)', gap: 3 }}>
      <Box
        sx={{
          width: '25%',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {listSlot}
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
        {headerSlot}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {workspaceSlot}
        </Box>
      </Box>
    </Box>
  )
}

export default MasterDetailWorkspace
