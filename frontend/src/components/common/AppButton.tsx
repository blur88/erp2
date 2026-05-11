import type { ReactNode } from 'react'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import SortIcon from '@mui/icons-material/Sort'
import { CircularProgress } from '@mui/material'
import Button, { type ButtonProps } from '@mui/material/Button'

type AppButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outlined'
  | 'neutral'
  | 'danger'
  | 'warning'
  | 'success'
  | 'text'
  | 'info'
type AppButtonSize = 'filter' | 'small' | 'medium' | 'large'

type SortConfig = {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

type AppButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'color'> & {
  variant?: AppButtonVariant
  size?: AppButtonSize
  loading?: boolean
  sortConfig?: SortConfig
}

export function AppButton({
  variant,
  size,
  loading = false,
  sortConfig,
  disabled,
  startIcon,
  sx,
  children,
  ...rest
}: AppButtonProps) {
  const isSortActive = sortConfig != null && sortConfig.sortBy === sortConfig.field

  let muiVariant: ButtonProps['variant']
  let muiColor: ButtonProps['color']
  let resolvedStartIcon: ReactNode = startIcon

  if (sortConfig != null) {
    muiVariant = isSortActive ? 'contained' : 'outlined'
    muiColor = 'primary'

    if (isSortActive) {
      resolvedStartIcon =
        sortConfig.sortOrder === 'desc' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />
    } else {
      resolvedStartIcon = <SortIcon />
    }
  } else {
    switch (variant) {
      case 'primary':
        muiVariant = 'contained'
        muiColor = 'primary'
        break
      case 'secondary':
        muiVariant = 'contained'
        muiColor = 'secondary'
        break
      case 'outlined':
        muiVariant = 'outlined'
        muiColor = 'primary'
        break
      case 'neutral':
        muiVariant = 'outlined'
        muiColor = 'inherit'
        break
      case 'danger':
        muiVariant = 'contained'
        muiColor = 'error'
        break
      case 'warning':
        muiVariant = 'contained'
        muiColor = 'warning'
        break
      case 'success':
        muiVariant = 'contained'
        muiColor = 'success'
        break
      case 'text':
        muiVariant = 'text'
        muiColor = 'inherit'
        break
      case 'info':
        muiVariant = 'contained'
        muiColor = 'info'
        break
      default:
        muiVariant = 'outlined'
        muiColor = 'primary'
        break
    }
  }

  if (loading) {
    resolvedStartIcon = <CircularProgress size={16} color="inherit" />
  }

  const muiSize: ButtonProps['size'] = size === 'filter' ? 'small' : size

  return (
    <Button
      variant={muiVariant}
      color={muiColor}
      size={muiSize}
      disabled={disabled || loading}
      startIcon={resolvedStartIcon}
      sx={size === 'filter' ? { height: 40, ...((sx as object) ?? {}) } : sx}
      {...rest}
    >
      {children}
    </Button>
  )
}
