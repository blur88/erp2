import '@/components/print/accountingReportPrint.css'
import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Box, IconButton, Typography } from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

import SimpleListPage from '@/components/common/SimpleListPage'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { useGetBalanceSheetQuery } from '@/store/api/accountingApi'
import { AccountingReportPrintLayout } from '@/components/print/AccountingReportPrintLayout'
import { buildLedgerLink, formatBalanceAmount, SECTION_LABELS } from './balanceSheetRows'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import type { BalanceSheetResponse } from '@/types'

interface BsFilters {
  year: string
}

const CURRENT_YEAR = new Date().getFullYear()

const BS_DEFAULTS: BsFilters = { year: String(CURRENT_YEAR) }

/** Mirrors the API's `@Min(1000)` on the Balance Sheet query DTO. */
const MIN_QUERYABLE_YEAR = 1000

const isZeroAmount = (amount: string | null) => amount === '0.0000'

/**
 * Owner's Equity tile: N46 + N50, null-propagating. If either leg is unknown
 * the tile shows an em dash — summing a substituted zero would assert a false
 * total.
 */
function equityTotal(n46: string | null, n50: string | null): string | null {
  if (n46 === null || n50 === null) return null
  const a = toScaledAmount(n46)
  const b = toScaledAmount(n50)
  if (a === null || b === null) return null
  return fromScaledAmount(a + b)
}

