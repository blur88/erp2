import React, { useMemo, useState } from 'react'
import { Alert, Box, IconButton, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import EntityTable, { type RowPresentationProps } from '@/components/common/EntityTable'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { AccountingReportPrintLayout } from '@/components/print/AccountingReportPrintLayout'
import type { FormBResponse } from '@/types'
import type { Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'
import { buildFormBTableRows, formatFormBAmount, periodLabel, type FormBTableRow } from './formBRows'

interface FormBTaxViewProps {
  data: FormBResponse | undefined
  year: number
  isLoading: boolean
  isError: boolean
  onOpenLedger: (accountId: string, year: number) => void
}

const isFormBRowSelectable = (row: FormBTableRow) =>
  (row.kind === 'cohort' && Boolean(row.accountId)) || (row.kind === 'line' && row.expandable)

const formBRowProps = (row: FormBTableRow): RowPresentationProps => ({
  'data-testid': row.testId,
  ...(row.printClass ? { className: row.printClass } : {}),
})

const formBRowSx = (row: FormBTableRow): SystemStyleObject<Theme> => {
  if (row.kind === 'cohortHeading') {
    return { '& td': { fontStyle: 'italic', color: 'text.secondary', borderBottom: 'none', pt: 0.5, pb: 0.5 } } as SystemStyleObject<Theme>
  }
  if (row.kind === 'cohort') {
    return { color: 'text.secondary', '& td': { pl: 4 } } as SystemStyleObject<Theme>
  }
  return {} as SystemStyleObject<Theme>
}

export default function FormBTaxView({ data, year, isLoading, isError, onOpenLedger }: FormBTaxViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (line: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  // Loading / error gates — mirror ProfitAndLossAccountingView's three-way gate.
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

  const rows = useMemo<FormBTableRow[]>(() => buildFormBTableRows(data, expanded), [data, expanded])

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

  const totalIssues =
    data.readiness.counts.warning + data.readiness.counts.incomplete + data.readiness.counts.integrity

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
    <Box data-testid="pl-tax-view" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
      <AccountingReportPrintLayout title="PROFIT & LOSS — FORM B TAX VIEW" period={periodLabel(data.year, data.formVersion)}>
        {/* Readiness summary */}
        <Box data-testid="formb-readiness" sx={{ mb: 2 }}>
          <Alert severity={totalIssues > 0 ? 'warning' : 'success'}>
            {totalIssues === 0 ? 'No issues detected by these checks' : `${totalIssues} items need attention before filing`}
          </Alert>
        </Box>

        {/* Business identity block */}
        <Box data-testid="formb-identity" sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Business Identity
          </Typography>
          {(
            [
              ['Business Name', data.identity.businessName],
              ['Registration Number', data.identity.registrationNumber],
              ['Business Code', data.identity.businessCode],
              ['Activity Type', data.identity.activityType],
            ] as const
          ).map(([label, field]) => (
            <Box key={label} sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ minWidth: 160, fontWeight: 500 }}>
                {label}:
              </Typography>
              <Typography variant="body2">
                {field.value ?? 'Not set'}
                {field.source === 'printSettings' ? ' from Print Settings' : ''}
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
            getRowProps={formBRowProps}
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
      </AccountingReportPrintLayout>
    </Box>
  )
}
