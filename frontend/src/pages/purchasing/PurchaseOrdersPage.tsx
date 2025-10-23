import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
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
  IconButton,
  TablePagination,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Skeleton,
  Alert,
  Grid,
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
  Description as OrderIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchPurchaseOrders,
  fetchSuppliers,
  fetchGoodsReceivedNotes,
  setSelectedPurchaseOrder,
  selectPurchaseOrders,
  selectSelectedPurchaseOrder,
  selectPurchasingLoading,
  selectPurchasingError,
  selectPurchasingPagination,
} from '@/store/slices/purchasingSlice'
import { purchasingApi } from '@/services/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedPurchaseOrdersDialog from '@/components/purchasing/DeletedPurchaseOrdersDialog'
import BlockedPurchaseOrderDialog from '@/components/purchasing/BlockedPurchaseOrderDialog'

interface PurchaseOrdersPageState {
  page: number
  rowsPerPage: number
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  supplierFilter: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

// Memoized Order Row Component
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
      </TableCell>
    </TableRow>
  )
})

OrderRow.displayName = 'OrderRow'

const PurchaseOrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()

  // Debug logging
  console.log('PurchaseOrdersPage rendering...')

  const purchaseOrders = useAppSelector(selectPurchaseOrders) || []
  const suppliers = useAppSelector((state: any) => state.purchasing.suppliers) || []
  const loading = useAppSelector(selectPurchasingLoading)?.purchaseOrders || false
  const error = useAppSelector(selectPurchasingError)
  const pagination = useAppSelector(selectPurchasingPagination)?.purchaseOrders
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)

  const [state, setState] = useState<PurchaseOrdersPageState>({
    page: 0,
    rowsPerPage: 20,
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc',
    supplierFilter: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })

  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [unreturnDialogOpen, setUnreturnDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<{ [key: string]: boolean }>({})
  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Fetch suppliers on mount
  useEffect(() => {
    dispatch(fetchSuppliers({ limit: 1000 }))
  }, [dispatch])

  // Helper function to calculate date ranges
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
        return { fromDate: state.customFromDate, toDate: state.customToDate }
      default:
        return { fromDate: undefined, toDate: undefined }
    }
  }, [state.customFromDate, state.customToDate])

  // Load purchase orders
  const loadOrders = useCallback(() => {
    const dateRange = getDateRange(state.dateFilter)
    dispatch(fetchPurchaseOrders({
      page: state.page + 1,
      limit: state.rowsPerPage,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder.toUpperCase() as 'ASC' | 'DESC',
      search: state.search,
      supplierId: state.supplierFilter === 'all' ? undefined : state.supplierFilter,
      orderDateFrom: dateRange.fromDate,
      orderDateTo: dateRange.toDate,
    } as any))
  }, [dispatch, state, getDateRange])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

  // Handle poId query parameter to auto-select PO from GRN page
  useEffect(() => {
    const poId = searchParams.get('poId')
    if (poId && purchaseOrders.length > 0) {
      const po = purchaseOrders.find((order: any) => order.id === poId)
      if (po) {
        dispatch(setSelectedPurchaseOrder(po))
        const orderIndex = purchaseOrders.findIndex((o: any) => o.id === po.id)
        setFocusedOrderIndex(orderIndex)
        // Remove the query parameter after selection
        setSearchParams({})
      }
    }
  }, [searchParams, purchaseOrders, dispatch, setSearchParams])

  // Check payment status when selected order changes
  useEffect(() => {
    if (selectedOrder) {
      checkPaymentStatus(selectedOrder.id)
    }
  }, [selectedOrder])

  // Function to check payment status for a PO
  const checkPaymentStatus = async (poId: string) => {
    try {
      const response = await purchasingApi.getPurchaseOrderPaymentStatus(poId)
      console.log('Payment status response:', response)

      // Handle both direct response and wrapped response structure
      let paymentData
      if (response.data && typeof response.data === 'object' && 'isPaid' in response.data) {
        // Direct response structure: { isPaid: boolean, payment?: any }
        paymentData = response.data
      } else if (response && typeof response === 'object' && 'isPaid' in response) {
        // Direct response structure: { isPaid: boolean, payment?: any }
        paymentData = response
      } else {
        // Fallback - assume unpaid if structure is unexpected
        paymentData = { isPaid: false }
      }

      setPaymentStatus(prev => ({
        ...prev,
        [poId]: paymentData.isPaid
      }))
    } catch (error) {
      console.error('Error checking payment status:', error)
      // Set default to false on error
      setPaymentStatus(prev => ({
        ...prev,
        [poId]: false
      }))
    }
  }

  const handleSort = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
      page: 0
    }))
  }, [])

  const handleOrderSelect = useCallback((order: any) => {
    dispatch(setSelectedPurchaseOrder(order))
    const orderIndex = purchaseOrders.findIndex(o => o.id === order.id)
    setFocusedOrderIndex(orderIndex)
  }, [dispatch, purchaseOrders])

  const handleApprove = async () => {
    if (!selectedOrder) return
    try {
      await purchasingApi.getPurchaseOrder(selectedOrder.id) // Approve endpoint to be added
      showSuccess('Purchase order approved successfully')
      loadOrders()
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to approve order')
    }
  }

  const handleSend = async () => {
    if (!selectedOrder) return
    try {
      await purchasingApi.sendPurchaseOrder(selectedOrder.id)
      showSuccess('Purchase order sent to supplier')
      loadOrders()
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to send order')
    }
  }

  const handleReceive = async () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      showError('No items to receive in this order')
      return
    }

    // Check GRN status
    if (selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0) {
      const grn = selectedOrder.goodsReceivedNotes[0]
      if (grn.status !== 'draft') {
        showError('GRN must be in draft status to receive goods')
        return
      }
    }

    try {
      const response = await purchasingApi.receiveGoods(selectedOrder.id)
      showSuccess('Goods received successfully. Product quantities updated.')

      // Update the selected order with the new data
      if (response.data) {
        dispatch(setSelectedPurchaseOrder(response.data))
      }

      loadOrders() // Reload to update the list
      // Refetch GRNs to update the GRN page with latest data
      dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
    } catch (err: any) {
      console.error('Receive error:', err)
      showError(err?.response?.data?.message || 'Failed to receive goods')
    }
  }

  const handleReturn = async () => {
    if (!selectedOrder || !selectedOrder.goodsReceivedNotes || selectedOrder.goodsReceivedNotes.length === 0) {
      showError('No GRN found to return')
      return
    }

    // Check GRN status
    const grn = selectedOrder.goodsReceivedNotes[0]
    if (grn.status !== 'received') {
      showError('GRN must be in received status to return goods')
      return
    }

    try {
      const response = await purchasingApi.returnGoods(selectedOrder.id)
      showSuccess('Goods returned successfully. Product quantities reverted.')

      // Update the selected order with the new data
      if (response.data) {
        dispatch(setSelectedPurchaseOrder(response.data))
      }

      loadOrders() // Reload to update the list
      // Refetch GRNs to update the GRN page with latest data
      dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
    } catch (err: any) {
      console.error('Return error:', err)
      showError(err?.response?.data?.message || 'Failed to return goods')
    }
  }

  const handleEditClick = () => {
    if (!selectedOrder) return

    // Check if order is received before allowing edit
    const isReceived = selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'

    // Check if order is paid before allowing edit
    const isPaid = paymentStatus[selectedOrder.id] === true

    // If either received or paid, show dialog
    if (isReceived || isPaid) {
      setBlockedDialogType('edit')
      setUnreturnDialogOpen(true)
    } else {
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    }
  }

  const handleReturnAndEdit = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.returnGoods(selectedOrder.id)
      showSuccess('Goods returned successfully. You can now edit the order.')

      // Update the selected order with the new data
      if (response.data) {
        dispatch(setSelectedPurchaseOrder(response.data))
      }

      setUnreturnDialogOpen(false)
      loadOrders() // Reload to update the list
      // Refetch GRNs to update the GRN page with latest data
      dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))

      // Navigate to edit page
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (err: any) {
      console.error('Return error:', err)
      showError(err?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReturnOnly = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.returnGoods(selectedOrder.id)
      showSuccess('Goods returned successfully. Product quantities reverted.')

      // Update the selected order with the new data
      if (response.data) {
        dispatch(setSelectedPurchaseOrder(response.data))
      }

      setUnreturnDialogOpen(false)
      loadOrders() // Reload to update the list
      // Refetch GRNs to update the GRN page with latest data
      dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
    } catch (err: any) {
      console.error('Return error:', err)
      showError(err?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayAndEdit = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if order is also received
      const isReceived = selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'

      // Step 1: Unpay first
      const unpayResponse = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)

      // Update payment status (optimistic update)
      setPaymentStatus(prev => ({
        ...prev,
        [selectedOrder.id]: false
      }))

      // Step 2: If also received, return goods
      if (isReceived) {
        const returnResponse = await purchasingApi.returnGoods(selectedOrder.id)
        showSuccess('Payment deleted and goods returned successfully. You can now edit the order.')

        // Update with returned goods data
        if (returnResponse.data) {
          dispatch(setSelectedPurchaseOrder(returnResponse.data))
        }

        // Refetch GRNs to update the GRN page with latest data
        dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
      } else {
        showSuccess('Payment deleted successfully. You can now edit the order.')

        // Update the selected order with the unpay data
        const updatedOrder = unpayResponse.data.data || unpayResponse.data
        if (updatedOrder && (updatedOrder as any).id) {
          const orderWithoutPayment = {
            ...(updatedOrder as any),
            vendorPayments: []
          }
          dispatch(setSelectedPurchaseOrder(orderWithoutPayment))
        }
      }

      setUnreturnDialogOpen(false)
      loadOrders() // Reload to update the list

      // Navigate to edit page
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (err: any) {
      console.error('Unpay/Return error:', err)
      showError(err?.response?.data?.message || 'Failed to prepare order for editing')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayOnly = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)
      showSuccess('Payment deleted successfully.')

      // Update payment status (optimistic update)
      setPaymentStatus(prev => ({
        ...prev,
        [selectedOrder.id]: false
      }))

      // Update the selected order with the new data
      const updatedOrder = response.data.data || response.data
      if (updatedOrder && (updatedOrder as any).id) {
        const orderWithoutPayment = {
          ...(updatedOrder as any),
          vendorPayments: []
        }
        dispatch(setSelectedPurchaseOrder(orderWithoutPayment))
      }

      setUnreturnDialogOpen(false)
      loadOrders() // Reload to update the list
    } catch (err: any) {
      console.error('Unpay error:', err)
      showError(err?.response?.data?.message || 'Failed to delete payment')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReturnAndDelete = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // First return goods
      const returnResponse = await purchasingApi.returnGoods(selectedOrder.id)

      // Then delete the order
      await purchasingApi.deletePurchaseOrder(selectedOrder.id)
      showSuccess('Goods returned and purchase order deleted successfully.')

      setUnreturnDialogOpen(false)

      // Select previous order or null
      const deletedIndex = purchaseOrders.findIndex(o => o.id === selectedOrder.id)
      if (purchaseOrders.length > 1) {
        const newIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
        const orderToSelect = purchaseOrders[newIndex].id === selectedOrder.id
          ? purchaseOrders[newIndex + 1]
          : purchaseOrders[newIndex]
        dispatch(setSelectedPurchaseOrder(orderToSelect))
        setFocusedOrderIndex(newIndex)
      } else {
        dispatch(setSelectedPurchaseOrder(null))
        setFocusedOrderIndex(-1)
      }

      loadOrders() // Reload to update the list
      // Refetch GRNs to update the GRN page with latest data
      dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
    } catch (err: any) {
      console.error('Return/Delete error:', err)
      showError(err?.response?.data?.message || 'Failed to return and delete order')
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpayAndDelete = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // Check if order is also received
      const isReceived = selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'

      // Step 1: Unpay first
      await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)

      // Update payment status (optimistic update)
      setPaymentStatus(prev => ({
        ...prev,
        [selectedOrder.id]: false
      }))

      // Step 2: If also received, return goods
      if (isReceived) {
        await purchasingApi.returnGoods(selectedOrder.id)
        // Refetch GRNs to update the GRN page with latest data
        dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
      }

      // Step 3: Delete the order
      await purchasingApi.deletePurchaseOrder(selectedOrder.id)

      if (isReceived) {
        showSuccess('Payment deleted, goods returned, and purchase order deleted successfully.')
      } else {
        showSuccess('Payment deleted and purchase order deleted successfully.')
      }

      setUnreturnDialogOpen(false)

      // Select previous order or null
      const deletedIndex = purchaseOrders.findIndex(o => o.id === selectedOrder.id)
      if (purchaseOrders.length > 1) {
        const newIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
        const orderToSelect = purchaseOrders[newIndex].id === selectedOrder.id
          ? purchaseOrders[newIndex + 1]
          : purchaseOrders[newIndex]
        dispatch(setSelectedPurchaseOrder(orderToSelect))
        setFocusedOrderIndex(newIndex)
      } else {
        dispatch(setSelectedPurchaseOrder(null))
        setFocusedOrderIndex(-1)
      }

      loadOrders() // Reload to update the list
    } catch (err: any) {
      console.error('Unpay/Return/Delete error:', err)
      showError(err?.response?.data?.message || 'Failed to prepare and delete order')
    } finally {
      setIsLoading(false)
    }
  }

  const handlePay = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.markPurchaseOrderAsPaid(selectedOrder.id)

      // Based on console logs: response.data is the PO object directly with vendorPayments populated
      const updatedPO = response.data as any

      // Show success message using the vendorPayments from the updated PO
      if (updatedPO.vendorPayments && updatedPO.vendorPayments.length > 0) {
        const latestPayment = updatedPO.vendorPayments[updatedPO.vendorPayments.length - 1]
        showSuccess(`Payment created: ${latestPayment.paymentNumber}`)
      } else {
        showSuccess('Payment created successfully')
      }

      // Update payment status (optimistic update)
      setPaymentStatus(prev => ({
        ...prev,
        [selectedOrder.id]: true
      }))

      // Update the selected order with the new data
      // The backend already includes vendorPayments in the updated PO
      dispatch(setSelectedPurchaseOrder(updatedPO))

      loadOrders() // Reload to update the list
    } catch (err: any) {
      console.error('Pay error:', err)
      if (err?.response?.status === 409) {
        showError('This purchase order is already paid')
      } else {
        showError(err?.response?.data?.message || 'Failed to create payment')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnpay = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)
      showSuccess('Payment deleted successfully')

      // Update payment status (optimistic update)
      setPaymentStatus(prev => ({
        ...prev,
        [selectedOrder.id]: false
      }))

      // Update the selected order with the new data
      // ApiService wraps response, check both response.data.data and response.data
      const updatedOrder = response.data.data || response.data
      if (updatedOrder && (updatedOrder as any).id) {
        // Clear vendorPayments array when unpaying
        const orderWithoutPayment = {
          ...(updatedOrder as any),
          vendorPayments: []
        }
        dispatch(setSelectedPurchaseOrder(orderWithoutPayment))
      }

      loadOrders() // Reload to update the list
    } catch (err: any) {
      console.error('Unpay error:', err)
      if (err?.response?.status === 404) {
        showError('No payment found for this purchase order')
      } else {
        showError(err?.response?.data?.message || 'Failed to delete payment')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteClick = () => {
    if (!selectedOrder) return

    // Check if order is received or paid before allowing delete
    const isReceived = selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'

    const isPaid = paymentStatus[selectedOrder.id] === true

    // If either received or paid, show blocking dialog
    if (isReceived || isPaid) {
      setBlockedDialogType('delete')
      setUnreturnDialogOpen(true)
    } else {
      // Otherwise show normal delete confirmation
      setOrderToDelete(selectedOrder)
      setDeleteConfirmOpen(true)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return

    // Find the index of the order being deleted
    const deletedIndex = purchaseOrders.findIndex(o => o.id === orderToDelete.id)

    try {
      await purchasingApi.deletePurchaseOrder(orderToDelete.id)
      showSuccess('Purchase order deleted successfully')
      setDeleteConfirmOpen(false)
      setOrderToDelete(null)

      // Select previous order, or next if deleting first order, or null if last order
      if (purchaseOrders.length > 1) {
        const newIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
        const orderToSelect = purchaseOrders[newIndex].id === orderToDelete.id
          ? purchaseOrders[newIndex + 1]
          : purchaseOrders[newIndex]
        dispatch(setSelectedPurchaseOrder(orderToSelect))
        setFocusedOrderIndex(newIndex)
      } else {
        dispatch(setSelectedPurchaseOrder(null))
        setFocusedOrderIndex(-1)
      }

      loadOrders()
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to delete purchase order')
    }
  }

  // Auto-focus first order when orders load
  useEffect(() => {
    if (purchaseOrders.length > 0 && focusedOrderIndex === -1) {
      if (!selectedOrder && searchInputRef.current !== document.activeElement) {
        // Don't auto-select if we have a poId query parameter
        const poId = searchParams.get('poId')
        if (!poId) {
          setFocusedOrderIndex(0)
          dispatch(setSelectedPurchaseOrder(purchaseOrders[0]))
        }
      }
    }
  }, [purchaseOrders, focusedOrderIndex, selectedOrder, dispatch, searchParams])

  // Clear selection when no orders exist
  useEffect(() => {
    if (purchaseOrders.length === 0 && selectedOrder) {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [purchaseOrders.length, selectedOrder, dispatch])

  // Keyboard shortcuts
  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      const newIndex = focusedOrderIndex - 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
    }
  }, [focusedOrderIndex, purchaseOrders, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < purchaseOrders.length - 1) {
      const newIndex = focusedOrderIndex + 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
    }
  }, [focusedOrderIndex, purchaseOrders, dispatch])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

  return (
    <Box>
      {/* Debug Info */}
      {process.env.NODE_ENV === 'development' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Debug: PurchaseOrdersPage loaded | Orders: {purchaseOrders.length} | Loading: {loading} | Error: {error || 'None'}
        </Alert>
      )}

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
            Purchase Orders
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage supplier purchase orders and procurement ({purchaseOrders.length} total)
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
            onClick={() => navigate('/purchasing/orders/create')}
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
          value={state.search}
          onChange={(e) => setState(prev => ({ ...prev, search: e.target.value, page: 0 }))}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 250,
            flex: isMobile ? 'none' : 1,
            maxWidth: isMobile ? 'none' : 400,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
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
            width: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
            }
          }}
        >
          <InputLabel>Date Filter</InputLabel>
          <Select
            value={state.dateFilter}
            label="Date Filter"
            onChange={(e) => setState(prev => ({ ...prev, dateFilter: e.target.value, page: 0 }))}
            sx={{ fontSize: '0.875rem' }}
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

        {state.dateFilter === 'custom' && (
          <>
            <TextField
              label="From Date"
              type="date"
              value={state.customFromDate}
              onChange={(e) => setState(prev => ({ ...prev, customFromDate: e.target.value }))}
              size="medium"
              sx={{
                minWidth: isMobile ? 'auto' : 120,
                '& .MuiOutlinedInput-root': {
                  height: TYPOGRAPHY_STYLES.searchField.input.height,
                  fontSize: '0.875rem',
                }
              }}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="To Date"
              type="date"
              value={state.customToDate}
              onChange={(e) => setState(prev => ({ ...prev, customToDate: e.target.value }))}
              size="medium"
              sx={{
                minWidth: isMobile ? 'auto' : 120,
                '& .MuiOutlinedInput-root': {
                  height: TYPOGRAPHY_STYLES.searchField.input.height,
                  fontSize: '0.875rem',
                }
              }}
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}

        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            width: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
            }
          }}
        >
          <InputLabel>Supplier</InputLabel>
          <Select
            value={state.supplierFilter}
            label="Supplier"
            onChange={(e) => setState(prev => ({ ...prev, supplierFilter: e.target.value, page: 0 }))}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="all">All</MenuItem>
            {suppliers.map((supplier: any) => (
              <MenuItem key={supplier.id} value={supplier.id}>
                {supplier.companyName}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {(state.dateFilter !== 'all' || state.supplierFilter !== 'all') && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => setState(prev => ({
              ...prev,
              dateFilter: 'all',
              customFromDate: '',
              customToDate: '',
              supplierFilter: 'all',
              page: 0
            }))}
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
          Sort
        </Button>
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Split Layout */}
      <Grid container spacing={3}>
        {/* Left Side - Order List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                PO List ({pagination?.total || 0})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={orderListRef}>
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size={TABLE_STYLES.size}>
                  <TableBody>
                    {loading && purchaseOrders.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      purchaseOrders.map((order: any, index: number) => (
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
                rowsPerPageOptions={[10, 20, 50]}
                size="small"
              />
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Order Details */}
        <Grid item xs={12} md={9}>
          {selectedOrder ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  PO Details - {selectedOrder.orderNumber}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <IconButton
                    size="small"
                    title="Edit Order"
                    onClick={handleEditClick}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      color: 'primary.main',
                    }}
                  >
                    <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete Order"
                    onClick={handleDeleteClick}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      color: 'error.main',
                    }}
                  >
                    <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                  </IconButton>
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                <Grid container spacing={3}>
                  {/* Left Column - PO Information */}
                  <Grid item xs={12} md={6} sx={{ pb: '0 !important' }}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                            '&:nth-of-type(1)': { width: '40%' },
                            '&:nth-of-type(2)': { width: '60%' },
                          }
                        }}
                      >
                        <TableBody>
                          {/* PO Information Section */}
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
                                PO Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Supplier
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.supplier?.companyName || 'N/A'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              PO Date
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedOrder.orderDate)}
                            </TableCell>
                          </TableRow>
                          {selectedOrder.requiredDate && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                                color: 'text.secondary',
                                fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                              }}>
                                Required Date
                              </TableCell>
                              <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                {formatDate(selectedOrder.requiredDate)}
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow sx={{ backgroundColor: selectedOrder.requiredDate ? 'inherit' : 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              GRN No
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0
                                ? selectedOrder.goodsReceivedNotes.map((grn: any, index: number) => (
                                    <Box key={grn.id} component="span">
                                      {index > 0 && ', '}
                                      <Link
                                        to={`/purchasing/goods-received?grnId=${grn.id}`}
                                        style={{
                                          color: '#1976d2',
                                          textDecoration: 'none',
                                          cursor: 'pointer',
                                          transition: 'color 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.color = '#1565c0'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.color = '#1976d2'
                                        }}
                                      >
                                        {grn.grnNumber}
                                      </Link>
                                    </Box>
                                  ))
                                : '-'}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: selectedOrder.requiredDate ? 'grey.50' : 'inherit' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              VP No
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
                                ? selectedOrder.vendorPayments.map((payment: any, index: number) => (
                                    <Box key={payment.id} component="span">
                                      {index > 0 && ', '}
                                      <Link
                                        to={`/purchasing/vendor-payments?paymentId=${payment.id}`}
                                        style={{
                                          color: '#1976d2',
                                          textDecoration: 'none',
                                          cursor: 'pointer',
                                          transition: 'color 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.color = '#1565c0'
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.color = '#1976d2'
                                        }}
                                      >
                                        {payment.paymentNumber}
                                      </Link>
                                    </Box>
                                  ))
                                : '-'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - PO Summary */}
                  <Grid item xs={12} md={6} sx={{ pb: '0 !important' }}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                            '&:nth-of-type(1)': { width: '40%' },
                            '&:nth-of-type(2)': { width: '60%' },
                          }
                        }}
                      >
                        <TableBody>
                          {/* PO Summary Section */}
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
                                PO Summary
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Subtotal
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatCurrency(
                                selectedOrder.subtotal ||
                                (selectedOrder.items?.reduce((sum: number, item: any) =>
                                  sum + (item.totalAmount || item.total || (item.quantity * (item.unitPrice || item.unitCost || 0))), 0
                                )) ||
                                (selectedOrder as any).total ||
                                0
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Shipping
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatCurrency(selectedOrder.shippingAmount || 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{
                            backgroundColor: 'grey.50',
                            borderTop: TABLE_STYLES.cell.border
                          }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Total Amount
                            </TableCell>
                            <TableCell sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              {formatCurrency(
                                selectedOrder.totalAmount ||
                                ((selectedOrder.items?.reduce((sum: number, item: any) =>
                                  sum + (item.totalAmount || item.total || (item.quantity * (item.unitPrice || item.unitCost || 0))), 0
                                ) || 0) + (selectedOrder.shippingAmount || 0)) ||
                                (selectedOrder as any).total ||
                                0
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                                <Button
                                  variant="contained"
                                  size="small"
                                  color={paymentStatus[selectedOrder.id] ? "error" : "primary"}
                                  sx={{ minWidth: 110 }}
                                  onClick={paymentStatus[selectedOrder.id] ? handleUnpay : handlePay}
                                  disabled={isLoading}
                                >
                                  {paymentStatus[selectedOrder.id] ? "Unpay" : "Pay"}
                                </Button>
                                {selectedOrder.goodsReceivedNotes &&
                                 selectedOrder.goodsReceivedNotes.length > 0 &&
                                 selectedOrder.goodsReceivedNotes[0].status === 'received' ? (
                                  <Button
                                    variant="contained"
                                    size="small"
                                    color="warning"
                                    sx={{ minWidth: 110 }}
                                    onClick={handleReturn}
                                    disabled={!selectedOrder?.items || selectedOrder.items.length === 0 || isLoading}
                                  >
                                    Return
                                  </Button>
                                ) : (
                                  <Button
                                    variant="contained"
                                    size="small"
                                    color="success"
                                    sx={{ minWidth: 110 }}
                                    onClick={handleReceive}
                                    disabled={!selectedOrder?.items || selectedOrder.items.length === 0 || isLoading}
                                  >
                                    Receive
                                  </Button>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Order Items Section */}
                  <Grid item xs={12} sx={{ pt: '0 !important' }}>
                    {/* Page Break */}
                    <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

                    <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        mb: 1
                      }}>
                        PO Items
                      </Typography>

                      {(selectedOrder.items && selectedOrder.items.length > 0) ? (
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
                                <TableCell sx={{ width: '35%' }}>Product</TableCell>
                                <TableCell align="center" sx={{ width: '13%' }}>Quantity</TableCell>
                                <TableCell align="center" sx={{ width: '13%' }}>Price</TableCell>
                                <TableCell align="center" sx={{ width: '13%' }}>Discount</TableCell>
                                <TableCell align="center" sx={{ width: '13%' }}>Sub-total</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {selectedOrder.items.map((item: any, index: number) => (
                                <TableRow
                                  key={item.id || index}
                                  hover
                                  sx={{
                                    '&:hover': { backgroundColor: 'action.hover' },
                                    transition: 'background-color 0.2s ease',
                                    height: TABLE_STYLES.row.height
                                  }}
                                >
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {item.product?.name || item.description || 'N/A'}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                    {item.quantity}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(item.unitPrice || item.unitCost || 0)}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                    {item.discountAmount ? (
                                      <Box component="span">
                                        {`-${formatCurrency(item.discountAmount)}`}
                                        {item.discountPercent > 0 && (
                                          <Typography component="span" sx={{
                                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                            color: 'text.secondary',
                                            ml: 0.5
                                          }}>
                                            ({item.discountPercent}%)
                                          </Typography>
                                        )}
                                      </Box>
                                    ) : '-'}
                                  </TableCell>
                                  <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(item.totalAmount || item.total || (item.quantity * (item.unitPrice || item.unitCost || 0)))}
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
                  </Grid>

                  {/* Notes Section */}
                  {selectedOrder.notes && (
                    <Grid item xs={12} sx={{ pt: '0 !important' }}>
                      {/* Page Break */}
                      <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

                      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          mb: 1
                        }}>
                          Notes
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
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select a purchase order to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setOrderToDelete(null)
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Purchase Order"
        message={`Are you sure you want to delete purchase order ${orderToDelete?.orderNumber}? This action can be undone from the deleted orders list.`}
        confirmText="Delete"
        severity="error"
      />

      {/* Deleted Purchase Orders Dialog */}
      <DeletedPurchaseOrdersDialog
        open={deletedOrdersDialogOpen}
        onClose={() => setDeletedOrdersDialogOpen(false)}
        onRefresh={loadOrders}
      />

      {/* Blocked Purchase Order Dialog */}
      {selectedOrder && (
        <BlockedPurchaseOrderDialog
          open={unreturnDialogOpen}
          orderNumber={selectedOrder.orderNumber}
          isReceived={
            selectedOrder.goodsReceivedNotes &&
            selectedOrder.goodsReceivedNotes.length > 0 &&
            selectedOrder.goodsReceivedNotes[0].status === 'received'
          }
          isPaid={paymentStatus[selectedOrder.id] === true}
          actionType={blockedDialogType}
          onClose={() => setUnreturnDialogOpen(false)}
          onReturnAndEdit={handleReturnAndEdit}
          onReturnOnly={handleReturnOnly}
          onUnpayAndEdit={handleUnpayAndEdit}
          onUnpayOnly={handleUnpayOnly}
          onReturnAndDelete={handleReturnAndDelete}
          onUnpayAndDelete={handleUnpayAndDelete}
          loading={isLoading}
        />
      )}
    </Box>
  )
}

export default PurchaseOrdersPage
