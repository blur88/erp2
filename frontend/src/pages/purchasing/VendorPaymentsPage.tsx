import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
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
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  AccountBalance as PaymentIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import { formatDate, formatCurrency, formatWholeQuantity } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  setSelectedVendorPayment,
  selectSelectedVendorPayment
} from '@/store/slices/purchasingSlice'
import { useGetVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import DeletedVendorPaymentsDialog from '@/components/purchasing/DeletedVendorPaymentsDialog'
import { VendorPaymentPrint } from '@/components/print'
import { journalEntriesApi } from '@/services/accountingApi'
import { paymentMethodsApi } from '@/services/paymentMethodsApi'

interface VendorPaymentFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  status: string
  paymentMethodId: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

const getDateRangeFromFilter = (filter: string, customFromDate: string, customToDate: string) => {
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - today.getDay())

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const startOfYear = new Date(today.getFullYear(), 0, 1)

  const formatLocalDate = (date: Date) => date.toISOString().split('T')[0]

  switch (filter) {
    case 'today':
      return { startDate: formatLocalDate(today), endDate: formatLocalDate(today) }
    case 'yesterday':
      return { startDate: formatLocalDate(yesterday), endDate: formatLocalDate(yesterday) }
    case 'this_week':
      return { startDate: formatLocalDate(startOfWeek), endDate: formatLocalDate(today) }
    case 'this_month':
      return { startDate: formatLocalDate(startOfMonth), endDate: formatLocalDate(today) }
    case 'this_year':
      return { startDate: formatLocalDate(startOfYear), endDate: formatLocalDate(today) }
    case 'custom':
      return { startDate: customFromDate, endDate: customToDate }
    default:
      return { startDate: undefined, endDate: undefined }
  }
}

// Memoized Payment Row Component
interface PaymentRowProps {
  payment: any
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: any) => void
}

