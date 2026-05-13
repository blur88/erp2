import { default as LockIcon } from '@mui/icons-material/Lock'
import { default as LockOpenIcon } from '@mui/icons-material/LockOpen'
import { Tooltip } from '@mui/material'

interface LockStatusIconProps {
  isLocked: boolean
  tooltipText: string
}

export function LockStatusIcon({ isLocked, tooltipText }: LockStatusIconProps) {
  if (isLocked) {
    return (
      <Tooltip title={tooltipText}>
        <LockIcon sx={{ fontSize: '1rem', color: 'warning.main', cursor: 'default' }} />
      </Tooltip>
    )
  }

  return (
    <Tooltip title={tooltipText}>
      <LockOpenIcon sx={{ fontSize: '1rem', color: 'text.disabled', opacity: 0.5, cursor: 'default' }} />
    </Tooltip>
  )
}
