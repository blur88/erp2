import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { ReactNode } from 'react'

import { TABLE_STYLES } from '@/constants/tableStyles'

export interface Column<T> {
  header: ReactNode
  align?: 'left' | 'right'
  width?: string
  render: (row: T) => ReactNode
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  emptyText: string
  isLoading?: boolean
  isError?: boolean
  errorText?: string
  /**
   * Rendered inside the card, directly under the last row — the placement
   * `PagePagination`'s own `borderTop` is designed for, matching how
   * `EntityTable` list pages compose table and pagination into one card.
   * Pagination belongs here, not in `footer`.
   */
  paginationSlot?: ReactNode
  /**
   * Rendered outside the card, below it. For detached blocks that are not part
   * of the table — e.g. the right-aligned Total Paid / Balance summary on the
   * Payments tabs. For pagination use `paginationSlot`.
   */
  footer?: ReactNode
}

const centeredText = (text: string) => (
  <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>{text}</Typography>
)

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyText,
  isLoading,
  isError,
  errorText,
  paginationSlot,
  footer,
}: DataTableProps<T>) {
  // Stale rows can coexist with isLoading/isError, so neither slot may key off
  // rows.length alone — both belong to the populated state only.
  const hasContent = !isLoading && !isError && rows.length > 0

  const content = isLoading ? (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
      <CircularProgress />
    </Box>
  ) : isError ? (
    centeredText(errorText ?? 'Failed to load.')
  ) : rows.length === 0 ? (
    centeredText(emptyText)
  ) : (
    <TableContainer>
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow
            sx={{
              '& .MuiTableCell-head': {
                fontWeight: 600,
                backgroundColor: TABLE_STYLES.header.backgroundColor,
              },
            }}
          >
            {columns.map((col, i) => (
              <TableCell key={i} align={col.align} sx={col.width ? { width: col.width } : undefined}>
                {col.header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={getRowKey(row)} hover>
              {columns.map((col, i) => (
                <TableCell key={i} align={col.align}>
                  {col.render(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )

  return (
    <>
      {/* overflow:hidden clips the square header background to the card's
          rounded corners — the same technique EntityTable and TableCard use. */}
      <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
        {content}
        {hasContent && paginationSlot}
      </Paper>
      {hasContent && footer}
    </>
  )
}
