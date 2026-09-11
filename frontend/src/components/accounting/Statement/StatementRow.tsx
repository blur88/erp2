import React from 'react'
import { Link } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import { StatementFigure } from './StatementFigure'
import type { StatementRow as Row } from './types'

interface StatementRowProps {
  row: Row
  figureCount: number
}

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
    <tr className={rowClasses(row)} data-testid={row.testId}>
      <td className="stmt-cell-code">{row.code ?? ''}</td>
      <td className="stmt-cell-label" style={{ paddingLeft: row.depth * 24 }}>
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
      </td>
      {/*
        A section head has no figures. Span the figure columns so the table's
        column count stays uniform — a short row would otherwise collapse the
        shared decimal anchor.
      */}
      {row.figures.length === 0 ? (
        <td colSpan={figureCount * 2} />
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
    </tr>
  )
}

export const StatementRowView = React.memo(StatementRowImpl)
