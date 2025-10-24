import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  InputAdornment,
  Chip,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
} from '@mui/material'
import {
  Add as AddIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { ApiService } from '@/services/api'
import type { Product, StockMovement } from '@/types'
import { StockMovementType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import {
  fetchProducts,
  selectProducts,
  selectInventoryLoading,
} from '@/store/slices/inventorySlice'

interface AdjustmentFormData {
  productId: string
  adjustmentType: 'increase' | 'decrease'
  quantity: number
  reason: string
  notes: string
}

const StockAdjustmentsPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const products = useSelector(selectProducts) || []
  const loading = useSelector(selectInventoryLoading)

  // Form state
  const [formData, setFormData] = useState<AdjustmentFormData>({
    productId: '',
    adjustmentType: 'increase',
    quantity: 0,
    reason: '',
    notes: '',
  })
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // History state
  const [adjustments, setAdjustments] = useState<StockMovement[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [total, setTotal] = useState(0)

  // Fetch products on mount
  useEffect(() => {
    dispatch(fetchProducts({ page: 1, limit: 100 }))
  }, [dispatch])

  // Fetch adjustment history
  useEffect(() => {
    fetchAdjustmentHistory()
  }, [page, rowsPerPage])

  const fetchAdjustmentHistory = async () => {
    try {
      setHistoryLoading(true)

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
    } catch (error: any) {
      console.error('Failed to fetch adjustment history:', error)
      showError(error?.message || 'Failed to load adjustment history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleProductChange = (_: any, value: Product | null) => {
    setSelectedProduct(value)
    setFormData((prev) => ({
      ...prev,
      productId: value?.id || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.productId) {
      showError('Please select a product')
      return
    }

    if (formData.quantity <= 0) {
      showError('Quantity must be greater than 0')
      return
    }

    if (!formData.reason.trim()) {
      showError('Please provide a reason for the adjustment')
      return
    }

    try {
      setSubmitting(true)

      const movementType =
        formData.adjustmentType === 'increase'
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE

      const quantity =
        formData.adjustmentType === 'increase'
          ? formData.quantity
          : -Math.abs(formData.quantity)

      await ApiService.post('/inventory/stock/movements', {
        productId: formData.productId,
        movementType,
        quantity,
        reason: formData.reason,
        notes: formData.notes || undefined,
      })

      showSuccess('Stock adjustment recorded successfully')

      // Reset form
      setFormData({
        productId: '',
        adjustmentType: 'increase',
        quantity: 0,
        reason: '',
        notes: '',
      })
      setSelectedProduct(null)

      // Refresh history and products
      fetchAdjustmentHistory()
      dispatch(fetchProducts({ page: 1, limit: 100 }))
    } catch (error: any) {
      console.error('Failed to create stock adjustment:', error)
      showError(error?.message || 'Failed to record stock adjustment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleReset = () => {
    setFormData({
      productId: '',
      adjustmentType: 'increase',
      quantity: 0,
      reason: '',
      notes: '',
    })
    setSelectedProduct(null)
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

  const currentStock = selectedProduct?.stockQuantity || 0
  const newStock =
    formData.adjustmentType === 'increase'
      ? currentStock + formData.quantity
      : currentStock - formData.quantity

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
            Manually adjust stock levels and track adjustment history ({total}{' '}
            total adjustments)
          </Typography>
        </Box>
      </Box>

      {/* Adjustment Form */}
      <Paper sx={{ p: 3, mb: 4 }}>
        <Typography
          variant="h6"
          sx={{
            mb: 3,
            fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
            fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
          }}
        >
          New Stock Adjustment
        </Typography>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Product Selection */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                value={selectedProduct}
                onChange={handleProductChange}
                options={products}
                getOptionLabel={(option) =>
                  `${option.name} (Stock: ${option.stockQuantity || 0})`
                }
                loading={loading.products}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Product"
                    required
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loading.products ? (
                            <CircularProgress color="inherit" size={20} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>

            {/* Adjustment Type */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth required>
                <InputLabel>Adjustment Type</InputLabel>
                <Select
                  value={formData.adjustmentType}
                  label="Adjustment Type"
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      adjustmentType: e.target.value as 'increase' | 'decrease',
                    }))
                  }
                >
                  <MenuItem value="increase">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon color="success" fontSize="small" />
                      Increase Stock
                    </Box>
                  </MenuItem>
                  <MenuItem value="decrease">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingDownIcon color="error" fontSize="small" />
                      Decrease Stock
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Quantity */}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                required
                type="number"
                label="Quantity"
                value={formData.quantity || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    quantity: parseFloat(e.target.value) || 0,
                  }))
                }
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>

            {/* Stock Summary Card */}
            {selectedProduct && formData.quantity > 0 && (
              <Grid item xs={12}>
                <Card
                  sx={{
                    bgcolor:
                      formData.adjustmentType === 'increase'
                        ? 'success.light'
                        : 'error.light',
                    border: 1,
                    borderColor:
                      formData.adjustmentType === 'increase'
                        ? 'success.main'
                        : 'error.main',
                  }}
                >
                  <CardContent sx={{ py: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          Current Stock
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 600 }}>
                          {currentStock}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          Adjustment
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 600,
                            color:
                              formData.adjustmentType === 'increase'
                                ? 'success.dark'
                                : 'error.dark',
                          }}
                        >
                          {formData.adjustmentType === 'increase' ? '+' : '-'}
                          {formData.quantity}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          New Stock Level
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 600,
                            color: newStock < 0 ? 'error.dark' : 'text.primary',
                          }}
                        >
                          {newStock}
                          {newStock < 0 && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="error"
                              sx={{ ml: 1 }}
                            >
                              (Negative stock!)
                            </Typography>
                          )}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Reason */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={2}
                label="Reason for Adjustment"
                value={formData.reason}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="e.g., Physical count variance, Damaged goods, Theft/loss, etc."
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Additional Notes (Optional)"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Any additional information about this adjustment"
              />
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={handleReset}
                  disabled={submitting}
                >
                  Reset
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={submitting || !formData.productId || formData.quantity <= 0}
                >
                  {submitting ? 'Recording...' : 'Record Adjustment'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>

      {/* Adjustment History */}
      <Paper sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box
          sx={{
            p: TABLE_STYLES.cell.padding.px,
            borderBottom: TABLE_STYLES.cell.border,
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
            Adjustment History ({total})
          </Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {historyLoading ? (
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
              <TableContainer sx={{ flex: 1, overflowX: 'auto' }}>
                <Table
                  size={TABLE_STYLES.size}
                  stickyHeader
                  sx={{
                    '& .MuiTableCell-root': {
                      borderBottom: TABLE_STYLES.cell.border,
                      py: TABLE_STYLES.cell.padding.py,
                      px: TABLE_STYLES.cell.padding.px,
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                      >
                        Date
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                      >
                        Product
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                      >
                        Type
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                        align="right"
                      >
                        Qty Before
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                        align="right"
                      >
                        Adjustment
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                        align="right"
                      >
                        Qty After
                      </TableCell>
                      <TableCell
                        sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
                      >
                        Reason
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {adjustments.map((adjustment) => (
                      <TableRow key={adjustment.id} hover>
                        <TableCell>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                            }}
                          >
                            {formatDate(adjustment.movementDate)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              fontWeight:
                                TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                            }}
                          >
                            {adjustment.product?.name || 'Unknown Product'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={getAdjustmentTypeLabel(adjustment.movementType)}
                            size="small"
                            color={getAdjustmentTypeColor(adjustment.movementType)}
                            icon={
                              adjustment.movementType ===
                              StockMovementType.ADJUSTMENT_INCREASE ? (
                                <TrendingUpIcon />
                              ) : (
                                <TrendingDownIcon />
                              )
                            }
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                            }}
                          >
                            {Number(adjustment.previousBalance)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              fontWeight: 600,
                              color:
                                adjustment.movementType ===
                                StockMovementType.ADJUSTMENT_INCREASE
                                  ? 'success.dark'
                                  : 'error.dark',
                            }}
                          >
                            {Number(adjustment.quantity) > 0 ? '+' : ''}
                            {Number(adjustment.quantity)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                              fontWeight:
                                TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                            }}
                          >
                            {Number(adjustment.newBalance)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
                            }}
                          >
                            {adjustment.reason || '-'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                rowsPerPageOptions={[10, 20, 50]}
                component="div"
                count={total}
                rowsPerPage={rowsPerPage}
                page={page}
                onPageChange={(_, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10))
                  setPage(0)
                }}
                size="small"
              />
            </>
          )}
        </Box>
      </Paper>
    </Box>
  )
}

export default StockAdjustmentsPage
