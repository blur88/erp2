import { Paper, TableContainer } from '@mui/material'
import type { SxProps, Theme } from '@mui/material'
import type { ReactNode } from 'react'

import { TABLE_STYLES } from '@/constants/tableStyles'

export interface TableCardProps {
  children: ReactNode
  /**
   * Caps the card's height and scrolls the table inside it. Omit for a card
   * that grows with its content.
   */
  maxHeight?: number | string
  sx?: SxProps<Theme>
}

/**
 * The outlined card every table outside `DataTable`/`EntityTable` sits in.
 *
 * Owns three things so they cannot drift per call site (issue #1118):
 * `variant="outlined"`, `overflow: 'hidden'` — which clips the square header
 * background to the card's rounded corners, the same technique `EntityTable`
 * and `DataTable` use — and the one canonical header background,
 * `TABLE_STYLES.header.backgroundColor`.
 *
 * Callers must not re-declare the header background. Cell padding, footers and
 * column widths stay with the caller's own `Table`.
 *
 * Prefer `DataTable` when the table is a plain read-only column/row render;
 * reach for `TableCard` only where `DataTable` does not fit (scrolling bodies,
 * custom cell padding, footer rows, editable line items).
 */
export function TableCard({ children, maxHeight, sx }: TableCardProps) {
  return (
    <TableContainer
      component={Paper}
      variant="outlined"
      sx={{
        overflow: 'hidden',
        ...(maxHeight !== undefined && { maxHeight, overflowY: 'auto' }),
        '& .MuiTableCell-head': {
          fontWeight: 600,
          backgroundColor: TABLE_STYLES.header.backgroundColor,
        },
        ...sx,
      }}
    >
      {children}
    </TableContainer>
  )
}

export default TableCard
