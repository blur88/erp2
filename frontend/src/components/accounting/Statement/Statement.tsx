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
 * table and cell selectors below.
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
      className={className}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'text.primary',
        // The header follows the edge-to-edge SO/PO table structure. Body
        // insets are carried by the statement cells below.
        padding: 0,

      }}
    >
      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'inherit',
        }}
      >
        <TableContainer
          data-testid="statement-scroller"
          sx={{
            flex: 1,
            overflow: 'auto',
          }}
        >
          <Table
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
              // Keep the full header strip filled when the table is narrower than
              // its scroll container. The cells still need their own background
              // because they are the sticky elements during body scrolling.
              '& .MuiTableHead-root, & .MuiTableHead-root .MuiTableRow-root': {
                backgroundColor: TABLE_STYLES.header.backgroundColor,
              },
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
                borderBottom: TABLE_STYLES.cell.border,
                padding: '8px 0',
                '&:first-of-type': { paddingLeft: '20px' },
                '&:last-of-type': { paddingRight: '20px' },
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
                <TableCell scope="col">
                  <Typography variant="tableHeader" sx={HEADER_TYPOGRAPHY_SX}>
                    Code
                  </Typography>
                </TableCell>
                <TableCell scope="col">
                  <Typography variant="tableHeader" sx={HEADER_TYPOGRAPHY_SX}>
                    Description
                  </Typography>
                </TableCell>
                {figureHeads.map((head) => (
                  <TableCell key={head} scope="col" align="right">
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
