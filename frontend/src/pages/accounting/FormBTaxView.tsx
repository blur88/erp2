import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import { Statement, type StatementRow } from '@/components/accounting/Statement'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import type { FormBResponse } from '@/types'
import { buildFormBTableRows, formatFormBAmount, type FormBTableRow } from './formBRows'

interface FormBTaxViewProps {
  data: FormBResponse | undefined
  year: number
  isLoading: boolean
  isError: boolean
  onOpenLedger: (accountId: string, year: number) => void
}

const STATEMENT_KIND: Record<FormBTableRow['kind'], StatementRow['kind']> = {
  section: 'section',
  line: 'line',
  total: 'subtotal',
}

/**
 * FormBTableRow → StatementRow.
 *
 * `rawAmount` (not the whole-ringgit `amount`) feeds StatementFigure, so every
 * report shares one figure treatment: two decimals, parens for negatives,
 * em dash for unknown. The tax view has no on-screen drill-down, so no href.
 */
const isAmountColumnTotal = (label: string) =>
  ['Cost of Sales', 'Total Revenue', 'Total Other Income', 'Total Expenses'].includes(label)

const toStatementRow = (row: FormBTableRow): StatementRow => ({
  id: row.testId,
  kind: STATEMENT_KIND[row.kind],
  depth: 0,
  code: row.code,
  label: row.label,
  // Section heads label a block; they carry no figure.
  figures:
    row.kind === 'section'
      ? []
      : row.kind === 'total' && !isAmountColumnTotal(row.label)
        ? [null, row.rawAmount]
        : [row.rawAmount, null],
  blankFigures:
    row.kind === 'section'
      ? undefined
      : row.kind === 'total' && !isAmountColumnTotal(row.label)
        ? [true, false]
        : [false, true],
  testId: row.testId,
  isZero: row.rawAmount === '0.0000',
})

/**
 * Loading / error gate. Holds NO hooks, so the loading -> loaded transition
 * cannot change a hook count.
 *
 * The body is a separate component taking non-null `data`. Putting the early
 * returns above the body's useMemo/useCallback calls in ONE component is the
 * hook-order trap: React counts hooks per render, so the first render with data
 * would run three more than the loading render and throw "Rendered more hooks
 * than during the previous render". A test that mocks a settled query never
 * sees it, because it never renders the loading state at all.
 */
export default function FormBTaxView({ data, year, isLoading, isError, onOpenLedger }: FormBTaxViewProps) {
  if (!data) {
    if (isLoading) {
      return (
        <Box data-testid="pl-tax-view">
          <Box data-testid="formb-loading">
            <ListSkeleton rows={8} columns={3} />
          </Box>
        </Box>
      )
    }
    if (isError) {
      return (
        <Box data-testid="pl-tax-view">
          <Alert severity="error">Unable to load Form B. Please try again.</Alert>
        </Box>
      )
    }
    return <Box data-testid="pl-tax-view" />
  }

  return (
    <FormBTaxViewBody data={data} year={year} onOpenLedger={onOpenLedger} />
  )
}

interface FormBTaxViewBodyProps {
  data: FormBResponse
  year: number
  onOpenLedger: (accountId: string, year: number) => void
}

/*
 * The tax view no longer drills through to the ledger — the statutory lines
 * are the whole screen. The props stay on the public interface because
 * ProfitAndLossPage owns the single `openLedger` callback for both views.
 */
