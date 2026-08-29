import '@/components/print/accountingReportPrint.css'
import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'
import PrintIcon from '@mui/icons-material/Print'

import PageHeader from '@/components/common/PageHeader'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProfitAndLossQuery } from '@/store/api/accountingApi'
import { AccountingReportPrintLayout } from '@/components/print/AccountingReportPrintLayout'
import { formatCurrency } from '@/utils/currency'
import type { ProfitAndLossResponse } from '@/types'

export default function ProfitAndLossPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const rawYear = searchParams.get('year')
  const isFourDigit = /^\d{4}$/.test(rawYear ?? '')
  const year = isFourDigit ? Number(rawYear) : new Date().getFullYear()

  // Normalize an absent or malformed ?year= to the year actually being shown.
  // Without this the URL keeps saying `?year=abc` while the page renders the
  // current year, so a refresh or a shared link disagrees with what was on
  // screen. `replace` keeps the correction out of the history stack.
  React.useEffect(() => {
    if (isFourDigit) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('year', String(year))
        return next
      },
      { replace: true },
    )
  }, [isFourDigit, year, setSearchParams])

  const handleYearChange = (newYear: number) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('year', String(newYear))
        return next
      },
      { replace: true },
    )
  }

  // `currentData` is scoped to the CURRENT argument, unlike `data`, which
  // keeps the previous year's payload while the new year is in flight. Reading
  // `data` would briefly render last year's figures under the new year's
  // heading — a wrong report, not merely a stale one.
  const { currentData, isLoading, isFetching, isError } = useGetProfitAndLossQuery({ year })
  const data = currentData

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const toggle = (rowId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  const openLedger = (accountId: string) => {
    const params = new URLSearchParams({
      account: accountId,
      period: 'custom',
      period_from: `${year}-01-01`,
      period_to: `${year}-12-31`,
    })
    navigate(`/accounting/general-ledger?${params.toString()}`)
  }

  const isZeroAmount = (amount: string) => amount === '0.0000'

  /**
   * A computed summary line (Gross Profit, Net Profit). Rendered as its own
   * one-row table so it can sit between sections — Gross Profit belongs
   * immediately after Cost of Sales, where the reader expects it, not after
   * every section has been listed.
   */
  const summaryRow = (rowId: string, label: string, amount: string) => (
    <Table
      size={TABLE_STYLES.size}
      className="acct-print-table"
      sx={{
        mb: 3,
        '& .MuiTableCell-root': {
          py: TABLE_STYLES.cell.padding.py,
          px: TABLE_STYLES.cell.padding.px,
        },
      }}
    >
      <TableBody>
        <TableRow
          data-testid={`pl-row-${rowId}`}
          data-zero={isZeroAmount(amount) ? 'true' : 'false'}
          sx={{
            '& td': {
              fontWeight: 700,
              borderTop: 2,
              borderTopColor: 'divider',
              color: isZeroAmount(amount) ? 'text.disabled' : 'text.primary',
            },
          }}
        >
          <TableCell colSpan={2}>{label}</TableCell>
          <TableCell align="right">{formatCurrency(amount)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )

  const profitAndLoss = data as ProfitAndLossResponse | undefined

  const years = profitAndLoss?.availableYears ?? [year]

  const toolbar = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }} data-print-hide="true">
      <FormControl size="small" sx={{ minWidth: 120 }}>
        <InputLabel id="pl-year-select-label">Year</InputLabel>
        <Select
          labelId="pl-year-select-label"
          label="Year"
          value={String(year)}
          onChange={(e) => handleYearChange(Number(e.target.value))}
          data-testid="pl-year-select"
        >
          {years.map((y) => (
            <MenuItem key={y} value={String(y)}>
              {y}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Button
        variant="outlined"
        startIcon={<PrintIcon />}
        onClick={() => window.print()}
        data-print-hide="true"
      >
        Print
      </Button>
    </Box>
  )

  return (
    <AccountingReportPrintLayout title="PROFIT & LOSS" period={`Year ${year}`}>
      <Box data-print-hide="true">
        <PageHeader
          variant="workflow"
          title="Profit & Loss"
          subtitle="Annual profit or loss."
          toolbar={toolbar}
        />
      </Box>

      {(isLoading || isFetching) && (
        <Box data-testid="pl-loading">
          <ListSkeleton rows={8} columns={4} />
        </Box>
      )}

      {isError && !isLoading && !isFetching && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Unable to load Profit & Loss. Please try again.
        </Alert>
      )}

      {profitAndLoss && !isLoading && !isFetching && !isError && (
        <>
          {/* Integrity warnings */}
          {(profitAndLoss.integrity.anomalies.length > 0 ||
            profitAndLoss.integrity.structuralFaults.length > 0 ||
            !profitAndLoss.integrity.tieOutOk) && (
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
          )}

          <Box className="acct-print-scroll" sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
            {profitAndLoss.sections.map((section) => {
              const isCogs = section.key === 'cogs'
              const totalAmount = isCogs ? profitAndLoss.totalCostOfSales : section.total
              const totalRowId = isCogs ? profitAndLoss.totalCostOfSalesRowId : section.totalRowId
              const totalIsZero = isZeroAmount(totalAmount)

              return (
                <Box key={section.key} sx={{ mb: 3 }}>
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 700, mb: 1 }}
                    data-testid={`pl-section-${section.key}`}
                  >
                    {section.label}
                  </Typography>
                  <Table
                    size={TABLE_STYLES.size}
                    className="acct-print-table"
                    sx={{
                      '& .MuiTableCell-root': {
                        py: TABLE_STYLES.cell.padding.py,
                        px: TABLE_STYLES.cell.padding.px,
                      },
                      '& .MuiTableCell-head': {
                        py: TABLE_STYLES.header.padding.py,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>Account Code</TableCell>
                        <TableCell>Name</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {section.rows.map((row) => {
                        const rowIsZero = isZeroAmount(row.amount)
                        if (row.isPostable) {
                          return (
                            <TableRow
                              key={row.rowId}
                              hover
                              role="link"
                              tabIndex={0}
                              onClick={() => openLedger(row.accountId)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') openLedger(row.accountId)
                              }}
                              sx={{ cursor: 'pointer', color: rowIsZero ? 'text.disabled' : undefined }}
                              data-testid={`pl-row-${row.rowId}`}
                              data-zero={rowIsZero ? 'true' : 'false'}
                            >
                              <TableCell>{row.code}</TableCell>
                              <TableCell>{row.name}</TableCell>
                              <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                            </TableRow>
                          )
                        }
                        const isExpanded = expanded.has(row.rowId)
                        return (
                          <React.Fragment key={row.rowId}>
                            <TableRow
                              data-testid={`pl-row-${row.rowId}`}
                              data-zero={rowIsZero ? 'true' : 'false'}
                              sx={{ color: rowIsZero ? 'text.disabled' : undefined }}
                            >
                              <TableCell>{row.code}</TableCell>
                              <TableCell>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <IconButton
                                    size="small"
                                    onClick={() => toggle(row.rowId)}
                                    className="acct-print-control"
                                    data-testid={`pl-expand-${row.rowId}`}
                                  >
                                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                  </IconButton>
                                  {row.name}
                                </Box>
                              </TableCell>
                              <TableCell align="right">{formatCurrency(row.amount)}</TableCell>
                            </TableRow>
                            {isExpanded &&
                              row.children.map((child) => {
                                const childIsZero = isZeroAmount(child.amount)
                                return (
                                  <TableRow
                                    key={child.rowId}
                                    hover
                                    role="link"
                                    tabIndex={0}
                                    onClick={() => openLedger(child.accountId)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') openLedger(child.accountId)
                                    }}
                                    sx={{
                                      cursor: 'pointer',
                                      color: childIsZero ? 'text.disabled' : undefined,
                                    }}
                                    className="acct-print-detail-row"
                                    data-testid={`pl-row-${child.rowId}`}
                                    data-zero={childIsZero ? 'true' : 'false'}
                                  >
                                    <TableCell>{child.code}</TableCell>
                                    <TableCell sx={{ pl: 4 }}>{child.name}</TableCell>
                                    <TableCell align="right">{formatCurrency(child.amount)}</TableCell>
                                  </TableRow>
                                )
                              })}
                          </React.Fragment>
                        )
                      })}

                      {/* Inventory Adjustments row inside Cost of Sales */}
                      {isCogs && (
                        <TableRow
                          data-testid={`pl-row-${profitAndLoss.inventoryAdjustmentsRowId}`}
                          data-zero={isZeroAmount(profitAndLoss.inventoryAdjustments) ? 'true' : 'false'}
                          sx={{
                            color: isZeroAmount(profitAndLoss.inventoryAdjustments) ? 'text.disabled' : undefined,
                          }}
                        >
                          <TableCell></TableCell>
                          <TableCell>Inventory Adjustments</TableCell>
                          <TableCell align="right">{formatCurrency(profitAndLoss.inventoryAdjustments)}</TableCell>
                        </TableRow>
                      )}

                      {/* Section total row */}
                      <TableRow
                        data-testid={`pl-row-${totalRowId}`}
                        data-zero={totalIsZero ? 'true' : 'false'}
                        sx={{
                          '& td': {
                            borderTop: 2,
                            borderTopColor: 'divider',
                            fontWeight: 700,
                            color: totalIsZero ? 'text.disabled' : 'text.primary',
                          },
                        }}
                      >
                        <TableCell colSpan={2}>{section.totalLabel}</TableCell>
                        <TableCell align="right">{formatCurrency(totalAmount)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>

                  {/* Gross Profit follows Cost of Sales directly (spec §4). */}
                  {isCogs && summaryRow('grossProfit', 'Gross Profit', profitAndLoss.grossProfit)}
                </Box>
              )
            })}

            {/* Net Profit closes the report. */}
            <Box sx={{ mt: 1 }}>
              {summaryRow('netProfit', 'Net Profit', profitAndLoss.netProfit)}
            </Box>
          </Box>
        </>
      )}
    </AccountingReportPrintLayout>
  )
}
