import type { ReactNode } from 'react'
import { useState } from 'react'
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { DataTable, type Column } from '@/components/common/DataTable/DataTable'
import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustmentItem } from '@/types'
import { useGetStockAdjustmentQuery, useRevertStockAdjustmentMutation, useUpdateStockAdjustmentNotesMutation } from '@/store/api/inventoryApi'
import { formatCurrency } from '@/utils/currency'
import { extractListQuery, listPathWithQuery, withListQuery } from '@/utils/listQuery'
import { formatDate, formatNumber } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { rtkErrorMessage } from '@/utils/errorMessage'

function Field({ label, value }: { label: string; value?: ReactNode }) {
  const hasValue = value !== null && value !== undefined && value !== ''
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography component="div" variant="body2" sx={{ color: 'text.primary' }}>
        {hasValue ? value : '—'}
      </Typography>
    </Box>
  )
}

export default function StockAdjustmentViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  // The ticket carried from the list. Edit forwards it alongside ?from=view.
  const listQuery = extractListQuery(location.search)
  const { data: adj, isLoading, isError } = useGetStockAdjustmentQuery(id ?? skipToken)
  const [updateNotes] = useUpdateStockAdjustmentNotesMutation()
  const [revertAdjustment] = useRevertStockAdjustmentMutation()
  const { showSuccess, showError } = useNotification()
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)

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
  const items = adj.items ?? []

  const itemColumns: Column<StockAdjustmentItem>[] = [
    { header: 'Product', render: (item) => item.product.name },
    {
      header: isCompleted ? 'Stock Before' : 'Current Stock',
      align: 'right',
      render: (item) => formatNumber(isCompleted ? item.stockBefore ?? 0 : item.liveStock ?? 0),
    },
    {
      header: 'Qty Change',
      align: 'right',
      render: (item) => (
        <Typography
          component="span"
          variant="body2"
          sx={{ color: item.difference > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}
        >
          {item.difference > 0 ? '+' : ''}
          {formatNumber(item.difference)}
        </Typography>
      ),
    },
    {
      header: 'Stock After',
      align: 'right',
      render: (item) =>
        isCompleted ? (item.stockAfter != null ? formatNumber(item.stockAfter) : '—') : '—',
    },
    { header: 'Unit Cost', align: 'right', render: (item) => formatCurrency(item.unitCost ?? 0) },
    { header: 'Total', align: 'right', render: (item) => formatCurrency(item.totalValue ?? 0) },
  ]

  const handleEdit = () => {
    if (isDraft) {
      navigate(withListQuery(`/inventory/stock-adjustments/${adj.id}/edit?from=view`, listQuery ? `?${listQuery}` : ''))
    } else {
      setNotesDraft(adj.notes || '')
      setNotesOpen(true)
    }
  }

  const handleNotesSave = async () => {
    try {
      await updateNotes({ id: adj.id, notes: notesDraft }).unwrap()
      setNotesOpen(false)
    } catch {
      // keep dialog open on failure; api layer surfaces the error
    }
  }

  const handleCloseNotes = () => {
    setNotesOpen(false)
  }

  const handleRevert = async () => {
    try {
      await revertAdjustment(adj.id).unwrap()
      showSuccess(`Stock adjustment ${adj.adjustmentNumber} reverted`)
      setRevertConfirmOpen(false)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to revert stock adjustment'))
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={adj.adjustmentNumber}
        titleBadge={<StatusChip status={adj.status} />}
        backAction={() => navigate(listPathWithQuery('/inventory/stock-adjustments', location.search))}
        primaryAction={{
          label: isDraft ? 'Edit' : 'Edit Notes',
          onClick: handleEdit,
        }}
        secondaryAction={isCompleted ? { label: 'Revert', onClick: () => setRevertConfirmOpen(true) } : undefined}
      />

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3} sx={{ mb: 3, alignItems: 'stretch' }}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Adjustment Info
                </Typography>
                <Field label="Adjustment Number" value={adj.adjustmentNumber} />
                <Field label="Adjustment Date" value={formatDate(adj.adjustmentDate)} />
                <Field label="Notes" value={adj.notes} />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Summary
                </Typography>
                <Field label="Status" value={<StatusChip status={adj.status} />} />
                <Field label="Item Count" value={formatNumber(adj.itemCount)} />
                <Field label="Total Value" value={formatCurrency(adj.totalValue)} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <DataTable
          columns={itemColumns}
          rows={items}
          getRowKey={(item) => item.id}
          emptyText="No items on this adjustment."
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Box sx={{ minWidth: 240 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Total Value</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(adj.totalValue)}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Revert confirmation */}
      <ConfirmationDialog
        open={revertConfirmOpen}
        title="Revert Stock Adjustment?"
        message={`Reverse stock changes for ${adj.adjustmentNumber}? This action cannot be undone.`}
        confirmText="Revert"
        onConfirm={handleRevert}
        onCancel={() => setRevertConfirmOpen(false)}
      />

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
