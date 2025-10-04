import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Typography,
  CircularProgress,
  Chip,
  Box,
} from '@mui/material'
import { RestoreFromTrash as RestoreIcon, Close as CloseIcon } from '@mui/icons-material'
import { purchasingApi } from '@/services/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType, SupplierRating } from '@/types'
import { useNotification } from '@/hooks/useNotification'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface DeletedSuppliersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedSuppliersDialog: React.FC<DeletedSuppliersDialogProps> = ({ open, onClose }) => {
  const [deletedSuppliers, setDeletedSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const { showSuccess, showError } = useNotification()

  useEffect(() => {
    if (open) {
      fetchDeletedSuppliers()
    }
  }, [open])

  const fetchDeletedSuppliers = async () => {
    setLoading(true)
    try {
      const response = await purchasingApi.getDeletedSuppliers({ limit: 100 })
      const apiResponse = response as any
      setDeletedSuppliers(apiResponse.data || [])
    } catch (error) {
      console.error('Error fetching deleted suppliers:', error)
      showError('Failed to fetch deleted suppliers')
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = async (supplier: Supplier) => {
    try {
      await purchasingApi.restoreSupplier(supplier.id)
      showSuccess(`Supplier "${supplier.companyName}" restored successfully`)
      fetchDeletedSuppliers()
    } catch (error) {
      showError(`Failed to restore supplier: ${error}`)
    }
  }

  const getRatingChip = (rating: SupplierRating) => {
    const ratingConfig = {
      [SupplierRating.EXCELLENT]: { label: 'Excellent', color: 'success' as const },
      [SupplierRating.GOOD]: { label: 'Good', color: 'primary' as const },
      [SupplierRating.AVERAGE]: { label: 'Average', color: 'warning' as const },
      [SupplierRating.POOR]: { label: 'Poor', color: 'error' as const },
      [SupplierRating.UNRATED]: { label: 'Unrated', color: 'default' as const },
    }
    const config = ratingConfig[rating]
    return <Chip label={config.label} size="small" color={config.color} />
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6">Deleted Suppliers</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : deletedSuppliers.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              No deleted suppliers found
            </Typography>
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Supplier
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Type
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Rating
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Deleted At
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {deletedSuppliers.map((supplier) => (
                  <TableRow key={supplier.id} hover>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                        fontWeight: 400,
                        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                      }}>
                        {supplier.companyName}
                      </Typography>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}>
                        ID: {supplier.id.slice(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={supplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                        size="small"
                        variant="outlined"
                        sx={{
                          fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                          height: TYPOGRAPHY_STYLES.chip.small.height
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      {getRatingChip(supplier.rating)}
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{
                        fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize
                      }}>
                        {supplier.deletedAt ? new Date(supplier.deletedAt).toLocaleDateString() : 'N/A'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => handleRestore(supplier)}
                        title={`Restore ${supplier.companyName}`}
                        sx={{
                          color: 'primary.main',
                          '&:hover': {
                            backgroundColor: 'primary.light'
                          }
                        }}
                      >
                        <RestoreIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  )
}

export default DeletedSuppliersDialog
