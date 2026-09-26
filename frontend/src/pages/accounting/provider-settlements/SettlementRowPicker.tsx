import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

import PagePagination from '@/components/common/PagePagination'
import { useGetEligibleSettlementRowsQuery } from '@/store/api/accountingApi'
import type { EligibleSettlementRow } from '@/types'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { groupKey, methodsIn, selectionTotals, type SelectedRow } from './settlementSelection'

export interface SettlementRowPickerProps {
  settlementDate: string
  settlementId?: string
  selected: SelectedRow[]
  onChange: (next: SelectedRow[]) => void
  enteredAmount: string
  /** Keys held in Needs attention — rendered unticked and disabled here. */
  attentionKeys?: string[]
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

export default function SettlementRowPicker({
  settlementDate, settlementId, selected, onChange, enteredAmount, attentionKeys = [],
}: SettlementRowPickerProps) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const debouncedSearch = useDebounce(search, 300)

  // Every input that redefines the result set invalidates the current page:
  // staying on page 4 of the PREVIOUS query could land past the new last page
  // and render an empty table with no way for the user to tell why.
  useEffect(() => {
    setPage(1)
  }, [settlementDate, debouncedSearch])

  // Refetch on mount: a reopened form with identical arguments would otherwise
  // serve RTK's cached rows, hiding payments recorded in another tab or by
  // another user until a browser refresh (#1296). Same-tab sales payments are
  // covered by cross-slice tag invalidation instead.
  const { data } = useGetEligibleSettlementRowsQuery({
    settlementDate, ...(settlementId ? { settlementId } : {}),
    search: debouncedSearch || undefined, page, limit,
  }, { refetchOnMountOrArgChange: true })

  const selectedKeys = useMemo(() => new Set(selected.map(groupKey)), [selected])
  const blocked = useMemo(() => new Set(attentionKeys), [attentionKeys])

  function toggle(row: EligibleSettlementRow) {
    const key = groupKey(row)
    onChange(selectedKeys.has(key)
      ? selected.filter((s) => groupKey(s) !== key)
      : [...selected, {
          salesOrderId: row.salesOrderId, paymentMethodId: row.paymentMethodId,
          paymentMethodName: row.paymentMethodName, orderNumber: row.orderNumber, netAmount: row.netAmount,
        }])
  }
  function toggleExpanded(key: string) {
    setExpanded((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  }

  const { selectedMinor, enteredMinor, differenceMinor } = selectionTotals(selected, enteredAmount)
  const money = (units: bigint | null) => (units === null ? '—' : formatCurrency(fromScaledAmount(units)))
  const methods = methodsIn(selected)

  return (
    <Box>
      <TextField
        label="Search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 2, minWidth: 280 }}
      />

      {methods.length > 1 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="mixed-methods-warning">
          A settlement can cover one provider payout. Selected:{' '}
          {methods.map((m) => `${m.paymentMethodName} (${m.count})`).join(', ')}. Create a separate
          settlement for each Payment Method.
        </Alert>
      )}

      <Table>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell padding="checkbox" />
            <TableCell>Sales Order No</TableCell>
            <TableCell>Payment Method</TableCell>
            <TableCell align="right">Net Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(data?.data ?? []).map((row) => {
            const key = groupKey(row)
            const netMinor = toScaledAmount(row.netAmount)
            const open = expanded.has(key)
            return (
              <Fragment key={key}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={selectedKeys.has(key)}
                      disabled={blocked.has(key)}
                      onChange={() => toggle(row)}
                      // MUI v9 removed Checkbox `inputProps`; slotProps.input is
                      // the replacement, and it is what gives the input its name.
                      slotProps={{ input: { 'aria-label': `${row.orderNumber} ${row.paymentMethodName} ${row.netAmount}` } }}
                    />
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton size="small" aria-label={`${open ? 'Hide' : 'Show'} payments for ${row.orderNumber}`} onClick={() => toggleExpanded(key)}>
                      {open ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{row.orderNumber}</TableCell>
                  <TableCell>{row.paymentMethodName}</TableCell>
                  <TableCell align="right">
                    {/* A marker element, not a colour: jsdom cannot assert colour. */}
                    {netMinor !== null && netMinor < 0n && (
                      <Chip size="small" label="Deduction" data-testid="deduction-marker" sx={{ mr: 1 }} />
                    )}
                    {money(netMinor)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} sx={{ py: 0, borderBottom: open ? undefined : 'none' }}>
                    <Collapse in={open} unmountOnExit>
                      <Table size="small">
                        <TableBody>
                          {row.payments.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell>{formatDate(p.paymentDate)}</TableCell>
                              <TableCell>{p.referenceNumber ?? '—'}</TableCell>
                              <TableCell align="right">{money(toScaledAmount(p.amount))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </Fragment>
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

      {/* The data-testids sit on the VALUE, not the labelled group, so a
          content assertion cannot pass on the label text alone. */}
      <Stack
        direction="row"
        spacing={4}
        useFlexGap
        sx={{ mt: 2, flexWrap: 'wrap', justifyContent: 'flex-end' }}
      >
        <Total label="Selected" testId="selected-count" value={String(selected.length)} />
        <Total label="Selected Total" testId="selected-total" value={money(selectedMinor)} />
        <Total label="Amount Received in Bank" testId="entered-amount" value={money(enteredMinor)} />
        <Total label="Difference" testId="difference" value={money(differenceMinor)} strong />
      </Stack>
    </Box>
  )
}

function Total({
  label, testId, value, strong = false,
}: { label: string; testId: string; value: string; strong?: boolean }) {
  return (
    <Box sx={{ textAlign: 'right' }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography
        variant="body2"
        component="div"
        data-testid={testId}
        sx={{ fontWeight: strong ? 700 : 500, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </Typography>
    </Box>
  )
}
