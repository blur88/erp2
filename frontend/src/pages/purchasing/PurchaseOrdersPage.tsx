import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useNavigate, Link, useSearchParams, useLocation } from 'react-router-dom'
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
  Description as OrderIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchPurchaseOrders,
  fetchSuppliers,
  fetchGoodsReceivedNotes,
  setSelectedPurchaseOrder,
  updatePurchaseOrderInPlace,
  selectPurchaseOrders,
  selectSelectedPurchaseOrder,
  selectPurchasingLoading,
  selectPurchasingError,
  selectPurchasingPagination,
  selectSupplierUpdateTimestamp,
} from '@/store/slices/purchasingSlice'
import { purchasingApi } from '@/services/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedPurchaseOrdersDialog from '@/components/purchasing/DeletedPurchaseOrdersDialog'
import BlockedPurchaseOrderDialog from '@/components/purchasing/BlockedPurchaseOrderDialog'
import { PurchaseOrderPrint } from '@/components/print'

interface PurchaseOrdersPageState {
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
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()

  const purchaseOrders = useAppSelector(selectPurchaseOrders) || []
  const suppliers = useAppSelector((state: any) => state.purchasing.suppliers) || []
  const loading = useAppSelector(selectPurchasingLoading)?.purchaseOrders || false
  const error = useAppSelector(selectPurchasingError)
  const pagination = useAppSelector(selectPurchasingPagination)?.purchaseOrders
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)
  const supplierUpdateTimestamp = useAppSelector(selectSupplierUpdateTimestamp)

  const [state, setState] = useState<PurchaseOrdersPageState>({
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc', // ASC so lower numbers appear first
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
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const processedHighlightRef = useRef<string | null>(null)
  const userHasNavigatedRef = useRef(false)

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

  // Refetch purchase orders when a supplier is updated
  useEffect(() => {
    if (supplierUpdateTimestamp) {
      loadOrders()
    }
  }, [supplierUpdateTimestamp])

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


  const handleSort = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc'
    }))
  }, [])

  const handleOrderSelect = useCallback(async (order: any) => {
    const orderIndex = purchaseOrders.findIndex((o: any) => o.id === order.id)
    setFocusedOrderIndex(orderIndex)
    userHasNavigatedRef.current = true

    try {
      // Fetch fresh data from server to ensure supplier name is current
      const response = await purchasingApi.getPurchaseOrder(order.id)
      const freshOrder = (response as any).data || response

      // Update both the selected order and the order in the list
      dispatch(setSelectedPurchaseOrder(freshOrder))
      dispatch(updatePurchaseOrderInPlace(freshOrder))
    } catch (error) {
      console.error('Error fetching purchase order:', error)
      // Fallback to cached order if fetch fails
      dispatch(setSelectedPurchaseOrder(order))
    }
  }, [dispatch, purchaseOrders])

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
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
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
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
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
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0

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
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
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
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
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

      // Step 1: If received, return goods first
      if (isReceived) {
        await purchasingApi.returnGoods(selectedOrder.id)

        // Refetch GRNs to update the GRN page with latest data
        dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))

        // Step 2: Then unpay
        const unpayResponse = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)
        showSuccess('Goods returned and payment deleted successfully. You can now edit the order.')

        // Update with the latest data
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder && updatedOrder.id) {
          const orderWithoutPayment = {
            ...(updatedOrder as any),
            vendorPayments: []
          }
          dispatch(setSelectedPurchaseOrder(orderWithoutPayment))
        }
      } else {
        // Only unpay (not received)
        const unpayResponse = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)
        showSuccess('Payment deleted successfully. You can now edit the order.')

        // Update the selected order with the unpay data
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder && updatedOrder.id) {
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


  const handleReturnAndDelete = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      // First return goods
      await purchasingApi.returnGoods(selectedOrder.id)

      // Then delete the order
      await purchasingApi.deletePurchaseOrder(selectedOrder.id)
      showSuccess('Goods returned and purchase order deleted successfully.')

      setUnreturnDialogOpen(false)

      // Select previous order or null
      const deletedIndex = purchaseOrders.findIndex((o: any) => o.id === selectedOrder.id)
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

      // Step 1: If received, return goods first
      if (isReceived) {
        await purchasingApi.returnGoods(selectedOrder.id)
        // Refetch GRNs to update the GRN page with latest data
        dispatch(fetchGoodsReceivedNotes({ page: 1, limit: 20 }))
      }

      // Step 2: Unpay
      await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)

      // Step 3: Delete the order
      await purchasingApi.deletePurchaseOrder(selectedOrder.id)

      if (isReceived) {
        showSuccess('Goods returned, payment deleted, and purchase order deleted successfully.')
      } else {
        showSuccess('Payment deleted and purchase order deleted successfully.')
      }

      setUnreturnDialogOpen(false)

      // Select previous order or null
      const deletedIndex = purchaseOrders.findIndex((o: any) => o.id === selectedOrder.id)
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

  const handleUnpay = async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await purchasingApi.markPurchaseOrderAsUnpaid(selectedOrder.id)
      showSuccess('Payment deleted successfully')

      // Update the selected order with the new data
      // ApiService wraps response, check both response.data.data || response.data
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder && updatedOrder.id) {
        // Clear vendorPayments array when unpaying
        const orderWithoutPayment = {
          ...(updatedOrder as any),
          vendorPayments: [],
          paidAmount: 0
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

  const handleRecordPayment = async () => {
    if (!selectedOrder) return

    // Calculate the new total paid amount
    let newPaidAmount: number
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
      // Optimistically update the UI
      const optimisticUpdate = {
        ...selectedOrder,
        paidAmount: newPaidAmount
      }
      dispatch(setSelectedPurchaseOrder(optimisticUpdate))
      setPaymentAmount('')

      const response = await purchasingApi.recordPurchaseOrderPayment(selectedOrder.id, newPaidAmount)

      // Handle the response data structure
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData

      dispatch(setSelectedPurchaseOrder(updatedOrder))
      showSuccess(`Payment of ${formatCurrency(paymentToAdd)} recorded successfully. Total paid: ${formatCurrency(newPaidAmount)}`)

      // Reload orders to update the list with new vendor payments
      loadOrders()
    } catch (error: any) {
      // Revert optimistic update on error
      dispatch(setSelectedPurchaseOrder(selectedOrder))
      setPaymentAmount(paymentToAdd.toString())
      console.error('Error recording payment:', error)
      const errorMessage = error?.response?.data?.message || 'Failed to record payment'
      showError(errorMessage)
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

    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0

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
    const deletedIndex = purchaseOrders.findIndex((o: any) => o.id === orderToDelete.id)

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
    // Check if there's a highlightOrderId in location.state OR if we recently processed one
    const state = location.state as { highlightOrderId?: string }
    const hasHighlightOrderId = !!state?.highlightOrderId || !!processedHighlightRef.current

    if (purchaseOrders.length > 0 && focusedOrderIndex === -1) {
      if (selectedOrder) {
        // We have a selected order - find its index and focus it
        const orderIndex = purchaseOrders.findIndex((o: any) => o.id === selectedOrder.id)
        if (orderIndex >= 0) {
          setFocusedOrderIndex(orderIndex)
        } else {
          // Selected order not in current list (due to filters) - focus first order but keep selection
          setFocusedOrderIndex(0)
        }
      } else if (searchInputRef.current !== document.activeElement && !hasHighlightOrderId) {
        // Don't auto-select if we have a poId query parameter
        const poId = searchParams.get('poId')
        if (!poId) {
          // No selected order - auto-focus and select first order
          setFocusedOrderIndex(0)
          dispatch(setSelectedPurchaseOrder(purchaseOrders[0]))
        }
      }
    }
  }, [purchaseOrders, focusedOrderIndex, selectedOrder, dispatch, searchParams, location.state])

  // Clear selection when no orders exist
  useEffect(() => {
    if (purchaseOrders.length === 0 && selectedOrder) {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [purchaseOrders.length, selectedOrder, dispatch])

  // Handle navigation from create/edit page with highlightOrderId
  useEffect(() => {
    const state = location.state as { highlightOrderId?: string }
    if (state?.highlightOrderId && purchaseOrders.length > 0) {
      const orderIndex = purchaseOrders.findIndex((o: any) => o.id === state.highlightOrderId)
      if (orderIndex >= 0) {
        // Only process if we haven't already processed this highlight ID
        if (processedHighlightRef.current !== state.highlightOrderId) {
          dispatch(setSelectedPurchaseOrder(purchaseOrders[orderIndex]))
          setFocusedOrderIndex(orderIndex)
          // Mark this ID as processed and reset navigation flag
          processedHighlightRef.current = state.highlightOrderId
          userHasNavigatedRef.current = false
        } else if (!userHasNavigatedRef.current) {
          // Already processed, but update focusedOrderIndex if order position changed
          // ONLY if user hasn't manually navigated away yet
          setFocusedOrderIndex(orderIndex)
        }
      }
    } else if (!state?.highlightOrderId) {
      // Reset when there's no highlightOrderId (e.g., normal navigation)
      processedHighlightRef.current = null
      userHasNavigatedRef.current = false
    }
  }, [purchaseOrders, location.state, dispatch])

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

  // Keyboard shortcuts
  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      const newIndex = focusedOrderIndex - 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [focusedOrderIndex, purchaseOrders, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < purchaseOrders.length - 1) {
      const newIndex = focusedOrderIndex + 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
      userHasNavigatedRef.current = true
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
          onChange={(e) => setState(prev => ({ ...prev, search: e.target.value }))}
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
            onChange={(e) => setState(prev => ({ ...prev, dateFilter: e.target.value }))}
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
            onChange={(e) => setState(prev => ({ ...prev, supplierFilter: e.target.value }))}
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
              supplierFilter: 'all'
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
        <Grid
          size={{
            xs: 12,
            md: 3
          }}>
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
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Order Details */}
        <Grid
          size={{
            xs: 12,
            md: 9
          }}>
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
                  <IconButton
                    size="small"
                    title="Print Purchase Order"
                    onClick={() => setPrintDialogOpen(true)}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      color: 'info.main',
                    }}
                  >
                    <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
                  </IconButton>
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                <Grid container spacing={3}>
                  {/* Left Column - PO Information */}
                  <Grid
                    sx={{ pb: '0 !important' }}
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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
                                                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
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
                          <TableRow>
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
                                        to={`/purchasing/vendor-payments?vpId=${payment.id}`}
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
                  <Grid
                    sx={{ pb: '0 !important' }}
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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
                              Total
                            </TableCell>
                            <TableCell sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              {formatCurrency(selectedOrder.totalAmount || 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Paid
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                                }}>
                                  {formatCurrency(selectedOrder.paidAmount || 0)}
                                </Typography>
                                <Typography sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                  +
                                </Typography>
                                <TextField
                                  size="small"
                                  type="number"
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
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
                                />
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Balance
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={{
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                  color: (() => {
                                    const additionalPayment = paymentAmount && !isNaN(parseFloat(paymentAmount)) ? parseFloat(paymentAmount) : 0
                                    const currentPaid = (selectedOrder.paidAmount || 0) + additionalPayment
                                    const balance = (selectedOrder.totalAmount || 0) - currentPaid
                                    return balance < 0 ? 'error.main' : 'inherit'
                                  })()
                                }}>
                                  {(() => {
                                    const additionalPayment = paymentAmount && !isNaN(parseFloat(paymentAmount)) ? parseFloat(paymentAmount) : 0
                                    const currentPaid = (selectedOrder.paidAmount || 0) + additionalPayment
                                    const balance = (selectedOrder.totalAmount || 0) - currentPaid
                                    return balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)
                                  })()}
                                </Typography>
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
                                    const isPaidInFull = (selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0
                                    return isPaidInFull ? "warning" : "primary"
                                  })()}
                                  onClick={(() => {
                                    const isPaidInFull = (selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0
                                    return isPaidInFull ? handleUnpay : handleRecordPayment
                                  })()}
                                  disabled={(() => {
                                    const isReceived = selectedOrder.goodsReceivedNotes &&
                                      selectedOrder.goodsReceivedNotes.length > 0 &&
                                      selectedOrder.goodsReceivedNotes[0].status === 'received'
                                    const isPaidInFull = (selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0
                                    // Disable unpay button if order is received, or if loading
                                    return (isPaidInFull && isReceived) || isLoading
                                  })()}
                                  sx={{ minWidth: 110 }}
                                >
                                  {(() => {
                                    const isPaidInFull = (selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0
                                    return isPaidInFull
                                      ? "Unpay"
                                      : (selectedOrder.paidAmount > 0 ? "Pay Remaining" : "Pay")
                                  })()}
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
                                    disabled={
                                      !selectedOrder?.items ||
                                      selectedOrder.items.length === 0 ||
                                      isLoading ||
                                      !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
                                    }
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
                  <Grid sx={{ pt: '0 !important' }} size={12}>
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
                    <Grid sx={{ pt: '0 !important' }} size={12}>
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
          isPaid={!!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)}
          actionType={blockedDialogType}
          onClose={() => setUnreturnDialogOpen(false)}
          onReturnAndEdit={handleReturnAndEdit}
          onReturnOnly={handleReturnOnly}
          onUnpayAndEdit={handleUnpayAndEdit}
          onReturnAndDelete={handleReturnAndDelete}
          onUnpayAndDelete={handleUnpayAndDelete}
          loading={isLoading}
        />
      )}
      {/* Print Dialog */}
      {selectedOrder && (
        <PurchaseOrderPrint
          open={printDialogOpen}
          onClose={() => setPrintDialogOpen(false)}
          purchaseOrder={selectedOrder}
        />
      )}
    </Box>
  );
}

export default PurchaseOrdersPage
