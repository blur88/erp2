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
  sticky?: boolean
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
  sticky,
  footer,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError) {
    return centeredText(errorText ?? 'Failed to load.')
  }

  if (rows.length === 0) {
    return centeredText(emptyText)
  }

  const container = (
    <Table stickyHeader={sticky} size={TABLE_STYLES.size}>
      <TableHead>
        <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
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
  )

  if (sticky) {
    return (
      <>
        <TableContainer component={Paper} variant="outlined" sx={{ flex: 1, overflow: 'auto' }}>
          {container}
        </TableContainer>
        {footer}
      </>
    )
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        {container}
      </TableContainer>
      {footer}
    </>
  )
}
