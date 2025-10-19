import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
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
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Payment as PaymentIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Keyboard as KeyboardIcon,
  Receipt as InvoiceIcon,
  ShoppingCart as OrderIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import KeyboardShortcutsHelp from '@/components/common/KeyboardShortcutsHelp'
import DeletedPaymentsDialog from '@/components/sales/DeletedPaymentsDialog'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useNotification } from '@/hooks/useNotification'
import { salesApi } from '@/services/salesApi'

// Payment types and interfaces
interface Payment {
  id: string
  paymentNumber: string
  customerName: string
  amount: number
  paymentDate: string
  paymentMethod: 'cash' | 'card' | 'bank_transfer' | 'check' | 'other'
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  reference?: string
  notes?: string
  relatedOrderId?: string
  relatedInvoiceId?: string
  relatedOrderNumber?: string
  relatedInvoiceNumber?: string
  customer?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
  salesOrder?: {
    id: string
    orderNumber: string
  }
  invoice?: {
    id: string
    invoiceNumber: string
  }
}

interface PaymentsPageState {
  page: number
  rowsPerPage: number
}

interface PaymentFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  dateFilter: string
  customFromDate: string
  customToDate: string
  customerId: string
  paymentMethod: string
}


// Memoized Payment Row Component
interface PaymentRowProps {
  payment: Payment
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: Payment) => void
}

