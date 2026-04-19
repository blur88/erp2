import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  transfers: FundTransfer[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: FundTransfer) => void
  listRef?: RefObject<HTMLDivElement | null>
}

export function FundTransfersTable({ transfers, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>From</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>To</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : transfers.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No fund transfers found</Typography></TableCell></TableRow>
            ) : transfers.map((transfer) => (
              <TableRow key={transfer.id} hover selected={transfer.id === selectedId} onClick={() => onSelect(transfer)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>{transfer.referenceNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2">{formatDate(transfer.transferDate)}</Typography></TableCell>
                <TableCell><Typography variant="body2">{transfer.sourceAccount.name}</Typography></TableCell>
                <TableCell><Typography variant="body2">{transfer.destinationAccount.name}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(transfer.amount)}</Typography></TableCell>
                <TableCell><Chip size="small" label={transfer.status} color={transfer.status === 'ACTIVE' ? 'success' : 'error'} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
