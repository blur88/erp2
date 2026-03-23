import type { ReactNode } from 'react'
import { Box, Button, Typography, useTheme } from '@mui/material'

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
  children?: ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  showDivider = true,
  children,
}: PageHeaderProps) {
  const theme = useTheme()
  const hasActions = primaryAction != null || secondaryAction != null

  return (
    <Box
      data-testid={showDivider ? 'page-header-divider' : undefined}
      sx={{
        mb: 3,
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
          [theme.breakpoints.down('sm')]: {
            flexDirection: 'column',
            alignItems: 'flex-start',
          },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary' }}>
              {subtitle}
            </Typography>
          )}
        </Box>

        {hasActions && (
          <Box
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
              <Button
                type="button"
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
            {primaryAction && (
              <Button
                type="button"
                variant="contained"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            )}
          </Box>
        )}
      </Box>

      {children && <Box sx={{ mt: 1 }}>{children}</Box>}
    </Box>
  )
}
