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
  TextField,
  InputAdornment,
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  Divider,
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
  Receipt as OrderIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import {
  fetchDeletedOrders,
  restoreOrder,
  bulkRestoreOrders,
  bulkDeleteOrders,
  permanentDeleteOrder,
  selectDeletedOrders,
  selectSalesLoading,
  fetchOrders
} from '@/store/slices/salesSlice'
import { useNotification } from '@/hooks/useNotification'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface DeletedOrdersDialogProps {
  open: boolean
  onClose: () => void
}

const DeletedOrdersDialog: React.FC<DeletedOrdersDialogProps> = ({ open, onClose }) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const deletedOrders = useSelector(selectDeletedOrders) || []
  const loading = useSelector(selectSalesLoading)

  const [searchTerm, setSearchTerm] = useState('')
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set())
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<SalesOrder | null>(null)
  const [bulkRestoring, setBulkRestoring] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => {
    if (open) {
      dispatch(fetchDeletedOrders({}))
      // Reset selections when dialog opens
      setSelectedOrders(new Set())
    }
  }, [open, dispatch])

  // Filter orders based on search term
  const filteredOrders = deletedOrders.filter(order =>
    order.orderNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Calculate selection state
  const selectedCount = selectedOrders.size
  const allSelected = filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length
  const partiallySelected = selectedOrders.size > 0 && selectedOrders.size < filteredOrders.length

  const handleRestore = async (order: SalesOrder) => {
    setRestoringId(order.id)
    try {
      const result = await dispatch(restoreOrder(order.id))

      if (restoreOrder.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Order "${order.orderNumber}" restored successfully`)
      // Refresh both deleted and active orders
      dispatch(fetchDeletedOrders({}))
      dispatch(fetchOrders({}))
    } catch (error: any) {
      console.error('Order restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to restore order'
      showError(errorMessage)
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
      const result = await dispatch(bulkRestoreOrders(orderIds))

      if (bulkRestoreOrders.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      const payload = result.payload as any
      console.log('Bulk restore payload:', payload) // Debug log
      const restoredCount = payload?.restoredCount || 0
      const failedIds = payload?.failedIds || []

      if (restoredCount > 0) {
        showSuccess(`Successfully restored ${restoredCount} orders`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to restore ${failedIds.length} orders`)
      }

      // Refresh both deleted and active orders and clear selections
      dispatch(fetchDeletedOrders({}))
      dispatch(fetchOrders({}))
      setSelectedOrders(new Set())
    } catch (error: any) {
      console.error('Bulk restore error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk restore orders'
      showError(errorMessage)
    } finally {
      setBulkRestoring(false)
      setShowBulkRestoreConfirm(false)
    }
  }

  const handlePermanentDelete = async (order: SalesOrder) => {
    setDeletingId(order.id)
    try {
      const result = await dispatch(permanentDeleteOrder(order.id))

      if (permanentDeleteOrder.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      showSuccess(`Order "${order.orderNumber}" permanently deleted`)
      // No need to refresh as the Redux reducer removes it from the list
    } catch (error: any) {
      console.error('Order permanent delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to permanently delete order'
      showError(errorMessage)
    } finally {
      setDeletingId(null)
      setShowDeleteConfirm(null)
    }
  }

  const handleBulkDelete = async () => {
    setBulkDeleting(true)
    try {
      const orderIds = Array.from(selectedOrders)
      const result = await dispatch(bulkDeleteOrders(orderIds))

      if (bulkDeleteOrders.rejected.match(result)) {
        throw new Error(result.payload as string)
      }

      const payload = result.payload as any
      console.log('Bulk delete payload:', payload) // Debug log
      const deletedCount = payload?.deletedCount || 0
      const failedIds = payload?.failedIds || []

      if (deletedCount > 0) {
        showSuccess(`Successfully permanently deleted ${deletedCount} orders`)
      }

      if (failedIds.length > 0) {
        showError(`Failed to delete ${failedIds.length} orders`)
      }

      // Refresh deleted orders list and clear selections
      dispatch(fetchDeletedOrders({}))
      setSelectedOrders(new Set())
    } catch (error: any) {
      console.error('Bulk delete error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to bulk delete orders'
      showError(errorMessage)
    } finally {
      setBulkDeleting(false)
      setShowBulkDeleteConfirm(false)
    }
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
            <OrderIcon sx={{ color: 'error.main' }} />
            <Typography variant={isMobile ? "h6" : "h5"} sx={{ fontWeight: 700 }}>
              Deleted Sales Orders
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Manage soft-deleted sales orders ({filteredOrders.length} {searchTerm ? 'found' : 'total'})
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            These sales orders have been soft-deleted. You can restore them to make them active again.
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

        {loading?.deletedOrders ? (
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
                      Order Number
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '30%' : '25%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Customer
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Order Date
                      </Typography>
                    </TableCell>
                  )}
                  {!isMobile && (
                    <TableCell align="right" sx={{ width: '15%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Total Amount
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
                              {order.totalAmount && (
                                <Typography variant="caption" color="primary.main" sx={{ fontSize: '0.65rem', fontWeight: 500 }}>
                                  • {formatCurrency(order.totalAmount)}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                          {order.customer?.name || 'Unknown Customer'}
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
                            {formatCurrency(order.totalAmount)}
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
                                '&:hover': {
                                  backgroundColor: 'success.light',
                                  color: 'success.main'
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
                                '&:hover': {
                                  backgroundColor: 'error.light',
                                  color: 'error.main'
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
                            {new Date((order as any).deletedAt).toLocaleDateString('en-US', {
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
            This will restore the selected sales orders back to active status and make them available for management.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to restore <strong>{selectedCount}</strong> selected orders?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Orders to be restored:
              </Typography>
              {Array.from(selectedOrders).slice(0, 5).map(orderId => {
                const order = filteredOrders.find((o: SalesOrder) => o.id === orderId)
                return order ? (
                  <Box key={orderId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {order.orderNumber} ({order.customer?.name || 'Unknown Customer'})
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
            <strong>Warning:</strong> This action cannot be undone. The selected sales orders will be permanently deleted from the system.
          </Alert>

          <Typography variant="body1" gutterBottom>
            Are you sure you want to permanently delete <strong>{selectedCount}</strong> selected orders?
          </Typography>

          {selectedCount <= 5 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                Orders to be deleted:
              </Typography>
              {Array.from(selectedOrders).slice(0, 5).map(orderId => {
                const order = filteredOrders.find((o: SalesOrder) => o.id === orderId)
                return order ? (
                  <Box key={orderId} sx={{ mb: 0.5 }}>
                    <Typography variant="body2">
                      • {order.orderNumber} ({order.customer?.name || 'Unknown Customer'})
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
            <strong>Warning:</strong> This action cannot be undone. The sales order will be permanently deleted from the system.
          </Alert>

          {showDeleteConfirm && (
            <>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to permanently delete order <strong>{showDeleteConfirm.orderNumber}</strong>?
              </Typography>

              <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Order Details:
                </Typography>
                <Typography variant="body2">
                  • Customer: {showDeleteConfirm.customer?.name || 'Unknown Customer'}
                </Typography>
                <Typography variant="body2">
                  • Order Date: {formatDate(showDeleteConfirm.orderDate)}
                </Typography>
                <Typography variant="body2">
                  • Total Amount: {formatCurrency(showDeleteConfirm.totalAmount)}
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

export default DeletedOrdersDialog