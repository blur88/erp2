import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Menu,
  ListSubheader,
  Divider,
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
import { fetchOrders, deleteOrder, selectOrders, selectSalesLoading, selectSalesError, selectSalesPagination, selectSelectedOrder, selectOrderFilters, setSelectedOrder, setOrderFilters, updateOrderInPlace } from '@/store/slices/salesSlice'
import { fetchCustomers } from '@/store/slices/customerSlice'
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
  page: number
  rowsPerPage: number
}

// Memoized Order Row Component to prevent unnecessary re-renders
interface OrderRowProps {
  order: any
  index: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: any) => void
}

const OrderRow = memo(({ order, index, selectedOrderId, focusedOrderIndex, onOrderSelect }: OrderRowProps) => {
  const isSelected = selectedOrderId === order.id
  const isFocused = index === focusedOrderIndex

  return (
    <TableRow
      key={order.id}
      hover
      onClick={() => onOrderSelect(order)}
      data-order-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover'
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
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
  )
})

OrderRow.displayName = 'OrderRow'

const OrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const orders = useAppSelector(selectOrders) || []
  const customers = useAppSelector((state: any) => state.customers.customers) || []

  const loading = useAppSelector(selectSalesLoading)?.orders || false
  const error = useAppSelector(selectSalesError)
  const pagination = useAppSelector(selectSalesPagination)?.orders
  const selectedOrder = useAppSelector(selectSelectedOrder)
  const orderFilters = useAppSelector(selectOrderFilters) || {
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
    customerId: '',
  }

  const [state, setState] = useState<OrdersPageState>({
    page: 0,
    rowsPerPage: 20,
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
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Memoize search change callback to prevent unnecessary re-renders
  const onSearchChange = useCallback((searchTerm: string) => {
    dispatch(setOrderFilters({ search: searchTerm }))
  }, [dispatch])

  // Search and filter functionality
  const { searchTerm, setSearchTerm: originalSetSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: orderFilters.search,
    onSearchChange,
    searchInputRef,
  })

  // Enhanced search term setter that preserves focus
  const setSearchTerm = useCallback((value: string) => {
    setShouldPreserveSearchFocus(true)
    originalSetSearchTerm(value)
  }, [originalSetSearchTerm])

  // Effect to restore search input focus when needed
  useEffect(() => {
    if (shouldPreserveSearchFocus && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
        setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    } else if (shouldPreserveSearchFocus) {
      setShouldPreserveSearchFocus(false)
    }
  }, [shouldPreserveSearchFocus, loading])


  // Memoize loadOrders function to prevent unnecessary re-renders
  const loadOrders = useCallback(() => {
    const dateRange = getDateRange(orderFilters.dateFilter)
    dispatch(fetchOrders({
      page: state.page + 1,
      limit: state.rowsPerPage,
      sortBy: orderFilters.sortBy,
      sortOrder: orderFilters.sortOrder,
      search: orderFilters.search,
      customerId: orderFilters.customerId || undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    }))
  }, [dispatch, state.page, state.rowsPerPage, orderFilters.sortBy, orderFilters.sortOrder, orderFilters.dateFilter, orderFilters.customFromDate, orderFilters.customToDate, orderFilters.customerId, orderFilters.search])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Fetch customers on component mount - memoized to prevent re-fetching
  useEffect(() => {
    dispatch(fetchCustomers({ limit: 1000 })) // Get all customers for dropdown
  }, [dispatch])

  // Helper function to calculate date ranges - memoized for performance
  const getDateRange = useCallback((filter: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)

    const formatDate = (date: Date) => date.toISOString().split('T')[0]

    switch (filter) {
      case 'today':
        return { fromDate: formatDate(today), toDate: formatDate(today) }
      case 'yesterday':
        return { fromDate: formatDate(yesterday), toDate: formatDate(yesterday) }
      case 'this_week':
        return { fromDate: formatDate(startOfWeek), toDate: formatDate(today) }
      case 'this_month':
        return { fromDate: formatDate(startOfMonth), toDate: formatDate(today) }
      case 'this_year':
        return { fromDate: formatDate(startOfYear), toDate: formatDate(today) }
      case 'custom':
        return { fromDate: orderFilters.customFromDate, toDate: orderFilters.customToDate }
      default: // 'all'
        return { fromDate: undefined, toDate: undefined }
    }
  }, [orderFilters.customFromDate, orderFilters.customToDate])


  const handleSort = useCallback((field: string) => {
    const newSortOrder = orderFilters.sortBy === field && orderFilters.sortOrder === 'desc' ? 'asc' : 'desc'
    dispatch(setOrderFilters({
      sortBy: field,
      sortOrder: newSortOrder
    }))
    setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
  }, [dispatch, orderFilters.sortBy, orderFilters.sortOrder])

  // Select order when clicked - memoized to prevent re-renders
  const handleOrderSelect = useCallback((order: SalesOrder) => {
    dispatch(setSelectedOrder(order))
    const orderIndex = orders.findIndex(o => o.id === order.id)
    setFocusedOrderIndex(orderIndex)
  }, [dispatch, orders])


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

  const handleOrderUpdated = async (order: SalesOrder) => {
    // Close the dialog first
    setEditDialog(false)

    // Update the Redux state immediately with the updated order
    // This automatically updates both the orders list and selected order
    dispatch(updateOrderInPlace(order))
  }

  const handleEditOrder = () => {
    if (selectedOrder) {
      setEditDialog(true)
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedOrder) return

    // Auto-fill behavior: if payment field is blank, use the remaining balance
    const paymentAmountToUse = paymentAmount || (selectedOrder.totalAmount - (selectedOrder.paidAmount || 0)).toString()

    if (!paymentAmountToUse || parseFloat(paymentAmountToUse) <= 0) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: parseFloat(paymentAmountToUse) }),
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        setPaymentAmount('')
        showSuccess(`Payment of ${formatCurrency(parseFloat(paymentAmountToUse))} recorded successfully`)
      } else {
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to record payment'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error recording payment:', error)
      showError('Error recording payment. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayOrder = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Payment cleared successfully')
      } else {
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to clear payment'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error unpaying order:', error)
      showError('Error clearing payment. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleFulfillOrder = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/fulfill-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order fulfilled successfully')
      } else {
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to fulfill order'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error fulfilling order:', error)
      showError('Error fulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnfulfillOrder = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order unfulfilled successfully - inventory restored')
      } else {
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to unfulfill order'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error unfulfilling order:', error)
      showError('Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-focus first order when orders load (only if search input is not focused)
  useEffect(() => {
    if (orders.length > 0 && focusedOrderIndex === -1) {
      // Only auto-focus if we don't have a selected order AND search input is not focused
      if (!selectedOrder && searchInputRef.current !== document.activeElement) {
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



  // Don't conditionally render the entire component during loading to preserve search input focus

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
          inputRef={searchInputRef}
          placeholder="Search orders..."
          value={searchTerm}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
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
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 180,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Date Filter</InputLabel>
          <Select
            value={orderFilters.dateFilter}
            label="Date Filter"
            onChange={(e) => {
              dispatch(setOrderFilters({ dateFilter: e.target.value }))
              setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
            }}
            sx={{
              fontSize: '0.875rem',
              '& .MuiSelect-select': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  '& .MuiMenuItem-root': {
                    fontSize: '0.875rem'
                  }
                }
              }
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="today">Today</MenuItem>
            <MenuItem value="yesterday">Yesterday</MenuItem>
            <MenuItem value="this_week">This Week</MenuItem>
            <MenuItem value="this_month">This Month</MenuItem>
            <MenuItem value="this_year">This Year</MenuItem>
            <Divider />
            <MenuItem value="custom">Custom Date Range</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 200,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Customer</InputLabel>
          <Select
            value={orderFilters.customerId}
            label="Customer"
            onChange={(e) => {
              dispatch(setOrderFilters({ customerId: e.target.value }))
              setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
            }}
            sx={{
              fontSize: '0.875rem',
              '& .MuiSelect-select': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  '& .MuiMenuItem-root': {
                    fontSize: '0.875rem'
                  }
                }
              }
            }}
          >
            <MenuItem value="">All Customers</MenuItem>
            {customers.map((customer: any) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {orderFilters.dateFilter === 'custom' && (
          <>
            <TextField
              label="From Date"
              type="date"
              value={orderFilters.customFromDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                dispatch(setOrderFilters({ customFromDate: e.target.value }))
              }}
              size="medium"
              sx={{
                minWidth: 150,
                '& .MuiOutlinedInput-root': {
                  height: TYPOGRAPHY_STYLES.searchField.input.height,
                  fontSize: '0.875rem'
                }
              }}
              InputLabelProps={{
                shrink: true,
              }}
            />
            <TextField
              label="To Date"
              type="date"
              value={orderFilters.customToDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                dispatch(setOrderFilters({ customToDate: e.target.value }))
              }}
              size="medium"
              sx={{
                minWidth: 150,
                '& .MuiOutlinedInput-root': {
                  height: TYPOGRAPHY_STYLES.searchField.input.height,
                  fontSize: '0.875rem'
                }
              }}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </>
        )}
        {(orderFilters.dateFilter !== 'all' || orderFilters.customerId) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              dispatch(setOrderFilters({
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
                customerId: ''
              }))
              setState((prev: OrdersPageState) => ({ ...prev, page: 0 }))
            }}
            sx={{
              minWidth: 'auto',
              px: 2,
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }}
          >
            Clear Filters
          </Button>
        )}
        <Button
          variant={orderFilters.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={orderFilters.sortBy === 'orderNumber' ? (orderFilters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('orderNumber')}
          sx={{
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: '0.875rem',
            minWidth: 'auto',
            px: 2
          }}
        >
          Sort
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Order List ({pagination?.total || 0})
                </Typography>
                {loading && orders.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Searching...
                    </Typography>
                    <Box sx={{ width: 16, height: 16 }}>
                      <Skeleton variant="circular" width={16} height={16} />
                    </Box>
                  </Box>
                )}
              </Box>
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
                    {loading && orders.length === 0 ? (
                      // Show skeleton rows when loading with no existing orders
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      orders.map((order: any, index: number) => (
                        <OrderRow
                          key={order.id}
                          order={order}
                          index={index}
                          selectedOrderId={selectedOrder?.id}
                          focusedOrderIndex={focusedOrderIndex}
                          onOrderSelect={handleOrderSelect}
                        />
                      ))
                    )}
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
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              {/* Header with Order Info and Actions */}
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
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

            <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
              {/* Order Details Section */}
              <Box>
                <Grid container spacing={3}>
                  {/* Left Column - Order Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                            '&:nth-of-type(1)': { width: '40%' }, // Field name column
                            '&:nth-of-type(2)': { width: '60%' }, // Value column
                          }
                        }}
                      >
                        <TableBody>
                          {/* Order Information Section */}
                          <TableRow>
                            <TableCell colSpan={2} sx={{
                              pb: TABLE_STYLES.cell.padding.py * 0.67,
                              py: TABLE_STYLES.cell.padding.py * 0.67,
                              borderTop: TABLE_STYLES.cell.border
                            }}>
                              <Typography variant="h6" sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                color: 'primary.main',
                                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                              }}>
                                Order Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Customer Name
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.customer?.name || 'Unknown Customer'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Order Date
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedOrder.orderDate)}
                            </TableCell>
                          </TableRow>
                          {selectedOrder.requiredDate && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                Required Date
                              </TableCell>
                              <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                {formatDate(selectedOrder.requiredDate)}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Payment & Fulfillment */}
                  <Grid item xs={12} md={6}>
                    {/* Payment and Fulfillment Section */}
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                          }
                        }}
                      >
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={3} sx={{
                              pb: TABLE_STYLES.cell.padding.py * 0.67,
                              py: TABLE_STYLES.cell.padding.py * 0.67,
                              borderTop: TABLE_STYLES.cell.border
                            }}>
                              <Typography variant="h6" sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                                color: 'primary.main'
                              }}>
                                Payment and Fulfillment
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ width: '25%', fontWeight: 600, color: 'text.secondary' }}>
                              Total:
                            </TableCell>
                            <TableCell>
                              {formatCurrency(selectedOrder.totalAmount || 0)}
                            </TableCell>
                            <TableCell sx={{ width: '30%' }} />
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>
                              Paid:
                            </TableCell>
                            <TableCell>
                              {!selectedOrder.isFulfilled ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  placeholder={`Auto-fill: ${formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}`}
                                  inputProps={{ min: 0, step: 0.01 }}
                                  sx={{
                                    width: '140px',
                                    '& .MuiInputBase-root': {
                                      height: '24px',
                                      fontSize: '0.875rem'
                                    },
                                    '& .MuiInputBase-input': {
                                      padding: '4px 8px',
                                      fontSize: '0.875rem'
                                    },
                                    '& input[type=number]': {
                                      MozAppearance: 'textfield'
                                    },
                                    '& input[type=number]::-webkit-outer-spin-button': {
                                      WebkitAppearance: 'none',
                                      margin: 0
                                    },
                                    '& input[type=number]::-webkit-inner-spin-button': {
                                      WebkitAppearance: 'none',
                                      margin: 0
                                    }
                                  }}
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                                />
                              ) : (
                                formatCurrency(selectedOrder.paidAmount || 0)
                              )}
                            </TableCell>
                            <TableCell sx={{ width: '30%' }} />
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>
                              Balance:
                            </TableCell>
                            <TableCell sx={{
                              color: (() => {
                                const currentPaid = paymentAmount ? parseFloat(paymentAmount) : (selectedOrder.paidAmount || 0)
                                const balance = Math.max(0, (selectedOrder.totalAmount || 0) - currentPaid)
                                return balance > 0 ? 'error.main' : 'success.main'
                              })()
                            }}>
                              {(() => {
                                const currentPaid = paymentAmount ? parseFloat(paymentAmount) : (selectedOrder.paidAmount || 0)
                                const balance = Math.max(0, (selectedOrder.totalAmount || 0) - currentPaid)
                                return formatCurrency(balance)
                              })()}
                            </TableCell>
                            <TableCell sx={{ width: '30%' }} />
                          </TableRow>
                          <TableRow>
                            <TableCell />
                            <TableCell colSpan={2}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Button
                                  variant="contained"
                                  size="small"
                                  color={selectedOrder.isPaidInFull ? "warning" : "primary"}
                                  onClick={selectedOrder.isPaidInFull ? handleUnpayOrder : handleRecordPayment}
                                  disabled={isLoading}
                                >
                                  {selectedOrder.isPaidInFull ? "Unpay" : "Pay"}
                                </Button>
                                <Button
                                  variant="contained"
                                  size="small"
                                  color={selectedOrder.isFulfilled ? "warning" : "success"}
                                  onClick={selectedOrder.isFulfilled ? handleUnfulfillOrder : handleFulfillOrder}
                                  disabled={isLoading || (!selectedOrder.isFulfilled && !selectedOrder.isPaidInFull)}
                                >
                                  {selectedOrder.isFulfilled ? "Unfulfill" : "Fulfill"}
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>

                    {/* Order Fulfillment Section */}
                    <Box sx={{ mt: 2 }}>
                      <TableContainer>
                        <Table
                          size={TABLE_STYLES.size}
                          sx={{
                            tableLayout: 'fixed',
                            '& .MuiTableCell-root': {
                              border: 'none',
                              py: TABLE_STYLES.cell.padding.py,
                              px: TABLE_STYLES.cell.padding.px,
                            }
                          }}
                        >
                          <TableBody>
                            <TableRow>
                              <TableCell colSpan={3} sx={{
                                pb: TABLE_STYLES.cell.padding.py * 0.67,
                                py: TABLE_STYLES.cell.padding.py * 0.67,
                                borderTop: TABLE_STYLES.cell.border
                              }}>
                                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                                  color: 'primary.main',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}>
                                  ✅ Order Fulfillment
                                </Typography>
                              </TableCell>
                            </TableRow>
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ width: '25%', fontWeight: 600, color: 'text.secondary' }}>
                                Fulfillment Status:
                              </TableCell>
                              <TableCell sx={{ fontWeight: 500 }}>
                                <Chip
                                  label={selectedOrder.isFulfilled ? 'Fulfilled' : 'Pending Fulfillment'}
                                  color={selectedOrder.isFulfilled ? 'success' : 'default'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell sx={{ width: '30%' }}>
                                {!selectedOrder.canFulfill && !selectedOrder.isFulfilled && (
                                  <Typography variant="caption" color="text.secondary">
                                    {selectedOrder.isPaidInFull
                                      ? 'Order can be fulfilled'
                                      : 'Payment required before fulfillment'
                                    }
                                  </Typography>
                                )}
                              </TableCell>
                            </TableRow>
                            {selectedOrder.isFulfilled && (
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary' }}>
                                  Fulfilled Date:
                                </TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>
                                  {selectedOrder.deliveredDate
                                    ? new Date(selectedOrder.deliveredDate).toLocaleDateString()
                                    : 'N/A'
                                  }
                                </TableCell>
                                <TableCell>
                                  <Typography variant="caption" color="success.main">
                                    ✓ Inventory has been deducted
                                  </Typography>
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  </Grid>
                </Grid>

                {/* Order Notes Section - below both columns if notes exist */}
                {selectedOrder.notes && (
                  <Box sx={{ mt: 3 }}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                          }
                        }}
                      >
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{
                              pb: TABLE_STYLES.cell.padding.py * 0.67,
                              py: TABLE_STYLES.cell.padding.py * 0.67,
                              borderTop: TABLE_STYLES.cell.border
                            }}>
                              <Typography variant="h6" sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                color: 'info.main',
                                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                              }}>
                                Order Notes
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              <Typography sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight,
                                whiteSpace: 'pre-wrap'
                              }}>
                                {selectedOrder.notes}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}

              </Box>

              {/* Page Break */}
              <Box sx={{
                borderTop: '2px solid',
                borderColor: 'divider',
                my: 3,
                pageBreakBefore: 'always' // CSS page break for printing
              }} />

              {/* Order Items Section */}
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Order Items Header */}
                <TableContainer>
                  <Table
                    size={TABLE_STYLES.size}
                    sx={{
                      tableLayout: 'fixed',
                      '& .MuiTableCell-root': {
                        border: 'none',
                        py: TABLE_STYLES.cell.padding.py,
                        px: TABLE_STYLES.cell.padding.px,
                      }
                    }}
                  >
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={3} sx={{
                          pb: TABLE_STYLES.cell.padding.py * 0.67,
                          py: TABLE_STYLES.cell.padding.py * 0.67,
                          borderTop: TABLE_STYLES.cell.border
                        }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                            fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                            fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Order Items
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Order Items Table */}
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

                {selectedOrder.items && selectedOrder.items.length > 0 ? (
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
                      <TableHead>
                        <TableRow sx={{ '& .MuiTableCell-head': {
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          backgroundColor: 'grey.50',
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                        } }}>
                          <TableCell sx={{ width: '40%' }}>
                            Product
                          </TableCell>
                          <TableCell align="center" sx={{ width: '12%' }}>
                            Quantity
                          </TableCell>
                          <TableCell align="right" sx={{ width: '16%' }}>
                            Unit Price
                          </TableCell>
                          <TableCell align="right" sx={{ width: '16%' }}>
                            Discount
                          </TableCell>
                          <TableCell align="right" sx={{ width: '16%' }}>
                            Total
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedOrder.items.map((item: any, index: number) => (
                          <TableRow
                            key={index}
                            hover
                            sx={{
                              '&:hover': {
                                backgroundColor: 'action.hover'
                              },
                              transition: 'background-color 0.2s ease',
                              height: TABLE_STYLES.row.height
                            }}
                          >
                            <TableCell sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                            }}>
                              {item.product?.name || item.productName || 'Unknown Product'}
                              {item.description && (
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                  color: 'text.secondary',
                                  display: 'block'
                                }}>
                                  {item.description}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="center" sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                            }}>
                              {item.quantity || 0}
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                            }}>
                              {formatCurrency(item.unitPrice || 0)}
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                            }}>
                              {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                              {item.discountType === 'percentage' && item.discountPercent && (
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                  color: 'text.secondary',
                                  display: 'block'
                                }}>
                                  ({item.discountPercent}%)
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                            }}>
                              {formatCurrency(item.totalAmount || (item.quantity * item.unitPrice) || 0)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Alert severity="info">No items in this order</Alert>
                )}
                </Box>
              </Box>

            </Box>
            </Paper>
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
                          <TableHead>
                            <TableRow sx={{ '& .MuiTableCell-head': {
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              backgroundColor: 'grey.50',
                              color: TYPOGRAPHY_STYLES.tableHeader.color,
                              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                            } }}>
                              <TableCell sx={{ width: '30%' }}>
                                Product
                              </TableCell>
                              <TableCell sx={{ width: '15%' }}>
                                SKU/Barcode
                              </TableCell>
                              <TableCell align="center" sx={{ width: '11%' }}>
                                Quantity
                              </TableCell>
                              <TableCell align="right" sx={{ width: '11%' }}>
                                Unit Price
                              </TableCell>
                              <TableCell align="right" sx={{ width: '16%' }}>
                                Discount
                              </TableCell>
                              <TableCell align="right" sx={{ width: '17%' }}>
                                Total
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {selectedOrder.items.map((item: any, index: number) => (
                              <TableRow
                                key={index}
                                hover
                                sx={{
                                  '&:hover': {
                                    backgroundColor: 'action.hover'
                                  },
                                  transition: 'background-color 0.2s ease',
                                  height: TABLE_STYLES.row.height
                                }}
                              >
                                <TableCell sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                                }}>
                                  {item.product?.name || item.productName || 'Unknown Product'}
                                  {item.description && (
                                    <Typography sx={{
                                      fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                      color: 'text.secondary',
                                      display: 'block'
                                    }}>
                                      {item.description}
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                                }}>
                                  {item.product?.barcode || item.product?.sku || 'N/A'}
                                </TableCell>
                                <TableCell align="center" sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                                }}>
                                  {item.quantity || 0}
                                </TableCell>
                                <TableCell align="right" sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                                }}>
                                  {formatCurrency(item.unitPrice || 0)}
                                </TableCell>
                                <TableCell align="right" sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                                }}>
                                  {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                                  {item.discountType === 'percentage' && item.discountPercent && (
                                    <Typography sx={{
                                      fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                      color: 'text.secondary',
                                      display: 'block'
                                    }}>
                                      ({item.discountPercent}%)
                                    </Typography>
                                  )}
                                  {item.discountType === 'amount' && item.discountAmount && (
                                    <Typography sx={{
                                      fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                      color: 'text.secondary',
                                      display: 'block'
                                    }}>
                                      (Fixed)
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right" sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                                }}>
                                  {formatCurrency(item.totalAmount || (item.quantity * item.unitPrice) || 0)}
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