function FormBTaxViewBody({ data }: FormBTaxViewBodyProps) {
  const [reconciliationOpen, setReconciliationOpen] = useState(false)

  const rows = useMemo<FormBTableRow[]>(() => buildFormBTableRows(data), [data])
  const statementRows = useMemo<StatementRow[]>(() => rows.map(toStatementRow), [rows])

  /*
   * DISALLOWED_EXPENSES_UNDETERMINED is PERMANENT: N27 has no ledger source
   * (HASiL worksheet F1), so it is always null and always reported. Counting it
   * as an outstanding item means the summary can never reach zero, and a
   * counter that always reads "1 item needs attention" on a correctly
   * configured system is one people learn to ignore — the exact failure this
   * summary exists to prevent.
   *
   * It is still rendered in the findings list below, because the filer must
   * supply the figure; it just is not counted as something to fix.
   */
  /*
   * Reconciliation state. See the panel's own comment for why there are three
   * of these rather than a simple show/hide.
   */
  const recNum = (v: string | null): number | null => (v === null ? null : Number(v))
  const recN7 = recNum(data.reconciliation.n7)
  const recCos = recNum(data.reconciliation.accountingTotalCostOfSales)
  const recAdj = recNum(data.reconciliation.inventoryAdjustments)
  const recDraw = recNum(data.reconciliation.ownerStockDrawings)
  const recResidual = recNum(data.reconciliation.residual)

  const reconciliationUnexplained = recResidual !== null && recResidual !== 0
  const reconciliationIdentical =
    !reconciliationUnexplained &&
    recN7 !== null && recCos !== null && recN7 === recCos &&
    (recAdj ?? 0) === 0 && (recDraw ?? 0) === 0
  const reconciliationDifferenceLabel =
    recN7 !== null && recCos !== null
      ? formatFormBAmount(String(recN7 - recCos))
      : formatFormBAmount(null)

  // An unexplained residual opens the panel on its own: the figure cannot be
  // trusted, so the detail must be in front of the filer without a click.
  useEffect(() => {
    if (reconciliationUnexplained) setReconciliationOpen(true)
  }, [reconciliationUnexplained])

  const actionable = data.findings.filter((f) => f.code !== 'DISALLOWED_EXPENSES_UNDETERMINED')
  const totalIssues = actionable.length

  // Group findings by severity for rendering order: integrity first, then warning, then incomplete
  const grouped = {
    integrity: data.findings.filter((f) => f.severity === 'integrity'),
    warning: data.findings.filter((f) => f.severity === 'warning'),
    incomplete: data.findings.filter((f) => f.severity === 'incomplete'),
  }

  const severityToAlert = {
    integrity: 'error' as const,
    warning: 'warning' as const,
    incomplete: 'info' as const,
  }

  return (
    /*
     * The flex chain must reach Statement, or the table has no bounded height:
     * it grows to its content and the PAGE scrolls instead of the rows, taking
     * the column header with it. That was Form B's behaviour before #1224 —
     * this wrapper had no overflow owner at all.
     *
     * SimpleListPage supplies `flex: 1, minHeight: 0` on the table area, so this
     * body continues it. `minHeight: 0` is the load-bearing half — without it a
     * flex child refuses to shrink below its content and the inner scroller
     * never engages.
     *
     * No `overflow` here: Statement owns its own scrolling
     * (`.stmt-frame` hidden, `.stmt-scroller` auto), which is what pins the
     * header while the rows move.
     */
    <Box
      data-testid="pl-tax-view"
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {/* Readiness summary */}
      {/*
        The count and the N27 note are SEPARATE alerts, deliberately.
        Rendered together they read as one statement — "1 item needs
        attention" immediately above the N27 caption made N27 look like the
        item being counted, when the count actually refers to the findings
        listed below and N27 is explicitly excluded from it.
      */}
      {/*
        Rendered ONLY when there is something to act on. A clean report says
        nothing rather than announcing its own cleanliness — a banner that is
        always present is one nobody reads, which would blunt the warning
        precisely when it does appear.
      */}
      {totalIssues > 0 && (
        <Box data-testid="formb-readiness" sx={{ mb: 2 }}>
          <Alert severity="warning">
            {`${totalIssues} item${totalIssues === 1 ? '' : 's'} below need${totalIssues === 1 ? 's' : ''} attention before filing`}
          </Alert>
        </Box>
      )}



      {/* Findings */}
      {data.findings.length > 0 && (
        <Box data-testid="formb-findings" sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {(Object.entries(grouped) as Array<[keyof typeof grouped, typeof data.findings]>).map(([severity, list]) =>
            list.map((finding, idx) => (
              <Alert key={`${severity}-${finding.code}-${idx}`} severity={severityToAlert[severity]}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {finding.code}
                  </Typography>
                  <Typography variant="body2">{finding.message}</Typography>
                  {finding.accounts.length > 0 && (
                    <Box sx={{ mt: 0.5, pl: 2 }}>
                      {finding.accounts.map((a) => (
                        <Typography key={a.accountId} variant="caption" sx={{ display: 'block' }}>
                          {a.code} {a.name}
                          {a.reason ? ` (${a.reason})` : ''}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {finding.settingKey && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                      Setting: {finding.settingKey}
                    </Typography>
                  )}
                </Box>
              </Alert>
            )),
          )}
        </Box>
      )}

      {/* N3–N27 table */}
      {/*
        Statement owns the scroller, so a long filing scrolls its rows rather
        than the page.
      */}
      <Box sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <Statement
          rows={statementRows}
          figureHeads={['Amount', 'Total']}
          label="Form B tax statement"
        />
      </Box>

      {/*
        Three states, not two. Hiding the panel whenever the residual is zero
        would suppress a legitimate, EXPLAINED difference — owner stock
        drawings, say — which is exactly what it exists to document (spec
        §5.3): N7 counts everything that left inventory, the Accounting View
        counts only what was sold.

          identical   - N7 == Accounting cost of sales and every explanatory
                        term is zero. Nothing to explain; hidden.
          explained   - a difference the terms fully account for. Collapsed
                        one-line summary.
          unexplained - residual non-zero. Expanded and highlighted.

      */}
      {!reconciliationIdentical && (
        <Box
          data-testid="formb-reconciliation"
          sx={{
            mt: 2, p: 2, border: 1, borderRadius: 1,
            borderColor: reconciliationUnexplained ? 'error.main' : 'divider',
            display: 'flex', flexDirection: 'column', gap: 1,
          }}
        >
          <Box
            component="button"
            type="button"
            data-testid="formb-reconciliation-toggle"
            onClick={() => setReconciliationOpen((v) => !v)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, p: 0, border: 0,
              background: 'none', cursor: 'pointer', textAlign: 'left',
              font: 'inherit', color: 'inherit',
            }}
          >
            {reconciliationOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Reconciliation
            </Typography>
          </Box>
          <Typography
            variant="body2"
            data-testid="formb-reconciliation-summary"
            color={reconciliationUnexplained ? 'error' : 'text.secondary'}
          >
            {reconciliationUnexplained
              ? `Unexplained difference of ${formatFormBAmount(data.reconciliation.residual)} — N7 cannot be reconciled to the Accounting View.`
              : `Reconciliation passed; ${reconciliationDifferenceLabel} difference explained.`}
          </Typography>
          <Box
            sx={{ display: reconciliationOpen ? 'flex' : 'none', flexDirection: 'column', gap: 1 }}
          >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2">N7 Cost of Sales</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {formatFormBAmount(data.reconciliation.n7)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="body2">(a) Accounting total cost of sales</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                {formatFormBAmount(data.reconciliation.accountingTotalCostOfSales)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, pl: 3 }}>
              <Typography variant="body2">(b) of which: inventory adjustments</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                {formatFormBAmount(data.reconciliation.inventoryAdjustments)}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2">(c) Owner stock drawings</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {formatFormBAmount(data.reconciliation.ownerStockDrawings)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="body2">Residual</Typography>
            <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
              {formatFormBAmount(data.reconciliation.residual)}
            </Typography>
          </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
