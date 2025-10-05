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
  TextField,
  InputAdornment,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Stack,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Close as CloseIcon,
  Business as BusinessIcon,
  Phone as PhoneIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material'
import { purchasingApi } from '@/services/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import { useNotification } from '@/hooks/useNotification'

interface DeletedSuppliersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const DeletedSuppliersDialog: React.FC<DeletedSuppliersDialogProps> = ({ open, onClose, onRefresh }) => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [deletedSuppliers, setDeletedSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Supplier | null>(null)
  const [selectedSuppliers, setSelectedSuppliers] = useState<Set<string>>(new Set())
  const [showBulkConfirm, setShowBulkConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [bulkRestoring, setBulkRestoring] = useState(false)

  useEffect(() => {
    if (open) {
      fetchDeletedSuppliers()
      // Reset selections when dialog opens
      setSelectedSuppliers(new Set())
    }
  }, [open])

  const fetchDeletedSuppliers = async () => {
    setLoading(true)
    try {
      const response = await purchasingApi.getDeletedSuppliers({ limit: 100 })
      const apiResponse = response as any
      setDeletedSuppliers(apiResponse.suppliers || apiResponse.data || [])
    } catch (error) {
      console.error('Error fetching deleted suppliers:', error)
      showError('Failed to fetch deleted suppliers')
    } finally {
      setLoading(false)
    }
  }

  // Filter suppliers based on search term
  const filteredSuppliers = deletedSuppliers.filter(supplier =>
    supplier.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    supplier.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedSuppliers.size
  const allSelected = filteredSuppliers.length > 0 && selectedSuppliers.size === filteredSuppliers.length
  const partiallySelected = selectedSuppliers.size > 0 && selectedSuppliers.size < filteredSuppliers.length

  const handleRestore = async (supplier: Supplier) => {
    setRestoringId(supplier.id)
    try {
      await purchasingApi.restoreSupplier(supplier.id)
      showSuccess(`Supplier "${supplier.companyName}" restored successfully`)

      // Refresh both deleted and active suppliers
      await fetchDeletedSuppliers()
      if (onRefresh) {
        onRefresh()
      }
    } catch (error: any) {
      console.error('Supplier restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore supplier'
      showError(errorMessage)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (supplier: Supplier) => {
    setDeletingId(supplier.id)
    try {
      await purchasingApi.permanentDeleteSupplier(supplier.id)
      showSuccess(`Supplier "${supplier.companyName}" permanently deleted`)
      // Refresh deleted suppliers list
      await fetchDeletedSuppliers()
    } catch (error: any) {
      console.error('Supplier permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to permanently delete supplier'
      showError(errorMessage)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  const handleSelectSupplier = (supplierId: string, checked: boolean) => {
    setSelectedSuppliers(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(supplierId)
      } else {
        newSet.delete(supplierId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSuppliers(new Set(filteredSuppliers.map(s => s.id)))
    } else {
      setSelectedSuppliers(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const supplierIds = Array.from(selectedSuppliers)
      const response = await purchasingApi.bulkRestoreSuppliers(supplierIds)

      const restoredCount = (response as any)?.data?.restoredCount || 0
      const failedIds = (response as any)?.data?.failedIds || []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} suppliers`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} suppliers`)
      }

      // Refresh both deleted and active suppliers and clear selections
      await fetchDeletedSuppliers()
      if (onRefresh) {
        onRefresh()
      }
      setSelectedSuppliers(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore suppliers'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handleBulkPermanentDelete = async () => {
    setBulkDeleting(true)
    try {
      const supplierIds = Array.from(selectedSuppliers)
      const response = await purchasingApi.bulkPermanentDeleteSuppliers(supplierIds)

      const deletedCount = (response as any)?.data?.deletedCount || 0
      const failedIds = (response as any)?.data?.failedIds || []

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} suppliers`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} suppliers`)
      }

      // Refresh deleted suppliers list and clear selections
      await fetchDeletedSuppliers()
      setSelectedSuppliers(new Set())
    } catch (error: any) {
      console.error('Bulk permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk delete suppliers'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkConfirm(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '80vh' } }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BusinessIcon sx={{ color: 'error.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Suppliers
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage soft-deleted suppliers ({filteredSuppliers.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These suppliers have been soft-deleted. You can restore them or permanently delete them from the database.
            <br />
            <strong>Warning:</strong> Permanent deletion cannot be undone!
          </Alert>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder="Search deleted suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
              sx={{ flex: 1, minWidth: '300px' }}
            />

            {selectedCount > 0 && (
              <>
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<RestoreIcon />}
                  onClick={() => setShowBulkRestoreConfirm(true)}
                  disabled={bulkRestoring || bulkDeleting}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Restore Selected ({selectedCount})
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  startIcon={<DeleteForeverIcon />}
                  onClick={() => setShowBulkConfirm(true)}
                  disabled={bulkDeleting || bulkRestoring}
                  sx={{ whiteSpace: 'nowrap' }}
                >
                  Delete Selected ({selectedCount})
                </Button>
              </>
            )}
          </Box>
        </Box>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 400 }}>
            <Table
              size="small"
              stickyHeader
              sx={{
                minWidth: isMobile ? 650 : 800,
                '& .MuiTableCell-root': {
                  borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                  py: 0.75,
                  px: 1.5
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: '48px', padding: '8px' }}>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={partiallySelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Supplier Details
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '20%' : '15%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Type
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Contact
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '25%' : '13%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredSuppliers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 5 : 6} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No deleted suppliers match your search.' : 'No deleted suppliers found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSuppliers.map((supplier) => (
                    <TableRow
                      key={supplier.id}
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .supplier-actions': {
                            opacity: 1
                          }
                        },
                        transition: 'background-color 0.2s ease',
                        cursor: 'default',
                        height: 48
                      }}
                    >
                      <TableCell sx={{ padding: '8px' }}>
                        <Checkbox
                          checked={selectedSuppliers.has(supplier.id)}
                          onChange={(e) => handleSelectSupplier(supplier.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {supplier.companyName}
                          </Typography>
                          {isMobile && supplier.contactPerson && (
                            <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                {supplier.contactPerson}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={supplier.type === SupplierType.LOCAL ? 'Local' : 'International'}
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            height: 20
                          }}
                        />
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Stack spacing={0.5}>
                            {supplier.contactPerson && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <BusinessIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{supplier.contactPerson}</Typography>
                              </Box>
                            )}
                            {supplier.phone && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>{supplier.phone}</Typography>
                              </Box>
                            )}
                          </Stack>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {supplier.deletedAt ? formatDate(supplier.deletedAt.toString()) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box
                          className="supplier-actions"
                          sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Restore Supplier">
                            <IconButton
                              onClick={() => handleRestore(supplier)}
                              disabled={restoringId === supplier.id || deletingId === supplier.id}
                              size="small"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.main'
                                },
                                p: 0.5
                              }}
                            >
                              {restoringId === supplier.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <RestoreIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete (Cannot be undone)">
                            <IconButton
                              onClick={() => setConfirmDelete(supplier)}
                              disabled={restoringId === supplier.id || deletingId === supplier.id}
                              size="small"
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.main'
                                },
                                p: 0.5
                              }}
                            >
                              <DeleteForeverIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {isMobile && supplier.deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{
                            display: 'block',
                            textAlign: 'right',
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {new Date(supplier.deletedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: '2-digit'
                            })}
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteForeverIcon color="error" />
            Permanently Delete Supplier
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The supplier will be completely removed from the database.
          </Alert>

          {confirmDelete && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete this supplier?
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {confirmDelete.companyName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Contact: {confirmDelete.contactPerson || 'N/A'}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                This will permanently remove the supplier and all related data from the database.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDelete(null)}
            variant="outlined"
            disabled={deletingId === confirmDelete?.id}
          >
            Cancel
          </Button>
          <Button
            onClick={() => confirmDelete && handlePermanentDelete(confirmDelete)}
            variant="contained"
            color="error"
            disabled={deletingId === confirmDelete?.id}
            startIcon={deletingId === confirmDelete?.id ? undefined : <DeleteForeverIcon />}
          >
            {deletingId === confirmDelete?.id ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Restore Confirmation Dialog */}
      <Dialog
        open={showBulkRestoreConfirm}
        onClose={() => !bulkRestoring && setShowBulkRestoreConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="success">
          <Box display="flex" alignItems="center" gap={1}>
            <RestoreIcon color="success" />
            Bulk Restore Suppliers
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected suppliers back to active status and make them available for use.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected suppliers?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Suppliers to be restored:
              </Typography>
              {Array.from(selectedSuppliers).slice(0, 5).map(supplierId => {
                const supplier = filteredSuppliers.find((s: Supplier) => s.id === supplierId)
                return supplier ? (
                  <Box key={supplierId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {supplier.companyName}
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected suppliers back to the active suppliers list and make them available for purchase orders.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowBulkRestoreConfirm(false)}
            variant="outlined"
            disabled={bulkRestoring}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkRestore}
            variant="contained"
            color="success"
            disabled={bulkRestoring}
            startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
          >
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Suppliers`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={showBulkConfirm}
        onClose={() => !bulkDeleting && setShowBulkConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteForeverIcon color="error" />
            Bulk Permanent Delete
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            This action cannot be undone! The selected suppliers will be completely removed from the database.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected suppliers?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Suppliers to be deleted:
              </Typography>
              {Array.from(selectedSuppliers).slice(0, 5).map(supplierId => {
                const supplier = filteredSuppliers.find((s: Supplier) => s.id === supplierId)
                return supplier ? (
                  <Box key={supplierId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {supplier.companyName}
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will permanently remove all selected suppliers and their data from the database.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowBulkConfirm(false)}
            variant="outlined"
            disabled={bulkDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkPermanentDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Suppliers`}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedSuppliersDialog
