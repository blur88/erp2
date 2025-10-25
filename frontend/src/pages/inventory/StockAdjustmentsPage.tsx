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
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  Assessment as AssessmentIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchStockMovements,
  setSelectedStockMovement,
  selectStockMovements,
  selectSelectedStockMovement,
  selectInventoryLoading,
  selectInventoryError,
  selectInventoryPagination,
} from '@/store/slices/inventorySlice'
import { formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { StockMovementType } from '@/types'
import type { StockMovement } from '@/types'

interface StockAdjustmentsPageState {
  page: number
  rowsPerPage: number
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  typeFilter: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

// Memoized Adjustment Row Component
interface AdjustmentRowProps {
  adjustment: StockMovement
  index: number
  selectedAdjustmentId?: string
  focusedAdjustmentIndex: number
  onAdjustmentSelect: (adjustment: StockMovement) => void
}

const AdjustmentRow = memo(({ adjustment, index, selectedAdjustmentId, focusedAdjustmentIndex, onAdjustmentSelect }: AdjustmentRowProps) => {
  const isSelected = selectedAdjustmentId === adjustment.id
  const isFocused = index === focusedAdjustmentIndex

  const getAdjustmentTypeLabel = (movementType: StockMovementType) => {
    return movementType === StockMovementType.ADJUSTMENT_INCREASE
      ? 'Increase'
      : 'Decrease'
  }

  const getAdjustmentTypeColor = (movementType: StockMovementType) => {
    return movementType === StockMovementType.ADJUSTMENT_INCREASE
      ? 'success'
      : 'error'
  }

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
          {adjustment.referenceNumber || adjustment.id.substring(0, 8)}
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

  const allStockMovements = useAppSelector(selectStockMovements) || []

  // Filter to show only adjustment movements and group by SA number
  const adjustments = React.useMemo(() => {
    const filtered = allStockMovements.filter((movement: StockMovement) =>
      movement.movementType === StockMovementType.ADJUSTMENT_INCREASE ||
      movement.movementType === StockMovementType.ADJUSTMENT_DECREASE
    )

    // Group by SA number (referenceNumber) - keep only the first movement of each SA
    const groupedMap = new Map<string, StockMovement>()
    filtered.forEach((movement: StockMovement) => {
      const saNumber = movement.referenceNumber || movement.id
      if (!groupedMap.has(saNumber)) {
        groupedMap.set(saNumber, movement)
      }
    })

    return Array.from(groupedMap.values())
  }, [allStockMovements])
  const loading = useAppSelector(selectInventoryLoading)?.stockMovements || false
  const error = useAppSelector(selectInventoryError)
  const pagination = useAppSelector(selectInventoryPagination)?.stockMovements
  const selectedAdjustment = useAppSelector(selectSelectedStockMovement)

  const [state, setState] = useState<StockAdjustmentsPageState>({
    page: 0,
    rowsPerPage: 20,
    search: '',
    sortBy: 'movementDate',
    sortOrder: 'desc',
    typeFilter: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })

  const [focusedAdjustmentIndex, setFocusedAdjustmentIndex] = useState(-1)
  const adjustmentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Get all movements for the selected SA number
  const selectedSAMovements = React.useMemo(() => {
    if (!selectedAdjustment || !selectedAdjustment.referenceNumber) {
      return []
    }
    return allStockMovements.filter((movement: StockMovement) =>
      movement.referenceNumber === selectedAdjustment.referenceNumber &&
      (movement.movementType === StockMovementType.ADJUSTMENT_INCREASE ||
       movement.movementType === StockMovementType.ADJUSTMENT_DECREASE)
    )
  }, [selectedAdjustment, allStockMovements])

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

    // Determine movement type based on typeFilter
    // For stock adjustments page, we ONLY want adjustment movements
    // Default to ADJUSTMENT_INCREASE to avoid fetching all movement types
    let movementType: StockMovementType = StockMovementType.ADJUSTMENT_INCREASE
    if (state.typeFilter === 'decrease') {
      movementType = StockMovementType.ADJUSTMENT_DECREASE
    }
    // Note: When 'all' is selected, we fetch ADJUSTMENT_INCREASE by default
    // The backend doesn't support fetching multiple movement types in one call
    // Frontend client-side filtering on line 142-158 will handle showing both types if needed

    dispatch(fetchStockMovements({
      page: state.page + 1,
      limit: state.rowsPerPage,
      movementType: movementType,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      search: state.search || undefined,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder.toUpperCase() as any,
    } as any))
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

  const handleAdjustmentSelect = useCallback((adjustment: StockMovement) => {
    dispatch(setSelectedStockMovement(adjustment))
    const adjustmentIndex = adjustments.findIndex(a => a.id === adjustment.id)
    setFocusedAdjustmentIndex(adjustmentIndex)
  }, [dispatch, adjustments])

  // Auto-focus first adjustment when adjustments load
  useEffect(() => {
    if (adjustments.length > 0 && focusedAdjustmentIndex === -1) {
      if (!selectedAdjustment && searchInputRef.current !== document.activeElement) {
        setFocusedAdjustmentIndex(0)
        dispatch(setSelectedStockMovement(adjustments[0]))
      }
    }
  }, [adjustments, focusedAdjustmentIndex, selectedAdjustment, dispatch])

  // Clear selection when no adjustments exist
  useEffect(() => {
    if (adjustments.length === 0 && selectedAdjustment) {
      dispatch(setSelectedStockMovement(null))
      setFocusedAdjustmentIndex(-1)
    }
  }, [adjustments.length, selectedAdjustment, dispatch])

  // Keyboard shortcuts
  const handleNavigateUp = useCallback(() => {
    if (focusedAdjustmentIndex > 0) {
      const newIndex = focusedAdjustmentIndex - 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockMovement(adjustments[newIndex]))
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedAdjustmentIndex < adjustments.length - 1) {
      const newIndex = focusedAdjustmentIndex + 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockMovement(adjustments[newIndex]))
    }
  }, [focusedAdjustmentIndex, adjustments, dispatch])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

  const getAdjustmentTypeLabel = (movementType: StockMovementType) => {
    return movementType === StockMovementType.ADJUSTMENT_INCREASE
      ? 'Increase'
      : 'Decrease'
  }

  const getAdjustmentTypeColor = (movementType: StockMovementType) => {
    return movementType === StockMovementType.ADJUSTMENT_INCREASE
      ? 'success'
      : 'error'
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
            <AssessmentIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Stock Adjustments
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            View and manage stock adjustment history ({adjustments.length} total)
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
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
          <InputLabel>Type</InputLabel>
          <Select
            value={state.typeFilter}
            label="Type"
            onChange={(e) => setState(prev => ({ ...prev, typeFilter: e.target.value, page: 0 }))}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="increase">Increase</MenuItem>
            <MenuItem value="decrease">Decrease</MenuItem>
          </Select>
        </FormControl>

        {(state.dateFilter !== 'all' || state.typeFilter !== 'all') && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => setState(prev => ({
              ...prev,
              dateFilter: 'all',
              customFromDate: '',
              customToDate: '',
              typeFilter: 'all',
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
          variant={state.sortBy === 'movementDate' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={state.sortBy === 'movementDate' ? (state.sortOrder === 'desc' ? <ArrowDownIcon /> : <ArrowUpIcon />) : <SortIcon />}
          onClick={() => handleSort('movementDate')}
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
                <Table size={TABLE_STYLES.size}>
                  <TableBody>
                    {loading && adjustments.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      adjustments.map((adjustment: StockMovement, index: number) => (
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  SA Details
                </Typography>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                <Grid container spacing={3}>
                  {/* Adjustment Information - Date Only */}
                  <Grid item xs={12}>
                    <TableContainer>
                      <Table
                        size={TABLE_STYLES.size}
                        sx={{
                          tableLayout: 'fixed',
                          '& .MuiTableCell-root': {
                            border: 'none',
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px,
                            '&:nth-of-type(1)': { width: '20%' },
                            '&:nth-of-type(2)': { width: '80%' },
                          }
                        }}
                      >
                        <TableBody>
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
                                Adjustment Information
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
                              {formatDate(selectedAdjustment.movementDate)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Items Table */}
                  <Grid item xs={12}>
                    <TableContainer component={Paper} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                      <Table
                        size="small"
                        sx={{
                          '& .MuiTableCell-root': {
                            border: `1px solid ${theme.palette.divider}`,
                            padding: '8px',
                            fontSize: '0.875rem',
                          },
                          '& .MuiTableHead-root .MuiTableCell-root': {
                            backgroundColor: theme.palette.grey[50],
                            fontWeight: 600,
                            color: theme.palette.text.primary,
                          },
                        }}
                      >
                        <TableHead>
                          <TableRow>
                            <TableCell align="left">Product</TableCell>
                            <TableCell align="center">New Quantity</TableCell>
                            <TableCell align="center">Old Quantity</TableCell>
                            <TableCell align="center">Difference</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedSAMovements.map((movement) => (
                            <TableRow key={movement.id}>
                              <TableCell>{movement.product?.name || 'Unknown Product'}</TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                                  {Number(movement.newBalance).toLocaleString()}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography variant="body2" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                  {Number(movement.previousBalance).toLocaleString()}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Typography
                                  variant="body2"
                                  fontWeight="600"
                                  sx={{
                                    fontSize: '0.875rem',
                                    color: Number(movement.quantity) > 0
                                      ? 'success.main'
                                      : Number(movement.quantity) < 0
                                      ? 'error.main'
                                      : 'text.primary'
                                  }}
                                >
                                  {Number(movement.quantity) > 0 ? '+' : ''}
                                  {Number(movement.quantity).toLocaleString()}
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Notes Section */}
                  {selectedAdjustment.notes && (
                    <Grid item xs={12}>
                      <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1 }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          mb: 1
                        }}>
                          Notes
                        </Typography>
                        <Typography sx={{
                          fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word'
                        }}>
                          {selectedAdjustment.notes}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>
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
    </Box>
  )
}

export default StockAdjustmentsPage
