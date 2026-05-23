import React, { memo } from 'react'
import {
  alpha,
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { darkTheme } from '@/styles/theme'

export interface ColumnConfig<T> {
  key: string
  render: (row: T) => React.ReactNode
  width?: string | number
  raw?: boolean
}

export interface EntityTableProps<T extends { id: string }> {
  rows: T[]
  columns: ColumnConfig<T>[]
  loading: boolean
  total: number
  label: string
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  listRef: React.RefObject<HTMLDivElement | null>
  dataAttr?: string
  showHeader?: boolean
  headers?: string[]
}

interface RowProps<T extends { id: string }> {
  row: T
  index: number
  columns: ColumnConfig<T>[]
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  dataAttr: string
}

const EntityRow = memo(function EntityRow<T extends { id: string }>({
  row,
  index,
  columns,
  selectedId,
  focusedIndex,
  onSelect,
  dataAttr,
}: RowProps<T>) {
  const isSelected = selectedId === row.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(row)}
      data-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected
          ? alpha(darkTheme.palette.primary.main, 0.2)
          : isFocused
            ? 'action.focus'
            : 'inherit',
        '&:hover': {
          backgroundColor: isSelected
            ? alpha(darkTheme.palette.primary.main, 0.25)
            : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      {columns.map((column) => (
        <TableCell key={column.key} width={column.width}>
          {column.raw
            ? column.render(row)
            : (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}
                >
                  {column.render(row)}
                </Typography>
              )}
        </TableCell>
      ))}
    </TableRow>
  )
}) as <T extends { id: string }>(props: RowProps<T>) => React.ReactElement

function EntityTable<T extends { id: string }>({
  rows,
  columns,
  loading,
  total,
  label,
  selectedId,
  focusedIndex,
  onSelect,
  listRef,
  dataAttr = 'row',
  showHeader = true,
  headers,
}: EntityTableProps<T>) {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {showHeader && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography
              variant="tableHeader"
              sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {label} ({total})
            </Typography>
            {loading && rows.length > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Searching...
                </Typography>
                <Box sx={{ width: 16, height: 16 }}>
                  <Skeleton variant="circular" width={16} height={16} />
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      )}
      <Box
        ref={listRef}
        sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      >
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
              '& tr:last-child .MuiTableCell-root': {
                borderBottom: 'none',
              },
            }}
          >
            {headers && (
              <TableHead>
                <TableRow sx={{ backgroundColor: 'action.hover' }}>
                  {headers.map((header, i) => (
                    <TableCell key={i} width={columns[i]?.width}>
                      <Typography
                        variant="tableHeader"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        {header}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
            )}
            <TableBody>
              {loading && rows.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {columns.map((column) => (
                        <TableCell key={column.key} width={column.width}>
                          <Skeleton height={40} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={columns.length}>
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}
                          >
                            No {label} found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : rows.map((row, index) => (
                      <EntityRow
                        key={row.id}
                        row={row}
                        index={index}
                        columns={columns}
                        selectedId={selectedId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                        dataAttr={dataAttr}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default EntityTable
