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
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Receipt as InvoiceIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Keyboard as KeyboardIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { fetchInvoices, selectInvoicesState } from '@/store/slices/salesSlice'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useNotification } from '@/hooks/useNotification'
import KeyboardShortcutsHelp from '@/components/common/KeyboardShortcutsHelp'
import DeletedInvoicesDialog from '@/components/sales/DeletedInvoicesDialog'
import type { InvoiceItem } from '@/types'

// Adapter types to match the backend API response structure
interface InvoiceListItem {
  id: string
  invoiceNumber: string
  customerName?: string
  orderNumber?: string
  invoiceDate?: string
  totalAmount?: number
  paidAmount: number
  balanceDue?: number
  status: 'draft' | 'partial_paid' | 'paid'
  isOverdue?: boolean
  lineItems?: InvoiceItem[]
  notes?: string
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
  // Handle both API response formats
  total?: number
  issueDate?: Date | string
  dueAmount?: number
  items?: InvoiceItem[]
}

interface InvoicesPageState {
  page: number
  rowsPerPage: number
}

interface InvoiceFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  dateFilter: string
  customFromDate: string
  customToDate: string
  customerId: string
}


// Memoized Invoice Row Component
interface InvoiceRowProps {
  invoice: InvoiceListItem
  index: number
  selectedInvoiceId?: string
  focusedInvoiceIndex: number
  onInvoiceSelect: (invoice: InvoiceListItem) => void
}

