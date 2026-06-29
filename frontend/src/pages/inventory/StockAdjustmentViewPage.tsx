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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
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
      <Typography variant="body2" component="div" sx={{ color: 'text.primary' }}>
        {hasValue ? value : '—'}
      </Typography>
    </Box>
  )
}

export default function StockAdjustmentViewPage() {
  const theme = useTheme()
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
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
                  <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <Field label="Date" value={formatDate(adj.adjustmentDate)} />
                    <Field label="Items" value={formatNumber(adj.itemCount)} />
                    <Field label="Total Value" value={formatCurrency(adj.totalValue)} />
                  </Box>
                  {isCompleted && (
                    <AccountingEntryLink sourceType="stock_adjustment" sourceId={adj.id} variant="inline" />
                  )}
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Items</Typography>
                <TableContainer sx={{ border: `1px solid ${theme.palette.divider}` }}>
                  <Table
                    size="small"
                    sx={{
                      '& .MuiTableCell-root': {
                        border: `1px solid ${theme.palette.divider}`,
                        padding: '6px 8px',
                        fontSize: '0.875rem',
                      },
                      '& .MuiTableHead-root .MuiTableCell-root': {
                        backgroundColor: theme.palette.grey[50],
                        fontWeight: 600,
                      },
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell align="center">Current Stock</TableCell>
                        <TableCell align="center">Qty Change</TableCell>
                        <TableCell align="right">Unit Cost</TableCell>
                        <TableCell align="right">Total</TableCell>
                        <TableCell align="center">Stock After</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(adj.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.product.name}</TableCell>
                          <TableCell align="center">
                            {isCompleted ? formatNumber(item.stockBefore ?? 0) : formatNumber(item.liveStock ?? 0)}
                          </TableCell>
                          <TableCell align="center" sx={{ color: item.difference > 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>
                            {item.difference > 0 ? '+' : ''}{formatNumber(item.difference)}
                          </TableCell>
                          <TableCell align="right">{formatCurrency(item.unitCost ?? 0)}</TableCell>
                          <TableCell align="right">{formatCurrency(item.totalValue ?? 0)}</TableCell>
                          <TableCell align="center">
                            {isCompleted ? (item.stockAfter != null ? formatNumber(item.stockAfter) : '—') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Notes</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                  {adj.notes || '—'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
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
