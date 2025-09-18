import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  TablePagination,
  TextField,
  InputAdornment,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Receipt as OrderIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { fetchOrders, selectOrders, selectSalesLoading, selectSalesError, selectSalesPagination } from '@/store/slices/salesSlice'
import { salesApi } from '@/services/salesApi'
import { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import CreateOrderDialog from '@/components/sales/CreateOrderDialog'
import DeletedOrdersDialog from '@/components/sales/DeletedOrdersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface OrdersPageState {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  page: number
  rowsPerPage: number
}

const OrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const orders = useAppSelector(selectOrders) || []
  const loading = useAppSelector(selectSalesLoading)?.orders || false
  const error = useAppSelector(selectSalesError)
  const pagination = useAppSelector(selectSalesPagination)?.orders

  const [state, setState] = useState<OrdersPageState>({
    search: '',
    sortBy: 'orderDate',
    sortOrder: 'desc',
    page: 0,
    rowsPerPage: 20,
  })

  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [viewDialog, setViewDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null)
  const [orderToDeleteName, setOrderToDeleteName] = useState<string>('')

  useEffect(() => {
    loadOrders()
  }, [state.page, state.rowsPerPage, state.sortBy, state.sortOrder])

  // Auto search with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (state.search !== undefined) {
        dispatch(fetchOrders({
          page: 1,
          limit: state.rowsPerPage,
          sortBy: state.sortBy,
          sortOrder: state.sortOrder,
          search: state.search,
        }))
        setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [state.search, state.rowsPerPage, state.sortBy, state.sortOrder, dispatch])

  const loadOrders = () => {
    dispatch(fetchOrders({
      page: state.page + 1,
      limit: state.rowsPerPage,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      search: state.search,
    }))
  }

  const handleSearch = () => {
    // Search is now automatic via useEffect
    setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
  }

  // Select order when clicked
  const handleOrderSelect = (order: SalesOrder) => {
    setSelectedOrder(order)
  }


  const handleOrderAction = async (action: string, orderId: string, data?: any) => {
    try {
      switch (action) {
        case 'confirm':
          await salesApi.confirmOrder(orderId)
          break
        case 'ship':
          await salesApi.shipOrder(orderId, data || {})
          break
        case 'deliver':
          await salesApi.deliverOrder(orderId)
          break
        case 'complete':
          await salesApi.completeOrder(orderId)
          break
        case 'cancel':
          await salesApi.cancelOrder(orderId, data?.reason)
          break
        case 'duplicate':
          await salesApi.duplicateOrder(orderId)
          break
        case 'delete':
          // Show confirmation dialog instead of deleting immediately
          const order = orders.find(o => o.id === orderId)
          if (order) {
            setOrderToDelete(orderId)
            setOrderToDeleteName(order.orderNumber || order.id)
            setDeleteConfirmOpen(true)
            return // Don't proceed with deletion yet
          }
          break
      }

      loadOrders()
    } catch (err: any) {
      console.error(`Failed to ${action} order:`, err)
    }
  }

  const handleConfirmDelete = async () => {
    if (orderToDelete) {
      try {
        await salesApi.deleteOrder(orderToDelete)
        loadOrders()
        setDeleteConfirmOpen(false)
        setOrderToDelete(null)
        setOrderToDeleteName('')
      } catch (err: any) {
        console.error('Failed to delete order:', err)
      }
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setOrderToDelete(null)
    setOrderToDeleteName('')
  }

  const handleOrderCreated = (_order: SalesOrder) => {
    loadOrders()
    setCreateDialog(false)
  }

  const handleOrderUpdated = (order: SalesOrder) => {
    loadOrders()
    setEditDialog(false)
    setSelectedOrder(order) // Update selected order with new data
  }

  const handleEditOrder = () => {
    if (selectedOrder) {
      setEditDialog(true)
    }
  }



  if (loading && orders.length === 0) {
    return (
      <Box>
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
          fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
          mb: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 2
        }}>
          <OrderIcon sx={{
            fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
            color: TYPOGRAPHY_STYLES.pageHeader.icon.color
          }} />
          Sales Orders
        </Typography>
        <Paper>
          <Box sx={{ p: 3 }}>
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} height={60} sx={{ mb: 1 }} />
            ))}
          </Box>
        </Paper>
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <OrderIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales Orders
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage your sales orders and track delivery status ({orders.length} total)
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={loadOrders}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Orders" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedOrdersDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.light'
              }
            }}
          >
            {isMobile ? "View Deleted" : "View Deleted"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size="medium"
            onClick={() => setCreateDialog(true)}
            fullWidth={isMobile}
          >
            {isMobile ? "Create New Order" : "Create Order"}
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 2,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search orders..."
          value={state.search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: OrdersPageState) => ({ ...prev, search: e.target.value }))}
          onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSearch()}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 250,
            flex: isMobile ? 'none' : 1,
            maxWidth: isMobile ? 'none' : 400,
            '& .MuiOutlinedInput-root': {
              height: '40px',
              fontSize: '0.875rem',
              '& input': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: '1.25rem',
                color: 'action.active'
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Split Layout: Order List and Order Details */}
      <Grid container spacing={3}>
        {/* Left Side - Order List */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(224, 224, 224, 0.4)' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                Order List ({pagination?.total || 0})
              </Typography>
            </Box>

            {/* Order List Table */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table
                  size="small"
                  sx={{
                    '& .MuiTableCell-root': {
                      borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                      py: 0.75,
                      px: 1.5
                    }
                  }}
                >
                  <TableHead>
                    <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                        }}>
                          Order #
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        hover
                        onClick={() => handleOrderSelect(order)}
                        sx={{
                          cursor: 'pointer',
                          backgroundColor: selectedOrder?.id === order.id ? 'action.selected' : 'inherit',
                          '&:hover': {
                            backgroundColor: selectedOrder?.id === order.id ? 'action.selected' : 'action.hover'
                          },
                          transition: 'background-color 0.2s ease',
                          height: 48
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" fontWeight={400} sx={{ fontSize: '0.8rem' }}>
                            {order.orderNumber}
                          </Typography>
                          {order.isOverdue && (
                            <Chip
                              label="Overdue"
                              color="error"
                              size="small"
                              sx={{
                                mt: 0.25,
                                fontSize: '0.65rem',
                                height: 18
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Pagination */}
              <TablePagination
                component="div"
                count={pagination?.total || 0}
                page={state.page}
                onPageChange={(_: unknown, newPage: number) => setState((prev: OrdersPageState) => ({ ...prev, page: newPage }))}
                rowsPerPage={state.rowsPerPage}
                onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: OrdersPageState) => ({
                  ...prev,
                  rowsPerPage: parseInt(e.target.value),
                  page: 0
                }))}
                rowsPerPageOptions={[10, 20, 50]}
                size="small"
              />
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Order Details */}
        <Grid item xs={12} md={8}>
          {selectedOrder ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, height: 'calc(100vh - 300px)' }}>
              {/* Top Box - Customer Info, Order Date, Notes */}
              <Paper sx={{ p: 3, minHeight: '200px' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Order Details - {selectedOrder.orderNumber}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <IconButton
                      size="small"
                      color="primary"
                      title="Edit Order"
                      onClick={handleEditOrder}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      title="Delete Order"
                      onClick={() => handleOrderAction('delete', selectedOrder.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Box>

                <Grid container spacing={3}>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Customer Name
                      </Typography>
                      <Typography variant="body1" fontWeight="medium">
                        {selectedOrder.customer?.name || 'Unknown Customer'}
                      </Typography>
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Order Date
                      </Typography>
                      <Typography variant="body1">
                        {formatDate(selectedOrder.orderDate)}
                      </Typography>
                    </Box>
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                        Total Amount
                      </Typography>
                      <Typography variant="h6" color="primary">
                        {formatCurrency(selectedOrder.totalAmount)}
                      </Typography>
                    </Box>

                    {selectedOrder.requiredDate && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Required Date
                        </Typography>
                        <Typography variant="body1">
                          {formatDate(selectedOrder.requiredDate)}
                        </Typography>
                      </Box>
                    )}
                  </Grid>

                  {selectedOrder.notes && (
                    <Grid item xs={12}>
                      <Box>
                        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                          Notes
                        </Typography>
                        <Typography variant="body1">
                          {selectedOrder.notes}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Paper>

              {/* Bottom Box - Order Items */}
              <Paper sx={{ p: 3, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Order Items ({selectedOrder.items?.length || 0})
                </Typography>

                {selectedOrder.items && selectedOrder.items.length > 0 ? (
                  <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Product</TableCell>
                          <TableCell align="right">Quantity</TableCell>
                          <TableCell align="right">Unit Price</TableCell>
                          <TableCell align="right">Discount</TableCell>
                          <TableCell align="right">Total</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedOrder.items.map((item: any, index: number) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Typography variant="body2" fontWeight="medium">
                                {item.product?.name || item.productName || 'Unknown Product'}
                              </Typography>
                              {item.description && (
                                <Typography variant="caption" color="text.secondary">
                                  {item.description}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">
                                {item.quantity || 0}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">
                                {formatCurrency(item.unitPrice || 0)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2">
                                {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                              </Typography>
                              {item.discountType === 'percentage' && item.discountPercent && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  ({item.discountPercent}%)
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight="medium">
                                {formatCurrency(item.totalPrice || (item.quantity * item.unitPrice) || 0)}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info">No items in this order</Alert>
                )}
              </Paper>
            </Box>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select an order to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>


      {/* Order Details Dialog */}
      <Dialog
        open={viewDialog}
        onClose={() => setViewDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">
            Order Details - {selectedOrder?.orderNumber}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Order Information</Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary">Order Date:</Typography>
                        <Typography>{formatDate(selectedOrder.orderDate)}</Typography>
                      </Box>
                      {selectedOrder.requiredDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Required Date:</Typography>
                          <Typography>{formatDate(selectedOrder.requiredDate)}</Typography>
                        </Box>
                      )}
                      {selectedOrder.shippedDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Shipped Date:</Typography>
                          <Typography>{formatDate(selectedOrder.shippedDate)}</Typography>
                        </Box>
                      )}
                      {selectedOrder.deliveredDate && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Delivered Date:</Typography>
                          <Typography>{formatDate(selectedOrder.deliveredDate)}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Customer Information</Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary">Name:</Typography>
                        <Typography>{selectedOrder.customer?.name}</Typography>
                      </Box>
                      {selectedOrder.customer?.email && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography color="text.secondary">Email:</Typography>
                          <Typography>{selectedOrder.customer.email}</Typography>
                        </Box>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              
              {/* Order Items */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Order Items</Typography>
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Product</TableCell>
                              <TableCell>SKU/Barcode</TableCell>
                              <TableCell align="right">Quantity</TableCell>
                              <TableCell align="right">Unit Price</TableCell>
                              <TableCell align="right">Discount</TableCell>
                              <TableCell align="right">Total</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedOrder.items.map((item: any, index: number) => (
                              <TableRow key={index}>
                                <TableCell>
                                  <Typography variant="body2" fontWeight="medium">
                                    {item.product?.name || item.productName || 'Unknown Product'}
                                  </Typography>
                                  {item.description && (
                                    <Typography variant="caption" color="text.secondary">
                                      {item.description}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Typography variant="body2">
                                    {item.product?.barcode || item.product?.sku || 'N/A'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2">
                                    {item.quantity || 0}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2">
                                    {formatCurrency(item.unitPrice || 0)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2">
                                    {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                                  </Typography>
                                  {item.discountType === 'percentage' && item.discountPercent && (
                                    <Typography variant="caption" color="text.secondary">
                                      ({item.discountPercent}%)
                                    </Typography>
                                  )}
                                  {item.discountType === 'amount' && item.discountAmount && (
                                    <Typography variant="caption" color="text.secondary">
                                      (Fixed)
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" fontWeight="medium">
                                    {formatCurrency(item.totalPrice || (item.quantity * item.unitPrice) || 0)}
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Alert severity="info">No items in this order</Alert>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* Order Summary */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Order Summary</Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <Typography variant="h6">Total:</Typography>
                      <Typography variant="h6">{formatCurrency(selectedOrder.totalAmount || selectedOrder.total || 0)}</Typography>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Create Order Dialog */}
      <CreateOrderDialog
        open={createDialog}
        onClose={() => setCreateDialog(false)}
        onOrderCreated={handleOrderCreated}
      />

      {/* Edit Order Dialog */}
      {selectedOrder && (
        <CreateOrderDialog
          open={editDialog}
          onClose={() => setEditDialog(false)}
          onOrderCreated={handleOrderUpdated}
        />
      )}

      {/* Deleted Orders Dialog */}
      <DeletedOrdersDialog
        open={deletedOrdersDialogOpen}
        onClose={() => setDeletedOrdersDialogOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete order #${orderToDeleteName}? This will move it to deleted orders.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="warning"
      />
    </Box>
  )
}

export default OrdersPage
