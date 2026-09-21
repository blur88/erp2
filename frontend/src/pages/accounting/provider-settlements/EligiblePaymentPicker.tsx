import { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Checkbox,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'

import PagePagination from '@/components/common/PagePagination'
import { useGetEligiblePaymentsQuery } from '@/store/api/accountingApi'
import type { EligiblePaymentRow } from '@/types'
import { fromScaledAmount, sumScaledAmounts, toScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'

export interface SelectedPayment {
  id: string
  amount: string // signed, scale-4, snapshot of the row
}

interface Props {
  providerPaymentMethodId: string
  settlementDate: string
  settlementId?: string
  /**
   * Selection carries the AMOUNT alongside the id, not just the id.
   *
   * The totals bar must stay correct while the viewer is on another page of
   * results, and a row selected on page 1 is not in `data` once page 2 loads.
   * Deriving the total from the rendered rows would silently drop those
   * selections from the sum — the difference would read zero while the
   * settlement was short. Selection state therefore owns everything the total
   * needs.
   */
  selected: SelectedPayment[]
  onChange: (next: SelectedPayment[]) => void
  enteredAmount: string
}

/**
 * Local debounce. SearchModal.tsx:58 keeps the same helper unexported, and
 * this is the only other caller — extracting a shared hook for two sites would
 * add a module without removing any duplication worth sharing.
 */
function useDebounce(value: string, delay: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [delay, value])

  return debouncedValue
}

export default function EligiblePaymentPicker({
  providerPaymentMethodId, settlementDate, settlementId,
  selected, onChange, enteredAmount,
}: Props) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  // Every input that redefines the result set invalidates the current page:
  // staying on page 4 of the PREVIOUS query could land past the new last page
  // and render an empty table with no way for the user to tell why.
  useEffect(() => {
    setPage(1)
  }, [providerPaymentMethodId, settlementDate, debouncedSearch])

  const { data } = useGetEligiblePaymentsQuery({
    providerPaymentMethodId, settlementDate,
    ...(settlementId ? { settlementId } : {}), // omitted entirely when creating
    search: debouncedSearch || undefined,
    page, limit,
  })

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected])

  function toggle(row: EligiblePaymentRow) {
    onChange(
      selectedIds.has(row.id)
        ? selected.filter((s) => s.id !== row.id)
        : [...selected, { id: row.id, amount: row.amount }],
    )
  }

  // bigint minor units throughout (1 unit = 0.0001).
  //
  // toScaledAmount returns `bigint | null` — null on malformed input — and
  // fromScaledAmount takes a bigint, not a string. Mixing either with a numeric
  // literal is a type error, and `String(total)` would not round-trip.
  // sumScaledAmounts returns null if ANY value is unparseable, which is what
  // makes a bad row visible instead of silently contributing zero.
  const selectedMinor = sumScaledAmounts(selected.map((s) => s.amount))
  const enteredMinor = enteredAmount.trim() === '' ? 0n : toScaledAmount(enteredAmount)

  const totalsValid = selectedMinor !== null && enteredMinor !== null
  const differenceMinor = totalsValid ? enteredMinor - selectedMinor : null

  const money = (units: bigint | null) =>
    units === null ? '—' : formatCurrency(fromScaledAmount(units))

  return (
    <Box>
      <TextField
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <Table>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Order</TableCell>
            <TableCell>Payment Date</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((row) => {
            const rowMinor = toScaledAmount(row.amount)
            const isRefund = rowMinor !== null && rowMinor < 0n
            return (
              <TableRow key={row.id} hover>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selectedIds.has(row.id)}
                    onChange={() => toggle(row)}
                    // MUI v9 removed Checkbox `inputProps`; slotProps.input is
                    // the replacement, and it is what gives the input its name.
                    slotProps={{ input: { 'aria-label': `${row.orderNumber} ${row.amount}` } }}
                  />
                </TableCell>
                <TableCell>{row.orderNumber}</TableCell>
                <TableCell>{formatDate(row.paymentDate)}</TableCell>
                <TableCell align="right">
                  {/* A marker element, not a colour: jsdom has no layout engine
                      and does not inject imported stylesheets, so a colour is
                      unassertable in the suite. */}
                  {isRefund && <Chip size="small" label="Refund" data-testid="refund-marker" />}
                  {money(rowMinor)}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <PagePagination
        // The server echoes the effective page size in `meta.limit`; use it so
        // the footer cannot disagree with the rows actually returned (a server
        // clamp would otherwise show the wrong page count).
        total={data?.meta.total ?? 0}
        page={page} limit={data?.meta.limit ?? limit}
        onPageChange={setPage} onLimitChange={setLimit}
      />

      <Stack direction="row" spacing={3}>
        <span data-testid="selected-count">{selected.length}</span>
        <span data-testid="selected-total">{money(selectedMinor)}</span>
        <span data-testid="entered-amount">{money(enteredMinor)}</span>
        <span data-testid="difference">{money(differenceMinor)}</span>
      </Stack>
    </Box>
  )
}
