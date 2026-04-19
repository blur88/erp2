import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { format } from 'date-fns'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  reconciliations: BankReconciliation[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: BankReconciliation) => void
  listRef?: RefObject<HTMLDivElement | null>
}

function statusColor(status: BankReconciliationStatus) {
  return status === BankReconciliationStatus.COMPLETED ? 'success' as const : 'warning' as const
}

export function BankReconciliationsTable({ reconciliations, loading, selectedId, onSelect, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Period</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Statement Balance</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : reconciliations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No reconciliations found</Typography>
                </TableCell>
              </TableRow>
            ) : reconciliations.map((item) => (
              <TableRow key={item.id} hover selected={item.id === selectedId} onClick={() => onSelect(item)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.account?.name ?? '—'}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{format(new Date(item.reconciliationDate), 'MMM yyyy')}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{formatCurrency(item.statementBalance)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={item.status} color={statusColor(item.status)} size="small" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
