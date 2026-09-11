import React from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import TableContainer from '@mui/material/TableContainer'

import { TABLE_STYLES } from '@/constants/tableStyles'

import './statement.css'
import { StatementRowView } from './StatementRow'
import type { StatementProps } from './types'

/**
 * A financial statement rendered as a semantic table inside a themed card.
 *
 * It stays a <table> because real row/column semantics reach assistive
 * technology and table column widths are synchronized across rows, which is the
 * shared grid the figure column depends on.
 *
 * Scroll ownership lives HERE, not in the consuming page (spec §3.1). The
 * chain — Paper / frame(overflow:hidden) / TableContainer(overflow:auto) —
 * mirrors EntityTable, which is what lets the column header stay put while the
 * rows scroll. Pages supply `flex: 1, minHeight: 0` above it; `minHeight: 0` is
 * the load-bearing half, because a flex child otherwise refuses to shrink below
 * its content and this scroller never engages.
 */
export function Statement({ rows, figureHeads, label, className }: StatementProps) {
  return (
    <Paper
      className={`stmt-root${className ? ` ${className}` : ''}`}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'text.primary',
        // Accounting-specific presentation, themed. Parentheses, hairlines and
        // the bottom-line rule are kept (spec §1); only their colours change.
        '& .stmt-cell-code': { color: 'text.secondary' },
        '& .stmt-col-head': {
          color: 'text.secondary',
          borderBottomColor: 'divider',
          backgroundColor: TABLE_STYLES.header.backgroundColor,
        },
        '& .stmt-row--section > *': { color: 'text.secondary' },
        '& .stmt-row--zero > *': { color: 'text.secondary' },
        '& .stmt-figure-negative': { color: 'error.main' },
        '& .stmt-link': { color: 'primary.main' },
        '& .stmt-row--subtotal .stmt-cell-figure': { borderTopColor: 'divider' },
        '& .stmt-row--bottomLine .stmt-cell-figure': { borderTopColor: 'text.primary' },
      }}
    >
      <Box
        className="stmt-frame"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'inherit',
        }}
      >
        <TableContainer
          className="stmt-scroller"
          sx={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <table className="stmt-table" aria-label={label}>
            <thead>
              <tr>
                <th className="stmt-col-head stmt-col-head--label" scope="col">
                  Code
                </th>
                <th className="stmt-col-head stmt-col-head--label" scope="col">
                  Description
                </th>
                {figureHeads.map((head) => (
                  <th key={head} className="stmt-col-head" scope="col">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <StatementRowView key={row.id} row={row} figureCount={figureHeads.length} />
              ))}
            </tbody>
          </table>
        </TableContainer>
      </Box>
    </Paper>
  )
}
