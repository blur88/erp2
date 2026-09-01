import React, { useCallback, useMemo, useState } from 'react'
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
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (line: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  const rows = useMemo<FormBTableRow[]>(() => buildFormBTableRows(data, expanded), [data, expanded])

  const getRowProps = useCallback(
    (row: FormBTableRow): RowPresentationProps => {
      // Cohorts print unconditionally but are hidden on screen when collapsed.
      // Prefer the row's own hiddenOnScreen flag (set by buildFormBTableRows),
      // fall back to checking expanded directly so a stale row still hides.
      const isHidden =
        row.hiddenOnScreen ??
        ((row.kind === 'cohort' || row.kind === 'cohortHeading') && !expanded.has(row.line))
      const classes = [row.printClass, isHidden ? 'acct-screen-hidden' : null].filter(Boolean).join(' ')
      return {
        'data-testid': row.testId,
        ...(classes ? { className: classes } : {}),
      }
    },
    [expanded],
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
            {row.expandable && (
              <IconButton
                size="small"
                className="acct-print-control"
                data-testid={`formb-expand-${row.line}`}
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(row.line)
                }}
              >
                {row.expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <Typography variant="body2" sx={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                {row.label}
              </Typography>
              {row.formula && (
                <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>
                  {row.formula}
                </Typography>
              )}
              {/*
                N5's statutory label is "Purchases and Production Costs", but
                this is a retail-only ERP with no production. The annotation
                says so explicitly rather than letting a reader infer that
                production cost was computed and happened to be zero.
              */}
              {row.annotation && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  data-testid={`formb-annotation-${row.line}`}
                  sx={{ whiteSpace: 'normal', wordBreak: 'break-word', fontStyle: 'italic' }}
                >
                  {row.annotation}
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
    [expanded],
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
    <Box data-testid="pl-tax-view" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <>
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


        {/* Business identity block */}
        <Box data-testid="formb-identity" sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Business Identity
          </Typography>
          {(
            [
              ['Business Name', data.identity.businessName],
              ['Registration Number', data.identity.registrationNumber],
            ] as const
          ).map(([label, field]) => (
            <Box key={label} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ minWidth: 160, fontWeight: 500 }}>
                {label}:
              </Typography>
              <Typography variant="body2">
                {field.value ?? 'Not set in Company Settings'}
              </Typography>
            </Box>
          ))}
        </Box>

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
        <Box className="acct-print-scroll" sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}>
          <EntityTable
            rows={rows}
            columns={columns}
            tableClassName="acct-print-table"
            isRowSelectable={isFormBRowSelectable}
            selectableRowRole="link"
            getRowSx={formBRowSx}
            getRowProps={getRowProps}
            onSelect={(row) => {
              if (row.kind === 'line' && row.expandable) toggle(row.line)
              else if (row.accountId) onOpenLedger(row.accountId, data.year)
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

        {/* Reconciliation panel */}
        <Box
          data-testid="formb-reconciliation"
          sx={{ mt: 2, p: 2, border: 1, borderColor: 'divider', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 1 }}
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Reconciliation
          </Typography>
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
      </>
    </Box>
  )
}
