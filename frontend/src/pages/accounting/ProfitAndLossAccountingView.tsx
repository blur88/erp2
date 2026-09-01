import React, { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  IconButton,
  TableCell,
  TableRow,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import EntityTable, { type RowPresentationProps } from '@/components/common/EntityTable'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { formatCurrency } from '@/utils/currency'
import type { PlAccountRow, ProfitAndLossResponse } from '@/types'
import type { Theme } from '@mui/material'
import type { SystemStyleObject } from '@mui/system'

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

interface ProfitAndLossAccountingViewProps {
  data: ProfitAndLossResponse | undefined
  year: number
  isLoading: boolean
  isFetching: boolean
  isError: boolean
  listRef: React.RefObject<HTMLDivElement | null>
  onOpenLedger: (accountId: string, year: number) => void
}

export default function ProfitAndLossAccountingView(props: ProfitAndLossAccountingViewProps) {
  const { data: profitAndLoss, year, isLoading, isFetching, listRef, onOpenLedger } = props
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (rowId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

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
    /*
     * Continues SimpleListPage's flex chain so EntityTable gets a bounded
     * height and scrolls its own rows. A plain block here let the table grow to
     * its content, so the PAGE scrolled and the column header went with it —
     * unlike every other list page. `minHeight: 0` is what allows the flex
     * child to shrink below its content so the inner scroller engages.
     */
    <Box
      data-testid="pl-accounting-view"
      sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}
    >
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
            onSelect={(row) => row.accountId && onOpenLedger(row.accountId, year)}
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
    </Box>
  )
}
