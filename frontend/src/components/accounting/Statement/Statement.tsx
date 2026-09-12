import React from 'react'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import { TABLE_STYLES } from '@/constants/tableStyles'

import { StatementRowView } from './StatementRow'
import type { StatementProps } from './types'

/**
 * The SO/PO header treatment, copied whole.
 *
 * These four values are duplicated verbatim from EntityTable.tsx:336-343, and
 * the duplication is the point: EntityTable does NOT render the theme's
 * `tableHeader` variant as-is: it overrides the variant's own 0.75rem/0.08em
 * with 0.8rem/0.5px inline. So `variant="tableHeader"` ALONE does not reproduce
 * the SO/PO header — it reproduces the variant, which no user has ever seen.
 *
 * Why this must sit on the Typography rather than be left to the cell: the head
 * cell already carries fontSize/letterSpacing (see the Table `sx` below), and
 * those inherit down to bare text. A nested Typography sets its OWN size and
 * tracking, and an element's own rule beats an inherited one — so wrapping the
 * text without carrying these values along would silently land the header back
 * at 12px/0.96px against SO/PO's 12.8px/0.5px. That is the #1228 divergence,
 * and it is invisible to jsdom: ST-10's browser measurement is what catches it.
 *
 * If EntityTable's inline values ever move into the theme variant, this whole
 * constant should be DELETED, not edited — along with EntityTable's own sx.
 */
const HEADER_TYPOGRAPHY_SX = {
  fontWeight: 600,
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
} as const

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
        /*
         * Code and label carry the SO/PO body contract on a child <Typography>
         * (StatementRow.tsx), which is what sizes the rendered glyphs. The
         * cell-level fontSize below is a FLOOR — it catches a cell that is ever
         * given bare text again — so it matches the child's 0.8rem rather than
         * the 0.8125/0.875rem Statement-only values it held before #1232.
         *
         * The code column is NO LONGER text.secondary. Muting it was defensible
         * hierarchy, but #1232 requires colour parity with the SO/PO body, which
         * inherits text.primary from the Paper.
         */
        '& .stmt-cell-code': {
          fontSize: '0.8rem',
          padding: '3px 12px 3px 0',
          whiteSpace: 'nowrap',
          verticalAlign: 'baseline',
          textAlign: 'left',
        },
        '& .stmt-cell-label': {
          fontSize: '0.8rem',
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
          /*
           * The figure cell takes the SO/PO body size directly rather than
           * through a Typography wrapper: StatementFigure renders THREE
           * children (the a11y value, the aria-hidden figure, the paren
           * spacer), and the spacer's reserved width must be the same glyph in
           * the same font as a real parenthesis. Sizing the cell keeps all
           * three in one font by inheritance.
           */
          fontSize: '0.8rem',
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
        /*
         * RESTORES the weight the body Typography would otherwise flatten.
         *
         * The `> *` rules above reach the CELL, but code and label now wrap
         * their text in a <Typography> carrying an explicit `fontWeight: 400`,
         * and an element's own rule beats an inherited one. Without these two
         * selectors the cell still computes 500 while the rendered glyphs drop
         * to 400 — a divergence no cell-level assertion can see.
         *
         * MEASURED: a row-scoped descendant selector wins, (0,2,0) against the
         * child's own (0,1,0). Scoped deliberately to the code/label Typography
         * so it cannot reach the figure cell's spans, the visually-hidden
         * value, the paren spacer or the drill-down link.
         *
         * The bottom line's old `.stmt-cell-label` 1rem bump is GONE (#1232):
         * weight and the double rule carry it, and a Statement-only size was
         * exactly the drift this issue set out to remove.
         */
        '& .stmt-row--subtotal .stmt-cell-code .MuiTypography-root, & .stmt-row--subtotal .stmt-cell-label .MuiTypography-root':
          { fontWeight: 500 },
        '& .stmt-row--bottomLine .stmt-cell-code .MuiTypography-root, & .stmt-row--bottomLine .stmt-cell-label .MuiTypography-root':
          { fontWeight: 500 },
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
                /*
                  No `color` here. SO/PO sets none on its head cell, so the
                  header takes the normal MUI table-header colour (#1232). The
                  rule this replaces was `color: 'text.secondary'`; since #1231
                  the visible glyphs come from the child Typography either way,
                  so what actually changes is the CELL's own colour — the
                  fallback a bare-text head cell would inherit.
                */
                borderBottom: '1px solid',
                borderBottomColor: 'divider',
                padding: '8px 0',
                zIndex: 2,
                /*
                  MEASURED PARITY, not inherited parity (#1228, ST-10).

                  As of #1231 the header TEXT is a <Typography
                  variant="tableHeader"> carrying HEADER_TYPOGRAPHY_SX, which is
                  what actually sizes the rendered glyphs — a child's own rule
                  beats anything inherited from this cell. See that constant for
                  why the SO/PO values are duplicated there.

                  These two lines are deliberately KEPT anyway: they hold the
                  cell itself at the right size/tracking, so a head cell that is
                  ever given bare text again (or a Typography that loses its sx)
                  degrades to the correct values instead of to the theme
                  variant's 0.75rem/0.08em. They are a floor, not the source.

                  If EntityTable's inline values ever move into the theme, these
                  two lines and HEADER_TYPOGRAPHY_SX should both be deleted, not
                  edited — ST-10 is what would catch the drift.
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
                  Each head cell wraps its text in <Typography
                  variant="tableHeader"> + HEADER_TYPOGRAPHY_SX — the exact
                  markup EntityTable uses (EntityTable.tsx:336-345), which is
                  the point of #1231: same component, same variant, same
                  overrides, so the two headers share one implementation rather
                  than two that merely computed alike.

                  The variant supplies family/weight/uppercase from the theme
                  (theme.ts:205); the sx pins size and tracking to EntityTable's
                  inline values. The theme's MuiTableHead override (theme.ts:284
                  — defined on baseThemeOptions, which darkTheme spreads without
                  redefining) still dresses the CELL, and the Table `sx` above
                  keeps the cell's own size/tracking as a floor.

                  Either way the old `.stmt-col-head` rule is gone — it set
                  weight 500 / 0.04em / no uppercase, which is exactly how the
                  Statement header diverged from SO/PO (#1228).
                */}
                <TableCell className="stmt-col-head stmt-col-head--label" scope="col">
                  <Typography variant="tableHeader" sx={HEADER_TYPOGRAPHY_SX}>
                    Code
                  </Typography>
                </TableCell>
                <TableCell className="stmt-col-head stmt-col-head--label" scope="col">
                  <Typography variant="tableHeader" sx={HEADER_TYPOGRAPHY_SX}>
                    Description
                  </Typography>
                </TableCell>
                {figureHeads.map((head) => (
                  <TableCell key={head} className="stmt-col-head" scope="col" align="right">
                    <Typography variant="tableHeader" sx={HEADER_TYPOGRAPHY_SX}>
                      {head}
                    </Typography>
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