export default function BalanceSheetPage() {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  // The cycle: filterConfig needs the query's availableYears to build its
  // options; useFilterBar(filterConfig) yields the selected year; the query
  // needs that year. Broken by keeping the option set in local state fed FROM
  // each settled response, so the config depends on state, not on a hook that
  // has not run yet.
  const [yearOptions, setYearOptions] = useState<number[] | null>(null)
  // Separate from the option array, because "no options yet" and "no options
  // are coming" are different states that must drive optionsLoading differently.
  const [isYearOptionsError, setIsYearOptionsError] = useState(false)

  const filterConfig = useMemo<FilterBarConfig<BsFilters>>(
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
          // A Balance Sheet is always for some year: there is no "All years"
          // report. Offering an empty choice would store null, fall back to the
          // current year for the query, yet display "All" and light up Reset —
          // control, query, URL and filter state all disagreeing.
          showEmptyOption: false,
        },
      ],
      defaults: BS_DEFAULTS,
    }),
    [yearOptions, isYearOptionsError],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  // Validate before querying: appliedFilters.year is preserved unvalidated while
  // options are unresolved, so it can be anything the URL carried.
  const rawYear = appliedFilters.year
  const parsedYear = /^\d{4}$/.test(rawYear ?? '') ? Number(rawYear) : NaN
  // Four digits is not enough: 0000-0999 match the pattern but the API declares
  // @Min(1000), so ?year=0999 would 400 rather than fall back. The backend
  // likewise rejects future years, so clamp those too instead of issuing a
  // request that cannot succeed.
  const year =
    Number.isNaN(parsedYear) || parsedYear < MIN_QUERYABLE_YEAR || parsedYear > CURRENT_YEAR
      ? CURRENT_YEAR
      : parsedYear

  const query = useGetBalanceSheetQuery({ year })

  // currentData is the report for THIS year; data may still point at the
  // previous year's result while a refetch is in flight. The `?? data` keeps
  // mocked responses (which carry only `data`) working.
  const source = (query.currentData ?? query.data) as BalanceSheetResponse | undefined

  // Feed the options back from each settled response. Guarded on a real change
  // so it cannot loop.
  useEffect(() => {
    const available = source?.availableYears
    if (!available) return
    setIsYearOptionsError(false)
    // The year actually reported on is authoritative too, even when it holds no
    // postings and so is absent from availableYears. The API accepts any year in
    // 1000-9999 and returns an all-zero statement for one with no activity —
    // that is a valid report, not an invalid filter. Without this, useFilterBar's
    // revalidation judges e.g. ?year=1990 stale and resets it to the current
    // year, silently discarding the report the user asked for.
    const years = available.includes(source.year)
      ? available
      : [...available, source.year].sort((a, b) => b - a)
    setYearOptions((prev) =>
      prev && prev.length === years.length && prev.every((y, i) => y === years[i]) ? prev : years,
    )
  }, [source])

  // A failed query means no option set is coming; record that so the control
  // stops claiming to be loading.
  useEffect(() => {
    if (query.isError) setIsYearOptionsError(true)
  }, [query.isError])

  const toggle = (line: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }

  // Gate the body on isFetching, not just isLoading: RTK Query keeps the
  // previous year's figures available while the new year's request is in
  // flight, and showing them under the new year's heading asserts what the
  // server has not said.
  const report: BalanceSheetResponse | undefined = query.isFetching ? undefined : source

  const rowsBySection = useMemo(() => {
    const groups: { section: keyof typeof SECTION_LABELS; rows: BalanceSheetResponse['rows'] }[] = []
    if (!report) return groups
    for (const row of report.rows) {
      const last = groups[groups.length - 1]
      if (last && last.section === row.section) last.rows.push(row)
      else groups.push({ section: row.section, rows: [row] })
    }
    return groups
  }, [report])

  const summary = useMemo(() => {
    if (!report) return null
    const amountOf = (line: string) => report.rows.find((r) => r.line === line)?.amount ?? null
    return {
      assets: amountOf('N41'),
      liabilities: amountOf('N45'),
      equity: equityTotal(amountOf('N46'), amountOf('N50')),
    }
  }, [report])

  const asOfDate = report?.asOfDate ?? `${year}-12-31`
  const reportYear = report?.year ?? year

  const balanceCheck = report?.balanceCheck
  const balanceStatusText =
    balanceCheck?.status === 'balanced'
      ? 'Balanced'
      : balanceCheck?.status === 'outOfBalance'
        ? 'Out of Balance'
        : balanceCheck
          ? 'Unavailable'
          : ''

  const body = query.isFetching ? (
    <Box data-testid="bs-skeleton">
      <ListSkeleton rows={8} columns={4} />
    </Box>
  ) : report ? (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {summary && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Box data-testid="bs-summary-assets" sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">
              Total Assets
            </Typography>
            <Typography variant="h6">{formatBalanceAmount(summary.assets)}</Typography>
          </Box>
          <Box data-testid="bs-summary-liabilities" sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">
              Total Liabilities
            </Typography>
            <Typography variant="h6">{formatBalanceAmount(summary.liabilities)}</Typography>
          </Box>
          <Box data-testid="bs-summary-equity" sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary">
              Owner&apos;s Equity
            </Typography>
            <Typography variant="h6">{formatBalanceAmount(summary.equity)}</Typography>
          </Box>
        </Box>
      )}

      {rowsBySection.map((group) => (
        <Box key={group.section}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            {SECTION_LABELS[group.section]}
          </Typography>
          {group.rows.map((row) => {
            const isZero = row.amount !== null && isZeroAmount(row.amount)
            const isExpanded = expanded.has(row.line)
            return (
              <React.Fragment key={row.line}>
                <Box
                  data-testid={`bs-row-${row.line}`}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                  fontWeight: row.isTotal ? 600 : undefined,
                  color: isZero ? 'text.secondary' : undefined,
                }}
              >
                <Typography variant="body2" sx={{ minWidth: 48 }}>
                  {row.line}
                </Typography>
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {row.accounts.length > 0 && (
                    <IconButton
                      size="small"
                      data-testid={`bs-expand-${row.line}`}
                      onClick={() => toggle(row.line)}
                    >
                      {isExpanded ? (
                        <ExpandLessIcon fontSize="small" />
                      ) : (
                        <ExpandMoreIcon fontSize="small" />
                      )}
                    </IconButton>
                  )}
                  <Typography variant="body2">{row.label}</Typography>
                </Box>
                <Typography variant="body2" data-testid="bs-amount" sx={{ textAlign: 'right' }}>
                  {formatBalanceAmount(row.amount)}
                </Typography>
                </Box>
                {isExpanded && row.accounts.length > 0 && (
                  <Box
                    data-testid={`bs-accounts-${row.line}`}
                    data-print-hide="true"
                    sx={{ pl: 8, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}
                  >
                    {row.accounts.map((account) => (
                      <Link
                        key={account.accountId}
                        to={buildLedgerLink(account.accountId, reportYear, asOfDate)}
                      >
                        {account.code} {account.name}
                      </Link>
                    ))}
                  </Box>
                )}
              </React.Fragment>
            )
          })}
        </Box>
      ))}

      {report.findings.length > 0 && (
        <Box data-testid="bs-findings" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {report.findings.map((finding, idx) => (
            <Alert
              key={`${finding.code}-${idx}`}
              severity={finding.severity === 'integrity' ? 'error' : 'warning'}
            >
              <div>{finding.message}</div>
              {finding.accounts.length > 0 && (
                <div>
                  {finding.accounts.map((a) => `${a.code} ${a.name}`).join(', ')}
                </div>
              )}
            </Alert>
          ))}
        </Box>
      )}

      {balanceCheck && (
        <Box data-testid="bs-balance-check" sx={{ border: 1, borderColor: 'divider', p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Balance Check
          </Typography>
          <Typography variant="body2" data-testid="bs-balance-status">
            {balanceStatusText}
          </Typography>
          {(balanceCheck.status === 'balanced' || balanceCheck.status === 'outOfBalance') && (
            <Typography variant="body2">
              Difference{' '}
              <span data-testid="bs-difference-value">
                {formatBalanceAmount(balanceCheck.difference)}
              </span>
            </Typography>
          )}
          {balanceCheck.status === 'unavailable' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
              <Typography variant="body2">
                The Balance Check is unavailable — this report is not ready for LHDN submission.
              </Typography>
              {balanceCheck.reasons.map((reason, idx) => (
                <Box key={`${reason.code}-${idx}`}>
                  <Typography variant="body2">{reason.message}</Typography>
                  {reason.accounts.length > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {reason.accounts.map((a) => `${a.code} ${a.name}`).join(', ')}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  ) : null

  return (
    <Box data-testid="bs-print-block">
      <AccountingReportPrintLayout
        title="BALANCE SHEET"
        period={`LHDN Borang B — Part N · As at ${asOfDate}`}
      >
        <SimpleListPage
          title="Balance Sheet"
          subtitle="Financial position aligned with LHDN Borang B Part N."
          hideHeaderOnPrint
          secondaryAction={{ label: 'Print', onClick: () => window.print() }}
          filterConfig={filterConfig}
          draftFilters={draftFilters}
          handlers={handlers}
          hasActiveFilters={hasActiveFilters}
          isFetching={query.isFetching}
          error={query.isError ? 'Unable to load Balance Sheet. Please try again.' : null}
          tableSlot={body}
        />
      </AccountingReportPrintLayout>
    </Box>
  )
}
