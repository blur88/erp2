import '@/components/print/accountingReportPrint.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  IconButton,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import EntityTable, { type RowPresentationProps } from '@/components/common/EntityTable'
import SimpleListPage from '@/components/common/SimpleListPage'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { useGetProfitAndLossQuery } from '@/store/api/accountingApi'
import { AccountingReportPrintLayout } from '@/components/print/AccountingReportPrintLayout'
import { formatCurrency } from '@/utils/currency'
import type { PlAccountRow, ProfitAndLossResponse } from '@/types'
import type { Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'

interface PlFilters {
  year: string
}

/**
 * Captured once at module load, deliberately. The default must be a STABLE
 * string: useFilterBar memoises defaults and compares applied state against
 * them for hasActiveFilters, so a value that changed identity per render would
 * make Reset and the active-filter state flicker. A page open across New Year's
 * midnight showing the prior year until reload is the accepted trade.
 */
const CURRENT_YEAR = new Date().getFullYear()

const PL_DEFAULTS: PlFilters = { year: String(CURRENT_YEAR) }

type PlRowKind = 'section' | 'account' | 'group' | 'child' | 'adjustments' | 'total' | 'summary'

interface PlTableRow {
  id: string
  kind: PlRowKind
  code: string
  name: string
  amount: string
  depth: number
  accountId?: string
  testId: string
  isZero: boolean
  /** Group rows only: expansion state, for the toggle icon. */
  expanded?: boolean
  /** Child rows only: carries the print class that hides detail rows. */
  printClass?: string
}

const isZeroAmount = (amount: string) => amount === '0.0000'

// Module scope — EntityRow is memoised, so inline arrows would defeat it.
// Postable leaves only, at any depth. A 'group' is non-postable by definition
// and must never navigate, however deeply nested it is.
const isPlRowSelectable = (row: PlTableRow) =>
  (row.kind === 'account' || row.kind === 'child') && Boolean(row.accountId)

const plRowProps = (row: PlTableRow): RowPresentationProps => ({
  'data-testid': row.testId,
  'data-zero': row.isZero ? 'true' : 'false',
  ...(row.printClass ? { className: row.printClass } : {}),
})

const plRowSx = (row: PlTableRow): SystemStyleObject<Theme> => {
  if (row.kind === 'section') {
    return { '& td': { fontWeight: 700, borderBottom: 'none', pt: 2 } }
  }
  if (row.kind === 'total' || row.kind === 'summary') {
    return {
      '& td': {
        borderTop: 2,
        borderTopColor: 'divider',
        fontWeight: 700,
        color: row.isZero ? 'text.disabled' : 'text.primary',
      },
    }
  }
  return { color: row.isZero ? 'text.disabled' : undefined } as SystemStyleObject<Theme>
}

export default function ProfitAndLossPage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (rowId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const openLedger = (accountId: string, year: number) => {
    const params = new URLSearchParams({
      account: accountId,
      period: 'custom',
      period_from: `${year}-01-01`,
      period_to: `${year}-12-31`,
    })
    navigate(`/accounting/general-ledger?${params.toString()}`)
  }

  // The cycle: filterConfig needs the query's availableYears to build its
  // options; useFilterBar(filterConfig) yields the selected year; the query
  // needs that year. Broken by keeping the option set in local state fed FROM
  // each settled response, so the config depends on state, not on a hook that
  // has not run yet.
  const [yearOptions, setYearOptions] = useState<number[] | null>(null)
  // Separate from the option array, because "no options yet" and "no options
  // are coming" are different states that must drive optionsLoading differently.
  const [isYearOptionsError, setIsYearOptionsError] = useState(false)

  const filterConfig = useMemo<FilterBarConfig<PlFilters>>(
    () => ({
      fields: [
        {
          field: 'year',
          label: 'Year',
          type: 'select',
          // The current year is always offered, so the control is never empty
          // and its default value always has a matching MenuItem.
          options: (yearOptions ?? [CURRENT_YEAR]).map((y) => ({
            value: String(y),
            label: String(y),
          })),
          // null means "no response has landed yet": not authoritative, so an
          // inbound ?year=2024 is preserved rather than allow-listed against an
          // incomplete set and discarded.
          optionsReady: yearOptions !== null,
          // Deliberately NOT `yearOptions === null`. An errored query never
          // lands a response, so readiness-derived loading would leave the
          // control disabled and reading "Loading…" forever — the exact failure
          // filterBar.types.ts:57-65 warns about. An errored query must be
          // optionsReady: false, optionsLoading: false.
          optionsLoading: yearOptions === null && !isYearOptionsError,
        },
      ],
      defaults: PL_DEFAULTS,
    }),
    [yearOptions, isYearOptionsError],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  // Validate before querying: appliedFilters.year is preserved unvalidated while
  // options are unresolved, so it can be anything the URL carried.
  const rawYear = appliedFilters.year
  const parsedYear = /^\d{4}$/.test(rawYear ?? '') ? Number(rawYear) : NaN
  const year = Number.isNaN(parsedYear) ? CURRENT_YEAR : parsedYear

  const { currentData, isLoading, isFetching, isError } = useGetProfitAndLossQuery({ year })
  const profitAndLoss = currentData as ProfitAndLossResponse | undefined

  // Feed the options back from each settled response. Guarded on a real change
  // so it cannot loop.
  useEffect(() => {
    const years = currentData?.availableYears
    if (!years) return
    setIsYearOptionsError(false)
    setYearOptions((prev) =>
      prev && prev.length === years.length && prev.every((y, i) => y === years[i]) ? prev : years,
    )
  }, [currentData])

  // A failed query means no option set is coming; record that so the control
  // stops claiming to be loading.
  useEffect(() => {
    if (isError) setIsYearOptionsError(true)
  }, [isError])

  const rows = useMemo<PlTableRow[]>(() => {
    if (!profitAndLoss) return []
    const out: PlTableRow[] = []

    for (const section of profitAndLoss.sections) {
      const isCogs = section.key === 'cogs'
      const totalAmount = isCogs ? profitAndLoss.totalCostOfSales : section.total
      const totalRowId = isCogs ? profitAndLoss.totalCostOfSalesRowId : section.totalRowId

      out.push({
        id: section.rowId, kind: 'section', code: '', name: section.label,
        amount: '', depth: 0, testId: `pl-section-${section.key}`, isZero: false,
      })

      // PlAccountRow.children is RECURSIVE and each descendant carries its own
      // isPostable, so this must walk, not loop one level. A nested non-postable
      // node stays expandable and non-selectable at any depth; treating every
      // child as a selectable leaf would make a group row navigate to an account
      // that cannot be posted to.
      const walk = (nodes: PlAccountRow[], depth: number) => {
        for (const node of nodes) {
          const isZero = isZeroAmount(node.amount)
          // Depth 0 is a section's own row; anything deeper is detail, which the
          // print stylesheet hides.
          const printClass = depth > 0 ? 'acct-print-detail-row' : undefined

          if (node.isPostable) {
            out.push({
              id: node.rowId, kind: depth > 0 ? 'child' : 'account',
              code: node.code, name: node.name, amount: node.amount, depth,
              accountId: node.accountId, testId: `pl-row-${node.rowId}`,
              isZero, printClass,
            })
            continue
          }

          const isExpanded = expanded.has(node.rowId)
          out.push({
            id: node.rowId, kind: 'group', code: node.code, name: node.name,
            amount: node.amount, depth, testId: `pl-row-${node.rowId}`,
            isZero, expanded: isExpanded, printClass,
          })
          if (isExpanded) walk(node.children, depth + 1)
        }
      }
      walk(section.rows, 0)

      if (isCogs) {
        out.push({
          id: profitAndLoss.inventoryAdjustmentsRowId, kind: 'adjustments',
          code: '', name: 'Inventory Adjustments',
          amount: profitAndLoss.inventoryAdjustments, depth: 0,
          testId: `pl-row-${profitAndLoss.inventoryAdjustmentsRowId}`,
          isZero: isZeroAmount(profitAndLoss.inventoryAdjustments),
        })
      }

      out.push({
        id: totalRowId, kind: 'total', code: '', name: section.totalLabel,
        amount: totalAmount, depth: 0, testId: `pl-row-${totalRowId}`,
        isZero: isZeroAmount(totalAmount),
      })

      // Gross Profit follows Cost of Sales directly, before Other Income.
      if (isCogs) {
        out.push({
          id: 'grossProfit', kind: 'summary', code: '', name: 'Gross Profit',
          amount: profitAndLoss.grossProfit, depth: 0,
          testId: 'pl-row-grossProfit', isZero: isZeroAmount(profitAndLoss.grossProfit),
        })
      }
    }

    return out
  }, [profitAndLoss, expanded])

  const columns = useMemo(
    () => [
      { key: 'code', render: (row: PlTableRow) => row.code },
      {
        key: 'name',
        raw: true,
        render: (row: PlTableRow) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, pl: row.depth * 3 }}>
            {row.kind === 'group' && (
              <IconButton
                size="small"
                className="acct-print-control"
                data-testid={`pl-expand-${row.id}`}
                onClick={(e) => { e.stopPropagation(); toggle(row.id) }}
              >
                {row.expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            )}
            {row.name}
          </Box>
        ),
      },
      {
        key: 'amount',
        align: 'right' as const,
        render: (row: PlTableRow) => (row.kind === 'section' ? '' : formatCurrency(row.amount)),
      },
    ],
    [],
  )

  const netProfitFooter = profitAndLoss ? (
    <TableRow
      data-testid="pl-row-netProfit"
      data-zero={isZeroAmount(profitAndLoss.netProfit) ? 'true' : 'false'}
      sx={{ '& td': { borderTop: 2, borderTopColor: 'divider', fontWeight: 700 } }}
    >
      <TableCell colSpan={2}>Net Profit</TableCell>
      <TableCell align="right">{formatCurrency(profitAndLoss.netProfit)}</TableCell>
    </TableRow>
  ) : undefined

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
            Fault: {f.kind} {f.settingKey ?? ''} {f.accounts.map((ac) => `${ac.code} ${ac.name}`).join(', ')}
          </div>
        ))}
        {!profitAndLoss.integrity.tieOutOk && <div>Tie-out failed</div>}
      </Alert>
    ) : null

  return (
    <AccountingReportPrintLayout title="PROFIT & LOSS" period={`Year ${year}`}>
      <SimpleListPage
        title="Profit & Loss"
        subtitle="Annual profit or loss."
        hideHeaderOnPrint
        secondaryAction={{ label: 'Print', onClick: () => window.print() }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
        error={isError ? 'Unable to load Profit & Loss. Please try again.' : null}
        tableSlot={
          <>
            {integrityAlert}
            {/*
              Three-way gate, matching the existing tests exactly:
                - no currentData + fetching  -> pl-loading skeleton, no table
                - no currentData + error     -> the error Alert alone, no table
                - currentData                -> the statement
              Rendering EntityTable unconditionally breaks both: the skeleton
              testid disappears, and on terminal error an empty table shows
              "No Statement found" beside the error message.

              Note the deliberate omission (#1172): a year with NO activity still
              renders the full statement — every section, every total, all zero —
              rather than an empty state. The structure is the report. Swapping
              in EntityTable's "No Statement found" would change report
              semantics, which that issue's non-goals exclude.
            */}
            {!profitAndLoss ? (
              isLoading || isFetching ? (
                <Box data-testid="pl-loading">
                  <ListSkeleton rows={8} columns={4} />
                </Box>
              ) : null
            ) : (
              <Box className="acct-print-scroll" sx={{ flex: 1, minHeight: 0 }}>
                <EntityTable
                  rows={rows}
                  columns={columns}
                  tableClassName="acct-print-table"
                  isRowSelectable={isPlRowSelectable}
                  selectableRowRole="link"
                  getRowSx={plRowSx}
                  getRowProps={plRowProps}
                  tableFooter={netProfitFooter}
                  onSelect={(row) => row.accountId && openLedger(row.accountId, year)}
                  headers={['Account Code', 'Name', 'Amount']}
                  showHeader={false}
                  focusedIndex={-1}
                  listRef={listRef}
                  // currentData is present here, so this only ever means a
                  // background refetch — never the initial load.
                  loading={false}
                  total={rows.length}
                  label="Statement"
                />
              </Box>
            )}
          </>
        }
      />
    </AccountingReportPrintLayout>
  )
}
