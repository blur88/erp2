import React from 'react'
import { Link } from 'react-router-dom'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import { StatementFigure } from './StatementFigure'
import type { StatementRow as Row } from './types'

/**
 * The SO/PO body treatment, copied whole.
 *
 * These three values are duplicated verbatim from EntityTable.tsx:194-203.
 * Matching the markup buys CONTRACT parity, not a shared implementation: the
 * two tables do not reuse a component, so these values are kept in step BY
 * HAND. `Statement.test.tsx`'s body-typography block is what notices drift.
 *
 * `variant="body2"` alone is NOT the SO/PO body: the theme variant is 0.875rem
 * / lineHeight 1.5 (theme.ts:183), which EntityTable overrides inline. Dropping
 * this sx would silently land the body back at the variant's values.
 *
 * NOTE the explicit `fontWeight: 400`. An element's own rule beats an inherited
 * one, so this flattens the weight that `.stmt-row--subtotal > *` and
 * `.stmt-row--bottomLine > *` set on the CELL. Statement.tsx restores it with
 * row-scoped selectors that reach this Typography directly — see the
 * "Row kinds" block there. Remove one without the other and subtotal/bottom-line
 * emphasis disappears while the cell still reports weight 500.
 */
const BODY_TYPOGRAPHY_SX = {
  fontWeight: 400,
  fontSize: '0.8rem',
  lineHeight: 1.2,
} as const

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
      <TableCell className="stmt-cell-code">
        <Typography variant="body2" sx={BODY_TYPOGRAPHY_SX}>
          {row.code ?? ''}
        </Typography>
      </TableCell>
      <TableCell className="stmt-cell-label" sx={{ paddingLeft: `${row.depth * 24}px` }}>
        {/*
          The expand control stays OUTSIDE the Typography: it is a sibling of
          the text, not part of it. Wrapping it would put a button inside a
          <p>, and the cell's textContent would still be the label either way —
          so the suites could not tell the difference.
        */}
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
        <Typography variant="body2" component="span" sx={BODY_TYPOGRAPHY_SX}>
          {label}
        </Typography>
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
