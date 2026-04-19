import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  settlements: Settlement[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: Settlement) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const statusColor = (status: Settlement['status']) => status === 'completed' ? 'success' : status === 'cancelled' ? 'error' : 'default'

export function SettlementsTable({ settlements, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Settlement #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Payment Method</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Total</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : settlements.length === 0 ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No settlements found</Typography></TableCell></TableRow>
            ) : settlements.map((item) => (
              <TableRow key={item.id} hover selected={item.id === selectedId} onClick={() => onSelect(item)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>{item.settlementNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2">{item.paymentMethod?.name || '-'}</Typography></TableCell>
                <TableCell><Typography variant="body2">{formatDate(item.settlementDate)}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(Number(item.totalAmount || 0))}</Typography></TableCell>
                <TableCell><Chip size="small" color={statusColor(item.status) as any} label={item.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
