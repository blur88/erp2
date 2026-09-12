import React from 'react'
import { Link as RouterLink } from 'react-router-dom'
import MuiLink from '@mui/material/Link'
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
 * The explicit `fontWeight: 400`, `fontSize: 0.8rem`, and `lineHeight: 1.2`
 * match the generic SO/PO body treatment.
 */
const BODY_TYPOGRAPHY_SX = {
  fontWeight: 400,
  fontSize: '0.8rem',
  lineHeight: 1.2,
} as const

const CODE_CELL_SX = {
  fontSize: '0.8rem',
  padding: '3px 12px 3px 20px',
  whiteSpace: 'nowrap',
  verticalAlign: 'baseline',
  textAlign: 'left',
} as const

const LABEL_CELL_SX = {
  fontSize: '0.8rem',
  padding: '3px 16px 3px 0',
  verticalAlign: 'baseline',
  textAlign: 'left',
} as const

const DRILLDOWN_LINK_SX = {
  color: 'primary.main',
  textDecoration: 'underline',
  textDecorationStyle: 'dotted',
  textUnderlineOffset: '2px',
  '&:hover': { textDecorationStyle: 'solid' },
  '&:focus-visible': { outline: '2px solid currentColor', outlineOffset: '2px' },
} as const

const SECTION_PLACEHOLDER_CELL_SX = {
  padding: 0,
} as const

const isEmphasizedRow = (kind: Row['kind']) =>
  kind === 'section' || kind === 'subtotal' || kind === 'bottomLine'

const uppercaseEmphasizedLabel = (label: string) => label.toUpperCase()

const SECTION_TOTAL_LABELS = new Set([
  'TOTAL REVENUE',
  'TOTAL COST OF SALES',
  'TOTAL OTHER INCOME',
  'GROSS PROFIT',
  'NET PROFIT',
  'GROSS PROFIT / LOSS',
  'TOTAL EXPENSES',
  'NET PROFIT / LOSS',
  'TOTAL NON-CURRENT ASSETS',
  'TOTAL CURRENT ASSETS',
  'TOTAL ASSETS',
  'TOTAL LIABILITIES',
  "TOTAL OWNER'S EQUITY",
  "TOTAL LIABILITIES AND OWNER'S EQUITY",
])

const hasSectionTotalGap = (label: string, id: string) =>
  id === 'N33' || SECTION_TOTAL_LABELS.has(label.toUpperCase())

interface StatementRowProps {
  row: Row
  figureCount: number
}

function StatementRowImpl({ row, figureCount }: StatementRowProps) {
  const emphasized = isEmphasizedRow(row.kind)
  const hasExtraBottomSpace = hasSectionTotalGap(row.label, row.id)
  const displayLabel = emphasized ? uppercaseEmphasizedLabel(row.label) : row.label
  const label = row.href ? (
    <MuiLink component={RouterLink} sx={DRILLDOWN_LINK_SX} to={row.href}>
      {displayLabel}
    </MuiLink>
  ) : (
    displayLabel
  )

  return (
    <TableRow
      data-testid={row.testId}
      sx={hasExtraBottomSpace ? { '& > .MuiTableCell-root': { paddingBottom: '11px' } } : undefined}
    >
      <TableCell sx={CODE_CELL_SX}>
        <Typography variant="body2" sx={BODY_TYPOGRAPHY_SX}>
          {row.code ?? ''}
        </Typography>
      </TableCell>
      <TableCell sx={{ ...LABEL_CELL_SX, paddingLeft: `${row.depth * 24}px` }}>
        {/*
          The expand control stays OUTSIDE the Typography: it is a sibling of
          the text, not part of it. Wrapping it would put a button inside a
          <p>, and the cell's textContent would still be the label either way —
          so the suites could not tell the difference.
        */}
        {row.expand && (
          <IconButton
            sx={{ p: 0, width: 20, height: 20 }}
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
        <Typography
          variant="body2"
          component="span"
          sx={{
            ...BODY_TYPOGRAPHY_SX,
            ...(emphasized ? { fontWeight: 700 } : {}),
          }}
        >
          {label}
        </Typography>
      </TableCell>
      {/*
        A section head has no figures. Span the figure columns so the table's
        column count stays uniform — a short row would otherwise break the
        shared column grid.
      */}
      {row.figures.length === 0 ? (
        <TableCell colSpan={figureCount} sx={SECTION_PLACEHOLDER_CELL_SX} />
      ) : (
        row.figures.map((amount, i) => (
          <StatementFigure
            key={i}
            amount={amount}
            testId={`${row.testId}-fig${i}`}
            amountHook={!row.blankFigures?.[i] ? row.amountHook : undefined}
            blank={row.blankFigures?.[i]}
            emphasized={emphasized}
          />
        ))
      )}
    </TableRow>
  )
}

export const StatementRowView = React.memo(StatementRowImpl)
