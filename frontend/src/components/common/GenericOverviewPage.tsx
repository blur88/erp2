import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface GenericOverviewPageProps {
  children: ReactNode
}

export default function GenericOverviewPage({ children }: GenericOverviewPageProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto', mr: { xs: -2, sm: -3 }, pr: { xs: 2, sm: 3 } }}>
      {children}
    </Box>
  )
}
