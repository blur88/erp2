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
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
  Checkbox,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Restore as RestoreIcon,
  Delete as DeleteIcon,
  Close as CloseIcon,
  Description as OrderIcon,
} from '@mui/icons-material'
import { purchasingApi } from '@/services/purchasingApi'
import type { PurchaseOrder } from '@/types'
import { useNotification } from '@/hooks/useNotification'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedPurchaseOrdersDialogProps {
  open: boolean
  onClose: () => void
  onRefresh?: () => void
}

const DeletedPurchaseOrdersDialog: React.FC<DeletedPurchaseOrdersDialogProps> = ({ open, onClose, onRefresh }) => {
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const [deletedOrders, setDeletedOrders] = useState<PurchaseOrder[]>([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<PurchaseOrder | null>(null)
  const [bulkRestoring, setBulkRestoring] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      fetchDeletedOrders()
      setSelectedOrders(new Set())
    }
  }, [open])

  const fetchDeletedOrders = async () => {
    setLoading(true)
    try {
      const response = await purchasingApi.getDeletedPurchaseOrders({ limit: 100 })
      const apiResponse = response as any
      setDeletedOrders(apiResponse.orders || apiResponse.data || [])
    } catch (error) {
      console.error('Error fetching deleted purchase orders:', error)
      showError('Failed to fetch deleted purchase orders')
    } finally {
      setLoading(false)
    }
  }

  const filteredOrders = deletedOrders.filter(order =>
    order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplier?.companyName?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const selectedCount = selectedOrders.size
  const allSelected = filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length
  const partiallySelected = selectedOrders.size > 0 && selectedOrders.size < filteredOrders.length

  const handleRestore = async (order: PurchaseOrder) => {
    setRestoringId(order.id)
    try {
      await purchasingApi.restorePurchaseOrder(order.id)
      showSuccess(`Purchase order ${order.orderNumber} restored successfully`)
      await fetchDeletedOrders()
      onRefresh?.()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to restore purchase order')
    } finally {
      setRestoringId(null)
    }
  }

  const handleSelectOrder = (orderId: string, checked: boolean) => {
    setSelectedOrders(prev => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(orderId)
      } else {
        newSet.delete(orderId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedOrders(new Set(filteredOrders.map(o => o.id)))
    } else {
      setSelectedOrders(new Set())
    }
  }

  const handleBulkRestore = async () => {
    setBulkRestoring(true)
    try {
      const orderIds = Array.from(selectedOrders)
      const response = await purchasingApi.bulkRestorePurchaseOrders(orderIds)
      const result = (response as any).data || response

      const restoredCount = result?.restoredCount || 0
      const failedIds = result?.failedIds || []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} purchase orders`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} purchase orders`)
      }

      await fetchDeletedOrders()
      onRefresh?.()
      setSelectedOrders(new Set())
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to bulk restore purchase orders')
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handlePermanentDelete = async (order: PurchaseOrder) => {
    setDeletingId(order.id)
    try {
      await purchasingApi.permanentDeletePurchaseOrder(order.id)
      showSuccess(`Purchase order ${order.orderNumber} permanently deleted`)
      await fetchDeletedOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to permanently delete purchase order')
    } finally {
      setDeletingId(null)
      setShowDeleteConfirm(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const orderIds = Array.from(selectedOrders)
      const response = await purchasingApi.bulkPermanentDeletePurchaseOrders(orderIds)
      const result = (response as any).data || response

      const deletedCount = result?.deletedCount || 0
      const failedIds = result?.failedIds || []

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} purchase orders`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} purchase orders`)
      }

      await fetchDeletedOrders()
      setSelectedOrders(new Set())
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to bulk delete purchase orders')
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteConfirm(false)
    }
  }

  const handleClose = () => {
    setSearchTerm('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{ sx: { height: '80vh' } }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <OrderIcon sx={{ color: 'error.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Purchase Orders
            </Typography>
          </Box>
          <IconButton onClick={handleClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage soft-deleted purchase orders ({filteredOrders.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These purchase orders have been soft-deleted. You can restore them to make them active again.
          </Alert>

          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              fullWidth
              placeholder="Search deleted orders..."
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
                  startIcon={<DeleteIcon />}
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  disabled={bulkRestoring || bulkDeleting}
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
                  <TableCell sx={{ width: isMobile ? '25%' : '20%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      PO Number
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '30%' : '25%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Supplier
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        PO Date
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell align="right" sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        PO Amount
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Deleted Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '45%' : '10%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isMobile ? 5 : 7} align="center" sx={{ py: 4 }}>
                      <Typography variant="body1" color="text.secondary">
                        {searchTerm ? 'No deleted orders match your search.' : 'No deleted orders found.'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => (
                    <TableRow
                      key={order.id}
                      hover
                      sx={{
                        '&:hover, &:focus-within': {
                          backgroundColor: 'action.hover',
                          '& .order-actions': {
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
                          checked={selectedOrders.has(order.id)}
                          onChange={(e) => handleSelectOrder(order.id, e.target.checked)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                            {order.orderNumber}
                          </Typography>
                          {isMobile && (
                            <Box sx={{ mt: 0.25, display: 'flex', gap: 0.5, alignItems: 'center' }}>
                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                {formatDate(order.orderDate)}
                              </Typography>
                              <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                                • {formatCurrency((order as any).totalAmount || order.total || 0)}
                              </Typography>
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {order.supplier?.companyName || 'Unknown Supplier'}
                        </Typography>
                      </TableCell>
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                            {formatDate(order.orderDate)}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }} color="primary">
                            {formatCurrency((order as any).totalAmount || order.total || 0)}
                          </Typography>
                        </TableCell>
                      )}
                      {!isMobile && (
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            {(order as any).deletedAt ? formatDate((order as any).deletedAt) : 'Unknown'}
                          </Typography>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box
                          className="order-actions"
                          sx={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: 0.25,
                            opacity: isMobile ? 1 : 0.7,
                            transition: 'opacity 0.2s ease'
                          }}
                        >
                          <Tooltip title="Restore Order">
                            <IconButton
                              onClick={() => handleRestore(order)}
                              disabled={restoringId === order.id || deletingId === order.id}
                              size="small"
                              sx={{
                                color: 'success.main',
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.dark'
                                },
                                p: 0.5
                              }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Permanently Delete Order">
                            <IconButton
                              onClick={() => setShowDeleteConfirm(order)}
                              disabled={restoringId === order.id || deletingId === order.id}
                              size="small"
                              sx={{
                                color: 'error.main',
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.dark'
                                },
                                p: 0.5
                              }}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                        {isMobile && (order as any).deletedAt && (
                          <Typography variant="caption" color="text.secondary" sx={{
                            display: 'block',
                            textAlign: 'right',
                            mt: 0.25,
                            fontSize: '0.65rem'
                          }}>
                            {formatDate((order as any).deletedAt)}
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
        <Button onClick={handleClose} variant="outlined">
          Close
        </Button>
      </DialogActions>

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
            Bulk Restore Orders
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            This will restore the selected purchase orders back to active status and make them available for management.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected orders?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Orders to be restored:
              </Typography>
              {Array.from(selectedOrders).slice(0, 5).map(orderId => {
                const order = filteredOrders.find((o: PurchaseOrder) => o.id === orderId)
                return order ? (
                  <Box key={orderId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {order.orderNumber} ({order.supplier?.companyName || 'Unknown Supplier'})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            This will move the selected orders back to the active orders list and make them available for processing.
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
            {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} Orders`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog
        open={showBulkDeleteConfirm}
        onClose={() => !bulkDeleting && setShowBulkDeleteConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            Permanent Delete Orders
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This action cannot be undone. The selected purchase orders will be permanently deleted from the system.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected orders?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Orders to be deleted:
              </Typography>
              {Array.from(selectedOrders).slice(0, 5).map(orderId => {
                const order = filteredOrders.find((o: PurchaseOrder) => o.id === orderId)
                return order ? (
                  <Box key={orderId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {order.orderNumber} ({order.supplier?.companyName || 'Unknown Supplier'})
                    </Typography>
                  </Box>
                ) : null
              })}
            </Box>
          )}

          <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
            These orders will be permanently removed from the database and cannot be recovered.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowBulkDeleteConfirm(false)}
            variant="outlined"
            disabled={bulkDeleting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleBulkDelete}
            variant="contained"
            color="error"
            disabled={bulkDeleting}
            startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} Orders`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Individual Delete Confirmation Dialog */}
      <Dialog
        open={!!showDeleteConfirm}
        onClose={() => !deletingId && setShowDeleteConfirm(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle color="error">
          <Box display="flex" alignItems="center" gap={1}>
            <DeleteIcon color="error" />
            Permanent Delete Order
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="error" sx={{ mb: 2 }}>
            <strong>Warning:</strong> This action cannot be undone. The purchase order will be permanently deleted from the system.
          </Alert>

          {showDeleteConfirm && (
            <>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete order <strong>{showDeleteConfirm.orderNumber}</strong>?
              </Typography>

              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Order Details:
                </Typography>
                <Typography variant="body2">
                  • Supplier: {showDeleteConfirm.supplier?.companyName || 'Unknown Supplier'}
                </Typography>
                <Typography variant="body2">
                  • Order Date: {formatDate(showDeleteConfirm.orderDate)}
                </Typography>
                <Typography variant="body2">
                  • Total Amount: {formatCurrency((showDeleteConfirm as any).totalAmount || showDeleteConfirm.total || 0)}
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">
                This order will be permanently removed from the database and cannot be recovered.
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowDeleteConfirm(null)}
            variant="outlined"
            disabled={!!deletingId}
          >
            Cancel
          </Button>
          <Button
            onClick={() => showDeleteConfirm && handlePermanentDelete(showDeleteConfirm)}
            variant="contained"
            color="error"
            disabled={!!deletingId}
            startIcon={deletingId ? <CircularProgress size={16} /> : <DeleteIcon />}
          >
            {deletingId ? 'Deleting...' : 'Permanently Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  )
}

export default DeletedPurchaseOrdersDialog
