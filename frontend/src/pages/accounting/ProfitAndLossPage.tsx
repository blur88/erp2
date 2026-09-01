import '@/components/print/accountingReportPrint.css'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'

import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { useGetProfitAndLossQuery, useGetFormBQuery } from '@/store/api/accountingApi'
import { AccountingReportPrintLayout } from '@/components/print/AccountingReportPrintLayout'
import { periodLabel } from './formBRows'
import type { ProfitAndLossResponse } from '@/types'
import ProfitAndLossAccountingView from './ProfitAndLossAccountingView'
import FormBTaxView from './FormBTaxView'

type PlView = 'accounting' | 'tax'

interface PlFilters {
  year: string
  view: string
}

const CURRENT_YEAR = new Date().getFullYear()

const PL_DEFAULTS: PlFilters = { year: String(CURRENT_YEAR), view: 'accounting' }

/**
 * Anything but the literal 'tax' is the Accounting View. An unrecognised value
 * must fall back rather than render nothing — a shared URL with a typo should
 * still show a report.
 */
const parseView = (raw: string | undefined): PlView => (raw === 'tax' ? 'tax' : 'accounting')

/** Mirrors the API's `@Min(1000)` on ProfitAndLossQueryDto. */
const MIN_QUERYABLE_YEAR = 1000

export default function ProfitAndLossPage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

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
          // A Profit & Loss is always for some year: there is no "All years"
          // report. Offering an empty choice would store null, fall back to the
          // current year for the query, yet display "All" and light up Reset —
          // control, query, URL and filter state all disagreeing.
          showEmptyOption: false,
        },
        {
          field: 'view',
          label: 'View',
          type: 'select',
          options: [
            { value: 'accounting', label: 'Accounting View' },
            { value: 'tax', label: 'Tax Filing View' },
          ],
          optionsReady: true,
          optionsLoading: false,
          showEmptyOption: false,
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
  // Four digits is not enough: 0000-0999 match the pattern but the API declares
  // @Min(1000) (profit-and-loss-query.dto.ts), so ?year=0999 would 400 rather
  // than fall back. Normalize to the current year instead of issuing a request
  // that cannot succeed.
  const year =
    Number.isNaN(parsedYear) || parsedYear < MIN_QUERYABLE_YEAR ? CURRENT_YEAR : parsedYear

  const view = parseView(appliedFilters.view)

  // Exactly one endpoint runs. `skip` is what keeps the inactive view from
  // issuing a request the user cannot see.
  const accountingQuery = useGetProfitAndLossQuery({ year }, { skip: view !== 'accounting' })
  const taxQuery = useGetFormBQuery({ year }, { skip: view !== 'tax' })
  const active = view === 'tax' ? taxQuery : accountingQuery

  // Feed the options back from each settled response. Guarded on a real change
  // so it cannot loop.
  useEffect(() => {
    const available = active.currentData?.availableYears
    if (!available) return
    setIsYearOptionsError(false)
    // The year actually reported on is authoritative too, even when it holds no
    // postings and so is absent from availableYears. The API accepts any year in
    // 1000-9999 and returns an all-zero statement for one with no activity —
    // that is a valid report, not an invalid filter. Without this, useFilterBar's
    // revalidation judges e.g. ?year=1990 stale and resets it to the current
    // year, silently discarding the report the user asked for.
    const years = available.includes((active.currentData as any).year)
      ? available
      : [...available, (active.currentData as any).year].sort((a, b) => b - a)
    setYearOptions((prev) =>
      prev && prev.length === years.length && prev.every((y, i) => y === years[i]) ? prev : years,
    )
  }, [active.currentData])

  // A failed query means no option set is coming; record that so the control
  // stops claiming to be loading.
  useEffect(() => {
    if (active.isError) setIsYearOptionsError(true)
  }, [active.isError])

  /*
   * The print layout lives HERE, once, for both views. It must not also be
   * rendered by a view body: two nested instances emit two headers and two
   * period lines onto the printed page, including two different titles.
   *
   * Title and period are therefore derived from the active view. The tax
   * view's period must carry the form-version mismatch (spec §2.1), so a
   * hardcoded `Year ${year}` would put a confident wrong year on the filed
   * sheet.
   */
  const printTitle = view === 'tax' ? 'PROFIT & LOSS — FORM B TAX VIEW' : 'PROFIT & LOSS'
  const printPeriod =
    view === 'tax' && taxQuery.currentData
      ? periodLabel(taxQuery.currentData.year, taxQuery.currentData.formVersion)
      : `Year ${year}`

  return (
    <AccountingReportPrintLayout title={printTitle} period={printPeriod}>
      <SimpleListPage
        title="Profit & Loss"
        subtitle="Annual profit or loss."
        hideHeaderOnPrint
        secondaryAction={{ label: 'Print', onClick: () => window.print() }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={active.isFetching}
        error={active.isError ? 'Unable to load Profit & Loss. Please try again.' : null}
        tableSlot={
          <>
            {view === 'accounting' ? (
              <ProfitAndLossAccountingView
                data={accountingQuery.currentData as ProfitAndLossResponse | undefined}
                year={year}
                isLoading={accountingQuery.isLoading}
                isFetching={accountingQuery.isFetching}
                isError={accountingQuery.isError}
                listRef={listRef}
                onOpenLedger={openLedger}
              />
            ) : (
              <FormBTaxView
                data={taxQuery.currentData}
                year={year}
                isLoading={taxQuery.isLoading}
                isError={taxQuery.isError}
                onOpenLedger={openLedger}
              />
            )}
          </>
        }
      />
    </AccountingReportPrintLayout>
  )
}
