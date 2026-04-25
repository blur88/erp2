import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface GenericOverviewPageProps {
  children: ReactNode
}

export default function GenericOverviewPage({ children }: GenericOverviewPageProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {children}
    </Box>
  )
}