const InvoiceRow = memo(({ invoice, index, selectedInvoiceId, focusedInvoiceIndex, onInvoiceSelect }: InvoiceRowProps) => {
  const isSelected = selectedInvoiceId === invoice.id
  const isFocused = index === focusedInvoiceIndex


  return (
    <TableRow
      key={invoice.id}
      hover
      onClick={() => onInvoiceSelect(invoice)}
      data-invoice-index={index}
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
          {invoice.invoiceNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

InvoiceRow.displayName = 'InvoiceRow'

const InvoicesPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()

  const dispatch = useAppDispatch()
  const { invoices, loading, error, pagination } = useAppSelector(selectInvoicesState)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceListItem | null>(null)

  const [state, setState] = useState<InvoicesPageState>({
    page: 0,
    rowsPerPage: 20,
  })

  const [filters, setFilters] = useState<InvoiceFilters>({
    search: '',
    sortBy: 'invoiceNumber',
    sortOrder: 'asc',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
    customerId: 'all'
  })

  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [focusedInvoiceIndex, setFocusedInvoiceIndex] = useState(-1)
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [deletedInvoicesDialogOpen, setDeletedInvoicesDialogOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const invoiceListRef = useRef<HTMLDivElement>(null)
  const { showSuccess, showError } = useNotification()

  // Memoize search change callback to prevent unnecessary re-renders
  const onSearchChange = useCallback((searchTerm: string) => {
    setFilters((prev: InvoiceFilters) => ({ ...prev, search: searchTerm }))
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

  // Load invoices on component mount
  useEffect(() => {
    // Note: Date filtering will be applied client-side until backend supports it
    dispatch(fetchInvoices({
      page: state.page + 1,
      limit: state.rowsPerPage,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder.toUpperCase() as any
    }))
  }, [dispatch, state.page, state.rowsPerPage, filters])

  // Transform and normalize invoice data
  const normalizedInvoices = useMemo(() => {
    return (invoices || []).map((invoice: any): InvoiceListItem => {
      // Handle both API response formats
      const customerName = invoice.customerName || invoice.customer?.name || 'Unknown Customer'
      const invoiceDate = invoice.invoiceDate || invoice.issueDate
      const totalAmount = invoice.totalAmount || invoice.total || 0
      const balanceDue = invoice.balanceDue ?? invoice.dueAmount ?? (totalAmount - (invoice.paidAmount || 0))
      const lineItems = invoice.lineItems || invoice.items || []

      return {
        ...invoice,
        customerName,
        invoiceDate,
        totalAmount,
        balanceDue,
        lineItems,
        paidAmount: invoice.paidAmount || 0,
        isOverdue: invoice.isOverdue || false
      }
    })
  }, [invoices])

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    let filtered = [...normalizedInvoices]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
        (invoice.customerName && invoice.customerName.toLowerCase().includes(searchLower)) ||
        (invoice.salesOrder?.orderNumber && invoice.salesOrder.orderNumber.toLowerCase().includes(searchLower))
      )
    }


    // Date filter
    if (filters.dateFilter !== 'all') {
      const dateRange = getDateRange(filters.dateFilter)
      if (dateRange.fromDate || dateRange.toDate) {
        filtered = filtered.filter(invoice => {
          if (!invoice.invoiceDate) return false

          const invoiceDate = new Date(invoice.invoiceDate).toISOString().split('T')[0]

          if (dateRange.fromDate && invoiceDate < dateRange.fromDate) return false
          if (dateRange.toDate && invoiceDate > dateRange.toDate) return false

          return true
        })
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[filters.sortBy as keyof InvoiceListItem]
      let bValue: any = b[filters.sortBy as keyof InvoiceListItem]

      if (filters.sortBy === 'invoiceDate') {
        aValue = new Date(aValue || 0).getTime()
        bValue = new Date(bValue || 0).getTime()
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [normalizedInvoices, filters, getDateRange])

  // Pagination
  const paginatedInvoices = useMemo(() => {
    const startIndex = state.page * state.rowsPerPage
    return filteredInvoices.slice(startIndex, startIndex + state.rowsPerPage)
  }, [filteredInvoices, state.page, state.rowsPerPage])

  const handleSort = useCallback((field: string) => {
    const newSortOrder = filters.sortBy === field && filters.sortOrder === 'desc' ? 'asc' : 'desc'
    setFilters((prev: InvoiceFilters) => ({
      ...prev,
      sortBy: field,
      sortOrder: newSortOrder
    }))
    setState((prev: InvoicesPageState) => ({ ...prev, page: 0 }))
  }, [filters.sortBy, filters.sortOrder])

  const handleInvoiceSelect = useCallback((invoice: InvoiceListItem) => {
    setSelectedInvoice(invoice)
    const invoiceIndex = paginatedInvoices.findIndex((i: InvoiceListItem) => i.id === invoice.id)
    setFocusedInvoiceIndex(invoiceIndex)
  }, [paginatedInvoices])

  const handleSalesOrderClick = useCallback((salesOrderId: string, event: React.MouseEvent) => {
    event.stopPropagation() // Prevent triggering parent row click
    navigate('/sales/orders', { state: { highlightOrderId: salesOrderId } })
  }, [navigate])

  // Auto-select first invoice when invoices load
  useEffect(() => {
    if (paginatedInvoices.length > 0 && focusedInvoiceIndex === -1) {
      if (!selectedInvoice && searchInputRef.current !== document.activeElement) {
        setFocusedInvoiceIndex(0)
        setSelectedInvoice(paginatedInvoices[0])
      }
    }
  }, [paginatedInvoices, focusedInvoiceIndex, selectedInvoice])

  // Handle navigation from orders page with highlightInvoiceId
  useEffect(() => {
    const state = location.state as { highlightInvoiceId?: string }
    if (state?.highlightInvoiceId && paginatedInvoices.length > 0) {
      const invoiceIndex = paginatedInvoices.findIndex(i => i.id === state.highlightInvoiceId)
      if (invoiceIndex >= 0) {
        setSelectedInvoice(paginatedInvoices[invoiceIndex])
        setFocusedInvoiceIndex(invoiceIndex)
        // Clear the state to prevent repeated highlighting
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [paginatedInvoices, location.state])

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    if (focusedInvoiceIndex >= 0 && invoiceListRef.current) {
      const focusedRow = invoiceListRef.current.querySelector(`[data-invoice-index="${focusedInvoiceIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedInvoiceIndex])

  // Keyboard navigation functions
  const handleNavigateUp = useCallback(() => {
    if (focusedInvoiceIndex > 0) {
      const newIndex = focusedInvoiceIndex - 1
      setFocusedInvoiceIndex(newIndex)
      setSelectedInvoice(paginatedInvoices[newIndex])
    }
  }, [focusedInvoiceIndex, paginatedInvoices])

  const handleNavigateDown = useCallback(() => {
    if (focusedInvoiceIndex < paginatedInvoices.length - 1) {
      const newIndex = focusedInvoiceIndex + 1
      setFocusedInvoiceIndex(newIndex)
      setSelectedInvoice(paginatedInvoices[newIndex])
    }
  }, [focusedInvoiceIndex, paginatedInvoices])

  const handleNavigateToFirst = useCallback(() => {
    if (paginatedInvoices.length > 0) {
      setFocusedInvoiceIndex(0)
      setSelectedInvoice(paginatedInvoices[0])
    }
  }, [paginatedInvoices])

  const handleNavigateToLast = useCallback(() => {
    if (paginatedInvoices.length > 0) {
      const lastIndex = paginatedInvoices.length - 1
      setFocusedInvoiceIndex(lastIndex)
      setSelectedInvoice(paginatedInvoices[lastIndex])
    }
  }, [paginatedInvoices])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedInvoiceIndex - state.rowsPerPage)
    setFocusedInvoiceIndex(newIndex)
    if (paginatedInvoices[newIndex]) {
      setSelectedInvoice(paginatedInvoices[newIndex])
    }
  }, [focusedInvoiceIndex, state.rowsPerPage, paginatedInvoices])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(paginatedInvoices.length - 1, focusedInvoiceIndex + state.rowsPerPage)
    setFocusedInvoiceIndex(newIndex)
    if (paginatedInvoices[newIndex]) {
      setSelectedInvoice(paginatedInvoices[newIndex])
    }
  }, [focusedInvoiceIndex, state.rowsPerPage, paginatedInvoices])

  const handleEnterAction = useCallback(() => {
    if (focusedInvoiceIndex >= 0 && paginatedInvoices[focusedInvoiceIndex]) {
      setEditDialog(true)
    }
  }, [focusedInvoiceIndex, paginatedInvoices])

  const handleEditAction = () => {
    if (selectedInvoice) {
      setEditDialog(true)
    }
  }

  const handleDeleteAction = () => {
    if (selectedInvoice) {
      showError('Delete functionality will be implemented later')
    }
  }

  const handleRefreshAction = () => {
    dispatch(fetchInvoices({
      page: 1,
      limit: state.rowsPerPage,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder.toUpperCase() as any
    }))
  }

  const handleViewDeletedAction = () => {
    showError('View deleted functionality will be implemented later')
  }

  const handleAddInvoice = () => {
    setCreateDialog(true)
  }

  const handleEscapeAction = useCallback(() => {
    setFocusedInvoiceIndex(-1)
    setSelectedInvoice(null)
    setCreateDialog(false)
    setEditDialog(false)
    setKeyboardHelpOpen(false)
  }, [])

  // Setup keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onAdd: handleAddInvoice,
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
            <InvoiceIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Invoices
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Manage customer invoices and track payments ({pagination?.total || 0} total)
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
            {isMobile ? "Refresh Invoices" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedInvoicesDialogOpen(true)}
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
          placeholder="Search invoices..."
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
              setFilters((prev: InvoiceFilters) => ({ ...prev, dateFilter: e.target.value }))
              setState((prev: InvoicesPageState) => ({ ...prev, page: 0 }))
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
                setFilters((prev: InvoiceFilters) => ({ ...prev, customFromDate: e.target.value }))
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
                setFilters((prev: InvoiceFilters) => ({ ...prev, customToDate: e.target.value }))
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

        {(filters.dateFilter !== 'all' || filters.search) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              setFilters({
                search: '',
                sortBy: 'invoiceNumber',
                sortOrder: 'asc',
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
                customerId: 'all'
              })
              setState((prev: InvoicesPageState) => ({ ...prev, page: 0 }))
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
          variant={filters.sortBy === 'invoiceNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={filters.sortBy === 'invoiceNumber' ? (filters.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('invoiceNumber')}
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

      {/* Split Layout: Invoice List and Invoice Details */}
      <Grid container spacing={3}>
        {/* Left Side - Invoice List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Invoice List ({pagination?.total || 0})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={invoiceListRef}>
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
                  <TableHead>
                    <TableRow sx={{ '& .MuiTableCell-head': {
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      backgroundColor: 'grey.50',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    } }}>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {loading && paginatedInvoices.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      paginatedInvoices.map((invoice: InvoiceListItem, index: number) => (
                        <InvoiceRow
                          key={invoice.id}
                          invoice={invoice}
                          index={index}
                          selectedInvoiceId={selectedInvoice?.id}
                          focusedInvoiceIndex={focusedInvoiceIndex}
                          onInvoiceSelect={handleInvoiceSelect}
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
                onPageChange={(_: unknown, newPage: number) => setState((prev: InvoicesPageState) => ({ ...prev, page: newPage }))}
                rowsPerPage={state.rowsPerPage}
                onRowsPerPageChange={(e: React.ChangeEvent<HTMLInputElement>) => setState((prev: InvoicesPageState) => ({
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

        {/* Right Side - Invoice Details */}
        <Grid item xs={12} md={9}>
          {selectedInvoice ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              {/* Header with Invoice Info and Actions */}
              <Box sx={{
                p: TABLE_STYLES.cell.padding.px,
                borderBottom: TABLE_STYLES.cell.border,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Invoice Details - {selectedInvoice.invoiceNumber}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                {/* Invoice Details Section */}
                <Grid container spacing={3}>
                  {/* Left Column - Invoice Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                                Invoice Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Customer
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedInvoice.customer?.name || selectedInvoice.customerName}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Invoice Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedInvoice.invoiceDate)}
                            </TableCell>
                          </TableRow>
                          {selectedInvoice.salesOrder?.orderNumber && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                Order No
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                <Typography
                                  component="button"
                                  onClick={(event) => handleSalesOrderClick(selectedInvoice.salesOrder!.id, event)}
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
                                  {selectedInvoice.salesOrder?.orderNumber}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Payment No
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {(selectedInvoice as any).payments && (selectedInvoice as any).payments.length > 0 ? (
                                (selectedInvoice as any).payments.map((payment: any, index: number) => (
                                  <Box key={payment.id} component="span">
                                    <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                                      {payment.paymentNumber}
                                    </Typography>
                                    {index < (selectedInvoice as any).payments.length - 1 && (
                                      <Typography component="span" sx={{ fontSize: '0.8rem' }}>
                                        ,
                                      </Typography>
                                    )}
                                  </Box>
                                ))
                              ) : (
                                <Typography sx={{
                                  fontSize: '0.8rem',
                                  color: 'text.secondary',
                                  fontStyle: 'italic'
                                }}>
                                  No payments
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Payment Information */}
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
                              Total Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedInvoice.totalAmount)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Paid Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedInvoice.paidAmount)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Balance Due
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedInvoice.balanceDue)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Status
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              <Chip
                                label={selectedInvoice.status === 'partial_paid' ? 'Partial Paid' : selectedInvoice.status}
                                size="small"
                                color={
                                  selectedInvoice.status === 'paid' ? 'success' :
                                  selectedInvoice.status === 'partial_paid' ? 'warning' :
                                  'default'
                                }
                                sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
                              />
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
                </Grid>

                {/* Invoice Notes Section */}
                {selectedInvoice.notes && (
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
                              {selectedInvoice.notes}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}

                {/* Page Break */}
                <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 3 }} />

                {/* Invoice Items Section */}
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    mb: 1
                  }}>
                    Invoice Items
                  </Typography>

                  {((selectedInvoice.lineItems && selectedInvoice.lineItems.length > 0) || (selectedInvoice.items && selectedInvoice.items.length > 0)) ? (
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
                          {(selectedInvoice.lineItems || selectedInvoice.items || [])?.map((item: InvoiceItem, index: number) => (
                            <TableRow
                              key={item.id || index}
                              hover
                              sx={{
                                '&:hover': { backgroundColor: 'action.hover' },
                                transition: 'background-color 0.2s ease',
                                height: TABLE_STYLES.row.height
                              }}
                            >
                              <TableCell sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                {(item as any).productName || item.product?.name || 'Unknown Product'}
                              </TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                {item.quantity}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.unitPrice)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {item.discount ? `-${formatCurrency(item.discount)}` : '-'}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                {formatCurrency((item as any).totalAmount || item.total)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No items in this invoice</Alert>
                  )}
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select an invoice to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Placeholder Dialogs */}
      <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create New Invoice</DialogTitle>
        <DialogContent>
          <Typography>Invoice creation form will be implemented here.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
          <Button variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Edit Invoice</DialogTitle>
        <DialogContent>
          <Typography>Invoice editing form will be implemented here.</Typography>
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

      {/* Deleted Invoices Dialog */}
      <DeletedInvoicesDialog
        open={deletedInvoicesDialogOpen}
        onClose={() => setDeletedInvoicesDialogOpen(false)}
      />
    </Box>
  )
}

export default InvoicesPage
