import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, IconButton, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import EntityTable, { type RowPresentationProps } from '@/components/common/EntityTable'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import type { FormBResponse } from '@/types'
import type { Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'
import { buildFormBTableRows, formatFormBAmount, type FormBTableRow } from './formBRows'

interface FormBTaxViewProps {
  data: FormBResponse | undefined
  year: number
  isLoading: boolean
  isError: boolean
  onOpenLedger: (accountId: string, year: number) => void
}

const isFormBRowSelectable = (row: FormBTableRow) =>
  (row.kind === 'cohort' && Boolean(row.accountId)) || (row.kind === 'line' && row.expandable)

const formBRowProps = (row: FormBTableRow): RowPresentationProps => {
  const classes = [row.printClass, row.hiddenOnScreen ? 'acct-screen-hidden' : null].filter(Boolean).join(' ')
  return {
    'data-testid': row.testId,
    ...(classes ? { className: classes } : {}),
  }
}

const formBRowSx = (row: FormBTableRow): SystemStyleObject<Theme> => {
  /*
   * A filled band, not just bold text. On a table where every row is text, a
   * font-weight change alone does not read as a break — the header looks like
   * another slightly-bolder line. The background, uppercase tracking and rule
   * beneath give the eye something to catch when scanning 25 statutory lines.
   */
  if (row.kind === 'section') {
    return {
      backgroundColor: 'action.hover',
      '& td': {
        fontWeight: 700,
        fontSize: '0.8125rem',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'text.primary',
        // A rule ABOVE as well as below: the band then reads as a divider
        // between blocks rather than a caption attached to the row under it.
        borderTop: 2,
        borderTopColor: 'divider',
        borderBottom: 2,
        borderBottomColor: 'divider',
        pt: 1.25,
        pb: 1.25,
        whiteSpace: 'nowrap',
      },
    } as SystemStyleObject<Theme>
  }
  if (row.kind === 'cohortHeading') {
    return { '& td': { fontStyle: 'italic', color: 'text.secondary', borderBottom: 'none', pt: 0.5, pb: 0.5 } } as SystemStyleObject<Theme>
  }
  if (row.kind === 'cohort') {
    return { color: 'text.secondary', '& td': { pl: 4 } } as SystemStyleObject<Theme>
  }
  return {} as SystemStyleObject<Theme>
}

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

function FormBTaxViewBody({ data, year, onOpenLedger }: FormBTaxViewBodyProps) {
  const [reconciliationOpen, setReconciliationOpen] = useState(false)

  const rows = useMemo<FormBTableRow[]>(() => buildFormBTableRows(data), [data])

  const getRowProps = useCallback(
    (row: FormBTableRow): RowPresentationProps => {
      // Cohorts are print-only: always hidden on screen, revealed by the print
      // stylesheet via .acct-print-formb-cohort.
      const isHidden = row.hiddenOnScreen ?? false
      const classes = [row.printClass, isHidden ? 'acct-screen-hidden' : null].filter(Boolean).join(' ')
      return {
        'data-testid': row.testId,
        ...(classes ? { className: classes } : {}),
      }
    },
    [],
  )

  const columns = useMemo(
    () => [
      {
        key: 'code',
        render: (row: FormBTableRow) => row.code,
        width: '80px',
      },
      {
        key: 'label',
        raw: true,
        render: (row: FormBTableRow) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: row.depth * 3, minWidth: 0, flexWrap: 'nowrap' }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                {row.label}
              </Typography>
              {row.formula && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {row.formula}
                </Typography>
              )}
            </Box>
          </Box>
        ),
      },
      {
        key: 'amount',
        align: 'right' as const,
        raw: true,
        render: (row: FormBTableRow) => (
          <Box sx={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{row.amount}</Box>
        ),
      },
    ],
    [],
  )

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
     * NO AccountingReportPrintLayout here. The shell (ProfitAndLossPage) owns
     * exactly one instance for both views and derives its title and period from
     * the active view; nesting a second one printed duplicate headers and two
     * conflicting titles on the same sheet.
     */
    /*
     * The flex chain must reach EntityTable, or the table has no bounded height:
     * it grows to its content and the PAGE scrolls instead of the rows, taking
     * the column header with it.
     *
     * SimpleListPage supplies `flex: 1, minHeight: 0` on the table area, so this
     * body continues it. `minHeight: 0` is the load-bearing half — without it a
     * flex child refuses to shrink below its content and the inner scroller
     * never engages.
     *
     * No `overflow` here: EntityTable owns its own scrolling
     * (`.entity-table-frame` hidden, `.entity-table-scroller` auto), which is
     * what pins the header while the rows move.
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
        NO `overflow: auto` here. EntityTable owns its own scrolling —
        `.entity-table-frame` is overflow:hidden and `.entity-table-scroller`
        is overflow:auto — which is what keeps the column header fixed while
        the rows scroll. An outer scroll container defeats that: the whole
        table, header included, scrolls as one block, unlike every other list
        page. Matches ProfitAndLossAccountingView, which had it right.

        The class stays: accountingReportPrint.css targets it to release the
        height and overflow constraints when printing.
      */}
      <Box className="acct-print-scroll" sx={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        <EntityTable
          rows={rows}
          columns={columns}
          tableClassName="acct-print-table"
          isRowSelectable={isFormBRowSelectable}
          selectableRowRole="link"
          getRowSx={formBRowSx}
          getRowProps={getRowProps}
          onSelect={(row) => {
            if (row.accountId) onOpenLedger(row.accountId, data.year)
          }}
          headers={['Code', 'Description', 'Amount']}
          showHeader={false}
          focusedIndex={-1}
          listRef={{ current: null } as any}
          loading={false}
          total={rows.length}
          label="Form B"
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

        It PRINTS whenever there is a difference: the sheet must document why
        N7 differs. The detail carries .acct-print-formb-cohort so the print
        stylesheet reveals it even when collapsed, as cohorts do.
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
            className="acct-print-control"
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
            className="acct-print-formb-cohort"
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
