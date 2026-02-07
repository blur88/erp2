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
  Payment as PaymentIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Receipt as InvoiceIcon,
  ShoppingCart as OrderIcon,
  RestoreFromTrash as RestoreIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import DeletedPaymentsDialog from '@/components/sales/DeletedPaymentsDialog'
import { PaymentReceiptPrint } from '@/components/print'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useNotification } from '@/hooks/useNotification'
import { salesApi } from '@/services/salesApi'
import AccountingEntryLink from '@/components/accounting/AccountingEntryLink'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { setSelectedPayment, selectSelectedPayment } from '@/store/slices/salesSlice'
import type { InvoiceItem } from '@/types'

// Payment types and interfaces
interface Payment {
  id: string
  paymentNumber: string
  customerName: string
  amount: number
  paymentDate: string
  paymentMethod: 'cash'
  status: 'completed'
  notes?: string
  reference?: string
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
    items?: InvoiceItem[]
  }
}

interface PaymentFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  dateFilter: string
  customFromDate: string
  customToDate: string
  customerId: string
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
  const dispatch = useAppDispatch()
  const selectedPayment = useAppSelector(selectSelectedPayment) as Payment | null

  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true) // Start as true to prevent clearing selection on mount
  const [error, setError] = useState<string | null>(null)
  const [totalPayments, setTotalPayments] = useState(0)

  const [filters, setFilters] = useState<PaymentFilters>({
    search: '',
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
    customerId: 'all'
  })

  const [editDialog, setEditDialog] = useState(false)
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const paymentListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const selectedPaymentRef = useRef(selectedPayment)
  const previousPathnameRef = useRef(location.pathname)

  // Keep ref in sync with selectedPayment
  useEffect(() => {
    selectedPaymentRef.current = selectedPayment
  }, [selectedPayment])

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
  }, [filters.sortBy, filters.sortOrder])

  const handlePaymentSelect = useCallback((payment: Payment) => {
    dispatch(setSelectedPayment(payment as any))
    const paymentIndex = paginatedPayments.findIndex((p: Payment) => p.id === payment.id)
    setFocusedPaymentIndex(paymentIndex)
  }, [paginatedPayments, dispatch])

  // Load payments from API
  const loadPayments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const dateRange = getDateRange(filters.dateFilter)
      const response = await salesApi.getPayments({
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder.toUpperCase() as 'ASC' | 'DESC',
        search: filters.search,
        customerId: filters.customerId === 'all' ? undefined : filters.customerId,
        fromDate: dateRange.fromDate,
        toDate: dateRange.toDate,
      } as any)

      // Backend returns { data: Payment[], meta: { total } }
      const paymentsData = (response as any)
      if (paymentsData) {
        setPayments(paymentsData.data || [])
        setTotalPayments(paymentsData.meta?.total || 0)
      }
    } catch (err: any) {
      console.error('Failed to load payments:', err)
      setError(err.message || 'Failed to load payments')
      showError('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }, [filters, getDateRange, showError])

  // Load payments on mount and when filters change
  useEffect(() => {
    loadPayments()
  }, [loadPayments])

  // Refresh on route navigation (when coming back from another page)
  useEffect(() => {
    // Only refresh if we navigated TO payments page FROM somewhere else
    if (previousPathnameRef.current !== '/sales/payments' && location.pathname === '/sales/payments') {
      loadPayments()
      // Reset restoration flag so selection can be restored again
      hasRestoredSelection.current = false
      // Don't reset focusedPaymentIndex here - let the restoration effect handle it
    }
    previousPathnameRef.current = location.pathname
  }, [location.pathname, loadPayments, selectedPayment])

  // Update selected payment when fresh data arrives (to reflect customer changes)
  useEffect(() => {
    if (payments && payments.length > 0 && selectedPaymentRef.current) {
      const freshPayment = payments.find((payment: any) => payment.id === selectedPaymentRef.current?.id)
      if (freshPayment) {
        // Only update if the data actually changed (to avoid infinite loops)
        const hasChanged = JSON.stringify(freshPayment) !== JSON.stringify(selectedPaymentRef.current)
        if (hasChanged) {
          dispatch(setSelectedPayment(freshPayment as any))
        }
      }
    }
  }, [payments, dispatch])

  // Initialize: Restore persisted selected payment on mount
  useEffect(() => {
    if (!hasRestoredSelection.current && selectedPayment && paginatedPayments.length > 0) {
      const index = paginatedPayments.findIndex((p: Payment) => p.id === selectedPayment.id)
      if (index >= 0) {
        // Force update the focused index even if it's already set
        setFocusedPaymentIndex(-1) // Reset first
        setTimeout(() => {
          setFocusedPaymentIndex(index)
          hasRestoredSelection.current = true
        }, 0)
      }
    }
  }, [selectedPayment, paginatedPayments])

  const handleOrderClick = useCallback((orderId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/orders', { state: { highlightOrderId: orderId } })
  }, [navigate])

  const handleInvoiceClick = useCallback((invoiceId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoiceId: invoiceId } })
  }, [navigate])

  // Auto-select first payment when payments load OR restore focus for persisted selection
  useEffect(() => {
    if (paginatedPayments.length > 0 && focusedPaymentIndex === -1) {
      // If we have a persisted selected payment from Redux, restore its focus
      if (selectedPayment) {
        const index = paginatedPayments.findIndex((p: Payment) => p.id === selectedPayment.id)
        if (index >= 0) {
          setFocusedPaymentIndex(index)
        }
      }
      // Only auto-focus first payment if we don't have a selected payment
      else if (searchInputRef.current !== document.activeElement) {
        setFocusedPaymentIndex(0)
        dispatch(setSelectedPayment(paginatedPayments[0] as any))
      }
    } else if (paginatedPayments.length === 0 && !loading) {
      // Only clear selection when no payments in list AND we're done loading
      dispatch(setSelectedPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [paginatedPayments, focusedPaymentIndex, selectedPayment, dispatch, loading])

  // Handle navigation from order page with highlightPaymentId
  useEffect(() => {
    const state = location.state as { highlightPaymentId?: string }
    if (state?.highlightPaymentId && paginatedPayments.length > 0) {
      const paymentIndex = paginatedPayments.findIndex(p => p.id === state.highlightPaymentId)
      if (paymentIndex >= 0) {
        dispatch(setSelectedPayment(paginatedPayments[paymentIndex] as any))
        setFocusedPaymentIndex(paymentIndex)
        // Clear the state to prevent repeated highlighting
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [paginatedPayments, location.state, dispatch])

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
      dispatch(setSelectedPayment(paginatedPayments[newIndex] as any))
    }
  }, [focusedPaymentIndex, paginatedPayments, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < paginatedPayments.length - 1) {
      const newIndex = focusedPaymentIndex + 1
      setFocusedPaymentIndex(newIndex)
      dispatch(setSelectedPayment(paginatedPayments[newIndex] as any))
    }
  }, [focusedPaymentIndex, paginatedPayments, dispatch])

  const handleNavigateToFirst = useCallback(() => {
    if (paginatedPayments.length > 0) {
      setFocusedPaymentIndex(0)
      dispatch(setSelectedPayment(paginatedPayments[0] as any))
    }
  }, [paginatedPayments, dispatch])

  const handleNavigateToLast = useCallback(() => {
    if (paginatedPayments.length > 0) {
      const lastIndex = paginatedPayments.length - 1
      setFocusedPaymentIndex(lastIndex)
      dispatch(setSelectedPayment(paginatedPayments[lastIndex] as any))
    }
  }, [paginatedPayments, dispatch])

  const handlePageUpNavigation = useCallback(() => {
    const pageSize = 20
    const newIndex = Math.max(0, focusedPaymentIndex - pageSize)
    setFocusedPaymentIndex(newIndex)
    if (paginatedPayments[newIndex]) {
      dispatch(setSelectedPayment(paginatedPayments[newIndex] as any))
    }
  }, [focusedPaymentIndex, paginatedPayments, dispatch])

  const handlePageDownNavigation = useCallback(() => {
    const pageSize = 20
    const newIndex = Math.min(paginatedPayments.length - 1, focusedPaymentIndex + pageSize)
    setFocusedPaymentIndex(newIndex)
    if (paginatedPayments[newIndex]) {
      dispatch(setSelectedPayment(paginatedPayments[newIndex] as any))
    }
  }, [focusedPaymentIndex, paginatedPayments, dispatch])

  const handleEnterAction = useCallback(() => {
    if (focusedPaymentIndex >= 0 && paginatedPayments[focusedPaymentIndex]) {
      setEditDialog(true)
    }
  }, [focusedPaymentIndex, paginatedPayments, dispatch])

  const handleEscapeAction = useCallback(() => {
    setFocusedPaymentIndex(-1)
    dispatch(setSelectedPayment(null))
    setEditDialog(false)
  }, [dispatch])

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success'
      default: return 'default'
    }
  }

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash'
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
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize }} />
                </InputAdornment>
              ),
            }
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
              slotProps={{
                inputLabel: {
                  shrink: true,
                }
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
              slotProps={{
                inputLabel: {
                  shrink: true,
                }
              }}
            />
          </>
        )}

        
        {(filters.dateFilter !== 'all' || filters.search) && (
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
                customerId: 'all'
              })
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
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Payment Details */}
        <Grid
          size={{
            xs: 12,
            md: 9
          }}>
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
                <Box>
                  <IconButton
                    size="small"
                    title="Print Receipt"
                    onClick={() => setPrintDialogOpen(true)}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      minHeight: 20,
                      minWidth: 20,
                      p: 0.125,
                      color: 'info.main',
                      '&:hover': {
                        backgroundColor: 'info.light',
                        color: 'info.dark'
                      }
                    }}
                  >
                    <PrintIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                    }} />
                  </IconButton>
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                {/* Payment Details Section */}
                <Grid container spacing={3}>
                  {/* Left Column - Payment Information */}
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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
                              Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedPayment.amount)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Payment Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedPayment.paymentDate)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Method
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {getPaymentMethodLabel(selectedPayment.paymentMethod)}
                            </TableCell>
                          </TableRow>
                          {selectedPayment.reference && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
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
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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

                  {/* Accounting Information */}
                  <Grid size={12}>
                    <Box
                      sx={{
                        p: 2,
                        mt: 2,
                        bgcolor: 'info.lighter',
                        borderRadius: 1,
                        borderLeft: '4px solid',
                        borderColor: 'info.main',
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                        Accounting Information
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                          This payment has been recorded in the accounting system
                        </Typography>
                        <AccountingEntryLink
                          sourceType="payment"
                          sourceId={selectedPayment.id}
                          variant="button"
                          label="View Entry"
                        />
                      </Box>
                    </Box>
                  </Grid>
                </Grid>

                {/* Page Break */}
                <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 3 }} />

                {/* Payment Items Section */}
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    mb: 1
                  }}>
                    Payment Items
                  </Typography>

                  {selectedPayment.invoice?.items && selectedPayment.invoice.items.length > 0 ? (
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
                            <TableCell sx={{ width: '40%' }}>Product</TableCell>
                            <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                            <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                            <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                            <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedPayment.invoice.items.map((item: any, index: number) => (
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
                                {item.product?.name || 'Unknown Product'}
                              </TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                {item.quantity}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.unitPrice)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {item.discountType === 'percentage' && item.discountPercent ? (
                                  `${item.discountPercent}%`
                                ) : item.discount ? (
                                  `-${formatCurrency(item.discount)}`
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.totalAmount || item.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No payment items available</Alert>
                  )}
                </Box>

                {/* Payment Notes Section */}
                {selectedPayment.notes && (
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
                      {selectedPayment.notes}
                    </Box>
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
      {/* Deleted Payments Dialog */}
      <DeletedPaymentsDialog
        open={deletedPaymentsDialogOpen}
        onClose={() => setDeletedPaymentsDialogOpen(false)}
      />
      {/* Print Dialog */}
      {selectedPayment && (
        <PaymentReceiptPrint
          open={printDialogOpen}
          onClose={() => setPrintDialogOpen(false)}
          payment={selectedPayment}
        />
      )}
    </Box>
  );
}

export default PaymentsPage
