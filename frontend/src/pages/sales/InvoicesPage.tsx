import React, { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react'
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
  Print as PrintIcon,
  Send as SendIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface Invoice {
  id: string
  invoiceNumber: string
  customerName: string
  orderNumber?: string
  invoiceDate: string
  dueDate: string
  totalAmount: number
  paidAmount: number
  balanceAmount: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  isPaid: boolean
  isOverdue: boolean
  items: InvoiceItem[]
  notes?: string
  customer?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
}

interface InvoiceItem {
  id: string
  productName: string
  description?: string
  quantity: number
  unitPrice: number
  discountAmount?: number
  discountPercent?: number
  discountType?: 'percentage' | 'amount'
  totalAmount: number
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
  status: string
  paymentStatus: string
}

// Mock data for the invoices
const mockInvoices: Invoice[] = [
  {
    id: '1',
    invoiceNumber: 'INV-000001',
    customerName: 'Acme Corporation',
    orderNumber: 'ORD-2024-001',
    invoiceDate: '2024-01-15',
    dueDate: '2024-02-14',
    totalAmount: 2500.00,
    paidAmount: 2500.00,
    balanceAmount: 0.00,
    status: 'paid',
    isPaid: true,
    isOverdue: false,
    items: [
      {
        id: '1',
        productName: 'Laptop Computer',
        description: 'High-performance business laptop',
        quantity: 2,
        unitPrice: 1200.00,
        totalAmount: 2400.00
      },
      {
        id: '2',
        productName: 'Software License',
        quantity: 1,
        unitPrice: 100.00,
        totalAmount: 100.00
      }
    ],
    customer: {
      id: '1',
      name: 'Acme Corporation',
      email: 'billing@acme.com',
      phone: '+1 (555) 123-4567'
    }
  },
  {
    id: '2',
    invoiceNumber: 'INV-000002',
    customerName: 'Tech Solutions Ltd',
    orderNumber: 'ORD-2024-002',
    invoiceDate: '2024-01-20',
    dueDate: '2024-02-19',
    totalAmount: 1800.00,
    paidAmount: 900.00,
    balanceAmount: 900.00,
    status: 'sent',
    isPaid: false,
    isOverdue: false,
    items: [
      {
        id: '1',
        productName: 'Office Supplies',
        quantity: 50,
        unitPrice: 36.00,
        totalAmount: 1800.00
      }
    ],
    customer: {
      id: '2',
      name: 'Tech Solutions Ltd',
      email: 'accounts@techsolutions.com',
      phone: '+1 (555) 987-6543'
    }
  },
  {
    id: '3',
    invoiceNumber: 'INV-000003',
    customerName: 'Global Industries',
    invoiceDate: '2023-12-15',
    dueDate: '2024-01-14',
    totalAmount: 5200.00,
    paidAmount: 0.00,
    balanceAmount: 5200.00,
    status: 'overdue',
    isPaid: false,
    isOverdue: true,
    items: [
      {
        id: '1',
        productName: 'Industrial Equipment',
        quantity: 1,
        unitPrice: 5200.00,
        totalAmount: 5200.00
      }
    ],
    customer: {
      id: '3',
      name: 'Global Industries',
      email: 'finance@globalind.com'
    }
  }
]

// Memoized Invoice Row Component
interface InvoiceRowProps {
  invoice: Invoice
  index: number
  selectedInvoiceId?: string
  focusedInvoiceIndex: number
  onInvoiceSelect: (invoice: Invoice) => void
}

const InvoiceRow = memo(({ invoice, index, selectedInvoiceId, focusedInvoiceIndex, onInvoiceSelect }: InvoiceRowProps) => {
  const isSelected = selectedInvoiceId === invoice.id
  const isFocused = index === focusedInvoiceIndex

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'success'
      case 'sent': return 'primary'
      case 'draft': return 'default'
      case 'overdue': return 'error'
      case 'cancelled': return 'secondary'
      default: return 'default'
    }
  }

  const getPaymentStatusColor = (isPaid: boolean, isOverdue: boolean) => {
    if (isPaid) return 'success'
    if (isOverdue) return 'error'
    return 'warning'
  }

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
          variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
          sx={{
            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
            fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
            lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
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

  const [invoices] = useState<Invoice[]>(mockInvoices)
  const [loading] = useState(false)
  const [error] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)

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
    customerId: 'all',
    status: 'all',
    paymentStatus: 'all'
  })

  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [focusedInvoiceIndex, setFocusedInvoiceIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Filter and sort invoices
  const filteredInvoices = useMemo(() => {
    let filtered = [...invoices]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(invoice =>
        invoice.invoiceNumber.toLowerCase().includes(searchLower) ||
        invoice.customerName.toLowerCase().includes(searchLower) ||
        (invoice.orderNumber && invoice.orderNumber.toLowerCase().includes(searchLower))
      )
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(invoice => invoice.status === filters.status)
    }

    // Payment status filter
    if (filters.paymentStatus !== 'all') {
      if (filters.paymentStatus === 'paid') {
        filtered = filtered.filter(invoice => invoice.isPaid)
      } else if (filters.paymentStatus === 'pending') {
        filtered = filtered.filter(invoice => !invoice.isPaid && !invoice.isOverdue)
      } else if (filters.paymentStatus === 'overdue') {
        filtered = filtered.filter(invoice => invoice.isOverdue)
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let aValue: any = a[filters.sortBy as keyof Invoice]
      let bValue: any = b[filters.sortBy as keyof Invoice]

      if (filters.sortBy === 'invoiceDate' || filters.sortBy === 'dueDate') {
        aValue = new Date(aValue).getTime()
        bValue = new Date(bValue).getTime()
      }

      if (filters.sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    return filtered
  }, [invoices, filters])

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

  const handleInvoiceSelect = useCallback((invoice: Invoice) => {
    setSelectedInvoice(invoice)
    const invoiceIndex = paginatedInvoices.findIndex((i: Invoice) => i.id === invoice.id)
    setFocusedInvoiceIndex(invoiceIndex)
  }, [paginatedInvoices])

  // Auto-select first invoice when invoices load
  useEffect(() => {
    if (paginatedInvoices.length > 0 && focusedInvoiceIndex === -1) {
      if (!selectedInvoice && searchInputRef.current !== document.activeElement) {
        setFocusedInvoiceIndex(0)
        setSelectedInvoice(paginatedInvoices[0])
      }
    }
  }, [paginatedInvoices, focusedInvoiceIndex, selectedInvoice])

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
            Manage customer invoices and track payments ({filteredInvoices.length} total)
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
            onClick={() => {}}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Invoices" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => {}}
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
            {isMobile ? "Create New Invoice" : "Create Invoice"}
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
          value={filters.search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFilters((prev: InvoiceFilters) => ({ ...prev, search: e.target.value }))}
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

        <FormControl size="medium" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filters.status}
            label="Status"
            onChange={(e: any) => setFilters((prev: InvoiceFilters) => ({ ...prev, status: e.target.value }))}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="sent">Sent</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="medium" sx={{ minWidth: 120 }}>
          <InputLabel>Payment</InputLabel>
          <Select
            value={filters.paymentStatus}
            label="Payment"
            onChange={(e: any) => setFilters((prev: InvoiceFilters) => ({ ...prev, paymentStatus: e.target.value }))}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="overdue">Overdue</MenuItem>
          </Select>
        </FormControl>

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
        <Grid item xs={12} md={4}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Invoice List ({filteredInvoices.length})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                      paginatedInvoices.map((invoice: Invoice, index: number) => (
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
                count={filteredInvoices.length}
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
        <Grid item xs={12} md={8}>
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <IconButton
                    size="small"
                    color="primary"
                    title="Print Invoice"
                    sx={{ height: 28, width: 28 }}
                  >
                    <PrintIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="info"
                    title="Send Invoice"
                    sx={{ height: 28, width: 28 }}
                  >
                    <SendIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="success"
                    title="Record Payment"
                    sx={{ height: 28, width: 28 }}
                  >
                    <PaymentIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="primary"
                    title="Edit Invoice"
                    onClick={() => setEditDialog(true)}
                    sx={{ height: 28, width: 28 }}
                  >
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    title="Delete Invoice"
                    sx={{ height: 28, width: 28 }}
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Box>
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
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Due Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: selectedInvoice.isOverdue ? 'error.main' : 'text.primary' }}>
                              {formatDate(selectedInvoice.dueDate)}
                            </TableCell>
                          </TableRow>
                          {selectedInvoice.orderNumber && (
                            <TableRow>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                Order #
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {selectedInvoice.orderNumber}
                              </TableCell>
                            </TableRow>
                          )}
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
                            <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                              {formatCurrency(selectedInvoice.totalAmount)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Paid Amount
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: selectedInvoice.paidAmount > 0 ? 'success.main' : 'text.primary' }}>
                              {formatCurrency(selectedInvoice.paidAmount)}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Balance Due
                            </TableCell>
                            <TableCell sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: selectedInvoice.balanceAmount > 0 ? 'error.main' : 'success.main'
                            }}>
                              {formatCurrency(selectedInvoice.balanceAmount)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Status
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                <Chip
                                  label={selectedInvoice.status.charAt(0).toUpperCase() + selectedInvoice.status.slice(1)}
                                  color={selectedInvoice.status === 'paid' ? 'success' : selectedInvoice.status === 'overdue' ? 'error' : 'primary'}
                                  size="small"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                                <Chip
                                  label={selectedInvoice.isPaid ? 'Paid' : selectedInvoice.isOverdue ? 'Overdue' : 'Pending'}
                                  color={selectedInvoice.isPaid ? 'success' : selectedInvoice.isOverdue ? 'error' : 'warning'}
                                  size="small"
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              </Box>
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

                  {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
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
                          {selectedInvoice.items.map((item: InvoiceItem, index: number) => (
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
                                {item.productName}
                                {item.description && (
                                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                                    {item.description}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                {item.quantity}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(item.unitPrice)}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                                {item.discountType === 'percentage' && item.discountPercent && (
                                  <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                                    ({item.discountPercent}%)
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                                {formatCurrency(item.totalAmount)}
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
    </Box>
  )
}

export default InvoicesPage
