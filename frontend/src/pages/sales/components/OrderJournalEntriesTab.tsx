import {
  Box,
  CircularProgress,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface OrderJournalEntriesTabProps {
  orderId: string
}

export default function OrderJournalEntriesTab({ orderId }: OrderJournalEntriesTabProps) {
  const { data, isLoading } = useGetJournalEntriesQuery({ sourceType: 'sales_order', sourceId: orderId })
  const entries = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (entries.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No journal entries created for this sales order.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600 } }}>
            <TableCell>Entry Number</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Debit</TableCell>
            <TableCell align="right">Credit</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => {
            const totalDebit = (entry.lines ?? []).reduce((sum: number, line: any) => sum + Number(line.debitAmount), 0)
            const totalCredit = (entry.lines ?? []).reduce((sum: number, line: any) => sum + Number(line.creditAmount), 0)

            return (
              <TableRow key={entry.id} hover>
                <TableCell>
                  <Link component={RouterLink} to={`/accounting/journal-entries/${entry.id}`}>
                    {entry.referenceNumber}
                  </Link>
                </TableCell>
                <TableCell>{formatDate(entry.entryDate)}</TableCell>
                <TableCell>{entry.description}</TableCell>
                <TableCell align="right">{formatCurrency(totalDebit)}</TableCell>
                <TableCell align="right">{formatCurrency(totalCredit)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
