import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Chip,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Grid,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import { useNotification } from '@/hooks/useNotification'
import { ApiService } from '@/services/api'
import type { StockMovement } from '@/types'
import { StockMovementType } from '@/types'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

const StockAdjustmentsPage: React.FC = () => {
  const navigate = useNavigate()
  const { showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  // List state
  const [adjustments, setAdjustments] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [total, setTotal] = useState(0)

  // Selection state
  const [selectedAdjustment, setSelectedAdjustment] = useState<StockMovement | null>(null)

  // Fetch adjustment history
  useEffect(() => {
    fetchAdjustmentHistory()
  }, [page, rowsPerPage])

  const fetchAdjustmentHistory = async () => {
    try {
      setLoading(true)

      // Fetch both increase and decrease adjustments separately with proper pagination
      // Use max allowed limit (100) and fetch multiple pages if needed
      const maxLimit = 100
      const pagesToFetch = Math.ceil((page + 1) * rowsPerPage / maxLimit) || 1

      // Fetch multiple pages to ensure we have enough data
      const fetchPromises = []
      for (let p = 1; p <= pagesToFetch; p++) {
        fetchPromises.push(
          ApiService.get('/inventory/stock/movements', {
            params: {
              page: p,
              limit: maxLimit,
              sortBy: 'movementDate',
              sortOrder: 'DESC',
              movementType: StockMovementType.ADJUSTMENT_INCREASE,
            },
          }),
          ApiService.get('/inventory/stock/movements', {
            params: {
              page: p,
              limit: maxLimit,
              sortBy: 'movementDate',
              sortOrder: 'DESC',
              movementType: StockMovementType.ADJUSTMENT_DECREASE,
            },
          })
        )
      }

      const responses = await Promise.all(fetchPromises) as any[]

      // Merge all data from all responses
      const allData: any[] = []
      responses.forEach((response) => {
        const data = response.data?.data || response.data || []
        allData.push(...data)
      })

      // Sort by date descending
      const sortedAdjustments = allData.sort((a, b) =>
        new Date(b.movementDate).getTime() - new Date(a.movementDate).getTime()
      )

      // Apply pagination manually
      const start = page * rowsPerPage
      const end = start + rowsPerPage
      const paginatedData = sortedAdjustments.slice(start, end)

      setAdjustments(paginatedData)
      setTotal(sortedAdjustments.length)

      // Auto-select first item if nothing is selected
      if (!selectedAdjustment && paginatedData.length > 0) {
        setSelectedAdjustment(paginatedData[0])
      }
    } catch (error: any) {
      console.error('Failed to fetch adjustment history:', error)
      showError(error?.message || 'Failed to load adjustment history')
    } finally {
      setLoading(false)
    }
  }

  const handleRowClick = (adjustment: StockMovement) => {
    setSelectedAdjustment(adjustment)
  }

  const handleCreateNew = () => {
    navigate('/inventory/stock-adjustments/create')
  }

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

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
      <Box
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          mb: 4,
          gap: isMobile ? 2 : 0,
        }}
      >
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography
            variant={
              isMobile
                ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant
                : TYPOGRAPHY_STYLES.pageHeader.variant
            }
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            <AssessmentIcon
              sx={{
                fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
                color: TYPOGRAPHY_STYLES.pageHeader.icon.color,
              }}
            />
            Stock Adjustments
          </Typography>
          <Typography
            variant={TYPOGRAPHY_STYLES.pageSubtitle.variant}
            color={TYPOGRAPHY_STYLES.pageSubtitle.color}
          >
            View and manage stock adjustment history ({total} total adjustments)
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleCreateNew}
          sx={{ minWidth: isMobile ? '100%' : 'auto' }}
        >
          New Adjustment
        </Button>
      </Box>

      {/* Split Layout: Adjustment List and Details */}
      <Grid container spacing={3}>
        {/* Left Side - Adjustment List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography
                variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                SA List ({total})
              </Typography>
            </Box>

            {/* Adjustment List Table */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {loading ? (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    py: 4,
                  }}
                >
                  <CircularProgress />
                </Box>
              ) : adjustments.length === 0 ? (
                <Box
                  sx={{
                    p: 4,
                    textAlign: 'center',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    color="text.secondary"
                  >
                    No stock adjustments recorded yet
                  </Typography>
                </Box>
              ) : (
                <>
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
                        {adjustments.map((adjustment) => (
                          <TableRow
                            key={adjustment.id}
                            hover
                            onClick={() => handleRowClick(adjustment)}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor:
                                selectedAdjustment?.id === adjustment.id
                                  ? 'action.selected'
                                  : 'inherit',
                              '&:hover': {
                                backgroundColor:
                                  selectedAdjustment?.id === adjustment.id
                                    ? 'action.selected'
                                    : 'action.hover',
                              },
                            }}
                          >
                            <TableCell>
                              <Typography
                                variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                                sx={{
                                  fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
                                  fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                                }}
                              >
                                {adjustment.product?.name || 'Unknown'}
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', mt: 0.5 }}
                              >
                                {formatDate(adjustment.movementDate)}
                              </Typography>
                              <Chip
                                label={getAdjustmentTypeLabel(adjustment.movementType)}
                                size="small"
                                color={getAdjustmentTypeColor(adjustment.movementType)}
                                sx={{
                                  mt: 0.5,
                                  height: 20,
                                  fontSize: '0.7rem',
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {/* Pagination */}
                  <TablePagination
                    component="div"
                    count={total}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => {
                      setRowsPerPage(parseInt(e.target.value, 10))
                      setPage(0)
                    }}
                    rowsPerPageOptions={[10, 20, 50]}
                    size="small"
                  />
                </>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - SA Details */}
        <Grid item xs={12} md={9}>
          {selectedAdjustment ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              {/* Header */}
              <Box
                sx={{
                  p: TABLE_STYLES.cell.padding.px,
                  borderBottom: TABLE_STYLES.cell.border,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                  sx={{
                    fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                    fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  SA Details
                </Typography>
              </Box>

              {/* Content */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <Card>
                      <CardContent>
                        <Typography variant="h6" gutterBottom>
                          Adjustment Information
                        </Typography>
                        <Stack spacing={2}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Date:</Typography>
                            <Typography>{formatDate(selectedAdjustment.movementDate)}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Product:</Typography>
                            <Typography>
                              {selectedAdjustment.product?.name || 'Unknown Product'}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Type:</Typography>
                            <Chip
                              label={getAdjustmentTypeLabel(selectedAdjustment.movementType)}
                              size="small"
                              color={getAdjustmentTypeColor(selectedAdjustment.movementType)}
                              icon={
                                selectedAdjustment.movementType ===
                                StockMovementType.ADJUSTMENT_INCREASE ? (
                                  <TrendingUpIcon />
                                ) : (
                                  <TrendingDownIcon />
                                )
                              }
                            />
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Stock Before:</Typography>
                            <Typography>{Number(selectedAdjustment.previousBalance)}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Adjustment:</Typography>
                            <Typography
                              sx={{
                                fontWeight: 600,
                                color:
                                  selectedAdjustment.movementType ===
                                  StockMovementType.ADJUSTMENT_INCREASE
                                    ? 'success.dark'
                                    : 'error.dark',
                              }}
                            >
                              {Number(selectedAdjustment.quantity) > 0 ? '+' : ''}
                              {Number(selectedAdjustment.quantity)}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography color="text.secondary">Stock After:</Typography>
                            <Typography sx={{ fontWeight: 600 }}>
                              {Number(selectedAdjustment.newBalance)}
                            </Typography>
                          </Box>
                          {selectedAdjustment.reason && (
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Reason:
                              </Typography>
                              <Typography>{selectedAdjustment.reason}</Typography>
                            </Box>
                          )}
                          {selectedAdjustment.notes && (
                            <Box>
                              <Typography color="text.secondary" gutterBottom>
                                Notes:
                              </Typography>
                              <Typography>{selectedAdjustment.notes}</Typography>
                            </Box>
                          )}
                        </Stack>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
              </Box>
            </Paper>
          ) : (
            <Paper
              sx={{
                height: 'calc(100vh - 300px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Typography color="text.secondary">
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
