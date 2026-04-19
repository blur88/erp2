import type { RefObject } from 'react'
import { Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as UndoIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  rows: OwnerEquityTransaction[]
  loading: boolean
  selectedId: string | null
  onSelect: (item: OwnerEquityTransaction) => void
  onEdit: (item: OwnerEquityTransaction) => void
  onPost: (item: OwnerEquityTransaction) => void
  onDelete: (item: OwnerEquityTransaction) => void
  onReverse: (item: OwnerEquityTransaction) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const typeLabel: Record<OwnerEquityTransaction['type'], string> = {
  capital_injection: 'Capital Injection',
  owner_drawing: 'Owner Drawing',
}

export function OwnerEquityTable({ rows, loading, selectedId, onSelect, onEdit, onPost, onDelete, onReverse, listRef }: Props) {
  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Reference #</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><Typography variant="body2" color="text.secondary">No owner equity transactions found.</Typography></TableCell></TableRow>
            ) : rows.map((row) => (
              <TableRow key={row.id} hover selected={row.id === selectedId} onClick={() => onSelect(row)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell><Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>{row.referenceNumber}</Typography></TableCell>
                <TableCell><Typography variant="body2">{formatDate(row.transactionDate)}</Typography></TableCell>
                <TableCell><Chip size="small" label={typeLabel[row.type]} color={row.type === 'capital_injection' ? 'primary' : 'warning'} /></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(Number(row.amount || 0))}</Typography></TableCell>
                <TableCell><Chip size="small" label={row.status} color={row.status === 'posted' ? 'success' : row.status === 'reversed' ? 'error' : 'default'} /></TableCell>
                <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    {row.status === 'draft' && (
                      <>
                        <Tooltip title="Edit"><span><AppButton size="small" variant="outlined" onClick={() => onEdit(row)} startIcon={<EditIcon fontSize="small" />} /></span></Tooltip>
                        <Tooltip title="Post"><span><AppButton size="small" variant="success" onClick={() => onPost(row)} startIcon={<PostIcon fontSize="small" />} /></span></Tooltip>
                        <Tooltip title="Delete"><span><AppButton size="small" variant="danger" onClick={() => onDelete(row)} startIcon={<DeleteIcon fontSize="small" />} /></span></Tooltip>
                      </>
                    )}
                    {row.status === 'posted' && (
                      <Tooltip title="Reverse"><span><AppButton size="small" variant="warning" onClick={() => onReverse(row)} startIcon={<UndoIcon fontSize="small" />} /></span></Tooltip>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
