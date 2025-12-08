import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  Receipt as OrderIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  PictureAsPdf as PdfIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { fetchOrders, fetchOrderById, deleteOrder, selectOrders, selectSalesLoading, selectSalesError, selectSalesPagination, selectSelectedOrder, selectOrderFilters, setSelectedOrder, setOrderFilters, updateOrderInPlace, fetchInvoices } from '@/store/slices/salesSlice'
import { fetchCustomers } from '@/store/slices/customerSlice'
import { salesApi } from '@/services/salesApi'
import { printSettingsApi } from '@/services/printSettingsApi'
import { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { generatePDFTemplate, printPDF } from '@/utils/pdfTemplateGenerator'
import DeletedOrdersDialog from '@/components/sales/DeletedOrdersDialog'
import BlockedSalesOrderDialog from '@/components/sales/BlockedSalesOrderDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useNotification } from '@/hooks/useNotification'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

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
  const location = useLocation()
  const navigate = useNavigate()
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
    customerId: 'all',
  }

  const [viewDialog, setViewDialog] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [blockedDialogAction, setBlockedDialogAction] = useState<'edit' | 'delete'>('edit')
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null)
  const [orderToDeleteName, setOrderToDeleteName] = useState<string>('')
  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(null)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const processedHighlightRef = useRef<string | null>(null)

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
      sortBy: orderFilters.sortBy,
      sortOrder: orderFilters.sortOrder,
      search: orderFilters.search,
      customerId: orderFilters.customerId === 'all' ? undefined : orderFilters.customerId,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      paymentStatus: orderFilters.paymentStatus,
      fulfillmentStatus: orderFilters.fulfillmentStatus,
    }))
  }, [dispatch, orderFilters.sortBy, orderFilters.sortOrder, orderFilters.dateFilter, orderFilters.customFromDate, orderFilters.customToDate, orderFilters.customerId, orderFilters.search, orderFilters.paymentStatus, orderFilters.fulfillmentStatus])

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
  }, [dispatch, orderFilters.sortBy, orderFilters.sortOrder])

  // Select order when clicked - memoized to prevent re-renders
  const handleOrderSelect = useCallback((order: SalesOrder) => {
    dispatch(setSelectedOrder(order))
    const orderIndex = orders.findIndex(o => o.id === order.id)
    setFocusedOrderIndex(orderIndex)
    // Fetch full order details with invoices and payments
    dispatch(fetchOrderById(order.id) as any)
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
            // Check if order is fulfilled or paid
            const isFulfilled = order.isFulfilled
            const isPaid = order.paidAmount && order.paidAmount > 0

            if (isFulfilled || isPaid) {
              dispatch(setSelectedOrder(order))
              setBlockedDialogAction('delete')
              setBlockedDialogOpen(true)
              return
            }
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

  const handleEditOrder = () => {
    if (selectedOrder) {
      // Check if order is fulfilled or paid before allowing edit
      const isFulfilled = selectedOrder.isFulfilled
      const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0

      if (isFulfilled || isPaid) {
        setBlockedDialogAction('edit')
        setBlockedDialogOpen(true)
        return
      }
      navigate(`/sales/orders/${selectedOrder.id}/edit`)
    }
  }

  const handlePrintPDF = async () => {
    if (!selectedOrder) return

    try {
      // Fetch print settings
      const printSettings = await printSettingsApi.getPrintSettings()

      // Calculate subtotal
      const subtotal = selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0
      const shippingAmount = selectedOrder.shippingAmount || 0
      const totalAmount = selectedOrder.totalAmount || 0

      // Prepare items for PDF template
      const items = (selectedOrder.items || []).map((item: any) => ({
        description: item.product?.name || 'Unknown Product',
        quantity: item.quantity || 0,
        unitPrice: item.unitPrice || 0,
        discount: item.discountAmount || 0,
        discountType: item.discountType || 'percentage',
        discountPercent: item.discountPercent || 0,
        amount: item.totalAmount || 0,
      }))

      // Prepare customer info
      const customerInfo = selectedOrder.customer ? {
        name: selectedOrder.customer.name || 'Unknown Customer',
        address: selectedOrder.shippingAddress || selectedOrder.customer.address,
        city: selectedOrder.customer.city,
        state: selectedOrder.customer.state,
        postalCode: selectedOrder.customer.postalCode,
        country: selectedOrder.customer.country,
        phone: selectedOrder.customer.phone,
        email: selectedOrder.customer.email,
      } : undefined

      // Generate PDF HTML using the template
      const html = generatePDFTemplate({
        documentType: 'salesOrder',
        documentNumber: selectedOrder.orderNumber,
        documentDate: selectedOrder.orderDate,
        printSettings,
        customerInfo,
        items,
        subtotal,
        shipping: shippingAmount,
        total: totalAmount,
        notes: selectedOrder.notes,
      })

      // Print the PDF
      printPDF(html, showError)
    } catch (error) {
      console.error('Failed to generate PDF:', error)
      showError('Failed to generate PDF. Please try again.')
    }
  }

  const handleRecordPayment = async () => {
    if (!selectedOrder) return

    // Calculate the new total paid amount
    let newPaidAmount
    let paymentToAdd = 0

    if (paymentAmount) {
      // If user entered an amount, add it to existing paid amount
      paymentToAdd = parseFloat(paymentAmount)
      newPaidAmount = (selectedOrder.paidAmount || 0) + paymentToAdd
    } else {
      // Auto-fill behavior: if payment field is blank, pay the remaining balance
      const remainingBalance = Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0))
      paymentToAdd = remainingBalance
      newPaidAmount = (selectedOrder.paidAmount || 0) + remainingBalance
    }

    if (paymentToAdd <= 0) return

    setIsLoading(true)
    try {
      // First, optimistically update the UI to show the new payment amount immediately
      const optimisticUpdate = {
        ...selectedOrder,
        paidAmount: newPaidAmount
      }
      dispatch(updateOrderInPlace(optimisticUpdate))
      setPaymentAmount('')

      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: newPaidAmount }),
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        // Fetch full order details to get updated invoices and payments
        dispatch(fetchOrderById(selectedOrder.id) as any)
        // Refresh invoices to show updated payment amounts
        dispatch(fetchInvoices({ page: 1, limit: 20 }))
        showSuccess(`Payment of ${formatCurrency(paymentToAdd)} recorded successfully. Total paid: ${formatCurrency(newPaidAmount)}`)
      } else {
        // Revert optimistic update on error
        dispatch(updateOrderInPlace(selectedOrder))
        setPaymentAmount(paymentToAdd.toString())
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to record payment'
        showError(errorMessage)
      }
    } catch (error) {
      // Revert optimistic update on error
      dispatch(updateOrderInPlace(selectedOrder))
      setPaymentAmount(paymentToAdd.toString())
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
        // Refresh invoices to show updated payment amounts
        dispatch(fetchInvoices({ page: 1, limit: 20 }))
        // Refresh the orders list to show updated state
        dispatch(fetchOrders({
          search: orderFilters.search || '',
          paymentStatus: orderFilters.paymentStatus || 'all',
          fulfillmentStatus: orderFilters.fulfillmentStatus || 'all'
        }))
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

  const handleRefundOrder = async () => {
    if (!selectedOrder) return

    const overpayment = (selectedOrder.paidAmount || 0) - (selectedOrder.totalAmount || 0)
    if (overpayment <= 0) return

    const newPaidAmount = selectedOrder.totalAmount || 0

    setIsLoading(true)
    try {
      // Optimistically update the UI to show refund immediately
      const optimisticUpdate = {
        ...selectedOrder,
        paidAmount: newPaidAmount
      }
      dispatch(updateOrderInPlace(optimisticUpdate))

      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/record-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount: newPaidAmount }),
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        // Refresh invoices to show updated payment amounts
        dispatch(fetchInvoices({ page: 1, limit: 20 }))
        showSuccess(`Refund of ${formatCurrency(overpayment)} processed. Payment adjusted to ${formatCurrency(newPaidAmount)}`)
      } else {
        // Revert optimistic update on error
        dispatch(updateOrderInPlace(selectedOrder))
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to process refund'
        showError(errorMessage)
      }
    } catch (error) {
      // Revert optimistic update on error
      dispatch(updateOrderInPlace(selectedOrder))
      console.error('Error processing refund:', error)
      showError('Error processing refund. Please try again.')
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
        showSuccess('Order fulfilled successfully! Inventory has been deducted.')
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

  const handleUnfulfillAndEdit = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if also paid - if so, need to unfulfill first, then unpay
      const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0

      // Step 1: Unfulfill first (required before unpay)
      const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!unfulfillResponse.ok) {
        const errorData = await unfulfillResponse.json()
        throw new Error(errorData?.message || 'Failed to unfulfill order')
      }

      if (isPaid) {
        // Step 2: Then unpay if needed
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (unpayResponse.ok) {
          const updatedOrder = await unpayResponse.json()
          dispatch(updateOrderInPlace(updatedOrder.data))
          showSuccess('Order unfulfilled and unpaid successfully')
          setBlockedDialogOpen(false)
          navigate(`/sales/orders/${selectedOrder.id}/edit`)
        } else {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }
      } else {
        // Only unfulfill
        const updatedOrder = await unfulfillResponse.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order unfulfilled successfully')
        setBlockedDialogOpen(false)
        navigate(`/sales/orders/${selectedOrder.id}/edit`)
      }
    } catch (error: any) {
      console.error('Error unfulfilling order:', error)
      showError(error.message || 'Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnfulfillOnly = async () => {
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
        setBlockedDialogOpen(false)
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

  const handleUnpayAndEdit = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if also fulfilled - if so, unfulfill first before unpay
      const isFulfilled = selectedOrder.isFulfilled

      if (isFulfilled) {
        // Step 1: Unfulfill first (required before unpay)
        const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unfulfillResponse.ok) {
          const errorData = await unfulfillResponse.json()
          throw new Error(errorData?.message || 'Failed to unfulfill order')
        }

        // Step 2: Then unpay
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (unpayResponse.ok) {
          const updatedOrder = await unpayResponse.json()
          dispatch(updateOrderInPlace(updatedOrder.data))
          showSuccess('Order unfulfilled and unpaid successfully')
          setBlockedDialogOpen(false)
          navigate(`/sales/orders/${selectedOrder.id}/edit`)
        } else {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }
      } else {
        // Only unpay, then edit
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        const updatedOrder = await unpayResponse.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order unpaid successfully - payment removed')
        setBlockedDialogOpen(false)
        navigate(`/sales/orders/${selectedOrder.id}/edit`)
      }
    } catch (error: any) {
      console.error('Error unpaying order:', error)
      showError(error.message || 'Error unpaying order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnfulfillAndDelete = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if also paid - if so, unfulfill first, then unpay
      const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0

      // Step 1: Unfulfill first (required before unpay)
      const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!unfulfillResponse.ok) {
        const errorData = await unfulfillResponse.json()
        throw new Error(errorData?.message || 'Failed to unfulfill order')
      }

      if (isPaid) {
        // Step 2: Then unpay if needed
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        showSuccess('Order unfulfilled and unpaid successfully')
      } else {
        showSuccess('Order unfulfilled successfully')
      }

      const updatedOrder = await unfulfillResponse.json()
      dispatch(updateOrderInPlace(updatedOrder.data))

      setBlockedDialogOpen(false)

      // Now proceed with delete
      setOrderToDelete(selectedOrder.id)
      setOrderToDeleteName(selectedOrder.orderNumber || selectedOrder.id)
      setDeleteConfirmOpen(true)
    } catch (error: any) {
      console.error('Error preparing order for deletion:', error)
      showError(error.message || 'Error preparing order for deletion. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayAndDelete = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if also fulfilled - if so, unfulfill first before unpay
      const isFulfilled = selectedOrder.isFulfilled

      if (isFulfilled) {
        // Step 1: Unfulfill first (required before unpay)
        const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unfulfillResponse.ok) {
          const errorData = await unfulfillResponse.json()
          throw new Error(errorData?.message || 'Failed to unfulfill order')
        }

        // Step 2: Then unpay
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        const updatedOrder = await unpayResponse.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order unfulfilled and unpaid successfully')
      } else {
        // Only unpay
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        const updatedOrder = await unpayResponse.json()
        dispatch(updateOrderInPlace(updatedOrder.data))
        showSuccess('Order unpaid successfully')
      }

      setBlockedDialogOpen(false)

      // Now proceed with delete
      setOrderToDelete(selectedOrder.id)
      setOrderToDeleteName(selectedOrder.orderNumber || selectedOrder.id)
      setDeleteConfirmOpen(true)
    } catch (error: any) {
      console.error('Error preparing order for deletion:', error)
      showError(error.message || 'Error preparing order for deletion. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayOnly = async () => {
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
        showSuccess('Order unpaid successfully - payment removed')
        setBlockedDialogOpen(false)
      } else {
        const errorData = await response.json()
        const errorMessage = errorData?.message || 'Failed to unpay order'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error unpaying order:', error)
      showError('Error unpaying order. Please try again.')
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
        // Fetch full order details with invoices and payments
        dispatch(fetchOrderById(orders[0].id) as any)
      }
    }
  }, [orders, focusedOrderIndex, selectedOrder, dispatch])

  // Handle pending order selection after orders load
  useEffect(() => {
    if (pendingOrderToSelect && orders.length > 0) {
      const orderIndex = orders.findIndex(o => o.id === pendingOrderToSelect)
      if (orderIndex >= 0) {
        dispatch(setSelectedOrder(orders[orderIndex]))
        setFocusedOrderIndex(orderIndex)
        setPendingOrderToSelect(null)
        // Fetch full order details with invoices and payments
        dispatch(fetchOrderById(orders[orderIndex].id) as any)
      }
    }
  }, [orders, pendingOrderToSelect])

  // Handle navigation from invoice page with highlightOrderId
  useEffect(() => {
    const state = location.state as { highlightOrderId?: string }
    if (state?.highlightOrderId && orders.length > 0) {
      // Only process if we haven't already processed this highlight ID
      if (processedHighlightRef.current !== state.highlightOrderId) {
        const orderIndex = orders.findIndex(o => o.id === state.highlightOrderId)
        if (orderIndex >= 0) {
          dispatch(setSelectedOrder(orders[orderIndex]))
          setFocusedOrderIndex(orderIndex)
          // Fetch full order details with invoices and payments
          dispatch(fetchOrderById(orders[orderIndex].id) as any)
          // Mark this ID as processed
          processedHighlightRef.current = state.highlightOrderId
          // Clear the state to prevent repeated highlighting
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
        }
      }
    } else if (!state?.highlightOrderId) {
      // Reset when there's no highlightOrderId (e.g., normal navigation)
      processedHighlightRef.current = null
    }
  }, [orders, location.state, dispatch])

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
    const rowsPerPage = 20 // Default value previously used
    const newIndex = Math.max(0, focusedOrderIndex - rowsPerPage)
    setFocusedOrderIndex(newIndex)
    if (orders[newIndex]) {
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, orders, dispatch])

  const handlePageDownNavigation = useCallback(() => {
    const rowsPerPage = 20 // Default value previously used
    const newIndex = Math.min(orders.length - 1, focusedOrderIndex + rowsPerPage)
    setFocusedOrderIndex(newIndex)
    if (orders[newIndex]) {
      dispatch(setSelectedOrder(orders[newIndex]))
    }
  }, [focusedOrderIndex, orders, dispatch])

  const handleEnterAction = useCallback(() => {
    if (focusedOrderIndex >= 0 && orders[focusedOrderIndex]) {
      navigate(`/sales/orders/${orders[focusedOrderIndex].id}/edit`)
    }
  }, [focusedOrderIndex, orders, navigate])

  const handleEditAction = () => {
    if (selectedOrder) {
      navigate(`/sales/orders/${selectedOrder.id}/edit`)
    }
  }

  const handleDeleteAction = () => {
    if (selectedOrder) {
      handleOrderAction('delete', selectedOrder.id)
    }
  }

  const handleViewDeletedAction = () => {
    setDeletedOrdersDialogOpen(true)
  }

  const handleAddOrder = () => {
    navigate('/sales/orders/create')
  }

  const handleNavigateToInvoice = useCallback((invoice: any, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation() // Prevent triggering parent row click
    }
    // Pass the full invoice object to avoid lookup issues with pagination
    navigate('/sales/invoices', { state: { highlightInvoice: invoice } })
  }, [navigate])

  const handleNavigateToPayment = useCallback((paymentId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation() // Prevent triggering parent row click
    }
    navigate('/sales/payments', { state: { highlightPaymentId: paymentId } })
  }, [navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedOrderIndex(-1)
    dispatch(setSelectedOrder(null))
    setViewDialog(false)
    setBlockedDialogOpen(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
  }, [dispatch])

  const clearDialogs = () => {
    setViewDialog(false)
    setBlockedDialogOpen(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
  }

  // Setup keyboard shortcuts - only navigation and search
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
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
            onClick={() => navigate('/sales/orders/create')}
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
            minWidth: isMobile ? 'auto' : 120,
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
                minWidth: 120,
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
                minWidth: 120,
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
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
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
            {customers.map((customer: any) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Payment Status</InputLabel>
          <Select
            value={orderFilters.paymentStatus}
            label="Payment Status"
            onChange={(e) => {
              dispatch(setOrderFilters({ paymentStatus: e.target.value }))
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
            <MenuItem value="unpaid">Unpaid</MenuItem>
            <MenuItem value="partial">Partially Paid</MenuItem>
            <MenuItem value="paid">Fully Paid</MenuItem>
            <MenuItem value="overpaid">Overpaid</MenuItem>
          </Select>
        </FormControl>
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Fulfillment</InputLabel>
          <Select
            value={orderFilters.fulfillmentStatus}
            label="Fulfillment"
            onChange={(e) => {
              dispatch(setOrderFilters({ fulfillmentStatus: e.target.value }))
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
            <MenuItem value="fulfilled">Fulfilled</MenuItem>
            <MenuItem value="unfulfilled">Unfulfilled</MenuItem>
          </Select>
        </FormControl>
        {(orderFilters.dateFilter !== 'all' || orderFilters.customerId !== 'all' || orderFilters.paymentStatus !== 'all' || orderFilters.fulfillmentStatus !== 'all') && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              dispatch(setOrderFilters({
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
                customerId: 'all',
                paymentStatus: 'all',
                fulfillmentStatus: 'all'
              }))
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
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Split Layout: Order List and SO Details */}
      <Grid container spacing={3}>
        {/* Left Side - Order List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  SO List ({pagination?.total || 0})
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
                      py: TABLE_STYLES.cell.padding.py * 0.75,
                      px: TABLE_STYLES.cell.padding.px * 0.75
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
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - SO Details */}
        <Grid item xs={12} md={9}>
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
                  SO Details - {selectedOrder.orderNumber}
                </Typography>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25
                }}>
                  <IconButton
                    size="small"
                    title="Print PDF"
                    onClick={handlePrintPDF}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                      width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                      minHeight: 20, // Reduced minimum size for better scaling
                      minWidth: 20,
                      p: 0.125, // Reduced padding for better proportion
                      color: 'success.main',
                      '&:hover': {
                        backgroundColor: 'success.light',
                        color: 'success.dark'
                      }
                    }}
                  >
                    <PdfIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                    }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Edit Order"
                    onClick={handleEditOrder}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                      width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                      minHeight: 20, // Reduced minimum size for better scaling
                      minWidth: 20,
                      p: 0.125, // Reduced padding for better proportion
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                        color: 'primary.dark'
                      }
                    }}
                  >
                    <EditIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                    }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete Order"
                    onClick={() => handleOrderAction('delete', selectedOrder.id)}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                      width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                      minHeight: 20, // Reduced minimum size for better scaling
                      minWidth: 20,
                      p: 0.125, // Reduced padding for better proportion
                      color: 'error.main',
                      '&:hover': {
                        backgroundColor: 'error.light',
                        color: 'error.dark'
                      }
                    }}
                  >
                    <DeleteIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                    }} />
                  </IconButton>
                </Box>
              </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
              {/* SO Details Section */}
              <Box>
                <Grid container spacing={3}>
                  {/* Left Column - SO Information */}
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
                          {/* SO Information Section */}
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
                                SO Information
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
                              SO Date
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedOrder.orderDate)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Invoice No
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.invoices && selectedOrder.invoices.length > 0 ? (
                                selectedOrder.invoices.map((invoice, index) => (
                                  <Box key={invoice.id} component="span">
                                    <Typography
                                      component="button"
                                      onClick={(event) => handleNavigateToInvoice(invoice, event)}
                                      sx={{
                                        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                        color: 'primary.main',
                                        cursor: 'pointer',
                                        textDecoration: 'none',
                                        border: 'none',
                                        background: 'none',
                                        padding: 0,
                                        fontFamily: 'inherit',
                                        '&:hover': {
                                          color: 'primary.dark'
                                        }
                                      }}
                                    >
                                      {invoice.invoiceNumber}
                                    </Typography>
                                    {index < selectedOrder.invoices!.length - 1 && (
                                      <Typography component="span" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                        ,
                                      </Typography>
                                    )}
                                  </Box>
                                ))
                              ) : (
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                  color: 'text.secondary',
                                  fontStyle: 'italic'
                                }}>
                                  {selectedOrder.isFulfilled ? 'Pending' : 'Not fulfilled'}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Payment No
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {(() => {
                                // Get payments from invoices
                                const invoicePayments = selectedOrder.invoices && selectedOrder.invoices.length > 0
                                  ? selectedOrder.invoices.flatMap((invoice: any) => invoice.payments || [])
                                  : [];

                                // Get direct payments (not linked to invoice)
                                const directPayments = (selectedOrder as any).directPayments || [];

                                // Combine all payments and remove duplicates by ID
                                const allPaymentsWithDuplicates = [...directPayments, ...invoicePayments];
                                const allPayments = allPaymentsWithDuplicates.filter((payment, index, self) =>
                                  index === self.findIndex((p) => p.id === payment.id)
                                );

                                if (allPayments.length === 0) {
                                  return (
                                    <Typography sx={{
                                      fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                      color: 'text.secondary',
                                      fontStyle: 'italic'
                                    }}>
                                      No payments
                                    </Typography>
                                  );
                                }

                                return allPayments.map((payment: any, index: number) => (
                                  <Box key={payment.id} component="span">
                                    <Typography
                                      component="button"
                                      onClick={(event) => handleNavigateToPayment(payment.id, event)}
                                      sx={{
                                        fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                        color: 'primary.main',
                                        cursor: 'pointer',
                                        textDecoration: 'none',
                                        border: 'none',
                                        background: 'none',
                                        padding: 0,
                                        fontFamily: 'inherit',
                                        '&:hover': {
                                          color: 'primary.dark'
                                        }
                                      }}
                                    >
                                      {payment.paymentNumber}
                                    </Typography>
                                    {index < allPayments.length - 1 && (
                                      <Typography component="span" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                        ,
                                      </Typography>
                                    )}
                                  </Box>
                                ));
                              })()}
                            </TableCell>
                          </TableRow>
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
                            '&:nth-of-type(1)': { width: '40%' }, // Field name column
                            '&:nth-of-type(2)': { width: '60%' }, // Value column
                          }
                        }}
                      >
                        <TableBody>
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
                                Payment and Fulfillment
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Sub-total
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatCurrency(
                                selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Shipping
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatCurrency(selectedOrder.shippingAmount || 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Total
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatCurrency(selectedOrder.totalAmount || 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Paid
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                                }}>
                                  {formatCurrency(selectedOrder.paidAmount || 0)}
                                </Typography>
                                {!selectedOrder.isFulfilled && (
                                  <>
                                    <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                      +
                                    </Typography>
                                    <TextField
                                      size="small"
                                      type="number"
                                      placeholder={`Add: ${formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}`}
                                      inputProps={{ min: 0, step: 0.01 }}
                                      sx={{
                                        width: '120px',
                                        '& .MuiInputBase-root': {
                                          height: '24px',
                                          fontSize: '0.75rem'
                                        },
                                        '& .MuiInputBase-input': {
                                          padding: '4px 6px',
                                          fontSize: '0.75rem'
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
                                  </>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Balance
                            </TableCell>
                            <TableCell sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {(() => {
                                  const additionalPayment = paymentAmount && !isNaN(parseFloat(paymentAmount)) ? parseFloat(paymentAmount) : 0
                                  const currentPaid = (selectedOrder.paidAmount || 0) + additionalPayment
                                  const balance = (selectedOrder.totalAmount || 0) - currentPaid
                                  return balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)
                                })()}
                                {paymentAmount && !isNaN(parseFloat(paymentAmount)) && parseFloat(paymentAmount) > 0 && (
                                  <Typography sx={{
                                    fontSize: '0.75rem',
                                    color: 'text.secondary',
                                    fontStyle: 'italic'
                                  }}>
                                    (after payment)
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                                <Button
                                  variant="contained"
                                  size="small"
                                  color={(() => {
                                    const isOverpaid = (selectedOrder.paidAmount || 0) > (selectedOrder.totalAmount || 0)
                                    if (isOverpaid) return "warning"
                                    return selectedOrder.isPaidInFull ? "warning" : "primary"
                                  })()}
                                  onClick={(() => {
                                    const isOverpaid = (selectedOrder.paidAmount || 0) > (selectedOrder.totalAmount || 0)
                                    if (isOverpaid) return handleRefundOrder
                                    return selectedOrder.isPaidInFull ? handleUnpayOrder : handleRecordPayment
                                  })()}
                                  disabled={isLoading || selectedOrder.isFulfilled}
                                  sx={{ minWidth: 110 }}
                                >
                                  {(() => {
                                    const isOverpaid = (selectedOrder.paidAmount || 0) > (selectedOrder.totalAmount || 0)
                                    if (isOverpaid) {
                                      return "Refund"
                                    }
                                    return selectedOrder.isPaidInFull
                                      ? "Unpay"
                                      : (selectedOrder.paidAmount > 0 ? "Pay Remaining" : "Pay")
                                  })()}
                                </Button>
                                <Button
                                  variant="contained"
                                  size="small"
                                  color={selectedOrder.isFulfilled ? "warning" : "success"}
                                  onClick={selectedOrder.isFulfilled ? handleUnfulfillOrder : handleFulfillOrder}
                                  disabled={isLoading || (!selectedOrder.isFulfilled && !selectedOrder.isPaidInFull)}
                                  sx={{ minWidth: 110 }}
                                >
                                  {selectedOrder.isFulfilled ? "Unfulfill" : "Fulfill"}
                                </Button>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>

                  </Grid>
                </Grid>

              </Box>

              {/* Page Break */}
              <Box sx={{
                borderTop: '2px solid',
                borderColor: 'divider',
                pageBreakBefore: 'always', // CSS page break for printing
                '@media print': {
                  pageBreakBefore: 'always'
                }
              }} />

              {/* SO Items Section */}
              <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* SO Items Header */}
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
                            SO Items
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* SO Items Table */}
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
                              lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                            }}>
                              {item.product?.name || 'Unknown Product'}
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
                              {item.discountType === 'percentage' && item.discountPercent ? (
                                `${item.discountPercent}%`
                              ) : item.discountAmount ? (
                                `-${formatCurrency(item.discountAmount)}`
                              ) : (
                                '-'
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
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

              {/* Page Break after SO Items */}
              <Box sx={{
                borderTop: '2px solid',
                borderColor: 'divider',
                pageBreakBefore: 'always', // CSS page break for printing
                '@media print': {
                  pageBreakBefore: 'always'
                }
              }} />

              {/* NOTES Section - below items */}
              {selectedOrder.notes && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    mb: 1
                  }}>
                    NOTES
                  </Typography>

                  <Box sx={{
                    p: 2,
                    backgroundColor: 'grey.50',
                    borderRadius: 1,
                    fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}>
                    {selectedOrder.notes}
                  </Box>
                </Box>
              )}

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


      {/* SO Details Dialog */}
      <Dialog
        open={viewDialog}
        onClose={() => setViewDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h6">
            SO Details - {selectedOrder?.orderNumber}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {selectedOrder && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>SO Information</Typography>
                    <Stack spacing={1}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography color="text.secondary">SO Date:</Typography>
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
              
              {/* SO Items */}
              <Grid item xs={12}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>SO Items</Typography>
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
                                  lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                                }}>
                                  {item.product?.name || 'Unknown Product'}
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
                                  {item.discountType === 'percentage' && item.discountPercent ? (
                                    `${item.discountPercent}%`
                                  ) : item.discountAmount ? (
                                    `-${formatCurrency(item.discountAmount)}`
                                  ) : (
                                    '-'
                                  )}
                                </TableCell>
                                <TableCell align="right" sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
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

      {/* Blocked Sales Order Dialog */}
      {selectedOrder && (
        <BlockedSalesOrderDialog
          open={blockedDialogOpen}
          orderNumber={selectedOrder.orderNumber || selectedOrder.id}
          isFulfilled={selectedOrder.isFulfilled}
          isPaid={!!(selectedOrder.paidAmount && selectedOrder.paidAmount > 0)}
          paidAmount={selectedOrder.paidAmount || 0}
          actionType={blockedDialogAction}
          onClose={() => setBlockedDialogOpen(false)}
          onUnfulfillAndEdit={handleUnfulfillAndEdit}
          onUnfulfillOnly={handleUnfulfillOnly}
          onUnpayAndEdit={handleUnpayAndEdit}
          onUnpayOnly={handleUnpayOnly}
          onUnfulfillAndDelete={handleUnfulfillAndDelete}
          onUnpayAndDelete={handleUnpayAndDelete}
          loading={isLoading}
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
