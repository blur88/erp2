import type { ReactNode } from 'react'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Box, IconButton, Typography, useTheme } from '@mui/material'

import { AppButton } from './AppButton'

type PageHeaderAction = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  primaryAction?: PageHeaderAction
  secondaryAction?: PageHeaderAction
  showDivider?: boolean
  variant?: 'standard' | 'report' | 'overview' | 'structure' | 'workflow' | 'system'
  titleBadge?: ReactNode
  backAction?: () => void
  toolbar?: ReactNode
  children?: ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  showDivider = true,
  variant: _variant,
  titleBadge,
  backAction,
  toolbar,
  children,
}: PageHeaderProps) {
  const theme = useTheme()
  const hasActions = primaryAction != null || secondaryAction != null

  return (
    <Box
      data-testid={showDivider ? 'page-header-divider' : undefined}
      sx={{
        mb: 2,
        pb: 2,
        ...(showDivider && {
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'nowrap',
          [theme.breakpoints.down('sm')]: {
            flexDirection: 'column',
            alignItems: 'flex-start',
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
          {backAction && (
            <IconButton onClick={backAction} size="small" sx={{ flexShrink: 0 }}>
              <ArrowBackIcon />
            </IconButton>
          )}
          <Box sx={{ minWidth: 0, flex: '1 1 auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="h5"
                sx={{ fontWeight: 700, color: 'text.primary', lineHeight: 1.2 }}
              >
                {title}
              </Typography>
              {titleBadge}
            </Box>
            {subtitle && (
              <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>

        {hasActions && (
          <Box
            data-testid="page-header-actions"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexShrink: 0,
              [theme.breakpoints.down('sm')]: {
                alignSelf: 'flex-start',
              },
            }}
          >
            {secondaryAction && (
              <AppButton
                type="button"
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </AppButton>
            )}
            {primaryAction && (
              <AppButton
                type="button"
                variant="primary"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </AppButton>
            )}
          </Box>
        )}
      </Box>

      {toolbar && (
        <Box data-testid="page-header-toolbar" sx={{ mt: 1 }}>
          {toolbar}
        </Box>
      )}

      {children && (
        <Box data-testid="page-header-children" sx={{ mt: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}
