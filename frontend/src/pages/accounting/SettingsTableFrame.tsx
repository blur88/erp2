import type { ReactNode } from 'react'
import { Box } from '@mui/material'

/**
 * The height overrides every settings table needs.
 *
 * EntityTable's card is `height: 100%` + `overflow: hidden` — correct inside a
 * bounded flex pane, and collapsing to nothing when it must instead grow to
 * its content. These three class names are PRINT HOOKS as well as style hooks
 * (see CLAUDE.md): renaming one truncates every printed report.
 *
 * Extracted so the seven tables on this page share one copy rather than seven.
 *
 * `.entity-table-scroller` is `visible`, NOT `auto`. This page stacks seven
 * tables inside ONE bounded scroller (AccountingSettingsPage), so a per-table
 * `auto` gives each of them its own scrollbar nested inside that one — the
 * competing-scrollbars case the design explicitly rules out. `visible` lets
 * every table grow to its full height and leaves all vertical scrolling to the
 * single outer pane.
 *
 * The horizontal axis is handled separately: narrow viewports still need the
 * table to scroll sideways, and `overflow-x: auto` cannot be combined with
 * `overflow-y: visible` (CSS coerces the visible axis to `auto`). So the
 * scroller keeps `visible` on both axes and the horizontal scroll is owned by
 * this wrapper instead.
 */
export default function SettingsTableFrame({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        overflowX: 'auto',
        '& .entity-table-card': { height: 'auto', boxShadow: 'none' },
        '& .entity-table-frame': { overflow: 'visible' },
        '& .entity-table-scroller': { overflow: 'visible' },
      }}
    >
      {children}
    </Box>
  )
}
