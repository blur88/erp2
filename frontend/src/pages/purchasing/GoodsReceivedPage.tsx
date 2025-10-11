import React, { useState, useEffect, useCallback, useMemo } from 'react'
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
  Skeleton,
  Alert,
  Grid,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  LocalShipping as GRNIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchGoodsReceivedNotes,
  selectGRNsState,
  setSelectedGRN
} from '@/store/slices/purchasingSlice'
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
}

const GoodsReceivedPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const dispatch = useAppDispatch()
  const { goodsReceivedNotes, loading, error, pagination } = useAppSelector(selectGRNsState)
  const [selectedGRN, setSelectedGRNLocal] = useState<any | null>(null)

  const [state, setState] = useState<GoodsReceivedPageState>({
    page: 0,
    rowsPerPage: 20,
  })

  const [filters, setFilters] = useState<GRNFilters>({
    search: '',
    sortBy: 'receivedDate',
    sortOrder: 'desc',
    status: 'all',
  })

  const [deletedGRNsDialogOpen, setDeletedGRNsDialogOpen] = useState(false)

  // Load GRNs on component mount and filter changes
  useEffect(() => {
    dispatch(fetchGoodsReceivedNotes({
      page: state.page + 1,
      limit: state.rowsPerPage,
      search: filters.search,
    }))
  }, [dispatch, state.page, state.rowsPerPage, filters.search])

  // Filter and sort GRNs
  const filteredGRNs = useMemo(() => {
    let filtered = [...(goodsReceivedNotes || [])]

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter((grn: any) =>
        grn.grnNumber?.toLowerCase().includes(searchLower) ||
        grn.supplier?.companyName?.toLowerCase().includes(searchLower) ||
        grn.purchaseOrder?.orderNumber?.toLowerCase().includes(searchLower)
      )
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter((grn: any) => grn.status === filters.status)
    }

    // Sort
    filtered.sort((a: any, b: any) => {
      let aValue: any = a[filters.sortBy]
      let bValue: any = b[filters.sortBy]

      if (filters.sortBy === 'receivedDate' || filters.sortBy === 'receiptDate') {
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
  }, [goodsReceivedNotes, filters])

  // Pagination
  const paginatedGRNs = useMemo(() => {
    const startIndex = state.page * state.rowsPerPage
    return filteredGRNs.slice(startIndex, startIndex + state.rowsPerPage)
  }, [filteredGRNs, state.page, state.rowsPerPage])

  const handleGRNSelect = useCallback((grn: any) => {
    setSelectedGRNLocal(grn)
    dispatch(setSelectedGRN(grn))
  }, [dispatch])

  const handleRefreshAction = () => {
    dispatch(fetchGoodsReceivedNotes({
      page: state.page + 1,
      limit: state.rowsPerPage,
      search: filters.search,
    }))
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'received':
        return 'success'
      case 'draft':
        return 'default'
      case 'inspected':
        return 'info'
      case 'accepted':
        return 'success'
      case 'rejected':
        return 'error'
      case 'partially_accepted':
        return 'warning'
      default:
        return 'default'
    }
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
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={handleRefreshAction}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh GRNs" : "Refresh"}
          </Button>
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
            <MenuItem value="inspected">Inspected</MenuItem>
            <MenuItem value="accepted">Accepted</MenuItem>
            <MenuItem value="rejected">Rejected</MenuItem>
            <MenuItem value="partially_accepted">Partially Accepted</MenuItem>
          </Select>
        </FormControl>

        {(filters.status !== 'all' || filters.search) && (
          <Button
            variant="outlined"
            size="medium"
            onClick={() => {
              setFilters({
                search: '',
                sortBy: 'receivedDate',
                sortOrder: 'desc',
                status: 'all',
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
        <Grid item xs={12} md={4}>
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

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                      <TableCell>GRN Number</TableCell>
                    </TableRow>
                  </TableHead>
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
                      paginatedGRNs.map((grn: any) => (
                        <TableRow
                          key={grn.id}
                          hover
                          onClick={() => handleGRNSelect(grn)}
                          sx={{
                            cursor: 'pointer',
                            backgroundColor: selectedGRN?.id === grn.id ? 'action.selected' : 'inherit',
                            '&:hover': {
                              backgroundColor: selectedGRN?.id === grn.id ? 'action.selected' : 'action.hover'
                            },
                            transition: 'background-color 0.2s ease',
                            height: TABLE_STYLES.row.height,
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
        <Grid item xs={12} md={8}>
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  GRN Details - {selectedGRN.grnNumber}
                </Typography>
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
                              Received Date
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(selectedGRN.receiptDate || selectedGRN.receivedDate)}
                            </TableCell>
                          </TableRow>
                          {selectedGRN.purchaseOrder && (
                            <TableRow sx={{ backgroundColor: 'grey.50' }}>
                              <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                                PO Number
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {selectedGRN.purchaseOrder.orderNumber}
                              </TableCell>
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Status
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              <Chip
                                label={selectedGRN.status}
                                size="small"
                                color={getStatusColor(selectedGRN.status) as any}
                                sx={{ textTransform: 'capitalize', fontSize: '0.75rem' }}
                              />
                            </TableCell>
                          </TableRow>
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
                              Total Value
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedGRN.totalAmount || selectedGRN.totalValue || 0)}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Received Qty
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {selectedGRN.totalReceivedQuantity || selectedGRN.totalQuantityReceived || 0}
                            </TableCell>
                          </TableRow>
                          <TableRow sx={{ backgroundColor: 'grey.50' }}>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Accepted Qty
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: 'success.main' }}>
                              {selectedGRN.totalAcceptedQuantity || selectedGRN.totalQuantityAccepted || 0}
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                              Rejected Qty
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8rem', color: 'error.main' }}>
                              {selectedGRN.totalRejectedQuantity || selectedGRN.totalQuantityRejected || 0}
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
