import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Chip,
  Paper,
} from '@mui/material'
import {
  TrendingUp as InwardIcon,
  TrendingDown as OutwardIcon,
} from '@mui/icons-material'
import { ApiService } from '@/services/api'
import { useNotification } from '@/hooks/useNotification'
import { StockMovement, StockMovementType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface MovementHistoryTabProps {
  productId: string
}

const getMovementTypeLabel = (movementType: StockMovementType): string => {
  const labels: Record<StockMovementType, string> = {
    [StockMovementType.PURCHASE_RECEIPT]: 'Purchase Receipt',
    [StockMovementType.SALES_RETURN]: 'Sales Return',
    [StockMovementType.PRODUCTION_RECEIPT]: 'Production Receipt',
    [StockMovementType.TRANSFER_IN]: 'Transfer In',
    [StockMovementType.ADJUSTMENT_INCREASE]: 'Stock Increase',
    [StockMovementType.INITIAL_STOCK]: 'Initial Stock',
    [StockMovementType.SALE]: 'Sale',
    [StockMovementType.PURCHASE_RETURN]: 'Purchase Return',
    [StockMovementType.PRODUCTION_CONSUMPTION]: 'Production Use',
    [StockMovementType.TRANSFER_OUT]: 'Transfer Out',
    [StockMovementType.ADJUSTMENT_DECREASE]: 'Stock Decrease',
    [StockMovementType.DAMAGE]: 'Damage',
    [StockMovementType.EXPIRY]: 'Expiry',
    [StockMovementType.THEFT]: 'Theft',
    [StockMovementType.LOSS]: 'Loss',
  }
  return labels[movementType] || 'Unknown'
}

const MovementHistoryTab: React.FC<MovementHistoryTabProps> = ({ productId }) => {
  const { showError } = useNotification()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchMovements = async () => {
      try {
        setLoading(true)
        const response = await ApiService.get('/inventory/stock/movements', {
          params: {
            productId,
            page: page + 1,
            limit: rowsPerPage,
            sortBy: 'movementDate',
            sortOrder: 'DESC',
          },
        }) as any

        // Extract data from ApiResponse<PaginatedResponse<StockMovement>>
        const data = response.data?.data || response.data || []
        const meta = response.data?.meta || response.meta || {}

        setMovements(data)
        setTotal(meta.total || 0)
      } catch (error: any) {
        console.error('Failed to fetch stock movements:', error)
        showError(error?.message || 'Failed to load movement history')
      } finally {
        setLoading(false)
      }
    }

    if (productId) {
      fetchMovements()
    }
  }, [productId, page, rowsPerPage, showError])

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (movements.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <Typography variant="body1" color="text.secondary">
          No movement history found for this product
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <TableContainer>
        <Table
          size={TABLE_STYLES.size}
          sx={{
            '& .MuiTableCell-root': {
              py: TABLE_STYLES.cell.padding.py,
              px: TABLE_STYLES.cell.padding.px,
              borderBottom: TABLE_STYLES.cell.border,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Transaction Type
              </TableCell>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Date
              </TableCell>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Order Number
              </TableCell>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }} align="right">
                Qty Before
              </TableCell>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }} align="right">
                Qty
              </TableCell>
              <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }} align="right">
                Qty After
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {movements.map((movement) => (
              <TableRow key={movement.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {movement.isInward ? (
                      <InwardIcon sx={{ fontSize: '1.2rem', color: 'success.main' }} />
                    ) : (
                      <OutwardIcon sx={{ fontSize: '1.2rem', color: 'error.main' }} />
                    )}
                    <Box>
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                        sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                      >
                        {getMovementTypeLabel(movement.movementType)}
                      </Typography>
                      {movement.reason && (
                        <Typography
                          variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                          color="text.secondary"
                          sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}
                        >
                          {movement.reason}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                  >
                    {formatDate(movement.movementDate)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                  >
                    {movement.referenceNumber || '-'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                  >
                    {Number(movement.previousBalance).toFixed(2)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Chip
                    label={`${movement.quantity > 0 ? '+' : ''}${Number(movement.quantity).toFixed(2)}`}
                    size="small"
                    color={movement.isInward ? 'success' : 'error'}
                    variant="outlined"
                    sx={{
                      fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                      fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                      minWidth: 60,
                    }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{
                      fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                      fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                    }}
                  >
                    {Number(movement.newBalance).toFixed(2)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
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
    </Box>
  )
}

export default MovementHistoryTab
