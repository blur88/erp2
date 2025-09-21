import React, { useState, useEffect, useRef, useCallback } from 'react'
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
  Keyboard as KeyboardIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { fetchOrders, deleteOrder, selectOrders, selectSalesLoading, selectSalesError, selectSalesPagination, selectSelectedOrder, setSelectedOrder } from '@/store/slices/salesSlice'
import { salesApi } from '@/services/salesApi'
import { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import CreateOrderDialog from '@/components/sales/CreateOrderDialog'
import DeletedOrdersDialog from '@/components/sales/DeletedOrdersDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import KeyboardShortcutsHelp from '@/components/common/KeyboardShortcutsHelp'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useNotification } from '@/hooks/useNotification'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface OrdersPageState {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  page: number
  rowsPerPage: number
  fromDate: string
  toDate: string
}

const OrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const orders = useAppSelector(selectOrders) || []
  const loading = useAppSelector(selectSalesLoading)?.orders || false
  const error = useAppSelector(selectSalesError)
  const pagination = useAppSelector(selectSalesPagination)?.orders
  const selectedOrder = useAppSelector(selectSelectedOrder)

  const [state, setState] = useState<OrdersPageState>({
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc',
    page: 0,
    rowsPerPage: 20,
    fromDate: '',
    toDate: '',
  })

  const [viewDialog, setViewDialog] = useState(false)
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null)
  const [orderToDeleteName, setOrderToDeleteName] = useState<string>('')
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(null)
  const orderListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadOrders()
  }, [state.page, state.rowsPerPage, state.sortBy, state.sortOrder, state.fromDate, state.toDate])

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
          fromDate: state.fromDate || undefined,
          toDate: state.toDate || undefined,
        }))
        setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [state.search, state.rowsPerPage, state.sortBy, state.sortOrder, state.fromDate, state.toDate, dispatch])

  const loadOrders = () => {
    dispatch(fetchOrders({
      page: state.page + 1,
      limit: state.rowsPerPage,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      search: state.search,
      fromDate: state.fromDate || undefined,
      toDate: state.toDate || undefined,
    }))
  }

  const handleSearch = () => {
    // Search is now automatic via useEffect
    setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
  }

  const handleSort = (field: string) => {
    setState((prev: OrdersPageState) => {
      const newSortOrder = prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
      return {
        ...prev,
        sortBy: field,
        sortOrder: newSortOrder,
        page: 0
      }
    })
  }

  // Select order when clicked
  const handleOrderSelect = (order: SalesOrder) => {
    dispatch(setSelectedOrder(order))
    const orderIndex = orders.findIndex(o => o.id === order.id)
    setFocusedOrderIndex(orderIndex)
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
        // Use Redux deleteOrder thunk which handles the new API response
        const result = await dispatch(deleteOrder(orderToDelete))

        if (deleteOrder.fulfilled.match(result)) {
          // The Redux action automatically updates the state and selects the previous order
          showSuccess(`Order "${orderToDeleteName}" has been deleted successfully`)
        } else if (deleteOrder.rejected.match(result)) {
          const errorMessage = result.payload as string || 'Failed to delete order'
          showError(errorMessage)
        }

        setDeleteConfirmOpen(false)
        setOrderToDelete(null)
        setOrderToDeleteName('')
      } catch (err: any) {
        console.error('Failed to delete order:', err)
        const errorMessage = err?.response?.data?.message || err?.message || 'Failed to delete order'
        showError(errorMessage)
        setDeleteConfirmOpen(false)
        setOrderToDelete(null)
        setOrderToDeleteName('')
      }
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setOrderToDelete(null)
    setOrderToDeleteName('')
  }

  const handleOrderCreated = (order: SalesOrder) => {
    // Close dialog first
    setCreateDialog(false)

    // Auto-select the newly created order immediately (using the fresh data from API)
    dispatch(setSelectedOrder(order))

    // Set the pending order ID to focus on after orders reload
    setPendingOrderToSelect(order.id)

    // Reload orders to get the updated list
    loadOrders()
  }

  const handleOrderUpdated = (order: SalesOrder) => {
    loadOrders()
    setEditDialog(false)
    dispatch(setSelectedOrder(order)) // Update selected order with new data
  }

  const handleEditOrder = () => {
    if (selectedOrder) {
      setEditDialog(true)
    }
  }

  // Auto-focus first order when orders load
  useEffect(() => {
    if (orders.length > 0 && focusedOrderIndex === -1) {
      // Only auto-focus if we don't have a selected order
      if (!selectedOrder) {
        setFocusedOrderIndex(0)
        // Automatically show order details for the first order
        dispatch(setSelectedOrder(orders[0]))
      }
    }
  }, [orders, focusedOrderIndex, selectedOrder])

  // Handle pending order selection after orders load
  useEffect(() => {
    if (pendingOrderToSelect && orders.length > 0) {
      const orderIndex = orders.findIndex(o => o.id === pendingOrderToSelect)
      if (orderIndex >= 0) {
        dispatch(setSelectedOrder(orders[orderIndex]))
        setFocusedOrderIndex(orderIndex)
        setPendingOrderToSelect(null)
      }
    }
  }, [orders, pendingOrderToSelect])

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    if (focusedOrderIndex >= 0 && orderListRef.current) {
      const focusedRow = orderListRef.current.querySelector(`[data-order-index="${focusedOrderIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedOrderIndex])

  // Keyboard navigation functions
  const focusSearchInput = () => {
    const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
  }

  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      const newIndex = focusedOrderIndex - 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, orders, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < orders.length - 1) {
      const newIndex = focusedOrderIndex + 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, orders, dispatch])

  const handleNavigateToFirst = useCallback(() => {
    if (orders.length > 0) {
      setFocusedOrderIndex(0)
      dispatch(setSelectedOrder(orders[0]))
    }
  }, [orders, dispatch])

  const handleNavigateToLast = useCallback(() => {
    if (orders.length > 0) {
      const lastIndex = orders.length - 1
      setFocusedOrderIndex(lastIndex)
      dispatch(setSelectedOrder(orders[lastIndex]))
    }
  }, [orders, dispatch])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedOrderIndex - state.rowsPerPage)
    setFocusedOrderIndex(newIndex)
    if (orders[newIndex]) {
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, state.rowsPerPage, orders])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(orders.length - 1, focusedOrderIndex + state.rowsPerPage)
    setFocusedOrderIndex(newIndex)
    if (orders[newIndex]) {
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, state.rowsPerPage, orders])

  const handleEnterAction = useCallback(() => {
    if (focusedOrderIndex >= 0 && orders[focusedOrderIndex]) {
      setEditDialog(true)
    }
  }, [focusedOrderIndex, orders, dispatch])

  const handleEditAction = () => {
    if (selectedOrder) {
      setEditDialog(true)
    }
  }

  const handleDeleteAction = () => {
    if (selectedOrder) {
      handleOrderAction('delete', selectedOrder.id)
    }
  }

  const handleRefreshAction = () => {
    loadOrders()
  }

  const handleViewDeletedAction = () => {
    setDeletedOrdersDialogOpen(true)
  }

  const handleAddOrder = () => {
    setCreateDialog(true)
  }

  const handleEscapeAction = useCallback(() => {
    setFocusedOrderIndex(-1)
    dispatch(setSelectedOrder(null))
    setCreateDialog(false)
    setEditDialog(false)
    setViewDialog(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
    setKeyboardHelpOpen(false)
  }, [dispatch])

  const clearDialogs = () => {
    setCreateDialog(false)
    setEditDialog(false)
    setViewDialog(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
    setKeyboardHelpOpen(false)
  }

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onAdd: handleAddOrder,
    onRefresh: handleRefreshAction,
    onEdit: handleEditAction,
    onDelete: handleDeleteAction,
    onViewDeleted: handleViewDeletedAction,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
    onEnter: handleEnterAction,
    onPageUp: handlePageUpNavigation,
    onPageDown: handlePageDownNavigation,
    onHome: handleNavigateToFirst,
    onEnd: handleNavigateToLast,
    onEscape: handleEscapeAction,
  })



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
        gap: isMobile ? 2 : 1,
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
              height: TYPOGRAPHY_STYLES.searchField.input.height,
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
                <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label="From Date"
          type="date"
          value={state.fromDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: OrdersPageState) => ({ ...prev, fromDate: e.target.value }))}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 180,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
              '& input': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }
          }}
          InputLabelProps={{
            shrink: true,
          }}
        />
        <TextField
          label="To Date"
          type="date"
          value={state.toDate}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: OrdersPageState) => ({ ...prev, toDate: e.target.value }))}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 180,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
              '& input': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }
          }}
          InputLabelProps={{
            shrink: true,
          }}
        />
        {(state.fromDate || state.toDate) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => setState((prev: OrdersPageState) => ({ ...prev, fromDate: '', toDate: '' }))}
            sx={{
              minWidth: 'auto',
              px: 2,
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }}
          >
            Clear Dates
          </Button>
        )}
        <Button
          variant={state.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={state.sortBy === 'orderNumber' ? (state.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('orderNumber')}
          sx={{
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: '0.875rem',
            minWidth: 'auto',
            px: 2
          }}
        >
          Sort by Number
        </Button>
        <Button
          variant="outlined"
          startIcon={<KeyboardIcon />}
          size="medium"
          onClick={() => setKeyboardHelpOpen(true)}
          sx={{
            flex: 'none',
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: '0.875rem',
            color: 'info.main',
            borderColor: 'info.main',
            '&:hover': {
              borderColor: 'info.dark',
              backgroundColor: 'info.light'
            }
          }}
        >
          Shortcuts
        </Button>
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
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Order List ({pagination?.total || 0})
              </Typography>
            </Box>

            {/* Order List Table */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={orderListRef}>
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table
                  size={TABLE_STYLES.size}
                  sx={{
                    '& .MuiTableCell-root': {
                      borderBottom: TABLE_STYLES.cell.border,
                      py: TABLE_STYLES.cell.padding.py,
                      px: TABLE_STYLES.cell.padding.px
                    }
                  }}
                >
                  <TableBody>
                    {orders.map((order: any, index: number) => (
                      <TableRow
                        key={order.id}
                        hover
                        onClick={() => handleOrderSelect(order)}
                        data-order-index={index}
                        sx={{
                          cursor: 'pointer',
                          backgroundColor: selectedOrder?.id === order.id ? 'action.selected' :
                                         index === focusedOrderIndex ? 'action.focus' : 'inherit',
                          '&:hover': {
                            backgroundColor: selectedOrder?.id === order.id ? 'action.selected' : 'action.hover'
                          },
                          transition: 'background-color 0.2s ease',
                          height: TABLE_STYLES.row.height,
                          ...(index === focusedOrderIndex && {
                            outline: '2px solid',
                            outlineColor: 'primary.main',
                            outlineOffset: '-2px'
                          })
                        }}
                      >
                        <TableCell>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                            sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                            }}
                          >
                            {order.orderNumber}
                          </Typography>
                          {order.isOverdue && (
                            <Chip
                              label="Overdue"
                              color="error"
                              size="small"
                              sx={{
                                mt: 0.25,
                                fontSize: TYPOGRAPHY_STYLES.chip.extraSmall.fontSize,
                                height: TYPOGRAPHY_STYLES.chip.extraSmall.height
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
                  <Box sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.25
                  }}>
                    <IconButton
                      size="small"
                      color="primary"
                      title="Edit Order"
                      onClick={handleEditOrder}
                      sx={{
                        height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                        width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                        minHeight: 20, // Reduced minimum size for better scaling
                        minWidth: 20,
                        p: 0.125 // Reduced padding for better proportion
                      }}
                    >
                      <EditIcon sx={{
                        fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                      }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      title="Delete Order"
                      onClick={() => handleOrderAction('delete', selectedOrder.id)}
                      sx={{
                        height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                        width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                        minHeight: 20, // Reduced minimum size for better scaling
                        minWidth: 20,
                        p: 0.125 // Reduced padding for better proportion
                      }}
                    >
                      <DeleteIcon sx={{
                        fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                      }} />
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
          editOrder={selectedOrder}
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

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />
    </Box>
  )
}

export default OrdersPage
