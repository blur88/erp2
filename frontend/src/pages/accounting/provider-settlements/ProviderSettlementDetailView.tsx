import type { ReactNode } from 'react'
import {
  Box,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

import { StatusChip } from '@/components/common/StatusChip'
import type { ProviderSettlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

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
            <TableCell>Payment</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell>Released</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {(settlement.lines ?? []).map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.salesOrderPaymentId}</TableCell>
              <TableCell align="right">
                {formatCurrency(l.amount)}
              </TableCell>
              <TableCell>{l.releasedAt ? formatDate(l.releasedAt) : '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
