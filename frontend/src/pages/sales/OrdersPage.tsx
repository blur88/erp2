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
  status: string
  priority: string
  sortBy: string
  sortOrder: 'ASC' | 'DESC'
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
    status: '',
    priority: '',
    sortBy: 'orderDate',
    sortOrder: 'DESC',
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
      status: state.status || undefined,
      priority: state.priority || undefined,
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

  const getStatusChip = (status: string) => {
    const statusConfig = {
      draft: { color: 'default' as const, label: 'Draft' },
      pending: { color: 'warning' as const, label: 'Pending' },
      confirmed: { color: 'info' as const, label: 'Confirmed' },
      in_progress: { color: 'primary' as const, label: 'In Progress' },
      shipped: { color: 'secondary' as const, label: 'Shipped' },
      delivered: { color: 'success' as const, label: 'Delivered' },
      completed: { color: 'success' as const, label: 'Completed' },
      cancelled: { color: 'error' as const, label: 'Cancelled' },
    }

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft
    return <Chip label={config.label} color={config.color} size="small" />
  }

  const getPriorityChip = (priority: string) => {
    const priorityConfig = {
      low: { color: 'default' as const, label: 'Low' },
      normal: { color: 'primary' as const, label: 'Normal' },
      high: { color: 'warning' as const, label: 'High' },
      urgent: { color: 'error' as const, label: 'Urgent' },
    }

    const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.normal
    return <Chip label={config.label} color={config.color} size="small" variant="outlined" />
  }

  const canPerformAction = (order: SalesOrder, action: string): boolean => {
    switch (action) {
      case 'confirm':
        return ['draft', 'pending'].includes(order.status)
      case 'ship':
        return order.status === 'confirmed'
      case 'deliver':
        return order.status === 'shipped'
      case 'complete':
        return order.status === 'delivered'
      case 'cancel':
        return !['shipped', 'delivered', 'completed', 'cancelled'].includes(order.status)
      case 'delete':
        return ['draft', 'pending'].includes(order.status)
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
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search orders..."
              value={state.search}
              onChange={(e) => setState(prev => ({ ...prev, search: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={state.status}
                onChange={(e) => setState(prev => ({ ...prev, status: e.target.value }))}
                label="Status"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="pending">Pending</MenuItem>
                <MenuItem value="confirmed">Confirmed</MenuItem>
                <MenuItem value="in_progress">In Progress</MenuItem>
                <MenuItem value="shipped">Shipped</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="completed">Completed</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select
                value={state.priority}
                onChange={(e) => setState(prev => ({ ...prev, priority: e.target.value }))}
                label="Priority"
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="low">Low</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="urgent">Urgent</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              variant="outlined"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              fullWidth
            >
              Search
            </Button>
          </Grid>
          <Grid item xs={12} md={2}>
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
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
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
                  <TableCell>{getStatusChip(order.status)}</TableCell>
                  <TableCell>{getPriorityChip(order.priority)}</TableCell>
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
                        <Typography color="text.secondary">Status:</Typography>
                        {getStatusChip(selectedOrder.status)}
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary">Priority:</Typography>
                        {getPriorityChip(selectedOrder.priority)}
                      </Box>
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