const PaymentRow = memo(({ payment, index, selectedPaymentId, focusedPaymentIndex, onPaymentSelect }: PaymentRowProps) => {
  const isSelected = selectedPaymentId === payment.id
  const isFocused = index === focusedPaymentIndex

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success'
      case 'pending': return 'warning'
      case 'failed': return 'error'
      case 'refunded': return 'info'
      default: return 'default'
    }
  }

  return (
    <TableRow
      key={payment.id}
      hover
      onClick={() => onPaymentSelect(payment)}
      data-payment-index={index}
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
          {payment.paymentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

PaymentRow.displayName = 'PaymentRow'

const PaymentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [totalPayments, setTotalPayments] = useState(0)

  const [state, setState] = useState<PaymentsPageState>({
    page: 0,
    rowsPerPage: 20,
  })

  const [filters, setFilters] = useState<PaymentFilters>({
    search: '',
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
    customerId: 'all',
    paymentMethod: 'all'
  })

  const [editDialog, setEditDialog] = useState(false)
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const paymentListRef = useRef<HTMLDivElement>(null)

  // Memoize search change callback to prevent unnecessary re-renders
  const onSearchChange = useCallback((searchTerm: string) => {
    setFilters((prev: PaymentFilters) => ({ ...prev, search: searchTerm }))
  }, [])

  // Search and filter functionality
  const { searchTerm, setSearchTerm: originalSetSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: filters.search,
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
        return { fromDate: filters.customFromDate, toDate: filters.customToDate }
      default: // 'all'
        return { fromDate: undefined, toDate: undefined }
    }
  }, [filters.customFromDate, filters.customToDate])

  // Filter and sort payments
  // Since backend handles filtering, sorting, and pagination, use payments directly
  const filteredPayments = payments
  const paginatedPayments = payments

  const handleSort = useCallback((field: string) => {
    const newSortOrder = filters.sortBy === field && filters.sortOrder === 'desc' ? 'asc' : 'desc'
    setFilters((prev: PaymentFilters) => ({
      ...prev,
      sortBy: field,
      sortOrder: newSortOrder
    }))
    setState((prev: PaymentsPageState) => ({ ...prev, page: 0 }))
  }, [filters.sortBy, filters.sortOrder])

  const handlePaymentSelect = useCallback((payment: Payment) => {
    setSelectedPayment(payment)
    const paymentIndex = paginatedPayments.findIndex((p: Payment) => p.id === payment.id)
    setFocusedPaymentIndex(paymentIndex)
  }, [paginatedPayments])

  // Load payments from API
  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dateRange = getDateRange(filters.dateFilter)
      const response = await salesApi.getPayments({
        page: state.page + 1,
        limit: state.rowsPerPage,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder.toUpperCase() as 'ASC' | 'DESC',
        search: filters.search,
        customerId: filters.customerId === 'all' ? undefined : filters.customerId,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      } as any)

      // Backend returns { data: Payment[], total, page, limit, totalPages }
      const paymentsData = (response as any)
      if (paymentsData) {
        setPayments(paymentsData.data || [])
        setTotalPayments(paymentsData.total || 0)
      }
    } catch (err: any) {
      console.error('Failed to load payments:', err)
      setError(err.message || 'Failed to load payments')
      showError('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [state.page, state.rowsPerPage, filters, getDateRange, showError])

  // Load payments on mount and when filters change
  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  const handleOrderClick = useCallback((orderId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/orders', { state: { highlightOrderId: orderId } })
  }, [navigate])

  const handleInvoiceClick = useCallback((invoiceId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoiceId: invoiceId } })
  }, [navigate])

  // Auto-select first payment when payments load
  useEffect(() => {
    if (paginatedPayments.length > 0 && focusedPaymentIndex === -1) {
      if (!selectedPayment && searchInputRef.current !== document.activeElement) {
        setFocusedPaymentIndex(0)
        setSelectedPayment(paginatedPayments[0])
      }
    }
  }, [paginatedPayments, focusedPaymentIndex, selectedPayment])

  // Handle navigation from order page with highlightPaymentId
  useEffect(() => {
    const state = location.state as { highlightPaymentId?: string }
    if (state?.highlightPaymentId && paginatedPayments.length > 0) {
      const paymentIndex = paginatedPayments.findIndex(p => p.id === state.highlightPaymentId)
      if (paymentIndex >= 0) {
        setSelectedPayment(paginatedPayments[paymentIndex])
        setFocusedPaymentIndex(paymentIndex)
        // Clear the state to prevent repeated highlighting
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [paginatedPayments, location.state])

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    if (focusedPaymentIndex >= 0 && paymentListRef.current) {
      const focusedRow = paymentListRef.current.querySelector(`[data-payment-index="${focusedPaymentIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedPaymentIndex])

  // Keyboard navigation functions
  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) {
      const newIndex = focusedPaymentIndex - 1
      setFocusedPaymentIndex(newIndex)
      setSelectedPayment(paginatedPayments[newIndex])
    }
  }, [focusedPaymentIndex, paginatedPayments])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < paginatedPayments.length - 1) {
      const newIndex = focusedPaymentIndex + 1
      setFocusedPaymentIndex(newIndex)
      setSelectedPayment(paginatedPayments[newIndex])
    }
  }, [focusedPaymentIndex, paginatedPayments])

  const handleNavigateToFirst = useCallback(() => {
    if (paginatedPayments.length > 0) {
      setFocusedPaymentIndex(0)
      setSelectedPayment(paginatedPayments[0])
    }
  }, [paginatedPayments])

  const handleNavigateToLast = useCallback(() => {
    if (paginatedPayments.length > 0) {
      const lastIndex = paginatedPayments.length - 1
      setFocusedPaymentIndex(lastIndex)
      setSelectedPayment(paginatedPayments[lastIndex])
    }
  }, [paginatedPayments])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedPaymentIndex - state.rowsPerPage)
    setFocusedPaymentIndex(newIndex)
    if (paginatedPayments[newIndex]) {
      setSelectedPayment(paginatedPayments[newIndex])
    }
  }, [focusedPaymentIndex, state.rowsPerPage, paginatedPayments])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(paginatedPayments.length - 1, focusedPaymentIndex + state.rowsPerPage)
    setFocusedPaymentIndex(newIndex)
    if (paginatedPayments[newIndex]) {
      setSelectedPayment(paginatedPayments[newIndex])
    }
  }, [focusedPaymentIndex, state.rowsPerPage, paginatedPayments])

  const handleEnterAction = useCallback(() => {
    if (focusedPaymentIndex >= 0 && paginatedPayments[focusedPaymentIndex]) {
      setEditDialog(true)
    }
  }, [focusedPaymentIndex, paginatedPayments])

  const handleEditAction = () => {
    if (selectedPayment) {
      setEditDialog(true)
    }
  }

  const handleDeleteAction = () => {
    if (selectedPayment) {
      showError('Delete functionality will be implemented later')
    }
  }

  const handleRefreshAction = () => {
    showSuccess('Payments refreshed')
  }

  const handleViewDeletedAction = () => {
    setDeletedPaymentsDialogOpen(true)
  }

  const handleEscapeAction = useCallback(() => {
    setFocusedPaymentIndex(-1)
    setSelectedPayment(null)
    setEditDialog(false)
    setKeyboardHelpOpen(false)
  }, [])

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success'
      case 'pending': return 'warning'
      case 'failed': return 'error'
      case 'refunded': return 'info'
      default: return 'default'
    }
  }

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash'
      case 'card': return 'Card'
      case 'bank_transfer': return 'Bank Transfer'
      case 'check': return 'Check'
      case 'other': return 'Other'
      default: return method
    }
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
            <PaymentIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Payments
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage customer payments and track financial transactions ({totalPayments} total)
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
            onClick={handleRefreshAction}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Payments" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedPaymentsDialogOpen(true)}
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
          placeholder="Search payments..."
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
            value={filters.dateFilter}
            label="Date Filter"
            onChange={(e) => {
              setFilters((prev: PaymentFilters) => ({ ...prev, dateFilter: e.target.value }))
              setState((prev: PaymentsPageState) => ({ ...prev, page: 0 }))
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

        {filters.dateFilter === 'custom' && (
          <>
            <TextField
              label="From Date"
              type="date"
              value={filters.customFromDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setFilters((prev: PaymentFilters) => ({ ...prev, customFromDate: e.target.value }))
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
              value={filters.customToDate}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                setFilters((prev: PaymentFilters) => ({ ...prev, customToDate: e.target.value }))
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
          <InputLabel>Payment Method</InputLabel>
          <Select
            value={filters.paymentMethod}
            label="Payment Method"
            onChange={(e) => {
              setFilters((prev: PaymentFilters) => ({ ...prev, paymentMethod: e.target.value }))
              setState((prev: PaymentsPageState) => ({ ...prev, page: 0 }))
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
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="card">Card</MenuItem>
            <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
            <MenuItem value="check">Check</MenuItem>
            <MenuItem value="other">Other</MenuItem>
          </Select>
        </FormControl>

        {(filters.dateFilter !== 'all' || filters.paymentMethod !== 'all' || filters.search) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              setFilters({
                search: '',
                sortBy: 'paymentNumber',
                sortOrder: 'asc',
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
                customerId: 'all',
                paymentMethod: 'all'
              })
              setState((prev: PaymentsPageState) => ({ ...prev, page: 0 }))
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
          variant={filters.sortBy === 'paymentNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={filters.sortBy === 'paymentNumber' ? (filters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('paymentNumber')}
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

      {/* Split Layout: Payment List and Payment Details */}
      <Grid container spacing={3}>
        {/* Left Side - Payment List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Payment List ({totalPayments})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
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
                  <TableHead sx={{ display: 'none' }}>
                    <TableRow sx={{ '& .MuiTableCell-head': {
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      backgroundColor: 'grey.50',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    } }}>
                      <TableCell>Payment #</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading && paginatedPayments.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell><Skeleton height={40} /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      paginatedPayments.map((payment: Payment, index: number) => (
                        <PaymentRow
                          key={payment.id}
                          payment={payment}
                          index={index}
                          selectedPaymentId={selectedPayment?.id}
                          focusedPaymentIndex={focusedPaymentIndex}
                          onPaymentSelect={handlePaymentSelect}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              <TablePagination
                component="div"
                count={totalPayments}
                page={state.page}
                onPageChange={(_: unknown, newPage: number) => setState((prev: PaymentsPageState) => ({ ...prev, page: newPage }))}
                rowsPerPage={state.rowsPerPage}
                onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: PaymentsPageState) => ({
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

        {/* Right Side - Payment Details */}
        <Grid item xs={12} md={9}>
          {selectedPayment ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              {/* Header with Payment Info and Actions */}
              <Box sx={{
                p: TABLE_STYLES.cell.padding.px,
                borderBottom: TABLE_STYLES.cell.border,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    Payment Details - {selectedPayment.paymentNumber}
                  </Typography>
                  <Chip
                    label={selectedPayment.status.charAt(0).toUpperCase() + selectedPayment.status.slice(1)}
                    color={getStatusColor(selectedPayment.status)}
                    size="small"
                    sx={{
                      textTransform: 'capitalize',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}
                  />
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                {/* Payment Details Section */}
                <Grid container spacing={3}>
                  {/* Left Column - Payment Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                                Payment Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Customer
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedPayment.customerName}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Phone No
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedPayment.customer?.phone ? (
                                selectedPayment.customer.phone
                              ) : (
                                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedPayment.amount)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Payment Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedPayment.paymentDate)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Method
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {getPaymentMethodLabel(selectedPayment.paymentMethod)}
                            </TableCell>
                          </TableRow>
                          {selectedPayment.reference && (
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                Reference
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {selectedPayment.reference}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Related Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                                Related Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Order No
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedPayment.relatedOrderNumber ? (
                                <Typography
                                  component="button"
                                  onClick={(event) => handleOrderClick(selectedPayment.relatedOrderId!, event)}
                                  sx={{
                                    fontSize: '0.8rem',
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
                                  {selectedPayment.relatedOrderNumber}
                                </Typography>
                              ) : (
                                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Invoice No
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedPayment.relatedInvoiceNumber ? (
                                <Typography
                                  component="button"
                                  onClick={(event) => handleInvoiceClick(selectedPayment.relatedInvoiceId!, event)}
                                  sx={{
                                    fontSize: '0.8rem',
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
                                  {selectedPayment.relatedInvoiceNumber}
                                </Typography>
                              ) : (
                                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                  N/A
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                          {selectedPayment.customer?.email && (
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                Customer Email
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {selectedPayment.customer.email}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
                </Grid>

                {/* Payment Notes Section */}
                {selectedPayment.notes && (
                  <Box sx={{ mt: 2 }}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'info.main', fontSize: '0.9rem' }}>
                                Notes
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
                              {selectedPayment.notes}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select a payment to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Placeholder Dialogs */}
      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Payment</DialogTitle>
        <DialogContent>
          <Typography>Payment editing form will be implemented here.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>Cancel</Button>
          <Button variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>

      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp
        open={keyboardHelpOpen}
        onClose={() => setKeyboardHelpOpen(false)}
      />

      {/* Deleted Payments Dialog */}
      <DeletedPaymentsDialog
        open={deletedPaymentsDialogOpen}
        onClose={() => setDeletedPaymentsDialogOpen(false)}
      />
    </Box>
  )
}

export default PaymentsPage
