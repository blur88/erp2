import React from 'react'
import { Box, IconButton, Popover, Typography } from '@mui/material'
import { default as CloseIcon } from '@mui/icons-material/Close'

interface TopBarUtilityPanelProps {
  anchorEl: HTMLElement | null
  onClose: () => void
  title: string
  width?: number
  maxHeight?: number
  headerAction?: React.ReactNode
  children: React.ReactNode
  paperRef?: React.Ref<HTMLDivElement>
}

const TopBarUtilityPanel: React.FC<TopBarUtilityPanelProps> = ({
  anchorEl,
  onClose,
  title,
  width = 380,
  maxHeight = 600,
  headerAction,
  children,
  paperRef,
}) => {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          ref: paperRef,
          sx: { width, maxHeight, mt: 1, borderRadius: '12px', overflow: 'hidden' },
        },
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {headerAction}
          <IconButton aria-label="close" size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      {children}
    </Popover>
  )
}

export default TopBarUtilityPanel
