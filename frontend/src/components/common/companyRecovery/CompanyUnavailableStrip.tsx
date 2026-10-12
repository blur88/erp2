import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import React from 'react'

export interface CompanyUnavailableStripProps {
  collapsed: boolean
  /** The tab may send: signed in, storage usable, visible, and nothing pending. */
  canRetry: boolean
  /** A request for this read is in flight, whoever started it. */
  retrying: boolean
  onRetry: () => void
}

/**
 * What the user sees when the company-settings read failed and recovery has
 * stopped: why the name and logo are missing, and a way to ask again. Shown in
 * the stopped state even when the branding is still on screen.
 *
 * The collapsed form is one icon button, because the sidebar is 64 px wide
 * there; its tooltip carries the wording the expanded row has.
 */
export const CompanyUnavailableStrip: React.FC<CompanyUnavailableStripProps> = ({
  collapsed,
  canRetry,
  retrying,
  onRetry,
}) => {
  const theme = useTheme()
  const warning = theme.palette.warning
  const border = theme.palette.divider
  const background = alpha(warning.main, theme.palette.mode === 'dark' ? 0.16 : 0.12)
  const hover = alpha(warning.main, theme.palette.mode === 'dark' ? 0.26 : 0.2)

  if (collapsed) {
    // A disabled MUI button takes no pointer events, so the tooltip would go
    // with it; the span keeps it showing while a request is pending.
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          py: 0.5,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}
      >
        <Tooltip title="Company details unavailable. Retry" placement="right">
          <span>
            <IconButton
              onClick={onRetry}
              disabled={!canRetry}
              aria-label="Retry loading company details"
              size="small"
              sx={{ color: warning.main, '&:hover': { bgcolor: hover } }}
            >
              <WarningAmberIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    )
  }

  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        bgcolor: background,
        borderBottom: `1px solid ${border}`,
        flexShrink: 0,
      }}
    >
      <WarningAmberIcon fontSize="small" sx={{ color: warning.main, flexShrink: 0 }} />
      <Typography variant="caption" sx={{ color: theme.palette.text.primary, flexGrow: 1, lineHeight: 1.3 }}>
        Company details unavailable
      </Typography>
      <Button
        size="small"
        onClick={onRetry}
        disabled={!canRetry}
        sx={{ color: warning.main, minWidth: 0, flexShrink: 0, py: 0 }}
      >
        {retrying ? 'Retrying…' : 'Retry'}
      </Button>
    </Box>
  )
}

export default CompanyUnavailableStrip