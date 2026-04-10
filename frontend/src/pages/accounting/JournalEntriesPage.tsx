import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
  Checkbox,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as AddIcon } from '@mui/icons-material/Add'
import { default as SearchIcon } from '@mui/icons-material/Search'
import { default as ViewIcon } from '@mui/icons-material/Visibility'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteJournalEntriesMutation,
  useBulkPostJournalEntriesMutation,
  useDeleteJournalEntryMutation,
  useGetJournalEntriesQuery,
  usePostJournalEntryMutation,
} from '@/store/api/accountingApi'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { getErrorMessage } from '@/utils/errorMessage'

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
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

const getEntryTypeLabel = (sourceType?: string): string => {
  if (!sourceType) return 'Manual Entry'
  return ENTRY_TYPE_LABELS[sourceType] || 'Unknown'
}

const JournalEntriesPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()

  // Local state
  const [filters, setFilters] = useState<Filters>({
    search: '',
    status: 'all',
    entryType: '',
    startDate: '',
    endDate: '',
  })
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [isPostConfirmOpen, setIsPostConfirmOpen] = useState(false)
  const [isBulkPostConfirmOpen, setIsBulkPostConfirmOpen] = useState(false)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const queryParams = useMemo(() => {
    const params: Record<string, unknown> = {
      page: 1,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
    }
    if (filters.search) params.search = filters.search
    if (filters.status !== 'all') params.status = filters.status
    if (filters.entryType) params.sourceType = filters.entryType
    if (filters.startDate) params.startDate = filters.startDate
    if (filters.endDate) params.endDate = filters.endDate

    const urlParams = new URLSearchParams(location.search)
    const sourceType = urlParams.get('sourceType')
    const sourceId = urlParams.get('sourceId')

    if (sourceType && sourceId) {
      params.sourceType = sourceType
      params.sourceId = sourceId
    }

    return params
  }, [filters, location.search])

  const {
    data: journalEntriesResponse,
    isLoading: loading,
    error,
    refetch,
  } = useGetJournalEntriesQuery(queryParams)
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [bulkPostJournalEntries] = useBulkPostJournalEntriesMutation()
  const [bulkDeleteJournalEntries] = useBulkDeleteJournalEntriesMutation()
  const journalEntries = journalEntriesResponse?.data ?? []
  const pagination = journalEntriesResponse?.meta
  const errorMessage = error ? getErrorMessage(error, 'Failed to fetch journal entries') : null

  useEffect(() => {
    if (errorMessage) {
      showError(errorMessage)
    }
  }, [errorMessage, showError])

  useEffect(() => {
    const validIds = new Set(journalEntries.map((entry: JournalEntry) => entry.id))
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => validIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [journalEntries])

  // Handle filter change
  const handleFilterChange = useCallback((field: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }))
  }, [])

  // Handle search
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilterChange('search', event.target.value)
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    const selectableIds = journalEntries
      .filter((entry: JournalEntry) => entry.status === JournalEntryStatus.DRAFT)
      .map((entry: JournalEntry) => entry.id)

    if (selectedIds.size === selectableIds.length) {
      setSelectedIds(new Set())
      return
    }
    setSelectedIds(new Set(selectableIds))
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
      await postJournalEntry(selectedEntry.id).unwrap()
      showSuccess(`Journal entry ${selectedEntry.referenceNumber} posted successfully`)
      setIsPostConfirmOpen(false)
      setSelectedEntry(null)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to post journal entry'))
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
      await deleteJournalEntry(selectedEntry.id).unwrap()
      showSuccess(`Journal entry ${selectedEntry.referenceNumber} deleted successfully`)
      setIsDeleteConfirmOpen(false)
      setSelectedEntry(null)
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Failed to delete journal entry'))
    } finally {
      setActionLoading(false)
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    refetch()
  }

  const handleBulkPost = async () => {
    setActionLoading(true)
    try {
      const result = await bulkPostJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) {
        showError(`${result.failed.length} entries failed to post`)
      }
      setSelectedIds(new Set())
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Bulk post failed'))
    } finally {
      setActionLoading(false)
      setIsBulkPostConfirmOpen(false)
    }
  }

  const handleBulkDelete = async () => {
    setActionLoading(true)
    try {
      const result = await bulkDeleteJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) {
        showError(`${result.failed.length} entries failed to delete`)
      }
      setSelectedIds(new Set())
      refetch()
    } catch (error: any) {
      showError(getErrorMessage(error, 'Bulk delete failed'))
    } finally {
      setActionLoading(false)
      setIsBulkDeleteConfirmOpen(false)
    }
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
    switch (sourceType) {
      case 'sales_order':
        navigate(`/sales/orders?highlight=${sourceId}`)
        break
      case 'payment':
        navigate(`/sales/payments?highlight=${sourceId}`)
        break
      case 'goods_received_note':
        navigate(`/purchasing/goods-received?grnId=${sourceId}`)
        break
      case 'vendor_payment':
        navigate(`/purchasing/vendor-payments?vpId=${sourceId}`)
        break
      case 'expense':
        navigate('/accounting/expenses')
        break
      case 'owner_equity_transaction':
        navigate('/accounting/owner-equity')
        break
      case 'stock_adjustment':
        navigate(`/inventory/stock-adjustments/${sourceId}/edit`)
        break
      case 'fund_transfer':
        navigate('/accounting/fund-transfers')
        break
      default:
        break
    }
  }

  useKeyboardShortcuts({
    onSearch: () => {
      const el = document.querySelector<HTMLInputElement>('[data-testid="search-input"]')
      el?.focus()
    },
    onAdd: () => navigate('/accounting/journal-entries/new'),
    onRefresh: handleRefresh,
  })

  const selectableEntries = journalEntries.filter((entry: JournalEntry) => entry.status === JournalEntryStatus.DRAFT)
  const allSelected = selectableEntries.length > 0 && selectedIds.size === selectableEntries.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < selectableEntries.length

  return (
    <>
      {/* Account Mapping Warning */}
      <AccountMappingWarning context="system" />
      <PageHeader
        variant="workflow"
        title="Journal Entries"
        subtitle={`Manage and post accounting journal entries (${pagination?.total || 0} total)`}
        primaryAction={{ label: 'New Journal Entry', onClick: handleCreateNew }}
      />
      {/* Filters */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {selectedIds.size > 0 && (
              <>
                <Button
                  size="small"
                  variant="contained"
                  color="primary"
                  startIcon={<PostIcon />}
                  onClick={() => setIsBulkPostConfirmOpen(true)}
                >
                  Post Selected ({selectedIds.size})
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => setIsBulkDeleteConfirmOpen(true)}
                >
                  Delete Selected ({selectedIds.size})
                </Button>
              </>
            )}
          </Box>
          <Tooltip title="Refresh">
            <span>
              <IconButton onClick={handleRefresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
        <Grid container spacing={2} sx={{
          alignItems: "center"
        }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField
              fullWidth
              placeholder="Search by reference or description..."
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'data-testid': 'search-input' },
              }}
              value={filters.search}
              onChange={handleSearchChange}
              size="small"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
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
          </Grid>
          <Grid size={{ xs: 12, md: 2 }}>
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
                <MenuItem value="owner_equity_transaction">Owner Equity</MenuItem>
                <MenuItem value="expense">Expense</MenuItem>
                <MenuItem value="fund_transfer">Fund Transfers</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 2.5 }}>
            <TextField
              fullWidth
              label="Start Date"
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 2.5 }}>
            <TextField
              fullWidth
              label="End Date"
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
        </Grid>
      </Box>
      {/* Error Alert */}
      {errorMessage && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage}
        </Alert>
      )}
      {/* Table */}
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={someSelected}
                    checked={allSelected}
                    onChange={handleSelectAll}
                  />
                </TableCell>
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
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                  </TableCell>
                </TableRow>
              ) : journalEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
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
                    <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        disabled={entry.status !== JournalEntryStatus.DRAFT}
                        checked={selectedIds.has(entry.id)}
                        onChange={() => handleToggleSelect(entry.id)}
                      />
                    </TableCell>
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
                      <Typography variant="body2">
                        {formatCurrency(entry.totalDebits)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
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
                      <Stack direction="row" spacing={1} sx={{
                        justifyContent: "center"
                      }}>
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
            <Typography variant="body2" sx={{
              color: "text.secondary"
            }}>
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
      <ConfirmationDialog
        open={isBulkPostConfirmOpen}
        title="Bulk Post Entries"
        message={`Post ${selectedIds.size} selected journal entries? Only draft entries will be posted.`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={handleBulkPost}
        onCancel={() => setIsBulkPostConfirmOpen(false)}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={isBulkDeleteConfirmOpen}
        title="Bulk Delete Entries"
        message={`Delete ${selectedIds.size} selected journal entries? Only draft entries can be deleted.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleBulkDelete}
        onCancel={() => setIsBulkDeleteConfirmOpen(false)}
        loading={actionLoading}
      />
    </>
  );
}

export default JournalEntriesPage
