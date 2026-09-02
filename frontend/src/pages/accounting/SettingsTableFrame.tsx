import type { ReactNode } from 'react'
import { Box } from '@mui/material'

/**
 * The height overrides every settings table needs.
 *
 * EntityTable's card is `height: 100%` + `overflow: hidden` — correct inside a
 * bounded flex pane, and collapsing to nothing inside GenericOverviewPage's
 * document-flow scroll. These three class names are PRINT HOOKS as well as
 * style hooks (see CLAUDE.md): renaming one truncates every printed report.
 *
 * Extracted so the seven tables on this page share one copy rather than seven.
 */
export default function SettingsTableFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        '& .entity-table-card': { height: 'auto', boxShadow: 'none' },
        '& .entity-table-frame': { overflow: 'visible' },
        '& .entity-table-scroller': { overflow: 'auto' },
      }}
    >
      {children}
    </Box>
  )
}
