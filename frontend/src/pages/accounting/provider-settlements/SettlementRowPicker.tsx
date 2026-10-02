import ClearIcon from '@mui/icons-material/Clear'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

import PagePagination from '@/components/common/PagePagination'
import { TableCard } from '@/components/common/TableCard'
import { FilterSelect } from '@/components/filters/FilterSelect'
import { TABLE_STYLES } from '@/constants/tableStyles'
import {
  useGetEligibleSettlementMethodsQuery,
  useGetEligibleSettlementRowsQuery,
} from '@/store/api/accountingApi'
import type { EligibleSettlementRow } from '@/types'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import { formatCurrency } from '@/utils/formatters'

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

// Local rather than `@mui/utils`' visuallyHidden: that package is not a
// direct dependency. Same rules as StatementFigure's a11yOnlySx.
const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

const COLUMN_COUNT = 4

export default function SettlementRowPicker({
  settlementDate, settlementId, selected, onChange, enteredAmount, attentionKeys = [],
}: SettlementRowPickerProps) {
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(25)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  // #1335: a DISPLAY filter. It narrows what the table lists and nothing else:
  // `selected` is owned by the form and is never rewritten from here, so rows
  // the filter hides stay selected, totalled and validated. The label is kept
  // with the id so the choice can still be shown after its option is gone.
  const [methodFilter, setMethodFilter] = useState<{ id: string; label: string } | null>(null)

  // Every input that redefines the result set invalidates the current page:
  // staying on page 4 of the PREVIOUS query could land past the new last page
  // and render an empty table with no way for the user to tell why.
  useEffect(() => {
    setPage(1)
  }, [settlementDate, debouncedSearch, methodFilter?.id])

  // Refetch on mount: a reopened form with identical arguments would otherwise
  // serve RTK's cached rows, hiding payments recorded in another tab or by
  // another user until a browser refresh (#1296). Same-tab sales payments are
  // covered by cross-slice tag invalidation instead.
  const { data, isLoading, isError } = useGetEligibleSettlementRowsQuery({
    settlementDate, ...(settlementId ? { settlementId } : {}),
    search: debouncedSearch || undefined,
    ...(methodFilter ? { paymentMethodId: methodFilter.id } : {}),
    page, limit,
  }, { refetchOnMountOrArgChange: true })

  // The methods that have eligible rows for this date (and this draft) —
  // deliberately not narrowed by Search. Refetched on mount for the same reason
  // as the rows (#1296).
  const { data: methodsData, isLoading: methodsLoading } = useGetEligibleSettlementMethodsQuery({
    settlementDate, ...(settlementId ? { settlementId } : {}),
  }, { refetchOnMountOrArgChange: true })
  const methodOptions = useMemo(() => {
    const options = (methodsData ?? []).map((m) => ({
      value: m.id,
      label: m.deleted ? `${m.name} (deleted)` : m.isActive ? m.name : `${m.name} (inactive)`,
    }))
    // A date change can leave the chosen method with no eligible rows, dropping
    // it from the options. The choice is the user's: it stays selected and
    // listed, the table says nothing matches, and All Payment Methods is one
    // click away. It is never reset behind their back.
    if (methodFilter && !options.some((o) => o.value === methodFilter.id)) {
      options.push({ value: methodFilter.id, label: methodFilter.label })
    }
    return options
  }, [methodsData, methodFilter])

  function changeMethodFilter(value: string | null) {
    const option = methodOptions.find((o) => o.value === value)
    setMethodFilter(option ? { id: option.value, label: option.label } : null)
  }

  // #1338: clears Search and nothing else. The rows come back through the same
  // debounce as typing, and the page reset rides on the effect above. Focus
  // returns to Search because the button unmounts with the text — left alone,
  // focus would fall to the document body.
  function clearSearch() {
    setSearch('')
    searchInputRef.current?.focus()
  }

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

  const { selectedMinor, enteredMinor, differenceMinor } = selectionTotals(selected, enteredAmount)
  const money = (units: bigint | null) => (units === null ? '—' : formatCurrency(fromScaledAmount(units)))
  const methods = methodsIn(selected)
  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0
  // Shown whenever there is something to page through — not only when rows are
  // on screen. If rows are claimed elsewhere, the current page can come back
  // empty with total > 0, and hiding the footer then would strand the user.
  const showPagination = !isLoading && !isError && total > 0

  /** A single full-width body row for the loading / error / empty states. */
  const stateRow = (content: ReactNode) => (
    <TableRow>
      <TableCell colSpan={COLUMN_COUNT} align="center" sx={{ py: 4, color: 'text.secondary' }}>
        {content}
      </TableCell>
    </TableRow>
  )
  // Rows already on screen stay there while a refetch is in flight; only a
  // first load with nothing to show gets the spinner.
  const body = isLoading && !data
    ? stateRow(<CircularProgress size={28} />)
    : isError
      ? stateRow('Failed to load payments.')
      : rows.length === 0
        ? stateRow(methodFilter
          ? 'No eligible payments match the current filters.'
          : debouncedSearch
            ? 'No payments match your search.'
            : 'No eligible payments for this settlement date.')
        : null

  return (
    <Box>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ mb: 2, alignItems: { sm: 'center' } }}
      >
        <TextField
          label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          // `xs`, the filter-bar size: Search and the filter beside it form one
          // filter row and must be the same height (32px). At `small` Search
          // stood 37px against the filter's 32px.
          size="xs"
          fullWidth
          inputRef={searchInputRef}
          slotProps={{
            input: {
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={clearSearch} edge="end" aria-label="Clear search">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ maxWidth: { sm: 360 } }}
        />
        <FilterSelect
          field="settlement-payment-method"
          label="Payment Method"
          value={methodFilter?.id ?? null}
          options={methodOptions}
          onChange={changeMethodFilter}
          emptyLabel="All Payment Methods"
          minWidth={220}
          optionsLoading={methodsLoading}
        />
      </Stack>

      {methods.length > 1 && (
        <Alert severity="warning" sx={{ mb: 2 }} data-testid="mixed-methods-warning">
          A settlement can cover one provider payout. Selected:{' '}
          {methods.map((m) => `${m.paymentMethodName} (${m.count})`).join(', ')}. Create a separate
          settlement for each Payment Method.
        </Alert>
      )}

      <TableCard>
        {/* TableCard clips (overflow: hidden) to keep the header inside its
            rounded corners, so the horizontal scroll lives on this inner box.
            Pagination sits outside it and stays in view at narrow widths.
            `position: relative` makes this box the containing block of the
            rows' visually hidden Deduction labels. They are absolutely
            positioned, and without it they are laid out against the page:
            once the table is wider than the viewport they hang past its edge
            and give the whole page a horizontal scrollbar. */}
        <Box sx={{ overflowX: 'auto', position: 'relative' }}>
          <Table size={TABLE_STYLES.size} sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox" />
                <TableCell>Sales Order No</TableCell>
                <TableCell>Payment Method</TableCell>
                <TableCell align="right">Net Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {body ?? rows.map((row) => {
                const key = groupKey(row)
                return (
                  <TableRow key={key} hover>
                    <TableCell padding="checkbox">
                      <Checkbox
                        size="small"
                        checked={selectedKeys.has(key)}
                        disabled={blocked.has(key)}
                        onChange={() => toggle(row)}
                        // MUI v9 removed Checkbox `inputProps`; slotProps.input is
                        // the replacement, and it is what gives the input its name.
                        slotProps={{ input: { 'aria-label': `${row.orderNumber} ${row.paymentMethodName} ${row.netAmount}` } }}
                      />
                    </TableCell>
                    <TableCell>{row.orderNumber}</TableCell>
                    <TableCell>{row.paymentMethodName}</TableCell>
                    <TableCell align="right">
                      <SignedAmount amount={row.netAmount} negativeLabel="Deduction" testId="net-amount" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>

        {showPagination && (
          <PagePagination
            // The server echoes the effective page size in `meta.limit`; use it so
            // the footer cannot disagree with the rows actually returned (a server
            // clamp would otherwise show the wrong page count).
            total={total}
            page={page} limit={data?.meta.limit ?? limit}
            onPageChange={setPage} onLimitChange={setLimit}
          />
        )}
      </TableCard>

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

/**
 * A scale-4 API amount. Negatives render in error red with their minus sign,
 * preceded by a visually hidden label announced with the amount — the label
 * must sit inside the same cell to keep the amount's row/column relationship.
 */
function SignedAmount({
  amount, negativeLabel, testId,
}: { amount: string; negativeLabel: string; testId: string }) {
  const units = toScaledAmount(amount)
  const negative = units !== null && units < 0n
  return (
    <>
      {negative && <Box component="span" sx={visuallyHidden}>{negativeLabel}</Box>}
      <Box
        component="span"
        data-testid={testId}
        sx={{ color: negative ? 'error.main' : 'text.primary', fontVariantNumeric: 'tabular-nums' }}
      >
        {units === null ? '—' : formatCurrency(fromScaledAmount(units))}
      </Box>
    </>
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
