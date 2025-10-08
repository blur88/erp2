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
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  ShoppingCart as OrderIcon,
  RestoreFromTrash as RestoreIcon,
  Keyboard as KeyboardIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Send as SendIcon,
  CheckCircle as ApproveIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchPurchaseOrders,
  fetchSuppliers,
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
import KeyboardShortcutsHelp from '@/components/common/KeyboardShortcutsHelp'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedPurchaseOrdersDialog from '@/components/purchasing/DeletedPurchaseOrdersDialog'

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

  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
  }, [dispatch, state])

  useEffect(() => {
    loadOrders()
  }, [loadOrders])

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

  const handleDeleteClick = () => {
    if (!selectedOrder) return
    setOrderToDelete(selectedOrder)
    setDeleteConfirmOpen(true)
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
        setFocusedOrderIndex(0)
        dispatch(setSelectedPurchaseOrder(purchaseOrders[0]))
      }
    }
  }, [purchaseOrders, focusedOrderIndex, selectedOrder, dispatch])

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

  const handleViewDeletedAction = useCallback(() => {
    setDeletedOrdersDialogOpen(true)
  }, [])

  const handleRefreshAction = useCallback(() => {
    loadOrders()
  }, [loadOrders])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onRefresh: handleRefreshAction,
    onViewDeleted: handleViewDeletedAction,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

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
                Purchase Order List ({pagination?.total || 0})
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
                  Purchase Order Details - {selectedOrder.orderNumber}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                  <IconButton
                    size="small"
                    title="Edit Order"
                    onClick={() => navigate(`/purchasing/orders/${selectedOrder.id}/edit`)}
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
                            '&:nth-of-type(1)': { width: '40%' },
                            '&:nth-of-type(2)': { width: '60%' },
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
                              Order Date
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
                              Status
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedOrder.status || 'Pending'}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Financial Summary */}
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
                            '&:nth-of-type(1)': { width: '40%' },
                            '&:nth-of-type(2)': { width: '60%' },
                          }
                        }}
                      >
                        <TableBody>
                          {/* Financial Summary Section */}
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
                                Financial Summary
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
                              fontWeight: 600,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Total Amount
                            </TableCell>
                            <TableCell sx={{
                              fontWeight: 600,
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
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Order Items Section */}
                  <Grid item xs={12}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          '& .MuiTableCell-root': {
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                          }
                        }}
                      >
                        <TableHead>
                          <TableRow>
                            <TableCell colSpan={5} sx={{
                              borderBottom: TABLE_STYLES.cell.border,
                              pb: TABLE_STYLES.cell.padding.py * 0.67
                            }}>
                              <Typography variant="h6" sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                              }}>
                                Order Items
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              color: 'text.secondary'
                            }}>
                              Product
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              color: 'text.secondary'
                            }}>
                              Quantity
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              color: 'text.secondary'
                            }}>
                              Unit Price
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              color: 'text.secondary'
                            }}>
                              Discount
                            </TableCell>
                            <TableCell align="right" sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              color: 'text.secondary'
                            }}>
                              Total
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedOrder.items && selectedOrder.items.length > 0 ? (
                            selectedOrder.items.map((item: any, index: number) => (
                              <TableRow key={index} sx={{ backgroundColor: index % 2 === 0 ? 'grey.50' : 'inherit' }}>
                                <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                  {item.description || item.productName || 'N/A'}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                  {item.quantity}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                  {formatCurrency(item.unitPrice || item.unitCost || 0)}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                  {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                                  {item.discountPercent > 0 && (
                                    <Typography sx={{
                                      fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                      color: 'text.secondary',
                                      display: 'block'
                                    }}>
                                      ({item.discountPercent}%)
                                    </Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                  {formatCurrency(item.totalAmount || item.total || (item.quantity * (item.unitPrice || item.unitCost || 0)))}
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell colSpan={5}>
                                <Alert severity="info">No items in this order</Alert>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
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

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />

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
    </Box>
  )
}

export default PurchaseOrdersPage
