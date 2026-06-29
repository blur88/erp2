import { useMemo, useState } from 'react'
import { Box, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams } from 'react-router-dom'

import AccountingEntryLink from '@/components/accounting/AccountingEntryLink'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetStockAdjustmentQuery, useUpdateStockAdjustmentNotesMutation } from '@/store/api/inventoryApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatNumber } from '@/utils/formatters'

export default function StockAdjustmentViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: adj, isLoading, isError } = useGetStockAdjustmentQuery(id ?? skipToken)
  const [updateNotes] = useUpdateStockAdjustmentNotesMutation()
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !adj) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Stock adjustment not found.</Typography>
      </Box>
    )
  }

  const isDraft = adj.status === 'draft'
  const isCompleted = adj.status === 'completed'

  const handleEdit = () => {
    if (isDraft) {
      navigate(`/inventory/stock-adjustments/${adj.id}/edit`)
    } else {
      setNotesDraft(adj.notes || '')
      setNotesOpen(true)
    }
  }

  const handleNotesSave = async () => {
    await updateNotes({ id: adj.id, notes: notesDraft })
    setNotesOpen(false)
  }

  const handleCloseNotes = () => {
    setNotesOpen(false)
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={adj.adjustmentNumber}
        titleBadge={<StatusChip status={adj.status} />}
        backAction={() => navigate('/inventory/stock-adjustments')}
        primaryAction={{
          label: isDraft ? 'Edit' : 'Edit Notes',
          onClick: handleEdit,
        }}
      />

      <Box sx={{ display: 'flex', gap: 2, px: 3, py: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary">
          Date: {formatDate(adj.adjustmentDate)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Items: {formatNumber(adj.itemCount)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Total Value: {formatCurrency(adj.totalValue)}
        </Typography>
        {isCompleted && (
          <AccountingEntryLink sourceType="stock_adjustment" sourceId={adj.id} variant="inline" />
        )}
      </Box>

      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell>Current Stock</TableCell>
              <TableCell>Qty Change</TableCell>
              <TableCell>Unit Cost</TableCell>
              <TableCell>Total</TableCell>
              <TableCell>Stock After</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {adj.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.product.name}</TableCell>
                <TableCell>
                  {isCompleted ? formatNumber(item.stockBefore ?? 0) : formatNumber(item.liveStock ?? 0)}
                </TableCell>
                <TableCell sx={{ color: item.difference > 0 ? 'success.main' : 'error.main' }}>
                  {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                </TableCell>
                <TableCell>{formatCurrency(item.unitCost ?? 0)}</TableCell>
                <TableCell>{formatCurrency(item.totalValue ?? 0)}</TableCell>
                <TableCell>
                  {isCompleted ? (item.stockAfter != null ? formatNumber(item.stockAfter) : '—') : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {adj.notes && (
        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Notes</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
            {adj.notes}
          </Typography>
        </Box>
      )}

      {/* Notes edit dialog for completed adjustments */}
      <Dialog open={notesOpen} onClose={handleCloseNotes} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Notes</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            rows={4}
            fullWidth
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <AppButton onClick={handleCloseNotes}>Cancel</AppButton>
          <AppButton onClick={handleNotesSave} variant="primary">Save</AppButton>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
