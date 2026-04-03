import type { ReactNode } from 'react'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import SortIcon from '@mui/icons-material/Sort'
import { CircularProgress } from '@mui/material'
import Button, { type ButtonProps } from '@mui/material/Button'

type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger'
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
    muiColor = isSortActive ? 'primary' : 'inherit'

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
      case 'danger':
        muiVariant = 'contained'
        muiColor = 'error'
        break
      case 'secondary':
      case 'outlined':
      default:
        muiVariant = 'outlined'
        muiColor = 'inherit'
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
