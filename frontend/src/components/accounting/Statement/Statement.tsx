import React from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'

import { TABLE_STYLES } from '@/constants/tableStyles'

import { StatementRowView } from './StatementRow'
import type { StatementProps } from './types'

/**
 * A financial statement rendered as a semantic table inside a themed card.
 *
 * It stays a real <table> (MUI's Table renders one) because row/column
 * semantics reach assistive technology and table column widths are
 * synchronized across rows, which is the shared grid the figure column
 * depends on.
 *
 * Scroll ownership lives HERE, not in the consuming page (spec §3.1). The
 * chain — Paper / frame(overflow:hidden) / TableContainer(overflow:auto) —
 * mirrors EntityTable, which is what lets the column header stay put while the
 * rows scroll. Pages supply `flex: 1, minHeight: 0` above it; `minHeight: 0` is
 * the load-bearing half, because a flex child otherwise refuses to shrink below
 * its content and this scroller never engages.
 *
 * PRESENTATION LIVES IN `sx`, NOT A STYLESHEET. `statement.css` was deleted in
 * #1228: every rule it carried now resolves from the MUI theme through the
 * descendant selectors below. The `stmt-*` class names survive as HOOKS — the
 * page suites address them (ProfitAndLossPage.test.tsx:386-392 asserts
 * `table.stmt-table thead`, `tr.stmt-row` and `.stmt-scroller table.stmt-table`)
 * — so they are load-bearing selectors even though they no longer carry rules
 * of their own.
 *
 * NOTE ON COVERAGE: Vitest injects no stylesheet and has no layout engine, so
 * nothing below is verifiable by the suite. `sx` IS observable through
 * `toHaveStyle` when the component renders under a ThemeProvider, but the
 * geometry these rules produce — decimal alignment, real sticky scrolling,
 * clipping — is browser-only. See docs/modules/accounting/STATEMENT_THEME_QA.md.
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
        // Surface, radius and elevation come from Paper itself; only the inner
        // padding is ours.
        padding: '16px 20px',

        // ---- Cells ----
        '& .stmt-cell-code': {
          color: 'text.secondary',
          fontSize: '0.8125rem',
          padding: '3px 12px 3px 0',
          whiteSpace: 'nowrap',
          verticalAlign: 'baseline',
          textAlign: 'left',
        },
        '& .stmt-cell-label': {
          fontSize: '0.875rem',
          padding: '3px 16px 3px 0',
          verticalAlign: 'baseline',
          textAlign: 'left',
        },
        /*
         * One right-aligned figure cell. Decimal alignment holds because every
         * figure has two decimals, renders at the SAME font size, and uses
         * tabular digits; `.stmt-paren-spacer` covers the remaining
         * closing-paren offset (spec §4.1).
         */
        '& .stmt-cell-figure': {
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: "'tnum'",
          textAlign: 'right',
          padding: '3px 0',
          whiteSpace: 'nowrap',
          verticalAlign: 'baseline',
        },
        '& .stmt-figure-negative': { color: 'error.main' },

        // ---- Row kinds (hierarchy by rule weight, not bold-everything) ----
        '& .stmt-row--section > *': {
          color: 'text.secondary',
          fontSize: '0.8125rem',
          fontWeight: 500,
          letterSpacing: '0.06em',
          paddingTop: '18px',
          paddingBottom: '2px',
        },
        '& .stmt-row--zero > *': { color: 'text.secondary' },
        /*
         * Hairline above the FIGURE cell only — an accounting convention that
         * keeps the eye in the numbers column.
         */
        '& .stmt-row--subtotal .stmt-cell-figure': {
          borderTop: '1px solid',
          borderTopColor: 'divider',
        },
        '& .stmt-row--subtotal > *': {
          fontWeight: 500,
          paddingTop: '5px',
        },
        '& .stmt-row--bottomLine > *': {
          fontWeight: 500,
          paddingTop: '8px',
        },
        '& .stmt-row--bottomLine .stmt-cell-label': { fontSize: '1rem' },
        /*
         * Bottom line is distinguished by WEIGHT and the double rule, never by
         * font size: a larger figure would place its decimal separator at a
         * different x position from every other row (spec §4.1). The label may
         * grow; the FIGURE must not.
         */
        '& .stmt-row--bottomLine .stmt-cell-figure': {
          fontWeight: 500,
          borderTop: '3px double',
          borderTopColor: 'text.primary',
        },
        '& .stmt-row--spacer > *': {
          padding: 0,
          height: '10px',
        },

        // ---- Drill-down ----
        '& .stmt-link': {
          color: 'primary.main',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: '2px',
          '&:hover': { textDecorationStyle: 'solid' },
          '&:focus-visible': {
            outline: '2px solid currentColor',
            outlineOffset: '2px',
          },
        },
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
          <Table
            className="stmt-table"
            aria-label={label}
            /*
              Column headers stay put while the body scrolls inside
              `.stmt-scroller`. MUI implements this by switching the table to
              `border-collapse: separate` and setting `position: sticky; top: 0`
              on the head cells — which is what the hand-rolled `.stmt-col-head`
              sticky rule used to do, and why the head-cell background below is
              load-bearing rather than cosmetic: a transparent sticky cell lets
              the rows scroll through it.
            */
            stickyHeader
            sx={{
              // MUI's default cell borders would draw a line under every
              // statement row. Accounting hierarchy is carried by the subtotal
              // hairline and the bottom-line double rule instead, so body cells
              // stay unruled.
              '& .MuiTableCell-root': { border: 0 },
              '& .MuiTableHead-root .MuiTableCell-root': {
                /*
                  The background must sit on the CELL, not the row: only the
                  cells are sticky, so a <TableRow> background scrolls away and
                  leaves the labels floating over the data. `grey.50` is
                  remapped to an opaque `grey[800]` in darkTheme, so it is solid
                  in both themes.
                */
                backgroundColor: TABLE_STYLES.header.backgroundColor,
                color: 'text.secondary',
                borderBottom: '1px solid',
                borderBottomColor: 'divider',
                padding: '8px 0',
                zIndex: 2,
                /*
                  MEASURED PARITY, not inherited parity (#1228, ST-10).
                  EntityTable does NOT render the theme's `tableHeader` variant
                  as-is — it overrides two of its values inline
                  (EntityTable.tsx:336-343): `fontSize: '0.8rem'` and
                  `letterSpacing: '0.5px'`, against the theme's 0.75rem/0.08em.
                  So the SO/PO header a user actually sees is the variant PLUS
                  that sx, and matching the variant alone leaves Statement at
                  12px/0.96px where SO/PO is 12.8px/0.5px.

                  A browser measurement caught this; the theme object alone
                  would have argued the opposite. Weight, family and uppercase
                  still come from the MuiTableHead override.

                  If EntityTable's inline values ever move into the theme, these
                  two lines should be deleted, not edited — ST-10 is what would
                  catch the drift.
                */
                fontSize: '0.8rem',
                letterSpacing: '0.5px',
              },
            }}
          >
            <TableHead>
              {/* Background lives on the head cells, not here — a row
                  background would scroll away. */}
              <TableRow>
                {/*
                  Header typography has TWO sources, deliberately: weight,
                  family and uppercase come from the theme's MuiTableHead
                  override (theme.ts:284, which baseThemeOptions defines and
                  darkTheme spreads without redefining, so it reaches both
                  themes); size and tracking are pinned in this Table's `sx`
                  above to match EntityTable's own inline overrides. See that
                  comment for why the theme alone is not enough.

                  Either way the old `.stmt-col-head` rule is gone — it set
                  weight 500 / 0.04em / no uppercase, which is exactly how the
                  Statement header diverged from SO/PO (#1228).
                */}
                <TableCell className="stmt-col-head stmt-col-head--label" scope="col">
                  Code
                </TableCell>
                <TableCell className="stmt-col-head stmt-col-head--label" scope="col">
                  Description
                </TableCell>
                {figureHeads.map((head) => (
                  <TableCell key={head} className="stmt-col-head" scope="col" align="right">
                    {head}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <StatementRowView key={row.id} row={row} figureCount={figureHeads.length} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}
