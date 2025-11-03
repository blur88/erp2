import React, { useState, useEffect, useRef, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
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
  IconButton,
  useTheme,
  useMediaQuery,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  SwapVert as StockAdjustmentIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material'
import DeletedStockAdjustmentsDialog from '@/components/inventory/DeletedStockAdjustmentsDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchStockAdjustments,
  fetchStockAdjustment,
  setSelectedStockAdjustment,
  selectStockAdjustments,
  selectSelectedStockAdjustment,
  selectInventoryLoading,
  selectInventoryError,
  selectInventoryPagination,
} from '@/store/slices/inventorySlice'
import { inventoryApi } from '@/services/inventoryApi'
import { formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { StockAdjustmentStatus } from '@/types'
import type { StockAdjustment } from '@/types'

interface StockAdjustmentsPageState {
  page: number
  rowsPerPage: number
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  statusFilter: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

// Memoized Adjustment Row Component
interface AdjustmentRowProps {
  adjustment: StockAdjustment
  index: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onAdjustmentSelect: (adjustment: StockAdjustment) => void
}

const AdjustmentRow = memo(({ adjustment, index, selectedAdjustmentId, focusedAdjustmentIndex, onAdjustmentSelect }: AdjustmentRowProps) => {
  const isSelected = selectedAdjustmentId === adjustment.id
  const isFocused = index === focusedAdjustmentIndex

  return (
    <TableRow
      key={adjustment.id}
      hover
      onClick={() => onAdjustmentSelect(adjustment)}
      data-adjustment-index={index}
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
          {adjustment.adjustmentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

AdjustmentRow.displayName = 'AdjustmentRow'

const StockAdjustmentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  const adjustments = useAppSelector(selectStockAdjustments) || []
  const loading = useAppSelector(selectInventoryLoading)?.stockAdjustments || false
  const error = useAppSelector(selectInventoryError)
  const pagination = useAppSelector(selectInventoryPagination)?.stockAdjustments
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)

  const [state, setState] = useState<StockAdjustmentsPageState>({
    page: 0,
    rowsPerPage: 20,
    search: '',
    sortBy: 'adjustmentDate',
    sortOrder: 'desc',
    statusFilter: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })

  const [focusedAdjustmentIndex, setFocusedAdjustmentIndex] = useState(-1)
  const adjustmentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showDeletedDialog, setShowDeletedDialog] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [adjustmentToDelete, setAdjustmentToDelete] = useState<string | null>(null)
  const [adjustmentToDeleteName, setAdjustmentToDeleteName] = useState<string>('')
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [adjustmentToComplete, setAdjustmentToComplete] = useState<string | null>(null)
  const [adjustmentToCompleteName, setAdjustmentToCompleteName] = useState<string>('')
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [adjustmentToCancel, setAdjustmentToCancel] = useState<string | null>(null)
  const [adjustmentToCancelName, setAdjustmentToCancelName] = useState<string>('')

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

  // Load adjustments
  const loadAdjustments = useCallback(() => {
    const dateRange = getDateRange(state.dateFilter)

    dispatch(fetchStockAdjustments({
      page: state.page + 1,
      limit: state.rowsPerPage,
      status: state.statusFilter !== 'all' ? state.statusFilter : undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      search: state.search || undefined,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder.toUpperCase() as any,
    }))
  }, [dispatch, state, getDateRange])

  useEffect(() => {
    loadAdjustments()
  }, [loadAdjustments])

  const handleSort = useCallback((field: string) => {
    setState(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
      page: 0
    }))
  }, [])

  const handleAdjustmentSelect = useCallback((adjustment: StockAdjustment) => {
    // Set the selected adjustment first (for immediate UI feedback)
    dispatch(setSelectedStockAdjustment(adjustment))
    const adjustmentIndex = adjustments.findIndex(a => a.id === adjustment.id)
    setFocusedAdjustmentIndex(adjustmentIndex)

    // Fetch full details including items
    dispatch(fetchStockAdjustment(adjustment.id))
  }, [dispatch, adjustments])

  // Auto-focus first adjustment when adjustments load
  useEffect(() => {
    if (adjustments.length > 0 && focusedAdjustmentIndex === -1) {
      if (!selectedAdjustment && searchInputRef.current !== document.activeElement) {
        setFocusedAdjustmentIndex(0)
        dispatch(setSelectedStockAdjustment(adjustments[0]))
        // Fetch full details for the first adjustment
        dispatch(fetchStockAdjustment(adjustments[0].id))
      }
    }
  }, [adjustments, focusedAdjustmentIndex, selectedAdjustment, dispatch])

  // Clear selection when no adjustments exist
  useEffect(() => {
    if (adjustments.length === 0 && selectedAdjustment) {
      dispatch(setSelectedStockAdjustment(null))
      setFocusedAdjustmentIndex(-1)
    }
  }, [adjustments.length, selectedAdjustment, dispatch])

  // Keyboard shortcuts
  const handleNavigateUp = useCallback(() => {
    if (focusedAdjustmentIndex > 0) {
      const newIndex = focusedAdjustmentIndex - 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      dispatch(fetchStockAdjustment(adjustments[newIndex].id))
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedAdjustmentIndex < adjustments.length - 1) {
      const newIndex = focusedAdjustmentIndex + 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      dispatch(fetchStockAdjustment(adjustments[newIndex].id))
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  const handleEdit = () => {
    if (selectedAdjustment) {
      // Only allow editing draft adjustments
      if (selectedAdjustment.status !== 'draft') {
        showError('Only draft adjustments can be edited')
        return
      }
      navigate(`/inventory/stock-adjustments/${selectedAdjustment.id}/edit`)
    }
  }

  const handleDelete = (id: string, adjustmentNumber: string) => {
    setAdjustmentToDelete(id)
    setAdjustmentToDeleteName(adjustmentNumber)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (adjustmentToDelete) {
      setDeletingId(adjustmentToDelete)
      try {
        await inventoryApi.deleteStockAdjustment(adjustmentToDelete)
        showSuccess(`Stock adjustment "${adjustmentToDeleteName}" deleted successfully`)
        loadAdjustments()
        // Clear selection if deleted adjustment was selected
        if (selectedAdjustment?.id === adjustmentToDelete) {
          dispatch(setSelectedStockAdjustment(null))
          setFocusedAdjustmentIndex(-1)
        }
        setDeleteConfirmOpen(false)
        setAdjustmentToDelete(null)
        setAdjustmentToDeleteName('')
      } catch (error: any) {
        console.error('Failed to delete stock adjustment:', error)
        showError(error?.response?.data?.message || 'Failed to delete stock adjustment')
        setDeleteConfirmOpen(false)
        setAdjustmentToDelete(null)
        setAdjustmentToDeleteName('')
      } finally {
        setDeletingId(null)
      }
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setAdjustmentToDelete(null)
    setAdjustmentToDeleteName('')
  }

  const handleComplete = (id: string, adjustmentNumber: string) => {
    setAdjustmentToComplete(id)
    setAdjustmentToCompleteName(adjustmentNumber)
    setCompleteConfirmOpen(true)
  }

  const handleConfirmComplete = async () => {
    if (adjustmentToComplete) {
      setCompletingId(adjustmentToComplete)
      try {
        await inventoryApi.completeStockAdjustment(adjustmentToComplete)
        showSuccess(`Stock adjustment "${adjustmentToCompleteName}" completed successfully`)
        loadAdjustments()
        // Refresh the selected adjustment details
        if (selectedAdjustment?.id === adjustmentToComplete) {
          dispatch(fetchStockAdjustment(adjustmentToComplete))
        }
        setCompleteConfirmOpen(false)
        setAdjustmentToComplete(null)
        setAdjustmentToCompleteName('')
      } catch (error: any) {
        console.error('Failed to complete stock adjustment:', error)
        showError(error?.response?.data?.message || 'Failed to complete stock adjustment')
        setCompleteConfirmOpen(false)
        setAdjustmentToComplete(null)
        setAdjustmentToCompleteName('')
      } finally {
        setCompletingId(null)
      }
    }
  }

  const handleCancelComplete = () => {
    setCompleteConfirmOpen(false)
    setAdjustmentToComplete(null)
    setAdjustmentToCompleteName('')
  }

  const handleCancel = (id: string, adjustmentNumber: string) => {
    setAdjustmentToCancel(id)
    setAdjustmentToCancelName(adjustmentNumber)
    setCancelConfirmOpen(true)
  }

  const handleConfirmCancel = async () => {
    if (adjustmentToCancel) {
      setCancellingId(adjustmentToCancel)
      try {
        await inventoryApi.uncompleteStockAdjustment(adjustmentToCancel)
        showSuccess(`Stock adjustment "${adjustmentToCancelName}" reverted to draft successfully`)
        loadAdjustments()
        // Refresh the selected adjustment details
        if (selectedAdjustment?.id === adjustmentToCancel) {
          dispatch(fetchStockAdjustment(adjustmentToCancel))
        }
        setCancelConfirmOpen(false)
        setAdjustmentToCancel(null)
        setAdjustmentToCancelName('')
      } catch (error: any) {
        console.error('Failed to revert stock adjustment:', error)
        showError(error?.response?.data?.message || 'Failed to revert stock adjustment')
        setCancelConfirmOpen(false)
        setAdjustmentToCancel(null)
        setAdjustmentToCancelName('')
      } finally {
        setCancellingId(null)
      }
    }
  }

  const handleCancelCancelDialog = () => {
    setCancelConfirmOpen(false)
    setAdjustmentToCancel(null)
    setAdjustmentToCancelName('')
  }

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
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
            <StockAdjustmentIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Stock Adjustments
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            View and manage stock adjustment history ({pagination?.total || 0} total)
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
            onClick={() => setShowDeletedDialog(true)}
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
            onClick={() => navigate('/inventory/stock-adjustments/create')}
            fullWidth={isMobile}
          >
            {isMobile ? "New Adjustment" : "New Adjustment"}
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
          placeholder="Search adjustments..."
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
          <InputLabel>Status</InputLabel>
          <Select
            value={state.statusFilter}
            label="Status"
            onChange={(e) => setState(prev => ({ ...prev, statusFilter: e.target.value, page: 0 }))}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
            <MenuItem value="cancelled">Cancelled</MenuItem>
          </Select>
        </FormControl>

        {(state.dateFilter !== 'all' || state.statusFilter !== 'all') && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => setState(prev => ({
              ...prev,
              dateFilter: 'all',
              customFromDate: '',
              customToDate: '',
              statusFilter: 'all',
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
          variant={state.sortBy === 'adjustmentDate' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={state.sortBy === 'adjustmentDate' ? (state.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('adjustmentDate')}
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
        {/* Left Side - Adjustment List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                SA List ({pagination?.total || 0})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={adjustmentListRef}>
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
                  <TableBody>
                    {loading && adjustments.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : adjustments.length === 0 ? (
                      <TableRow>
                        <TableCell align="center">
                          <Typography variant="body2" color="text.secondary">
                            No stock adjustments found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      adjustments.map((adjustment: StockAdjustment, index: number) => (
                        <AdjustmentRow
                          key={adjustment.id}
                          adjustment={adjustment}
                          index={index}
                          selectedAdjustmentId={selectedAdjustment?.id}
                          focusedAdjustmentIndex={focusedAdjustmentIndex}
                          onAdjustmentSelect={handleAdjustmentSelect}
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

        {/* Right Side - SA Details */}
        <Grid item xs={12} md={9}>
          {selectedAdjustment ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px'
                  }}>
                    SA Details - {selectedAdjustment.adjustmentNumber}
                  </Typography>
                  <Chip
                    label={selectedAdjustment.status}
                    size="small"
                    color={
                      selectedAdjustment.status === 'completed' ? 'success' :
                      selectedAdjustment.status === 'cancelled' ? 'error' :
                      'default'
                    }
                    sx={{
                      textTransform: 'capitalize',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}
                  />
                </Box>
                <Box sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.25
                }}>
                  <IconButton
                    size="small"
                    title="Edit Adjustment"
                    onClick={handleEdit}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      minHeight: 20,
                      minWidth: 20,
                      p: 0.125,
                      color: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                        color: 'primary.dark'
                      }
                    }}
                  >
                    <EditIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                    }} />
                  </IconButton>
                  <IconButton
                    size="small"
                    title="Delete Adjustment"
                    onClick={() => handleDelete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
                    disabled={deletingId === selectedAdjustment.id}
                    sx={{
                      height: `${TABLE_STYLES.row.height * 0.75}px`,
                      width: `${TABLE_STYLES.row.height * 0.75}px`,
                      minHeight: 20,
                      minWidth: 20,
                      p: 0.125,
                      color: 'error.main',
                      '&:hover': {
                        backgroundColor: 'error.light',
                        color: 'error.dark'
                      }
                    }}
                  >
                    <DeleteIcon sx={{
                      fontSize: `${TABLE_STYLES.row.height * 0.5}px`
                    }} />
                  </IconButton>
                </Box>
              </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
              {/* SA Details Section */}
              <Box>
                <Grid container spacing={3}>
                  {/* Adjustment Information */}
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
                          {/* SA Information Section */}
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
                                SA Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Date
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedAdjustment.adjustmentDate)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Item Count
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {selectedAdjustment.itemCount}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* SA Confirmation */}
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
                          {/* SA Confirmation Section */}
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
                                SA Confirmation
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              color: 'text.secondary',
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                            }}>
                              Created At
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedAdjustment.createdAt)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              Updated At
                            </TableCell>
                            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {formatDate(selectedAdjustment.updatedAt)}
                            </TableCell>
                          </TableRow>
                          {(selectedAdjustment.status === 'draft' || selectedAdjustment.status === 'completed') && (
                            <TableRow>
                              <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                                  {selectedAdjustment.status === 'draft' ? (
                                    <Button
                                      variant="contained"
                                      size="small"
                                      color="primary"
                                      onClick={() => handleComplete(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
                                      disabled={completingId === selectedAdjustment.id}
                                      sx={{ minWidth: 110 }}
                                    >
                                      {completingId === selectedAdjustment.id ? 'Completing...' : 'Complete'}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="contained"
                                      size="small"
                                      color="warning"
                                      onClick={() => handleCancel(selectedAdjustment.id, selectedAdjustment.adjustmentNumber)}
                                      disabled={cancellingId === selectedAdjustment.id}
                                      sx={{ minWidth: 110 }}
                                    >
                                      {cancellingId === selectedAdjustment.id ? 'Cancelling...' : 'Cancel'}
                                    </Button>
                                  )}
                                </Stack>
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
                </Grid>

                {/* Page Break before SA Items */}
                <Box sx={{
                  borderTop: '2px solid',
                  borderColor: 'divider',
                  pageBreakBefore: 'always', // CSS page break for printing
                  '@media print': {
                    pageBreakBefore: 'always'
                  }
                }} />

                {/* SA Items Section Header */}
                <TableContainer>
                  <Table
                    size={TABLE_STYLES.size}
                    sx={{
                      '& .MuiTableCell-root': {
                        border: 'none',
                        py: TABLE_STYLES.cell.padding.py,
                        px: TABLE_STYLES.cell.padding.px,
                      }
                    }}
                  >
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={3} sx={{
                          pb: TABLE_STYLES.cell.padding.py * 0.67,
                          py: TABLE_STYLES.cell.padding.py * 0.67,
                          borderTop: TABLE_STYLES.cell.border
                        }}>
                          <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                            fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                            fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            SA Items
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* SA Items Table */}
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  {selectedAdjustment.items && selectedAdjustment.items.length > 0 ? (
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
                            <TableCell sx={{ width: '40%' }}>
                              Product
                            </TableCell>
                            <TableCell align="center" sx={{ width: '20%' }}>
                              Old Quantity
                            </TableCell>
                            <TableCell align="center" sx={{ width: '20%' }}>
                              New Quantity
                            </TableCell>
                            <TableCell align="center" sx={{ width: '20%' }}>
                              Difference
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedAdjustment.items.map((item: any, index: number) => (
                            <TableRow
                              key={index}
                              hover
                              sx={{
                                '&:hover': {
                                  backgroundColor: 'action.hover'
                                },
                                transition: 'background-color 0.2s ease',
                                height: TABLE_STYLES.row.height
                              }}
                            >
                              <TableCell sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight
                              }}>
                                {item.product?.name || 'Unknown Product'}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight,
                                color: 'text.secondary'
                              }}>
                                {Number(item.oldQuantity).toLocaleString()}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight
                              }}>
                                {Number(item.newQuantity).toLocaleString()}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                                lineHeight: TYPOGRAPHY_STYLES.tableCell.primary.lineHeight,
                                fontWeight: 600,
                                color: Number(item.difference) > 0
                                  ? 'success.main'
                                  : Number(item.difference) < 0
                                  ? 'error.main'
                                  : 'text.primary'
                              }}>
                                {Number(item.difference) > 0 ? '+' : ''}
                                {Number(item.difference).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No items in this adjustment</Alert>
                  )}
                </Box>
              </Box>

              {/* Page Break after SA Items */}
              <Box sx={{
                borderTop: '2px solid',
                borderColor: 'divider',
                pageBreakBefore: 'always', // CSS page break for printing
                '@media print': {
                  pageBreakBefore: 'always'
                }
              }} />

              {/* NOTES Section - below items */}
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
                  {selectedAdjustment.notes || '-'}
                </Box>
              </Box>
            </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select an adjustment to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Deleted Stock Adjustments Dialog */}
      <DeletedStockAdjustmentsDialog
        open={showDeletedDialog}
        onClose={() => setShowDeletedDialog(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete stock adjustment #${adjustmentToDeleteName}? This will move it to deleted stock adjustments.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="warning"
      />

      {/* Complete Confirmation Dialog */}
      <ConfirmationDialog
        open={completeConfirmOpen}
        title="Confirm Complete"
        message={`Are you sure you want to complete stock adjustment #${adjustmentToCompleteName}? This will post the stock movements and update inventory levels. This action cannot be undone.`}
        confirmText="Complete"
        cancelText="Cancel"
        onConfirm={handleConfirmComplete}
        onCancel={handleCancelComplete}
        severity="info"
      />

      {/* Cancel Confirmation Dialog */}
      <ConfirmationDialog
        open={cancelConfirmOpen}
        title="Revert to Draft"
        message={`Are you sure you want to revert stock adjustment #${adjustmentToCancelName} back to draft? This will reverse the stock movements and return inventory levels to their previous state.`}
        confirmText="Revert to Draft"
        cancelText="Go Back"
        onConfirm={handleConfirmCancel}
        onCancel={handleCancelCancelDialog}
        severity="warning"
      />
    </Box>
  )
}

export default StockAdjustmentsPage