const PaymentRow = memo(({ payment, index, selectedPaymentId, focusedPaymentIndex, onPaymentSelect }: PaymentRowProps) => {
  const isSelected = selectedPaymentId === payment.id
  const isFocused = index === focusedPaymentIndex

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

const VendorPaymentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const dispatch = useAppDispatch()
  const selectedPaymentFromRedux = useAppSelector(selectSelectedVendorPayment)
  const [selectedPayment, setSelectedPaymentLocal] = useState<any | null>(null)

  const [filters, setFilters] = useState<VendorPaymentFilters>({
    search: '',
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
    status: 'all',
    paymentMethodId: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })

  const [journalEntryRef, setJournalEntryRef] = useState<{ id: string; referenceNumber: string } | null>(null)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const paymentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [paymentMethods, setPaymentMethods] = useState<Array<{ id: string; name: string }>>([])
  const queryParams = useMemo(() => {
    const dateRange = getDateRangeFromFilter(filters.dateFilter, filters.customFromDate, filters.customToDate)
    return {
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      status: filters.status !== 'all' ? filters.status : undefined,
      paymentMethodId: filters.paymentMethodId !== 'all' ? filters.paymentMethodId : undefined,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    }
  }, [filters])
  const { data: vendorPaymentsResponse, isFetching: loading, error: vendorPaymentsError } = useGetVendorPaymentsQuery(queryParams)
  const vendorPayments = vendorPaymentsResponse?.data || []
  const pagination = vendorPaymentsResponse?.meta
  const error =
    vendorPaymentsError && typeof vendorPaymentsError === 'object'
      ? ((vendorPaymentsError as any).data?.message ||
          (vendorPaymentsError as any).data ||
          'Failed to fetch vendor payments')
      : null

  const handlePaymentSelect = useCallback((payment: any) => {
    setSelectedPaymentLocal(payment)
    dispatch(setSelectedVendorPayment(payment))
    const paymentIndex = vendorPayments.findIndex(p => p.id === payment.id)
    setFocusedPaymentIndex(paymentIndex)
  }, [dispatch, vendorPayments])

  // Restore selected payment from Redux on mount
  useEffect(() => {
    if (selectedPaymentFromRedux && vendorPayments.length > 0 && !selectedPayment) {
      const payment = vendorPayments.find((p: any) => p.id === selectedPaymentFromRedux.id)
      if (payment) {
        handlePaymentSelect(payment)
      }
    }
  }, [selectedPaymentFromRedux, vendorPayments, selectedPayment, handlePaymentSelect])

  // Handle vpId query parameter to auto-select payment
  useEffect(() => {
    const vpId = searchParams.get('vpId')
    if (vpId) {
      const payment = vendorPayments.find((p: any) => p.id === vpId)
      if (payment) {
        handlePaymentSelect(payment)
        setSearchParams({})
      }
    }
  }, [handlePaymentSelect, searchParams, setSearchParams, vendorPayments])

  useEffect(() => {
    paymentMethodsApi
      .getActive()
      .then((response: any) => {
        const methods = response?.data?.data || response?.data || response || []
        setPaymentMethods(
          Array.isArray(methods)
            ? methods.map((pm: any) => ({ id: pm.id, name: pm.name }))
            : [],
        )
      })
      .catch(() => {
        setPaymentMethods([])
      })
  }, [])

  // Auto-refresh selected payment when the list updates
  useEffect(() => {
    if (selectedPayment && vendorPayments.length > 0) {
      const updatedPayment = vendorPayments.find((p: any) => p.id === selectedPayment.id)
      if (updatedPayment) {
        setSelectedPaymentLocal(updatedPayment)
        dispatch(setSelectedVendorPayment(updatedPayment))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorPayments])

  // Auto-select first payment when payments load
  useEffect(() => {
    if (vendorPayments.length > 0 && focusedPaymentIndex === -1) {
      if (!selectedPayment && searchInputRef.current !== document.activeElement) {
        // Don't auto-select if we have a vpId query parameter or a persisted selection
        const vpId = searchParams.get('vpId')
        if (!vpId && !selectedPaymentFromRedux) {
          setFocusedPaymentIndex(0)
          handlePaymentSelect(vendorPayments[0])
        }
      }
    }
  }, [vendorPayments, focusedPaymentIndex, selectedPayment, handlePaymentSelect, searchParams, selectedPaymentFromRedux])

  // Clear selection when no payments exist
  useEffect(() => {
    if (vendorPayments.length === 0 && selectedPayment) {
      setSelectedPaymentLocal(null)
      dispatch(setSelectedVendorPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [vendorPayments.length, selectedPayment, dispatch])

  // Fetch journal entry reference for selected vendor payment
  useEffect(() => {
    if (!selectedPayment) {
      setJournalEntryRef(null)
      return
    }
    setJournalEntryRef(null)
    journalEntriesApi.getAll({ sourceType: 'vendor_payment', sourceId: selectedPayment.id, limit: 1 })
      .then((res: any) => {
        const entry = res?.data?.[0]
        if (entry) {
          setJournalEntryRef({ id: entry.id, referenceNumber: entry.referenceNumber })
        }
      })
      .catch(() => { /* silently ignore */ })
  }, [selectedPayment?.id])

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

  const handleSort = useCallback((field: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
  }, [])

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'success'
      case 'pending':
        return 'warning'
      case 'cancelled':
        return 'error'
      default:
        return 'default'
    }
  }

  // Keyboard navigation handlers
  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) {
      const newIndex = focusedPaymentIndex - 1
      setFocusedPaymentIndex(newIndex)
      handlePaymentSelect(vendorPayments[newIndex])
    }
  }, [focusedPaymentIndex, vendorPayments, handlePaymentSelect])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < vendorPayments.length - 1) {
      const newIndex = focusedPaymentIndex + 1
      setFocusedPaymentIndex(newIndex)
      handlePaymentSelect(vendorPayments[newIndex])
    }
  }, [focusedPaymentIndex, vendorPayments, handlePaymentSelect])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
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
            Vendor Payments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Track and manage payments to suppliers ({vendorPayments.length} total)
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
      <Paper sx={{ p: 2, mb: 3 }}>
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          inputRef={searchInputRef}
          placeholder="Search payments..."
          value={filters.search}
          onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
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
            width: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
            }
          }}
        >
          <InputLabel>Date Filter</InputLabel>
          <Select
            value={filters.dateFilter}
            label="Date Filter"
            onChange={(e) => setFilters(prev => ({ ...prev, dateFilter: e.target.value }))}
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

        {filters.dateFilter === 'custom' && (
          <>
            <TextField
              label="From Date"
              type="date"
              value={filters.customFromDate}
              onChange={(e) => setFilters(prev => ({ ...prev, customFromDate: e.target.value }))}
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
              value={filters.customToDate}
              onChange={(e) => setFilters(prev => ({ ...prev, customToDate: e.target.value }))}
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
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Status</InputLabel>
          <Select
            value={filters.status}
            label="Status"
            onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
            sx={{
              fontSize: '0.875rem',
              '& .MuiSelect-select': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>

        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 140,
            width: isMobile ? 'auto' : 140,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem'
            }
          }}
        >
          <InputLabel>Payment Method</InputLabel>
          <Select
            value={filters.paymentMethodId}
            label="Payment Method"
            onChange={(e) => setFilters((prev) => ({ ...prev, paymentMethodId: e.target.value }))}
            sx={{
              fontSize: '0.875rem',
              '& .MuiSelect-select': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            }}
          >
            <MenuItem value="all">All</MenuItem>
            {paymentMethods.map((method) => (
              <MenuItem key={method.id} value={method.id}>
                {method.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {(filters.dateFilter !== 'all' || filters.status !== 'all' || filters.paymentMethodId !== 'all' || filters.search) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              setFilters({
                search: '',
                sortBy: 'paymentNumber',
                sortOrder: 'asc',
                status: 'all',
                paymentMethodId: 'all',
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
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
          startIcon={filters.sortBy === 'paymentNumber' ? (filters.sortOrder === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />) : <SortIcon />}
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
      </Paper>
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
                VP List ({vendorPayments.length})
              </Typography>
            </Box>

            <TableContainer sx={{ flex: 1, overflow: 'auto' }} ref={paymentListRef}>
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
                  {loading && vendorPayments.length === 0 ? (
                    [...Array(10)].map((_, i) => (
                      <TableRow key={`skeleton-${i}`}>
                        <TableCell>
                          <Skeleton height={40} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    vendorPayments.map((payment: any, index: number) => (
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
              {/* Header with Payment Info */}
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
                    VP Details - {selectedPayment.paymentNumber}
                  </Typography>
                  <Chip
                    label={selectedPayment.status}
                    size="small"
                    color={getStatusColor(selectedPayment.status) as any}
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
                    title="Print Payment"
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
                                VP Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Supplier
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedPayment.supplier?.companyName || 'Unknown'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              VP Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'primary.main' }}>
                              {formatCurrency(selectedPayment.amount)}
                            </TableCell>
                          </TableRow>
                          {selectedPayment.purchaseOrder && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                PO Amount
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(selectedPayment.purchaseOrder.totalAmount)}
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Payment Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedPayment.paymentDate)}
                            </TableCell>
                          </TableRow>
                          {selectedPayment.referenceNumber && (
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                Reference Number
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {selectedPayment.referenceNumber}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Amount Information */}
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
                          {selectedPayment.purchaseOrder && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                                PO No
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                <Typography
                                  component="button"
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
                                  onClick={() => navigate(`/purchasing/orders?poId=${selectedPayment.purchaseOrder.id}`)}
                                >
                                  {selectedPayment.purchaseOrder.orderNumber}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                          {selectedPayment.grn && (
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                GRN No
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                <Typography
                                  component="button"
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
                                  onClick={() => navigate(`/purchasing/goods-received?grnId=${selectedPayment.grn.id}`)}
                                >
                                  {selectedPayment.grn.grnNumber}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Journal Entry
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {journalEntryRef ? (
                                <Typography
                                  component="button"
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
                                  onClick={() => navigate(`/accounting/journal-entries/${journalEntryRef.id}`)}
                                >
                                  {journalEntryRef.referenceNumber}
                                </Typography>
                              ) : (
                                <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>
                                  —
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
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

                  {selectedPayment.purchaseOrder?.items && selectedPayment.purchaseOrder.items.length > 0 ? (
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
                            <TableCell align="right" sx={{ width: '16%' }}>Unit Cost</TableCell>
                            <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                            <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedPayment.purchaseOrder.items.map((item: any, index: number) => (
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
                                {formatWholeQuantity(item.quantity)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.unitCost)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {item.discountType === 'percentage' && parseFloat(item.discountPercent) > 0 ? (
                                  `${item.discountPercent}%`
                                ) : parseFloat(item.discountAmount) > 0 ? (
                                  `-${formatCurrency(item.discountAmount)}`
                                ) : (
                                  '-'
                                )}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.totalAmount)}
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
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {selectedPayment.purchaseOrder && selectedPayment.grn ? (
                              `Payment recorded for purchase order ${selectedPayment.purchaseOrder.orderNumber} (GRN: ${selectedPayment.grn.grnNumber})`
                            ) : selectedPayment.purchaseOrder ? (
                              `Payment recorded for purchase order ${selectedPayment.purchaseOrder.orderNumber}`
                            ) : selectedPayment.grn ? (
                              `Payment recorded for GRN ${selectedPayment.grn.grnNumber}`
                            ) : (
                              selectedPayment.notes || 'Payment recorded'
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>

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
      {/* Deleted Vendor Payments Dialog */}
      <DeletedVendorPaymentsDialog
        open={deletedPaymentsDialogOpen}
        onClose={() => setDeletedPaymentsDialogOpen(false)}
      />
      {/* Print Dialog */}
      {selectedPayment && (
        <VendorPaymentPrint
          open={printDialogOpen}
          onClose={() => setPrintDialogOpen(false)}
          payment={selectedPayment}
        />
      )}
    </Box>
  );
}

export default VendorPaymentsPage
