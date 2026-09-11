import React, { useMemo, useState } from 'react'
import { Alert, Box } from '@mui/material'

import { Statement } from '@/components/accounting/Statement'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { buildProfitAndLossRows } from './profitAndLossRows'
import type { ProfitAndLossResponse } from '@/types'

interface ProfitAndLossAccountingViewProps {
  data: ProfitAndLossResponse | undefined
  year: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  listRef: React.RefObject<HTMLDivElement | null>
  onOpenLedger: (accountId: string, year: number) => void
}

/** Mirrors ProfitAndLossPage.openLedger, as a URL rather than a navigate call. */
const buildLedgerHref = (accountId: string, year: number) => {
  const params = new URLSearchParams({
    account: accountId,
    period: 'custom',
    period_from: `${year}-01-01`,
    period_to: `${year}-12-31`,
  })
  return `/accounting/general-ledger?${params.toString()}`
}

export default function ProfitAndLossAccountingView(props: ProfitAndLossAccountingViewProps) {
  const { data: profitAndLoss, year, isLoading, isFetching, listRef } = props
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (rowId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const rows = useMemo(
    () =>
      profitAndLoss
        ? buildProfitAndLossRows(
            profitAndLoss,
            expanded,
            (accountId) => buildLedgerHref(accountId, year),
            toggle,
          )
        : [],
    [profitAndLoss, expanded, year],
  )

  const integrityAlert =
    profitAndLoss &&
    (profitAndLoss.integrity.anomalies.length > 0 ||
      profitAndLoss.integrity.structuralFaults.length > 0 ||
      !profitAndLoss.integrity.tieOutOk) ? (
      <Alert severity="warning" data-testid="pl-integrity-warning" sx={{ mb: 2 }}>
        {profitAndLoss.integrity.anomalies.map((a) => (
          <div key={`${a.accountId}-${a.component}`}>
            Anomaly: {a.code} {a.name} {a.component} count {a.count}
          </div>
        ))}
        {profitAndLoss.integrity.structuralFaults.map((f, idx) => (
          <div key={`${f.kind}-${idx}`}>
            Fault: {f.kind} {f.settingKey ?? ''}{' '}
            {f.accounts.map((ac) => `${ac.code} ${ac.name}`).join(', ')}
          </div>
        ))}
        {!profitAndLoss.integrity.tieOutOk && <div>Tie-out failed</div>}
      </Alert>
    ) : null

  return (
    <Box
      data-testid="pl-accounting-view"
      ref={listRef}
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}
    >
      {integrityAlert}
      {/*
        Three-way gate, matching the existing tests exactly:
          - no currentData + fetching -> pl-loading skeleton, no statement
          - no currentData + error    -> the error Alert alone, no statement
          - currentData               -> the statement
        Note the deliberate omission (#1172): a year with NO activity still
        renders the full statement — every section, every total, all zero —
        rather than an empty state. The structure is the report.
      */}
      {!profitAndLoss ? (
        isLoading || isFetching ? (
          <Box data-testid="pl-loading">
            <ListSkeleton rows={8} columns={4} />
          </Box>
        ) : null
      ) : (
        // Statement owns its own scroller (spec §3.1), so no overflow here.
        // `minHeight: 0` stays: without it this flex child refuses to shrink
        // below its content and Statement's scroller never engages.
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <Statement rows={rows} figureHeads={['RM']} label="Profit and Loss statement" />
        </Box>
      )}
    </Box>
  )
}
