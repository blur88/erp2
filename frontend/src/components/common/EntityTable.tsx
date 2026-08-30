import React, { memo } from 'react'
import type { ReactNode } from 'react'
import {
  alpha,
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { darkTheme } from '@/styles/theme'

export interface ColumnConfig<T> {
  key: string
  render: (row: T) => React.ReactNode
  width?: string | number
  /**
   * Cell alignment, applied to the header, body and skeleton cells alike.
   * Layout only — number formatting stays in the column's `render`, so a
   * right-aligned count or percentage does not have to opt into currency
   * formatting to get its alignment.
   */
  align?: 'left' | 'center' | 'right'
  raw?: boolean
}

/**
 * Presentation-only row attributes. Deliberately a closed whitelist, not a
 * spread of arbitrary props: an open hook becomes a backdoor for event handlers
 * that would race `onSelect`, and for `sx` that would bypass `getRowSx`. Add a
 * key here explicitly if a caller genuinely needs one.
 */
export interface RowPresentationProps {
  className?: string
  'data-testid'?: string
  'data-zero'?: string
}

export interface EntityTableProps<T extends { id: string }> {
  rows: T[]
  columns: ColumnConfig<T>[]
  loading: boolean
  total: number
  label: string
  emptyLabel?: string
  emptyFilteredLabel?: string
  hasActiveFilters?: boolean
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  listRef: React.RefObject<HTMLDivElement | null>
  dataAttr?: string
  showHeader?: boolean
  headers?: string[]
  paginationSlot?: ReactNode
  /**
   * Rendered as a semantic <TableFooter> inside <Table>, after <TableBody>, so
   * footer cells share the body's column grid and alignment. Supply the
   * <TableRow>/<TableCell> structure yourself.
   *
   * Rendered only when there are rows: an empty list must show its empty state,
   * not a lone total line.
   */
  tableFooter?: ReactNode
  /**
   * Whether a row can be selected. Default: every row. A row that returns false
   * gets no click handler, no pointer cursor, no hover highlight, and none of
   * the `selectableRowRole` accessibility attributes — it is inert content
   * (a section header or a total line), not a disabled control.
   */
  isRowSelectable?: (row: T) => boolean
  /**
   * Opt-in keyboard navigation for selectable rows: applies the role,
   * `tabIndex={0}` and activation. Omitted by default, which keeps the DOM of
   * existing consumers unchanged. Links activate on Enter only; buttons also
   * activate on Space.
   */
  selectableRowRole?: 'link' | 'button'
  /**
   * Row-level styling — full-width borders and backgrounds a column renderer
   * cannot apply.
   *
   * `SystemStyleObject`, NOT `SxProps`: `SxProps` is a union that also admits a
   * theme callback and a readonly array, neither of which survives the object
   * spread used to merge this with the row's base styles. Constraining the type
   * makes the merge below sound. Callers needing theme access can use the
   * `theme.palette.*` string tokens (`'divider'`, `'text.disabled'`) that MUI
   * resolves inside a style object.
   */
  getRowSx?: (row: T) => SystemStyleObject<Theme>
  /** Presentation-only row attributes; see RowPresentationProps. */
  getRowProps?: (row: T) => RowPresentationProps
  /** Class applied to the inner <Table>, e.g. a print stylesheet hook. */
  tableClassName?: string
}

interface RowProps<T extends { id: string }> {
  row: T
  index: number
  columns: ColumnConfig<T>[]
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  dataAttr: string
  isRowSelectable?: (row: T) => boolean
  selectableRowRole?: 'link' | 'button'
  getRowSx?: (row: T) => SystemStyleObject<Theme>
  getRowProps?: (row: T) => RowPresentationProps
}

const EntityRow = memo(function EntityRow<T extends { id: string }>({
  row,
  index,
  columns,
  selectedId,
  focusedIndex,
  onSelect,
  dataAttr,
  isRowSelectable,
  selectableRowRole,
  getRowSx,
  getRowProps,
}: RowProps<T>) {
  const isSelected = selectedId === row.id
  const isFocused = index === focusedIndex
  const selectable = isRowSelectable ? isRowSelectable(row) : true
  const rowSx = getRowSx?.(row)
  const rowProps = getRowProps?.(row)
  const role = selectable ? selectableRowRole : undefined

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (!selectable || !role) return
    if (event.key === 'Enter') {
      onSelect(row)
      return
    }
    // Space activates a button, never a link — and its default page scroll must
    // be suppressed before activation.
    if (role === 'button' && event.key === ' ') {
      event.preventDefault()
      onSelect(row)
    }
  }

  return (
    <TableRow
      hover={selectable}
      onClick={selectable ? () => onSelect(row) : undefined}
      role={role}
      tabIndex={role ? 0 : undefined}
      onKeyDown={role ? handleKeyDown : undefined}
      data-index={index}
      {...rowProps}
      sx={{
        cursor: selectable ? 'pointer' : 'default',
        backgroundColor: isSelected
          ? alpha(darkTheme.palette.primary.main, 0.2)
          : isFocused
            ? 'action.focus'
            : 'inherit',
        // Only a selectable row highlights. An inert row (a section header or a
        // total line) that lit up on hover would advertise a click that does
        // nothing — `hover={selectable}` alone does not cover this, because
        // this custom rule applies independently of MUI's own hover prop.
        ...(selectable && {
          '&:hover': {
            backgroundColor: isSelected
              ? alpha(darkTheme.palette.primary.main, 0.25)
              : 'action.hover',
          },
        }),
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
        ...rowSx,
      }}
    >
      {columns.map((column) => (
        <TableCell key={column.key} width={column.width} align={column.align}>
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
  emptyLabel,
  emptyFilteredLabel,
  hasActiveFilters,
  selectedId,
  focusedIndex,
  onSelect,
  listRef,
  dataAttr = 'row',
  showHeader = true,
  headers,
  paginationSlot,
  tableFooter,
  isRowSelectable,
  selectableRowRole,
  getRowSx,
  getRowProps,
  tableClassName,
}: EntityTableProps<T>) {
  const emptyName = hasActiveFilters
    ? emptyFilteredLabel ?? emptyLabel ?? label
    : emptyLabel ?? label
  const emptyMessage = hasActiveFilters
    ? `No ${emptyName} match filters`
    : `No ${emptyName} found`

  return (
    <Paper
      className="entity-table-card"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
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
      {/*
        The three class hooks here (card / frame / scroller) are the ONLY handle
        a print stylesheet has on this component's scroll constraints. Between
        them, `height: 100%`, `overflow: hidden` and `overflow: auto` clip the
        table to one viewport — correct on screen, silently truncating on paper.
        A wrapper class on an ancestor cannot undo them. Do not rename without
        updating accountingReportPrint.css.
      */}
      <Box
        ref={listRef}
        className="entity-table-frame"
        sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', borderRadius: 'inherit' }}
      >
        <TableContainer className="entity-table-scroller" sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            className={tableClassName}
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
              '& .MuiTableHead-root .MuiTableCell-root': {
                py: 1,
                borderBottom: TABLE_STYLES.cell.border,
              },
              ...(!paginationSlot && {
                '& tr:last-child .MuiTableCell-root': {
                  borderBottom: 'none',
                },
              }),
            }}
          >
            {headers && (
              <TableHead>
                <TableRow sx={{ backgroundColor: TABLE_STYLES.header.backgroundColor }}>
                  {headers.map((header, i) => (
                    <TableCell
                      key={i}
                      width={columns[i]?.width}
                      align={columns[i]?.align}
                    >
                      <Typography
                        variant="tableHeader"
                        sx={{
                          fontWeight: 600,
                          fontSize: '0.8rem',
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
                        <TableCell key={column.key} width={column.width} align={column.align}>
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
                            {emptyMessage}
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
                        isRowSelectable={isRowSelectable}
                        selectableRowRole={selectableRowRole}
                        getRowSx={getRowSx}
                        getRowProps={getRowProps}
                      />
                    ))}
            </TableBody>
            {tableFooter && rows.length > 0 && <TableFooter>{tableFooter}</TableFooter>}
          </Table>
        </TableContainer>
      </Box>
      {paginationSlot && (
        <Box>
          {paginationSlot}
        </Box>
      )}
    </Paper>
  )
}

export default EntityTable
