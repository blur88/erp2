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
import { ApiService } from '@/services/api'
import { useNotification } from '@/hooks/useNotification'
import { StockMovement, StockMovementType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface MovementHistoryTabProps {
  productId: string
}

// Filter to only show these transaction types
const ALLOWED_MOVEMENT_TYPES = [
  StockMovementType.PURCHASE_RECEIPT,
  StockMovementType.SALE,
  StockMovementType.ADJUSTMENT_INCREASE,
  StockMovementType.ADJUSTMENT_DECREASE,
]

const getMovementTypeLabel = (movementType: StockMovementType): string => {
  const labels: Partial<Record<StockMovementType, string>> = {
    [StockMovementType.PURCHASE_RECEIPT]: 'Purchase Order Receive',
    [StockMovementType.SALE]: 'Sales Order Fulfillment',
    [StockMovementType.ADJUSTMENT_INCREASE]: 'Stock Adjustment',
    [StockMovementType.ADJUSTMENT_DECREASE]: 'Stock Adjustment',
  }
  return labels[movementType] || 'Unknown'
}

const MovementHistoryTab: React.FC<MovementHistoryTabProps> = ({ productId }) => {
  const { showError } = useNotification()
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
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

        // Filter to only show allowed movement types
        const filteredData = data.filter((movement: StockMovement) =>
          ALLOWED_MOVEMENT_TYPES.includes(movement.movementType)
        )

        setMovements(filteredData)
        // Use total from API meta, not filtered data length
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
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const getOrderNumber = (movement: StockMovement): string => {
    // For Stock Adjustments, show blank
    if (
      movement.movementType === StockMovementType.ADJUSTMENT_INCREASE ||
      movement.movementType === StockMovementType.ADJUSTMENT_DECREASE
    ) {
      return ''
    }

    // Try to get from referenceNumber first
    if (movement.referenceNumber) {
      if (movement.movementType === StockMovementType.PURCHASE_RECEIPT) {
        return movement.referenceNumber.startsWith('PO-') ? movement.referenceNumber : `PO-${movement.referenceNumber}`
      }
      if (movement.movementType === StockMovementType.SALE) {
        return movement.referenceNumber.startsWith('SO-') ? movement.referenceNumber : `SO-${movement.referenceNumber}`
      }
      return movement.referenceNumber
    }

    // If referenceNumber is null, try to extract from reason field
    if (movement.reason) {
      // Extract SO number from reason like "Sales order fulfillment: SO-000008"
      const soMatch = movement.reason.match(/SO-\d+/)
      if (soMatch && movement.movementType === StockMovementType.SALE) {
        return soMatch[0]
      }

      // Extract PO number from reason like "Purchase order received: PO-000001"
      const poMatch = movement.reason.match(/PO-\d+/)
      if (poMatch && movement.movementType === StockMovementType.PURCHASE_RECEIPT) {
        return poMatch[0]
      }
    }

    return ''
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
    <>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table
          size={TABLE_STYLES.size}
          stickyHeader
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
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                  >
                    {getMovementTypeLabel(movement.movementType)}
                  </Typography>
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
                    {getOrderNumber(movement) || '-'}
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
                  <Typography
                    variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                  >
                    {Number(movement.quantity).toFixed(2)}
                  </Typography>
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
  )
}

export default MovementHistoryTab
