import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  IconButton,
  Alert,
  CircularProgress,
  Stack,
  Tooltip,
  InputAdornment,
  Link,
} from '@mui/material'
import GridLegacy from '@mui/material/GridLegacy'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  PostAdd as PostIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import {
  fetchJournalEntries,
  deleteJournalEntry,
  postEntry,
  selectJournalEntries,
  selectJournalEntriesLoading,
  selectJournalEntriesError,
  selectJournalEntriesPagination,
  clearError,
} from '@/store/slices/journalEntriesSlice'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface Filters {
  search: string
  status: JournalEntryStatus | 'all'
  entryType: string
  startDate: string
  endDate: string
}

// Entry type labels for display
const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
}

const getEntryTypeLabel = (sourceType?: string): string => {
  if (!sourceType) return 'Manual Entry'
  return ENTRY_TYPE_LABELS[sourceType] || 'Unknown'
}

const JournalEntriesPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  // Redux state
  const journalEntries = useAppSelector(selectJournalEntries) || []
  const loading = useAppSelector(selectJournalEntriesLoading)
  const error = useAppSelector(selectJournalEntriesError)
  const pagination = useAppSelector(selectJournalEntriesPagination)

  // Local state
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    entryType: '',
    startDate: '',
    endDate: '',
  })
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isPostConfirmOpen, setIsPostConfirmOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  // Load journal entries
  useEffect(() => {
    const params: any = {
      page: 1,
      limit: 50,
    }

    if (filters.search) {
      params.search = filters.search
    }
    if (filters.status !== 'all') {
      params.status = filters.status
    }
    if (filters.entryType) {
      params.sourceType = filters.entryType
    }
    if (filters.startDate) {
      params.startDate = filters.startDate
    }
    if (filters.endDate) {
      params.endDate = filters.endDate
    }

    // Check URL query parameters (from transaction pages)
    const urlParams = new URLSearchParams(location.search)
    const sourceType = urlParams.get('sourceType')
    const sourceId = urlParams.get('sourceId')

    if (sourceType && sourceId) {
      params.sourceType = sourceType
      params.sourceId = sourceId
    }

    dispatch(fetchJournalEntries(params))
  }, [dispatch, filters, location.search])

  // Clear error on mount
  useEffect(() => {
    dispatch(clearError())
  }, [dispatch])

  // Handle filter change
  const handleFilterChange = useCallback((field: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  // Handle search
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilterChange('search', event.target.value)
  }

  // Handle row click
  const handleRowClick = (entry: JournalEntry) => {
    navigate(`/accounting/journal-entries/${entry.id}`)
  }

  // Handle create new entry
  const handleCreateNew = () => {
    navigate('/accounting/journal-entries/new')
  }

  // Handle view details
  const handleViewDetails = (entry: JournalEntry, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate(`/accounting/journal-entries/${entry.id}`)
  }

  // Handle post entry
  const handlePostClick = (entry: JournalEntry, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedEntry(entry)
    setIsPostConfirmOpen(true)
  }

  const handleConfirmPost = async () => {
    if (!selectedEntry) return

    setActionLoading(true)
    try {
      await dispatch(postEntry(selectedEntry.id)).unwrap()
      showSuccess(`Journal entry ${selectedEntry.referenceNumber} posted successfully`)
      setIsPostConfirmOpen(false)
      setSelectedEntry(null)
      // Refresh list
      dispatch(fetchJournalEntries({ page: 1, limit: 50 }))
    } catch (error: any) {
      showError(`Failed to post journal entry: ${error}`)
    } finally {
      setActionLoading(false)
    }
  }

  // Handle delete entry
  const handleDeleteClick = (entry: JournalEntry, event: React.MouseEvent) => {
    event.stopPropagation()
    setSelectedEntry(entry)
    setIsDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!selectedEntry) return

    setActionLoading(true)
    try {
      await dispatch(deleteJournalEntry(selectedEntry.id)).unwrap()
      showSuccess(`Journal entry ${selectedEntry.referenceNumber} deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedEntry(null)
      // Refresh list
      dispatch(fetchJournalEntries({ page: 1, limit: 50 }))
    } catch (error: any) {
      showError(`Failed to delete journal entry: ${error}`)
    } finally {
      setActionLoading(false)
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    const params: any = { page: 1, limit: 50 }
    if (filters.search) params.search = filters.search
    if (filters.status !== 'all') params.status = filters.status
    if (filters.entryType) params.sourceType = filters.entryType
    if (filters.startDate) params.startDate = filters.startDate
    if (filters.endDate) params.endDate = filters.endDate
    dispatch(fetchJournalEntries(params))
  }

  // Get status badge color
  const getStatusColor = (status: JournalEntryStatus) => {
    switch (status) {
      case JournalEntryStatus.DRAFT:
        return 'primary'
      case JournalEntryStatus.POSTED:
        return 'success'
      case JournalEntryStatus.REVERSED:
        return 'error'
      default:
        return 'default'
    }
  }

  // Navigate to source transaction
  const navigateToSourceTransaction = (sourceType: string, sourceId: string) => {
    const routes: Record<string, string> = {
      sales_order: `/sales/orders/${sourceId}`,
      payment: `/sales/payments/${sourceId}`,
      goods_received_note: `/purchasing/goods-received/${sourceId}`,
      vendor_payment: `/purchasing/vendor-payments/${sourceId}`,
      stock_adjustment: `/inventory/stock-adjustments/${sourceId}`,
    }

    const route = routes[sourceType]
    if (route) {
      navigate(route)
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Account Mapping Warning */}
      <AccountMappingWarning context="system" />

      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          Journal Entries
        </Typography>
        <Stack direction="row" spacing={2}>
          <Tooltip title="Refresh">
            <IconButton onClick={handleRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreateNew}
          >
            New Journal Entry
          </Button>
        </Stack>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <GridLegacy container spacing={2} alignItems="center">
          <GridLegacy item xs={12} md={3}>
            <TextField
              fullWidth
              placeholder="Search by reference or description..."
              value={filters.search}
              onChange={handleSearchChange}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </GridLegacy>
          <GridLegacy item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                label="Status"
              >
                <MenuItem value="all">All Statuses</MenuItem>
                <MenuItem value={JournalEntryStatus.DRAFT}>Draft</MenuItem>
                <MenuItem value={JournalEntryStatus.POSTED}>Posted</MenuItem>
                <MenuItem value={JournalEntryStatus.REVERSED}>Reversed</MenuItem>
              </Select>
            </FormControl>
          </GridLegacy>
          <GridLegacy item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Entry Type</InputLabel>
              <Select
                value={filters.entryType}
                onChange={(e) => handleFilterChange('entryType', e.target.value)}
                label="Entry Type"
              >
                <MenuItem value="">All Entries</MenuItem>
                <MenuItem value="manual">Manual Entries</MenuItem>
                <MenuItem value="sales_order">Sales Orders</MenuItem>
                <MenuItem value="payment">Customer Payments</MenuItem>
                <MenuItem value="goods_received_note">Goods Receipts</MenuItem>
                <MenuItem value="vendor_payment">Vendor Payments</MenuItem>
                <MenuItem value="stock_adjustment">Stock Adjustments</MenuItem>
              </Select>
            </FormControl>
          </GridLegacy>
          <GridLegacy item xs={12} md={2.5}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </GridLegacy>
          <GridLegacy item xs={12} md={2.5}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </GridLegacy>
        </GridLegacy>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      {/* Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Entry Type</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Total Debits</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Total Credits</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : journalEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No journal entries found
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                journalEntries.map((entry) => (
                  <TableRow
                    key={entry.id}
                    hover
                    onClick={() => handleRowClick(entry)}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { backgroundColor: 'action.hover' },
                    }}
                  >
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: 'primary.main' }}
                      >
                        {entry.referenceNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(entry.entryDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ maxWidth: 300 }}>
                        {entry.description}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getEntryTypeLabel(entry.sourceType)}
                        size="small"
                        color={entry.sourceType === 'manual' || !entry.sourceType ? 'default' : 'primary'}
                      />
                    </TableCell>
                    <TableCell>
                      {entry.sourceType && entry.sourceType !== 'manual' && entry.sourceId && (
                        <Link
                          component="button"
                          variant="body2"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigateToSourceTransaction(entry.sourceType, entry.sourceId)
                          }}
                        >
                          View Transaction
                        </Link>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrency(entry.totalDebits)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrency(entry.totalCredits)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={entry.status}
                        color={getStatusColor(entry.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Tooltip title="View Details">
                          <IconButton
                            size="small"
                            onClick={(e) => handleViewDetails(entry, e)}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {entry.status === JournalEntryStatus.DRAFT && (
                          <>
                            <Tooltip title="Post Entry">
                              <IconButton
                                size="small"
                                color="success"
                                onClick={(e) => handlePostClick(entry, e)}
                              >
                                <PostIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Entry">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => handleDeleteClick(entry, e)}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination Info */}
        {pagination && pagination.total > 0 && (
          <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Showing {journalEntries.length} of {pagination.total} entries
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Post Confirmation Dialog */}
      <ConfirmationDialog
        open={isPostConfirmOpen}
        title="Post Journal Entry"
        message={`Are you sure you want to post journal entry ${selectedEntry?.referenceNumber}? This action cannot be undone.`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={handleConfirmPost}
        onCancel={() => {
          setIsPostConfirmOpen(false)
          setSelectedEntry(null)
        }}
        loading={actionLoading}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={isDeleteConfirmOpen}
        title="Delete Journal Entry"
        message={`Are you sure you want to delete journal entry ${selectedEntry?.referenceNumber}? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setIsDeleteConfirmOpen(false)
          setSelectedEntry(null)
        }}
        loading={actionLoading}
      />
    </Box>
  )
}

export default JournalEntriesPage
