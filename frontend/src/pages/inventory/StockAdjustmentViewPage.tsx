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
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams } from 'react-router-dom'

import AccountingEntryLink from '@/components/accounting/AccountingEntryLink'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetStockAdjustmentQuery, useUpdateStockAdjustmentNotesMutation } from '@/store/api/inventoryApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate, formatNumber } from '@/utils/formatters'

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
  const items = adj.items ?? []

  const handleEdit = () => {
    if (isDraft) {
      navigate(`/inventory/stock-adjustments/${adj.id}/edit?from=view`)
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
                {isCompleted && (
                  <Field
                    label="Journal Entry"
                    value={<AccountingEntryLink sourceType="stock_adjustment" sourceId={adj.id} variant="inline" />}
                  />
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <TableContainer component={Paper} variant="outlined">
          <Table size={TABLE_STYLES.size}>
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600 } }}>
                <TableCell>Product</TableCell>
                <TableCell align="right">{isCompleted ? 'Stock Before' : 'Current Stock'}</TableCell>
                <TableCell align="right">Qty Change</TableCell>
                <TableCell align="right">Stock After</TableCell>
                <TableCell align="right">Unit Cost</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>{item.product.name}</TableCell>
                  <TableCell align="right">
                    {formatNumber(isCompleted ? item.stockBefore ?? 0 : item.liveStock ?? 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: item.difference > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                    {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                  </TableCell>
                  <TableCell align="right">
                    {isCompleted ? (item.stockAfter != null ? formatNumber(item.stockAfter) : '—') : '—'}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.unitCost ?? 0)}</TableCell>
                  <TableCell align="right">{formatCurrency(item.totalValue ?? 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Box sx={{ minWidth: 240 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>Total Value</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatCurrency(adj.totalValue)}</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

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
