import { Fragment, useMemo, useState, type ReactNode } from 'react'
import {
  Alert,
  Box,
  Collapse,
  IconButton,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import { Link as RouterLink } from 'react-router-dom'

import { StatusChip } from '@/components/common/StatusChip'
import type { ProviderSettlement, ProviderSettlementLine } from '@/types'
import { fromScaledAmount, sumScaledAmounts } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { isNotProviderClearingDraft } from './providerSettlementActions'

interface SettlementLineGroup {
  orderNumber: string
  method: string
  lines: ProviderSettlementLine[]
}

// Local presentational helper — OwnerEquityDetailView's equivalent is not
// exported. `component="div"` so a StatusChip (<div>) can be a value.
function Field({ label, value, testId }: {
  label: string; value: ReactNode; testId?: string
}) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography component="div" variant="body2" data-testid={testId}>{value}</Typography>
    </Stack>
  )
}

export default function ProviderSettlementDetailView({
  settlement,
}: { settlement: ProviderSettlement }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  // One row per sales order + payment method. Lines without the joined payment
  // fall back to their own key so legacy payloads still render (labels '—',
  // never the raw UUID).
  const groups = useMemo(() => {
    const out = new Map<string, SettlementLineGroup>()
    for (const l of settlement.lines ?? []) {
      const p = l.salesOrderPayment
      const key = p ? `${p.salesOrderId}:${p.paymentMethodId}` : l.salesOrderPaymentId
      const g = out.get(key) ?? {
        orderNumber: p?.salesOrder?.orderNumber ?? '—',
        method: p?.paymentMethod?.name ?? '—',
        lines: [],
      }
      g.lines.push(l)
      out.set(key, g)
    }
    return [...out.entries()]
  }, [settlement.lines])

  // Deduplicated by LABEL: legacy lines without a joined payment each fall back
  // to their own key, so several can render as the same "— · —".
  const blockedLabels = useMemo(
    () => (isNotProviderClearingDraft(settlement)
      ? [...new Set(groups.map(([, g]) => `${g.orderNumber} · ${g.method}`))]
      : []),
    [settlement, groups],
  )

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h6">{settlement.referenceNumber}</Typography>
      <Stack spacing={1}>
        <Field
          label="Date"
          value={formatDate(settlement.settlementDate)}
          testId="settlement-date"
        />
        <Field label="Provider" value={settlement.providerPaymentMethod?.name ?? '—'} />
        <Field label="Provider Reference" value={settlement.providerReference ?? '—'} />
        <Field
          label="Provider Clearing Account"
          value={settlement.clearingAccount
            ? `${settlement.clearingAccount.code} ${settlement.clearingAccount.name}` : '—'}
        />
        <Field
          label="Bank Account"
          value={settlement.bankAccount
            ? `${settlement.bankAccount.code} ${settlement.bankAccount.name}` : '—'}
        />
        <Field
          label="Settlement Amount"
          // A decimal STRING from the API. formatCurrency takes it directly;
          // fromScaledAmount takes a bigint and would be a type error here.
          value={formatCurrency(settlement.settlementAmount)}
          testId="settlement-amount"
        />
        <Field label="Status" value={<StatusChip status={settlement.status} />} />
      </Stack>

      {blockedLabels.length > 0 && (
        <Alert severity="warning" data-testid="not-provider-clearing" sx={{ mt: 2 }}>
          These payments were not recorded to a provider clearing account. Edit the draft to remove them, or discard it.
          <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
            {blockedLabels.map((label) => <li key={label}>{label}</li>)}
          </Box>
        </Alert>
      )}

      {/* Both entries are shown once reversed: the original is preserved, and
          hiding it would make the audit trail unreachable from the document. */}
      {settlement.journalEntryId && (
        <Box sx={{ mt: 2 }}>
          <Link
            component={RouterLink}
            to={`/accounting/journal-entries/${settlement.journalEntryId}`}
          >
            Journal Entry
          </Link>
        </Box>
      )}
      {settlement.reversalJournalEntryId && (
        <Box sx={{ mt: 1 }}>
          <Link
            component={RouterLink}
            to={`/accounting/journal-entries/${settlement.reversalJournalEntryId}`}
          >
            Reversing Entry
          </Link>
        </Box>
      )}

      <Table sx={{ mt: 3 }}>
        <TableHead>
          <TableRow>
            <TableCell padding="checkbox" />
            <TableCell>Sales Order No</TableCell>
            <TableCell>Payment Method</TableCell>
            <TableCell align="right">Net Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {groups.map(([key, g]) => {
            const open = expanded.has(key)
            return (
              <Fragment key={key}>
                <TableRow hover>
                  <TableCell padding="checkbox">
                    <IconButton
                      size="small"
                      aria-label={`${open ? 'Hide' : 'Show'} payments for ${g.orderNumber}`}
                      onClick={() => toggleExpanded(key)}
                    >
                      {open
                        ? <KeyboardArrowUpIcon fontSize="small" />
                        : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  <TableCell>{g.orderNumber}</TableCell>
                  <TableCell>{g.method}</TableCell>
                  <TableCell align="right" data-testid="group-net">
                    {/* Snapshot totals only — never salesOrderPayment.amount, which is live. */}
                    {formatCurrency(
                      fromScaledAmount(sumScaledAmounts(g.lines.map((l) => l.amount)) ?? 0n),
                    )}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell
                    colSpan={4}
                    sx={{ py: 0, borderBottom: open ? undefined : 'none' }}
                  >
                    <Collapse in={open} unmountOnExit>
                      <Table size="small">
                        <TableBody>
                          {g.lines.map((l) => (
                            <TableRow key={l.id}>
                              <TableCell>
                                {l.salesOrderPayment?.paymentDate
                                  ? formatDate(l.salesOrderPayment.paymentDate) : '—'}
                              </TableCell>
                              <TableCell>
                                {l.salesOrderPayment?.referenceNumber ?? '—'}
                              </TableCell>
                              <TableCell align="right">{formatCurrency(l.amount)}</TableCell>
                              <TableCell>
                                {l.releasedAt ? formatDate(l.releasedAt) : '—'}
                              </TableCell>
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
    </Box>
  )
}
