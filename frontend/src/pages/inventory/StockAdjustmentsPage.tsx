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
  CircularProgress,
  Alert,
  Grid,
  IconButton,
  useTheme,
  useMediaQuery,
  Stack,
} from '@mui/material'
import {
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import DeletedStockAdjustmentsDialog from '@/components/inventory/DeletedStockAdjustmentsDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { JournalEntry } from '@/types'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  setSelectedStockAdjustment,
  selectSelectedStockAdjustment,
} from '@/store/slices/inventorySlice'
import {
  useCompleteStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useGetStockAdjustmentsQuery,
  useLazyGetStockAdjustmentQuery,
  useUncompleteStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface StockAdjustmentFilters {
  search: string
  status: 'draft' | 'completed' | 'cancelled' | null
}

interface StockAdjustmentsSortState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
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
          variant="body2"
          sx={{
            fontWeight: 400,
            fontSize: '0.8rem',
            lineHeight: 1.2
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
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  // Check for newly created adjustment ID from navigation state
  const newAdjustmentId = (location.state as any)?.newAdjustmentId

  const [sortState, setSortState] = useState<StockAdjustmentsSortState>({
    sortBy: 'adjustmentNumber',
    sortOrder: 'asc',
  })
  const selectedAdjustment = useAppSelector(selectSelectedStockAdjustment)

  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' },
          ],
        },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const adjustmentQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      status: appliedFilters.status ?? undefined,
      sortBy: sortState.sortBy,
      sortOrder: sortState.sortOrder.toUpperCase(),
    }),
    [appliedFilters, sortState],
  )

  const {
    data: adjustmentsResponse,
    isLoading,
    isFetching,
    error: listError,
    refetch: refetchAdjustments,
  } = useGetStockAdjustmentsQuery(adjustmentQueryParams)
  const [fetchStockAdjustmentById] = useLazyGetStockAdjustmentQuery()
  const [deleteStockAdjustment] = useDeleteStockAdjustmentMutation()
  const [completeStockAdjustment] = useCompleteStockAdjustmentMutation()
  const [uncompleteStockAdjustment] = useUncompleteStockAdjustmentMutation()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const adjustments = adjustmentsResponse?.data || []
  const pagination = adjustmentsResponse?.meta
  const error = useMemo(() => {
    if (!listError) return null
    const fallback = 'Failed to fetch stock adjustments'
    if (typeof listError !== 'object') return fallback
    const errorData = (listError as any).data
    if (typeof errorData === 'string') return errorData
    return errorData?.message || fallback
  }, [listError])

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
  const [hasAutoSelected, setHasAutoSelected] = useState(false)
  const [journalEntry, setJournalEntry] = useState<JournalEntry | null>(null)

  // Fetch journal entry for completed stock adjustment
  useEffect(() => {
    if (selectedAdjustment?.status === 'completed') {
      fetchJournalEntries({ sourceType: 'stock_adjustment', sourceId: selectedAdjustment.id, limit: 1 })
        .unwrap()
        .then((res) => {
          const entries = res?.data || []
          setJournalEntry(entries.length > 0 ? entries[0] : null)
        })
        .catch(() => setJournalEntry(null))
    } else {
      setJournalEntry(null)
    }
  }, [selectedAdjustment?.id, selectedAdjustment?.status, fetchJournalEntries])

  const loadStockAdjustmentDetail = useCallback(async (id: string) => {
    try {
      const adjustment = await fetchStockAdjustmentById(id).unwrap()
      dispatch(setSelectedStockAdjustment(adjustment))
    } catch (detailError: any) {
      console.error('Failed to fetch stock adjustment details:', detailError)
      showError(detailError?.data?.message || detailError?.message || 'Failed to load stock adjustment details')
    }
  }, [dispatch, fetchStockAdjustmentById, showError])

  const handleSort = useCallback((field: string) => {
    setSortState((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const handleAdjustmentSelect = useCallback((adjustment: StockAdjustment) => {
    // Set the selected adjustment first (for immediate UI feedback)
    dispatch(setSelectedStockAdjustment(adjustment))
    const adjustmentIndex = adjustments.findIndex(a => a.id === adjustment.id)
    setFocusedAdjustmentIndex(adjustmentIndex)

    // Fetch full details including items
    void loadStockAdjustmentDetail(adjustment.id)
  }, [dispatch, adjustments, loadStockAdjustmentDetail])

  // Auto-select newly created adjustment when navigating back from create page
  useEffect(() => {
    if (newAdjustmentId && adjustments.length > 0 && !hasAutoSelected) {
      const newAdjustment = adjustments.find(a => a.id === newAdjustmentId)
      if (newAdjustment) {
        const newIndex = adjustments.indexOf(newAdjustment)
        setFocusedAdjustmentIndex(newIndex)
        setHasAutoSelected(true)
        // Set the selected adjustment first (for immediate UI feedback)
        dispatch(setSelectedStockAdjustment(newAdjustment))
        // Fetch full details including items
        void loadStockAdjustmentDetail(newAdjustmentId)
      }
    }
  }, [newAdjustmentId, adjustments, hasAutoSelected, dispatch, loadStockAdjustmentDetail])

  // Auto-focus first adjustment when adjustments load (only if no new adjustment to select)
  useEffect(() => {
    if (adjustments.length > 0 && focusedAdjustmentIndex === -1 && !newAdjustmentId) {
      if (!selectedAdjustment && searchInputRef.current !== document.activeElement) {
        setFocusedAdjustmentIndex(0)
        dispatch(setSelectedStockAdjustment(adjustments[0]))
        // Fetch full details for the first adjustment
        void loadStockAdjustmentDetail(adjustments[0].id)
      }
    }
  }, [adjustments, focusedAdjustmentIndex, selectedAdjustment, dispatch, newAdjustmentId, loadStockAdjustmentDetail])

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
      void loadStockAdjustmentDetail(adjustments[newIndex].id)
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch, loadStockAdjustmentDetail])

  const handleNavigateDown = useCallback(() => {
    if (focusedAdjustmentIndex < adjustments.length - 1) {
      const newIndex = focusedAdjustmentIndex + 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      void loadStockAdjustmentDetail(adjustments[newIndex].id)
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch, loadStockAdjustmentDetail])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
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
        // Clear selection BEFORE deleting if this adjustment is selected
        if (selectedAdjustment?.id === adjustmentToDelete) {
          dispatch(setSelectedStockAdjustment(null))
          setFocusedAdjustmentIndex(-1)
        }

        await deleteStockAdjustment(adjustmentToDelete).unwrap()
        showSuccess(`Stock adjustment "${adjustmentToDeleteName}" deleted successfully`)
        void refetchAdjustments()

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
        await completeStockAdjustment(adjustmentToComplete).unwrap()
        showSuccess(`Stock adjustment "${adjustmentToCompleteName}" completed successfully`)
        void refetchAdjustments()
        if (selectedAdjustment?.id === adjustmentToComplete) {
          void loadStockAdjustmentDetail(adjustmentToComplete)
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
        await uncompleteStockAdjustment(adjustmentToCancel).unwrap()
        showSuccess(`Stock adjustment "${adjustmentToCancelName}" reverted to draft successfully`)
        void refetchAdjustments()
        if (selectedAdjustment?.id === adjustmentToCancel) {
          void loadStockAdjustmentDetail(adjustmentToCancel)
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
    <Box data-testid="stock-adjustments-page-root" sx={{ p: 0, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <PageHeader
        title="Stock Adjustments"
        subtitle="View and manage stock adjustment history"
        secondaryAction={{ label: 'View Deleted', onClick: () => setShowDeletedDialog(true) }}
        primaryAction={{ label: 'New Adjustment', onClick: () => navigate('/inventory/stock-adjustments/create') }}
      />
      {/* Filters and Search */}
      <Box sx={{ mb: 3 }}>
        <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'flex-start'}>
          <Box sx={{ flex: 1 }}>
            <FilterBar
              config={filterConfig}
              draftFilters={draftFilters}
              handlers={handlers}
              hasActiveFilters={hasActiveFilters}
              searchInputRef={searchInputRef}
            />
          </Box>

          <Button
            variant={sortState.sortBy === 'adjustmentDate' ? 'contained' : 'outlined'}
            size="medium"
            startIcon={sortState.sortBy === 'adjustmentDate' ? (sortState.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
            onClick={() => handleSort('adjustmentDate')}
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
          {error}
        </Alert>
      )}
      {/* Split Layout */}
      <Box
        data-testid="stock-adjustments-content-region"
        sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        <Grid container spacing={3} sx={{ flex: 1, minHeight: 0 }}>
        {/* Left Side - Adjustment List */}
        <Grid
          size={{
            xs: 12,
            md: 3
          }}
          sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant="tableHeader" sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                SA List ({pagination?.total || 0})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={adjustmentListRef}>
              {(isLoading || (isFetching && !adjustmentsResponse)) ? (
                <ListSkeleton rows={8} columns={1} />
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', opacity: isFetching ? 0.6 : 1, position: 'relative' }}>
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
                      <TableBody>
                        {adjustments.map((adjustment: StockAdjustment, index: number) => (
                          <AdjustmentRow
                            key={adjustment.id}
                            adjustment={adjustment}
                            index={index}
                            selectedAdjustmentId={selectedAdjustment?.id}
                            focusedAdjustmentIndex={focusedAdjustmentIndex}
                            onAdjustmentSelect={handleAdjustmentSelect}
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

        {/* Right Side - SA Details */}
        <Grid
          size={{
            xs: 12,
            md: 9
          }}
          sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {selectedAdjustment ? (
            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="tableHeader" sx={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
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

            <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
              {/* SA Details Section */}
              <Box>
                <Grid container spacing={3}>
                  {/* Adjustment Information */}
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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
                                fontWeight: 600,
                                color: 'primary.main',
                                fontSize: '0.8rem'
                              }}>
                                SA Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: 600,
                              color: 'text.secondary',
                              fontSize: '0.8rem'
                            }}>
                              Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedAdjustment.adjustmentDate)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Item Count
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedAdjustment.itemCount}
                            </TableCell>
                          </TableRow>
                          {selectedAdjustment.status === 'completed' && (
                            <>
                              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                  Journal Entry
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {journalEntry ? (
                                    <Typography
                                      component="span"
                                      sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'primary.main', cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                                      onClick={() => navigate(`/accounting/journal-entries/${journalEntry.id}`)}
                                    >
                                      {journalEntry.referenceNumber}
                                    </Typography>
                                  ) : '-'}
                                </TableCell>
                              </TableRow>

                            </>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* SA Confirmation */}
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
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
                                fontWeight: 600,
                                color: 'primary.main',
                                fontSize: '0.8rem'
                              }}>
                                SA Confirmation
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{
                              fontWeight: 600,
                              color: 'text.secondary',
                              fontSize: '0.8rem'
                            }}>
                              Created At
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedAdjustment.createdAt)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Updated At
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
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
                          <Typography variant="tableHeader" sx={{
                            fontWeight: 600,
                            fontSize: '0.8rem',
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
                <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                            fontWeight: 600,
                            backgroundColor: 'grey.50',
                            color: 'text.primary',
                            fontSize: '0.8rem'
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
                                fontSize: '0.8rem',
                                lineHeight: 1.2
                              }}>
                                {item.product?.name || 'Unknown Product'}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: '0.8rem',
                                fontWeight: 400,
                                lineHeight: 1.2,
                                color: 'text.secondary'
                              }}>
                                {Number(item.oldQuantity).toLocaleString()}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: '0.8rem',
                                fontWeight: 400,
                                lineHeight: 1.2
                              }}>
                                {Number(item.newQuantity).toLocaleString()}
                              </TableCell>
                              <TableCell align="center" sx={{
                                fontSize: '0.8rem',
                                lineHeight: 1.2,
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
                  {selectedAdjustment.notes || '-'}
                </Box>
              </Box>
            </Box>
            </Paper>
          ) : (
            <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select an adjustment to view details
              </Typography>
            </Paper>
          )}
        </Grid>
        </Grid>
      </Box>
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
  );
}

export default StockAdjustmentsPage
