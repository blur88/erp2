import { useParams, useNavigate, Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  Typography,
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { DataTable, type Column } from '@/components/common/DataTable'
import { useGetJournalEntryQuery } from '@/store/api/accountingApi'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import type { AccountingSourceType } from '@/types'

const SOURCE_PATHS: Record<AccountingSourceType, string | null> = {
  SALES_ORDER: '/sales/orders',
  PURCHASE_ORDER: '/purchasing/orders',
  STOCK_ADJUSTMENT: '/inventory/stock-adjustments',
  OPENING_BALANCE: null,
}

function SourceLink({
  sourceType,
  sourceDocumentId,
}: {
  sourceType: AccountingSourceType
  sourceDocumentId: string | null
}) {
  const basePath = SOURCE_PATHS[sourceType]
  const displayText = sourceType.replace(/_/g, ' ')

  if (!basePath || !sourceDocumentId) {
    return <Typography variant="body2">{displayText}</Typography>
  }

  const href =
    sourceType === 'STOCK_ADJUSTMENT'
      ? `${basePath}/${sourceDocumentId}/view`
      : `${basePath}/${sourceDocumentId}`

  return (
    <Button component={Link} to={href} variant="text" size="small" sx={{ textTransform: 'none' }}>
      {displayText}
    </Button>
  )
}

function Field({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
        {value ?? '—'}
      </Typography>
    </Box>
  )
}

// Numeric compare (not string) so any zero format ('0', '0.00', '0.0000') → em-dash.
// Non-numeric/empty (NaN) also falls through to em-dash rather than "RM NaN".
function lineCell(value: string) {
  const n = Number(value)
  return Number.isFinite(n) && n !== 0 ? formatCurrency(value) : '—'
}

export default function JournalEntryViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: entry, isFetching, error } = useGetJournalEntryQuery(id!)

  if (isFetching) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !entry) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Failed to load journal entry.</Typography>
      </Box>
    )
  }

  const statusChip = (
    <StatusChip
      status={entry.status === 'Posted' ? 'active' : 'inactive'}
      label={entry.status}
    />
  )

  const lines = entry.lines.map((line, index) => ({
    ...line,
    rowKey: `${line.accountCode}-${index}`,
  }))

  const columns: Column<(typeof lines)[number]>[] = [
    { header: 'Account Code', render: (line) => line.accountCode },
    { header: 'Account Name', render: (line) => line.accountName },
    { header: 'Debit', align: 'right', render: (line) => lineCell(line.debit) },
    { header: 'Credit', align: 'right', render: (line) => lineCell(line.credit) },
  ]

  const totals: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Total Debit', value: formatCurrency(entry.totalDebit) },
    { label: 'Total Credit', value: formatCurrency(entry.totalCredit) },
    { label: 'Difference', value: formatCurrency(entry.difference), bold: true },
  ]

  return (
    <Box>
      <PageHeader
        title={`Journal Entry ${entry.journalNo}`}
        titleBadge={statusChip}
        backAction={() => navigate('/accounting/journal-entries')}
      />

      <Grid container spacing={3} sx={{ mb: 3, alignItems: 'stretch' }}>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Entry Info
              </Typography>
              <Field label="Entry Date" value={formatDate(entry.entryDate)} />
              <Field
                label="Source Type"
                value={
                  <SourceLink
                    sourceType={entry.sourceType}
                    sourceDocumentId={entry.sourceDocumentId}
                  />
                }
              />
              <Field label="Source Reference" value={entry.sourceRef} />
              <Field label="Description" value={entry.description} />
              <Field label="Created By" value={entry.createdBy} />
              <Field label="Created At" value={formatDateTime(entry.createdAt)} />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
          <Card sx={{ flex: 1 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Summary
              </Typography>
              <Field label="Status" value={statusChip} />
              <Field label="Total Debit" value={formatCurrency(entry.totalDebit)} />
              <Field label="Total Credit" value={formatCurrency(entry.totalCredit)} />
              <Field label="Difference" value={formatCurrency(entry.difference)} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Typography variant="h6" sx={{ mb: 2 }}>
        Journal Lines
      </Typography>
      <DataTable
        columns={columns}
        rows={lines}
        getRowKey={(line) => line.rowKey}
        emptyText="No lines on this journal entry."
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Box sx={{ minWidth: 240 }}>
          {totals.map(({ label, value, bold }) => (
            <Box
              key={label}
              sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}
            >
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
