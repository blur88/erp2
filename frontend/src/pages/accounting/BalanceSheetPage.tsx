import { useEffect, useMemo, useState } from 'react'
import { Alert, Box, Typography } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { useGetBalanceSheetQuery } from '@/store/api/accountingApi'
import { Statement, type StatementRow } from '@/components/accounting/Statement'
import { buildLedgerLink, formatBalanceAmount, SECTION_LABELS } from './balanceSheetRows'
import type { BalanceSheetResponse } from '@/types'

interface BsFilters {
  year: string
}

const CURRENT_YEAR = new Date().getFullYear()

const BS_DEFAULTS: BsFilters = { year: String(CURRENT_YEAR) }

/** Mirrors the API's `@Min(1000)` on the Balance Sheet query DTO. */
const MIN_QUERYABLE_YEAR = 1000

/**
 * The official row the derived subtotals are anchored AFTER (#1216). Anchored on
 * the line id, never on an array index or "last row in the section": N50 follows
 * the subtotals, so a positional anchor would silently drift if the taxonomy
 * ever gains a row.
 */
const DERIVED_TOTALS_ANCHOR_LINE = 'N49'

/**
 * The derived subtotal rows, in render order (#1212). `key` indexes
 * BalanceSheetResponse['derivedTotals'], so a renamed backend field is a type
 * error here rather than a silently missing row.
 */
const BALANCE_SHEET_AMOUNT_TOTALS = new Set([
  'TOTAL NON-CURRENT ASSETS',
  'TOTAL CURRENT ASSETS',
  'TOTAL LIABILITIES',
  "TOTAL OWNER'S EQUITY",
])

const isAmountColumnTotal = (label: string) => BALANCE_SHEET_AMOUNT_TOTALS.has(label.toUpperCase())

