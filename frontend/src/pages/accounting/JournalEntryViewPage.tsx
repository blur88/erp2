import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  Box,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetJournalEntryQuery } from '@/store/api/accountingApi'
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

function DetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <Grid size={{ xs: 6 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value ?? '-'}</Typography>
    </Grid>
  )
}

export default function JournalEntryViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: entry, isFetching, error } = useGetJournalEntryQuery(id!)

  if (isFetching) {
    return <Typography>Loading...</Typography>
  }

  if (error || !entry) {
    return <Typography>Failed to load journal entry.</Typography>
  }

  return (
    <Box>
      <PageHeader
        title={`Journal Entry ${entry.journalNo}`}
        titleBadge={
          <StatusChip
            status={entry.status === 'Posted' ? 'active' : 'inactive'}
            label={entry.status}
          />
        }
        backAction={() => navigate('/accounting/journal-entries')}
      />

      {/* Details Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <DetailRow label="Entry Date" value={entry.entryDate} />
          <Grid size={{ xs: 6 }}>
            <Typography variant="caption" color="text.secondary">
              Source Type
            </Typography>
            <SourceLink sourceType={entry.sourceType} sourceDocumentId={entry.sourceDocumentId} />
          </Grid>
          <DetailRow label="Source Reference" value={entry.sourceRef} />
          <DetailRow label="Description" value={entry.description} />
          <DetailRow label="Created By" value={entry.createdBy} />
          <DetailRow label="Created At" value={entry.createdAt} />
        </Grid>
      </Paper>

      {/* Lines Table Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
          Journal Lines
        </Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Account Code</TableCell>
                <TableCell>Account Name</TableCell>
                <TableCell align="right">Debit</TableCell>
                <TableCell align="right">Credit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entry.lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell>{line.accountCode}</TableCell>
                  <TableCell>{line.accountName}</TableCell>
                  <TableCell align="right">{line.debit}</TableCell>
                  <TableCell align="right">{line.credit}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Totals Section */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Grid container spacing={2} sx={{ maxWidth: 600 }}>
            <Grid size={{ xs: 4 }}>
              <Typography variant="subtitle2">Total Debit</Typography>
              <Typography variant="body2">{entry.totalDebit}</Typography>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Typography variant="subtitle2">Total Credit</Typography>
              <Typography variant="body2">{entry.totalCredit}</Typography>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <Typography variant="subtitle2">Difference</Typography>
              <Typography variant="body2">{entry.difference}</Typography>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Box>
  )
}
