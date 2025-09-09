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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TablePagination,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  Divider,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as ConfirmIcon,
  LocalShipping as ShipIcon,
  FileCopy as DuplicateIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { fetchOrders, selectOrders, selectSalesLoading, selectSalesError, selectSalesPagination } from '@/store/slices/salesSlice'
import { salesApi } from '@/services/salesApi'
import { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import CreateOrderDialog from '@/components/sales/CreateOrderDialog'

interface OrdersPageState {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  page: number
  rowsPerPage: number
}

const OrdersPage: React.FC = () => {
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

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [viewDialog, setViewDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)

  useEffect(() => {
    loadOrders()
  }, [state.page, state.rowsPerPage, state.sortBy, state.sortOrder])

  const loadOrders = () => {
    dispatch(fetchOrders({
      page: state.page + 1,
      limit: state.rowsPerPage,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
    }))
  }

  const handleSearch = () => {
    setState(prev => ({ ...prev, page: 0 }))
    loadOrders()
  }

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>, order: SalesOrder) => {
    setAnchorEl(event.currentTarget)
    setSelectedOrder(order)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedOrder(null)
  }

  const handleViewOrder = (order: SalesOrder) => {
    setSelectedOrder(order)
    setViewDialog(true)
    handleMenuClose()
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
          await salesApi.deleteOrder(orderId)
          break
      }
      
      loadOrders()
      handleMenuClose()
    } catch (err: any) {
      console.error(`Failed to ${action} order:`, err)
    }
  }

  const handleOrderCreated = (order: SalesOrder) => {
    loadOrders()
    setCreateDialog(false)
  }


  const canPerformAction = (order: SalesOrder, action: string): boolean => {
    switch (action) {
      case 'confirm':
        return !order.shippedDate
      case 'ship':
        return !order.shippedDate
      case 'deliver':
        return order.shippedDate && !order.deliveredDate
      case 'complete':
        return order.deliveredDate !== undefined
      case 'cancel':
        return !order.shippedDate
      case 'delete':
        return !order.shippedDate
      default:
        return true
    }
  }

  if (loading && orders.length === 0) {
    return (
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>Sales Orders</Typography>
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>Sales Orders</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialog(true)}
        >
          Create Order
        </Button>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              placeholder="Search orders..."
              value={state.search}
              onChange={(e) => setState(prev => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              size="medium"
              sx={{
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
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="outlined"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              fullWidth
            >
              Search
            </Button>
          </Grid>
          <Grid item xs={12} md={3}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadOrders}
              fullWidth
            >
              Refresh
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Orders Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Order #</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Date</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell>Items</TableCell>
                <TableCell align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order: any) => (
                <TableRow key={order.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {order.orderNumber}
                    </Typography>
                    {order.isOverdue && (
                      <Chip label="Overdue" color="error" size="small" sx={{ mt: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {order.customer?.name || 'Unknown Customer'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {order.customer?.customerCode}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {formatDate(order.orderDate)}
                    </Typography>
                    {order.requiredDate && (
                      <Typography variant="caption" color="text.secondary">
                        Due: {formatDate(order.requiredDate)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium">
                      {formatCurrency(order.totalAmount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {order.items?.length || 0} items
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <IconButton
                      onClick={(e) => handleMenuOpen(e, order)}
                      size="small"
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={pagination?.total || 0}
          page={state.page}
          onPageChange={(_, newPage) => setState(prev => ({ ...prev, page: newPage }))}
          rowsPerPage={state.rowsPerPage}
          onRowsPerPageChange={(e) => setState(prev => ({ 
            ...prev, 
            rowsPerPage: parseInt(e.target.value), 
            page: 0 
          }))}
        />
      </Paper>

      {/* Action Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => handleViewOrder(selectedOrder!)}>
          <ListItemIcon><ViewIcon /></ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>
        
        {selectedOrder && canPerformAction(selectedOrder, 'confirm') && (
          <MenuItem onClick={() => handleOrderAction('confirm', selectedOrder.id)}>
            <ListItemIcon><ConfirmIcon /></ListItemIcon>
            <ListItemText>Confirm Order</ListItemText>
          </MenuItem>
        )}
        
        {selectedOrder && canPerformAction(selectedOrder, 'ship') && (
          <MenuItem onClick={() => handleOrderAction('ship', selectedOrder.id)}>
            <ListItemIcon><ShipIcon /></ListItemIcon>
            <ListItemText>Ship Order</ListItemText>
          </MenuItem>
        )}
        
        <MenuItem onClick={() => handleOrderAction('duplicate', selectedOrder?.id || '')}>
          <ListItemIcon><DuplicateIcon /></ListItemIcon>
          <ListItemText>Duplicate Order</ListItemText>
        </MenuItem>
        
        <Divider />
        
        <MenuItem onClick={() => handleViewOrder(selectedOrder!)}>
          <ListItemIcon><EditIcon /></ListItemIcon>
          <ListItemText>Edit Order</ListItemText>
        </MenuItem>
        
        {selectedOrder && canPerformAction(selectedOrder, 'cancel') && (
          <MenuItem onClick={() => handleOrderAction('cancel', selectedOrder.id)}>
            <ListItemIcon><CancelIcon /></ListItemIcon>
            <ListItemText>Cancel Order</ListItemText>
          </MenuItem>
        )}
        
        {selectedOrder && canPerformAction(selectedOrder, 'delete') && (
          <MenuItem onClick={() => handleOrderAction('delete', selectedOrder.id)}>
            <ListItemIcon><DeleteIcon /></ListItemIcon>
            <ListItemText>Delete Order</ListItemText>
          </MenuItem>
        )}
      </Menu>

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
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary">Code:</Typography>
                        <Typography>{selectedOrder.customer?.customerCode}</Typography>
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
    </Box>
  )
}

export default OrdersPage
