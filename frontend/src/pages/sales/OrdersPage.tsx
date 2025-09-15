import React, { useState, useEffect, useCallback } from 'react'
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
  useTheme,
  useMediaQuery,
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
  ShoppingCart as OrderIcon,
  RestoreFromTrash as RestoreIcon,
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

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null)
  const [viewDialog, setViewDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)

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
        setState(prev => ({ ...prev, page: 0 }))
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
    setState(prev => ({ ...prev, page: 0 }))
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
          <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <OrderIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            Sales Orders
          </Typography>
          <Typography variant="body1" color="text.secondary">
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
            onClick={() => {/* TODO: Add view deleted orders functionality */}}
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
          onChange={(e) => setState(prev => ({ ...prev, search: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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

      {/* Orders Table */}
      <Paper>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table 
            size="small"
            sx={{ 
              minWidth: 800,
              '& .MuiTableCell-root': { 
                borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                py: 0.75,
                px: 1.5
              }
            }}
          >
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                <TableCell sx={{ width: '15%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Order #
                  </Typography>
                </TableCell>
                <TableCell sx={{ width: '25%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Customer
                  </Typography>
                </TableCell>
                <TableCell sx={{ width: '18%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Date
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Total
                  </Typography>
                </TableCell>
                <TableCell sx={{ width: '12%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Items
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ width: '15%' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                    Actions
                  </Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order: any) => (
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
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.8rem' }}>
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
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                      {order.customer?.name || 'Unknown Customer'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                      {formatDate(order.orderDate)}
                    </Typography>
                    {order.requiredDate && (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Due: {formatDate(order.requiredDate)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight="medium" sx={{ fontSize: '0.8rem' }}>
                      {formatCurrency(order.totalAmount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${order.items?.length || 0} ${(order.items?.length || 0) === 1 ? 'item' : 'items'}`}
                      size="small"
                      color={order.items?.length > 0 ? 'primary' : 'default'}
                      variant="outlined"
                      sx={{
                        fontSize: '0.7rem',
                        fontWeight: 500,
                        height: 20
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Box 
                      className="order-actions"
                      sx={{ 
                        display: 'flex', 
                        justifyContent: 'flex-end',
                        gap: 0.25,
                        opacity: 0.7,
                        transition: 'opacity 0.2s ease'
                      }}
                    >
                      <IconButton
                        onClick={(e) => handleMenuOpen(e, order)}
                        size="small"
                        sx={{
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            color: 'primary.main'
                          },
                          p: 0.5
                        }}
                      >
                        <MoreVertIcon fontSize="small" />
                      </IconButton>
                    </Box>
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
