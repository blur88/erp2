import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
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
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  LocalShipping as GRNIcon,
  RestoreFromTrash as RestoreIcon,
  Sort as SortIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
} from '@mui/icons-material'
import { formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchGoodsReceivedNotes,
  selectGRNsState,
  setSelectedGRN
} from '@/store/slices/purchasingSlice'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import DeletedGRNsDialog from '@/components/purchasing/DeletedGRNsDialog'

interface GoodsReceivedPageState {
  page: number
  rowsPerPage: number
}

interface GRNFilters {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  status: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

// Memoized GRN Row Component
interface GRNRowProps {
  grn: any
  index: number
  selectedGRNId?: string
  focusedGRNIndex: number
  onGRNSelect: (grn: any) => void
}

const GRNRow = memo(({ grn, index, selectedGRNId, focusedGRNIndex, onGRNSelect }: GRNRowProps) => {
  const isSelected = selectedGRNId === grn.id
  const isFocused = index === focusedGRNIndex

  return (
    <TableRow
      key={grn.id}
      hover
      onClick={() => onGRNSelect(grn)}
      data-grn-index={index}
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
          {grn.grnNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

GRNRow.displayName = 'GRNRow'

const GoodsReceivedPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [searchParams, setSearchParams] = useSearchParams()

  const dispatch = useAppDispatch()
  const { goodsReceivedNotes, loading, error, pagination } = useAppSelector(selectGRNsState)
  const [selectedGRN, setSelectedGRNLocal] = useState<any | null>(null)

  const [state, setState] = useState<GoodsReceivedPageState>({
    page: 0,
    rowsPerPage: 20,
  })

  const [filters, setFilters] = useState<GRNFilters>({
    search: '',
    sortBy: 'grnNumber',
    sortOrder: 'asc',
    status: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })

  const [deletedGRNsDialogOpen, setDeletedGRNsDialogOpen] = useState(false)
  const [focusedGRNIndex, setFocusedGRNIndex] = useState(-1)
  const grnListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
      default:
        return { fromDate: undefined, toDate: undefined }
    }
  }, [filters.customFromDate, filters.customToDate])

  // Load GRNs on component mount and filter changes
  useEffect(() => {
    const dateRange = getDateRange(filters.dateFilter)
    dispatch(fetchGoodsReceivedNotes({
      page: state.page + 1,
      limit: state.rowsPerPage,
      search: filters.search,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
      receiptDateFrom: dateRange.fromDate,
      receiptDateTo: dateRange.toDate,
    } as any))
  }, [dispatch, state.page, state.rowsPerPage, filters.search, filters.sortBy, filters.sortOrder, filters.dateFilter, getDateRange])

  // Filter GRNs (status filter only - backend handles search and sorting)
  const filteredGRNs = useMemo(() => {
    let filtered = [...(goodsReceivedNotes || [])]

    // Status filter (client-side only)
    if (filters.status !== 'all') {
      filtered = filtered.filter((grn: any) => grn.status === filters.status)
    }

    return filtered
  }, [goodsReceivedNotes, filters.status])

  // Pagination
  const paginatedGRNs = useMemo(() => {
    const startIndex = state.page * state.rowsPerPage
    return filteredGRNs.slice(startIndex, startIndex + state.rowsPerPage)
  }, [filteredGRNs, state.page, state.rowsPerPage])

  const handleGRNSelect = useCallback((grn: any) => {
    setSelectedGRNLocal(grn)
    dispatch(setSelectedGRN(grn))
    const grnIndex = paginatedGRNs.findIndex(g => g.id === grn.id)
    setFocusedGRNIndex(grnIndex)
  }, [dispatch, paginatedGRNs])

  // Handle grnId query parameter to auto-select GRN from PO page
  useEffect(() => {
    const grnId = searchParams.get('grnId')
    if (grnId && goodsReceivedNotes.length > 0) {
      const grn = goodsReceivedNotes.find((g: any) => g.id === grnId)
      if (grn) {
        handleGRNSelect(grn)
        // Remove the query parameter after selection
        setSearchParams({})
      }
    }
  }, [searchParams, goodsReceivedNotes, handleGRNSelect, setSearchParams])

  // Auto-refresh selected GRN when the list updates (e.g., after PO edit/return/receive)
  useEffect(() => {
    if (selectedGRN && goodsReceivedNotes.length > 0) {
      const updatedGRN = goodsReceivedNotes.find((g: any) => g.id === selectedGRN.id)
      if (updatedGRN) {
        // Always update to ensure fresh data, especially for status and quantity changes
        setSelectedGRNLocal(updatedGRN)
        dispatch(setSelectedGRN(updatedGRN))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goodsReceivedNotes])

  // Auto-select first GRN when GRNs load
  useEffect(() => {
    if (paginatedGRNs.length > 0 && focusedGRNIndex === -1) {
      if (!selectedGRN && searchInputRef.current !== document.activeElement) {
        // Don't auto-select if we have a grnId query parameter
        const grnId = searchParams.get('grnId')
        if (!grnId) {
          setFocusedGRNIndex(0)
          handleGRNSelect(paginatedGRNs[0])
        }
      }
    }
  }, [paginatedGRNs, focusedGRNIndex, selectedGRN, handleGRNSelect, searchParams])

  // Clear selection when no GRNs exist
  useEffect(() => {
    if (paginatedGRNs.length === 0 && selectedGRN) {
      setSelectedGRNLocal(null)
      dispatch(setSelectedGRN(null))
      setFocusedGRNIndex(-1)
    }
  }, [paginatedGRNs.length, selectedGRN, dispatch])

  const handleSort = useCallback((field: string) => {
    setFilters(prev => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'asc' ? 'desc' : 'asc',
    }))
    setState(prev => ({ ...prev, page: 0 }))
  }, [])

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'received':
        return 'success'
      case 'draft':
        return 'default'
      default:
        return 'default'
    }
  }

  // Keyboard navigation handlers
  const handleNavigateUp = useCallback(() => {
    if (focusedGRNIndex > 0) {
      const newIndex = focusedGRNIndex - 1
      setFocusedGRNIndex(newIndex)
      handleGRNSelect(paginatedGRNs[newIndex])
    }
  }, [focusedGRNIndex, paginatedGRNs, handleGRNSelect])

  const handleNavigateDown = useCallback(() => {
    if (focusedGRNIndex < paginatedGRNs.length - 1) {
      const newIndex = focusedGRNIndex + 1
      setFocusedGRNIndex(newIndex)
      handleGRNSelect(paginatedGRNs[newIndex])
    }
  }, [focusedGRNIndex, paginatedGRNs, handleGRNSelect])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

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
            <GRNIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Goods Received Notes
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Track and manage incoming goods from suppliers ({pagination?.total || 0} total)
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
            onClick={() => setDeletedGRNsDialogOpen(true)}
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
          placeholder="Search GRNs..."
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
            <MenuItem value="draft">Draft</MenuItem>
            <MenuItem value="received">Received</MenuItem>
          </Select>
        </FormControl>

        {(filters.dateFilter !== 'all' || filters.status !== 'all' || filters.search) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              setFilters({
                search: '',
                sortBy: 'grnNumber',
                sortOrder: 'asc',
                status: 'all',
                dateFilter: 'all',
                customFromDate: '',
                customToDate: '',
              })
              setState((prev) => ({ ...prev, page: 0 }))
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
          variant={filters.sortBy === 'grnNumber' ? 'contained' : 'outlined'}
          size="medium"
          startIcon={filters.sortBy === 'grnNumber' ? (filters.sortOrder === 'asc' ? <ArrowUpIcon /> : <ArrowDownIcon />) : <SortIcon />}
          onClick={() => handleSort('grnNumber')}
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

      {/* Split Layout: GRN List and GRN Details */}
      <Grid container spacing={3}>
        {/* Left Side - GRN List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                GRN List ({pagination?.total || 0})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={grnListRef}>
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
                    {loading && paginatedGRNs.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={40} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      paginatedGRNs.map((grn: any, index: number) => (
                        <GRNRow
                          key={grn.id}
                          grn={grn}
                          index={index}
                          selectedGRNId={selectedGRN?.id}
                          focusedGRNIndex={focusedGRNIndex}
                          onGRNSelect={handleGRNSelect}
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
                onPageChange={(_: unknown, newPage: number) => setState((prev) => ({ ...prev, page: newPage }))}
                rowsPerPage={state.rowsPerPage}
                onRowsPerPageChange={(e) => setState((prev) => ({
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

        {/* Right Side - GRN Details */}
        <Grid item xs={12} md={9}>
          {selectedGRN ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              {/* Header with GRN Info */}
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
                    GRN Details - {selectedGRN.grnNumber}
                  </Typography>
                  <Chip
                    label={selectedGRN.status}
                    size="small"
                    color={getStatusColor(selectedGRN.status) as any}
                    sx={{
                      textTransform: 'capitalize',
                      fontSize: '0.75rem',
                      fontWeight: 600
                    }}
                  />
                </Box>
              </Box>

              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                {/* GRN Details Section */}
                <Grid container spacing={3}>
                  {/* Left Column - GRN Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                                GRN Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Supplier
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedGRN.supplier?.companyName || 'Unknown'}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              GRN Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedGRN.receiptDate || selectedGRN.receivedDate)}
                            </TableCell>
                          </TableRow>
                          {selectedGRN.purchaseOrder && (
                            <>
                              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                  PO No
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  <Link
                                    to={`/purchasing/orders?poId=${selectedGRN.purchaseOrder.id}`}
                                    style={{
                                      color: '#1976d2',
                                      textDecoration: 'none',
                                      cursor: 'pointer',
                                      transition: 'color 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.color = '#1565c0'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.color = '#1976d2'
                                    }}
                                  >
                                    {selectedGRN.purchaseOrder.orderNumber}
                                  </Link>
                                </TableCell>
                              </TableRow>
                              <TableRow>
                                <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                  VP No
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {selectedGRN.purchaseOrder.vendorPayments && selectedGRN.purchaseOrder.vendorPayments.length > 0 ? (
                                    <Link
                                      to={`/purchasing/vendor-payments?vpId=${selectedGRN.purchaseOrder.vendorPayments[0].id}`}
                                      style={{
                                        color: '#1976d2',
                                        textDecoration: 'none',
                                        cursor: 'pointer',
                                        transition: 'color 0.2s ease'
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.color = '#1565c0'
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.color = '#1976d2'
                                      }}
                                    >
                                      {selectedGRN.purchaseOrder.vendorPayments[0].paymentNumber}
                                    </Link>
                                  ) : (
                                    <Typography variant="body2" sx={{ color: 'text.disabled', fontSize: '0.8rem' }}>
                                      Not yet paid
                                    </Typography>
                                  )}
                                </TableCell>
                              </TableRow>
                            </>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>

                  {/* Right Column - Quantity Information */}
                  <Grid item xs={12} md={6}>
                    <TableContainer>
                      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: 0.75, px: 1 } }}>
                        <TableBody>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ pb: 0.5, borderTop: TABLE_STYLES.cell.border }}>
                              <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.9rem' }}>
                                Quantity Information
                              </Typography>
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: '40%' }}>
                              Ordered Qty
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {(selectedGRN.items && selectedGRN.items.reduce((sum: number, item: any) => sum + (item.orderedQuantity || 0), 0)) || 0}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Received Qty
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: 'success.main' }}>
                              {selectedGRN.totalReceivedQuantity || selectedGRN.totalQuantityReceived || 0}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Grid>
                </Grid>

                {/* Notes Section */}
                {selectedGRN.notes && (
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
                              {selectedGRN.notes}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                )}

                {/* Page Break */}
                <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 3 }} />

                {/* GRN Items Section */}
                <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    mb: 1
                  }}>
                    GRN Items
                  </Typography>

                  {(selectedGRN.items && selectedGRN.items.length > 0) ? (
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
                            <TableCell sx={{ width: '50%' }}>Product</TableCell>
                            <TableCell align="center" sx={{ width: '25%' }}>Ordered</TableCell>
                            <TableCell align="center" sx={{ width: '25%' }}>Received</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedGRN.items.map((item: any, index: number) => (
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
                                {item.purchaseOrderItem?.product?.name || item.product?.name || 'N/A'}
                              </TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                {item.orderedQuantity || 0}
                              </TableCell>
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                {item.receivedQuantity || 0}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <Alert severity="info">No items in this GRN</Alert>
                  )}
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                Select a GRN to view details
              </Typography>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Deleted GRNs Dialog */}
      <DeletedGRNsDialog
        open={deletedGRNsDialogOpen}
        onClose={() => setDeletedGRNsDialogOpen(false)}
      />
    </Box>
  )
}

export default GoodsReceivedPage