const DERIVED_TOTALS = [
  { testId: 'bs-derived-owners-equity', label: "TOTAL OWNER'S EQUITY", key: 'ownersEquity' },
  {
    testId: 'bs-derived-liabilities-and-equity',
    label: "TOTAL LIABILITIES AND OWNER'S EQUITY",
    key: 'liabilitiesAndEquity',
  },
] as const satisfies readonly {
  testId: string
  label: string
  key: keyof BalanceSheetResponse['derivedTotals']
}[]

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

  // currentData is the report for THIS year's arguments; `data` may still hold
  // the PREVIOUS year's result while a refetch is in flight or after one fails.
  //
  // Deliberately NO `?? query.data` fallback. That fallback defeats the guard
  // it sits next to: when a year change errors, currentData is undefined and
  // the page would silently render last year's figures under the new year's
  // heading — the "no stale figures from another year" rule, inverted. Tests
  // must mock `currentData`, the same field RTK Query populates.
  const raw = query.currentData as BalanceSheetResponse | undefined

  // Belt and braces: never render a payload whose year disagrees with the one
  // requested, and never render at all once the query has errored.
  const source = !query.isError && raw?.year === year ? raw : undefined

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
      // The SAME figure the subtotal row renders. Computing it here again
      // would reintroduce a second expression that can drift from the backend.
      equity: report.derivedTotals.ownersEquity,
    }
  }, [report])

  const asOfDate = report?.asOfDate ?? `${year}-12-31`
  const reportYear = report?.year ?? year

  /**
   * BalanceSheetResponse → StatementRow[]. Statement owns presentation; this
   * keeps the report's own rules: sections grouped by `row.section`, official
   * rows addressable by `bs-row-<line>`, expanded account links as drill-down
   * rows, and the derived presentation subtotals anchored after N49.
   */
  const statementRows = useMemo<StatementRow[]>(() => {
    if (!report) return []
    const out: StatementRow[] = []

    for (const group of rowsBySection) {
      out.push({
        id: `section-${group.section}`,
        kind: 'section',
        depth: 0,
        label: SECTION_LABELS[group.section],
        figures: [],
        testId: `bs-section-${group.section}`,
      })

      for (const row of group.rows) {
        const isExpanded = expanded.has(row.line)
        const useAmountColumn = !row.isTotal || isAmountColumnTotal(row.label)
        out.push({
          id: row.line,
          kind: row.isTotal ? 'subtotal' : 'line',
          depth: 0,
          code: row.line,
          label: row.label,
          figures: useAmountColumn ? [row.amount, null] : [null, row.amount],
          blankFigures: useAmountColumn ? [false, true] : [true, false],
          topBorderFigures: row.isTotal ? (useAmountColumn ? [true, false] : [false, true]) : [false, false],
          testId: `bs-row-${row.line}`,
          // Single-node amount hook, read by the suite as one node.
          amountHook: 'bs-amount',
          isZero: row.amount !== null && row.amount === '0.0000',
          ...(row.accounts.length > 0
            ? {
                expand: { expanded: isExpanded, onToggle: () => toggle(row.line) },
                expandTestId: `bs-expand-${row.line}`,
              }
            : {}),
        })

        /*
         * `bs-accounts-<line>` must identify ONE element — the existing suite
         * does `screen.getByTestId('bs-accounts-N37')`, which throws on
         * duplicates, and a line can have MANY contributor accounts. So the
         * group testid goes on a single leading group row and each account row
         * gets its own unique testid beneath it.
         */
        if (isExpanded && row.accounts.length > 0) {
          for (const account of row.accounts) {
            out.push({
              id: `${row.line}-${account.accountId}`,
              kind: 'line',
              depth: 2,
              code: account.code,
              label: account.name,
              figures: [account.amount ?? null],
              // Unique per account, so N contributors do not collide.
              testId: `bs-account-${row.line}-${account.accountId}`,
              href: buildLedgerLink(account.accountId, reportYear, asOfDate),
            })
          }
        }

        // Derived presentation subtotals sit between N49 and N50, anchored on
        // the LINE ID — never an array index or "last row in the section": N50
        // follows them, so a positional anchor would drift if the taxonomy
        // gained a row. They are NOT LHDN fields: no N-code, no expand, no
        // drill-down.
        if (row.line === DERIVED_TOTALS_ANCHOR_LINE) {
          for (const derived of DERIVED_TOTALS) {
            out.push({
              id: derived.testId,
              kind: 'subtotal',
              depth: 0,
              label: derived.label,
              figures: isAmountColumnTotal(derived.label)
                ? [report.derivedTotals[derived.key], null]
                : [null, report.derivedTotals[derived.key]],
              blankFigures: isAmountColumnTotal(derived.label) ? [false, true] : [true, false],
              topBorderFigures: isAmountColumnTotal(derived.label) ? [true, false] : [false, true],
              testId: derived.testId,
              // Same single-node hook as the official rows.
              amountHook: 'bs-amount',
            })
          }
        }
      }
    }

    return out
  }, [report, rowsBySection, expanded, reportYear, asOfDate])

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
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
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

      {/* Statement owns its own scroller (spec §3.1); `minHeight: 0` is what
          lets it shrink so that scroller engages. */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <Statement rows={statementRows} figureHeads={['Amount', 'Total']} label="Balance Sheet statement" />
      </Box>

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
          {/*
            All three comparison lines stay visible in EVERY status, including
            `unavailable` (#1212). An unavailable check can still carry a known
            totalAssets, and blanking a figure the server did compute hides
            usable information; only genuinely null amounts become em dashes.
            `difference` is typed null under `unavailable` by the BalanceCheck
            union, so it renders as an em dash there without a status check.
          */}
          <Typography variant="body2">
            Total Assets{' '}
            <span data-testid="bs-check-assets">
              {formatBalanceAmount(balanceCheck.totalAssets)}
            </span>
          </Typography>
          <Typography variant="body2">
            Total Liabilities and Owner&apos;s Equity{' '}
            <span data-testid="bs-check-liabilities-equity">
              {formatBalanceAmount(balanceCheck.totalLiabilitiesAndEquity)}
            </span>
          </Typography>
          <Typography variant="body2">
            Difference{' '}
            <span data-testid="bs-difference-value">
              {formatBalanceAmount(balanceCheck.difference)}
            </span>
          </Typography>
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
    <SimpleListPage
      title="Balance Sheet"
      subtitle="Financial position aligned with LHDN Borang B Part N."
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      isFetching={query.isFetching}
      error={query.isError ? 'Unable to load Balance Sheet. Please try again.' : null}
      tableSlot={body}
    />
  )
}
