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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  Link,
  Stack,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Receipt as InvoiceIcon,
  ShoppingCart as OrderIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate, formatWholeQuantity } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { FilterBar } from '@/components/filters'
import DeletedPaymentsDialog from '@/components/sales/DeletedPaymentsDialog'
import PageHeader from '@/components/common/PageHeader'
import { PaymentReceiptPrint } from '@/components/print'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCustomersQuery, useGetPaymentsQuery } from '@/store/api/salesApi'
import { setSelectedPayment, selectSelectedPayment } from '@/store/slices/salesSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'
import type { InvoiceItem } from '@/types'

// Payment types and interfaces
interface Payment {
  id: string
  paymentNumber: string
  customerName?: string
  amount: number
  paymentDate: string | Date
  paymentMethodId?: string
  paymentMethod?: string
  paymentMethodEntity?: {
    id: string
    code: string
    name: string
  }
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded'
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
}

interface PaymentSortState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
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
          variant="body2"
          sx={{
            fontWeight: 400,
            fontSize: '0.8rem',
            lineHeight: 1.2
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
  const dispatch = useAppDispatch()
  const selectedPayment = useAppSelector(selectSelectedPayment) as Payment | null

  const [sortState, setSortState] = useState<PaymentSortState>({
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
  })
  const [pendingPaymentToSelect, setPendingPaymentToSelect] = useState<string | null>(() => {
    const id = new URLSearchParams(window.location.search).get('highlight')
    return id
  })
  const [editDialog, setEditDialog] = useState(false)
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [journalEntryRef, setJournalEntryRef] = useState<{ referenceNumber: string; id: string } | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const paymentListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const selectedPaymentRef = useRef(selectedPayment)
  const previousPathnameRef = useRef(location.pathname)
  const { data: customersData } = useGetCustomersQuery({ limit: 999999 })
  const customers = customersData?.data ?? []
  const presetCustomerId = (location.state as { customerId?: string } | null)?.customerId ?? null

  const filterConfig = useMemo<FilterBarConfig<PaymentFilters>>(
    () => ({
      search: { placeholder: 'Search by payment number or customer...' },
      fields: [],
      defaults: { search: '' },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const filterBarHandlers = useMemo(
    () => (
      presetCustomerId
        ? {
            ...handlers,
            onClearAll: () => {
              handlers.onClearField('search')
            },
          }
        : handlers
    ),
    [handlers, presetCustomerId],
  )
  const paymentQueryArgs = useMemo(
    () => ({
      sortBy: sortState.sortBy,
      sortOrder: sortState.sortOrder,
      search: appliedFilters.search || undefined,
      customerId: presetCustomerId ?? undefined,
    }),
    [appliedFilters, sortState, presetCustomerId],
  )

  // Keep ref in sync with selectedPayment
  useEffect(() => {
    selectedPaymentRef.current = selectedPayment
  }, [selectedPayment])

  // Fetch journal entry reference number for selected payment
  useEffect(() => {
    if (!selectedPayment) {
      setJournalEntryRef(null)
      return
    }
    fetchJournalEntries({ sourceType: 'payment', sourceId: selectedPayment.id, limit: 1 })
      .unwrap()
      .then((res) => {
        const entry = res?.data?.[0]
        setJournalEntryRef(entry ? { referenceNumber: entry.referenceNumber, id: entry.id } : null)
      })
      .catch(() => setJournalEntryRef(null))
  }, [selectedPayment?.id, fetchJournalEntries])

  const { data, isLoading, isFetching, error, refetch } = useGetPaymentsQuery(paymentQueryArgs)
  const loading = isLoading || isFetching
  const payments = data?.data ?? []
  const totalPayments = data?.meta.total ?? 0

  // Filter and sort payments
  // Since backend handles filtering, sorting, and pagination, use payments directly
  const filteredPayments = payments
  const paginatedPayments = payments

  const handleSort = useCallback((field: string) => {
    const newSortOrder = sortState.sortBy === field && sortState.sortOrder === 'desc' ? 'asc' : 'desc'
    setSortState((prev: PaymentSortState) => ({
      ...prev,
      sortBy: field,
      sortOrder: newSortOrder,
    }))
  }, [sortState.sortBy, sortState.sortOrder])

  const handlePaymentSelect = useCallback((payment: Payment) => {
    dispatch(setSelectedPayment(payment as any))
    const paymentIndex = paginatedPayments.findIndex((p: Payment) => p.id === payment.id)
    setFocusedPaymentIndex(paymentIndex)
  }, [paginatedPayments, dispatch])

  // Refresh on route navigation (when coming back from another page)
  useEffect(() => {
    // Only refresh if we navigated TO payments page FROM somewhere else
    if (previousPathnameRef.current !== '/sales/payments' && location.pathname === '/sales/payments') {
      void refetch()
      // Reset restoration flag so selection can be restored again
      hasRestoredSelection.current = false
      // Don't reset focusedPaymentIndex here - let the restoration effect handle it
    }
    previousPathnameRef.current = location.pathname
  }, [location.pathname, refetch, selectedPayment])

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
    navigate(`/sales/orders?highlight=${orderId}`)
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

  // Handle pending payment selection from ?highlight query param (e.g. navigating from journal entries)
  useEffect(() => {
    if (!pendingPaymentToSelect || paginatedPayments.length === 0) return
    const paymentIndex = paginatedPayments.findIndex(p => p.id === pendingPaymentToSelect)
    if (paymentIndex >= 0) {
      dispatch(setSelectedPayment(paginatedPayments[paymentIndex] as any))
      setFocusedPaymentIndex(paymentIndex)
      setPendingPaymentToSelect(null)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [paginatedPayments, pendingPaymentToSelect, dispatch])

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
    onSearch: () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    },
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

  const getPaymentMethodLabel = (payment: Payment) => {
    if (payment.paymentMethodEntity?.name) return payment.paymentMethodEntity.name
    if (payment.paymentMethod) return payment.paymentMethod
    return 'Unknown'
  }


  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <PageHeader
        title="Payments"
        subtitle="Review customer payments and transaction history"
        secondaryAction={{ label: 'View Deleted', onClick: () => setDeletedPaymentsDialogOpen(true) }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={filterBarHandlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />

            {presetCustomerId ? (
              <Stack direction="row" sx={{ mt: '7px' }}>
                <Chip
                  label={`Customer: ${customers.find((customer) => customer.id === presetCustomerId)?.name ?? presetCustomerId}`}
                  size="small"
                  variant="filled"
                />
              </Stack>
            ) : null}
          </Box>

          <Button
            variant={sortState.sortBy === 'paymentNumber' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={sortState.sortBy === 'paymentNumber' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
            onClick={() => handleSort('paymentNumber')}
            sx={{
              height: '40px',
              fontSize: '0.875rem',
              minWidth: 'auto',
              px: 2,
            }}
          >
            Sort
          </Button>
        </Stack>
      </Box>
      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load payments.
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
              <Typography variant="tableHeader" sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Payment List ({totalPayments})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
              {(isLoading || (isFetching && !data)) ? (
                <ListSkeleton rows={8} columns={1} />
              ) : (
                <Box sx={{ flex: 1, opacity: isFetching ? 0.6 : 1, position: 'relative' }}>
                  {isFetching ? (
                    <CircularProgress size={16} sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }} />
                  ) : null}
                  <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                    <Table
                      size={TABLE_STYLES.size}
                      sx={{
                        '& .MuiTableCell-root': {
                          borderBottom: TABLE_STYLES.cell.border,
                          py: TABLE_STYLES.cell.padding.py * 0.75,
                          px: TABLE_STYLES.cell.padding.px * 0.75,
                        },
                      }}
                    >
                      <TableHead sx={{ display: 'none' }}>
                        <TableRow sx={{ '& .MuiTableCell-head': {
                          fontWeight: 600,
                          backgroundColor: 'grey.50',
                          color: 'text.primary',
                          fontSize: '0.8rem',
                        } }}>
                          <TableCell>Payment #</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedPayments.map((payment: Payment, index: number) => (
                          <PaymentRow
                            key={payment.id}
                            payment={payment}
                            index={index}
                            selectedPaymentId={selectedPayment?.id}
                            focusedPaymentIndex={focusedPaymentIndex}
                            onPaymentSelect={handlePaymentSelect}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
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
                  <Typography variant="tableHeader" sx={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
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
                              {getPaymentMethodLabel(selectedPayment)}
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
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Journal Entry
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {journalEntryRef ? (
                                <Link
                                  component="button"
                                  onClick={() => navigate(`/accounting/journal-entries/${journalEntryRef.id}`)}
                                  sx={{
                                    fontSize: '0.8rem',
                                    color: 'primary.main',
                                    cursor: 'pointer',
                                    textDecoration: 'none',
                                    border: 'none',
                                    background: 'none',
                                    padding: 0,
                                    '&:hover': { color: 'primary.dark' }
                                  }}
                                >
                                  {journalEntryRef.referenceNumber}
                                </Link>
                              ) : (
                                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                                  N/A
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
                  <Typography variant="tableHeader" sx={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
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
                            fontWeight: 600,
                            backgroundColor: 'grey.50',
                            color: 'text.primary',
                            fontSize: '0.8rem'
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
                                {formatWholeQuantity(item.quantity)}
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
                    <Typography variant="tableHeader" sx={{
                      fontWeight: 600,
                      fontSize: '0.8rem',
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
                      fontSize: '0.8rem',
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
