import React from 'react'
import { Link } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import { StatementFigure } from './StatementFigure'
import type { StatementRow as Row } from './types'

interface StatementRowProps {
  row: Row
  figureCount: number
}

/*
 * The kind class is the hook the row's presentation hangs on: Statement.tsx
 * carries the matching `sx` descendant selectors, and the page suites assert
 * these names directly (ProfitAndLossPage.test.tsx:135 reads `stmt-row--zero`).
 * Renaming one is a breaking change to those suites, not a refactor.
 */
const rowClasses = (row: Row): string =>
  [
    'stmt-row',
    `stmt-row--${row.kind}`,
    row.isZero ? 'stmt-row--zero' : null,
  ]
    .filter(Boolean)
    .join(' ')

function StatementRowImpl({ row, figureCount }: StatementRowProps) {
  const label = row.href ? (
    <Link className="stmt-link" to={row.href}>
      {row.label}
    </Link>
  ) : (
    row.label
  )

  return (
    <TableRow className={rowClasses(row)} data-testid={row.testId}>
      <TableCell className="stmt-cell-code">{row.code ?? ''}</TableCell>
      <TableCell className="stmt-cell-label" sx={{ paddingLeft: `${row.depth * 24}px` }}>
        {row.expand && (
          <IconButton
            size="small"
            data-testid={row.expandTestId ?? `stmt-expand-${row.id}`}
            aria-label={row.expand.expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
            onClick={row.expand.onToggle}
          >
            {row.expand.expanded ? (
              <ExpandLessIcon fontSize="small" />
            ) : (
              <ExpandMoreIcon fontSize="small" />
            )}
          </IconButton>
        )}
        {label}
      </TableCell>
      {/*
        A section head has no figures. Span the figure columns so the table's
        column count stays uniform — a short row would otherwise break the
        shared column grid.
      */}
      {row.figures.length === 0 ? (
        <TableCell colSpan={figureCount} />
      ) : (
        row.figures.map((amount, i) => (
          <StatementFigure
            key={i}
            amount={amount}
            testId={`${row.testId}-fig${i}`}
            // First figure column only: a single hook must match one element.
            amountHook={i === 0 ? row.amountHook : undefined}
          />
        ))
      )}
    </TableRow>
  )
}

export const StatementRowView = React.memo(StatementRowImpl)
